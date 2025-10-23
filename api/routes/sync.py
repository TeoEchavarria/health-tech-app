from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, validator
from typing import List, Dict, Any, Optional, Literal
from config import settings
from bson.errors import InvalidId
import json
import os
import pymongo
from pyfcm import FCMNotification
import datetime
from .login import verify_token
from aggregators import aggregate_records, group_records_by_date
from validators import validate_record_type

mongo = pymongo.MongoClient(settings.MONGO_URI)

router = APIRouter()

# Pydantic Models
class SyncRequest(BaseModel):
    data: List[Dict[str, Any]] | Dict[str, Any]

class FetchRequest(BaseModel):
    queries: Optional[List[Dict[str, Any]]] = []

class PushRequest(BaseModel):
    data: List[Dict[str, Any]] | Dict[str, Any]

class DeleteRequest(BaseModel):
    uuid: List[str] | str

class UpdateRequest(BaseModel):
    date: str
    operation: Literal["add", "update", "delete"]
    data: Dict[str, Any]

class SuccessResponse(BaseModel):
    success: bool
    message: Optional[str] = None

@router.post("/{method}", response_model=SuccessResponse)
def sync(method: str, request: SyncRequest, user_id: str = Depends(verify_token)):
    """
    Sync health records. Aggregates by date and stores optimized daily records.
    Uses bulk operations for efficiency when syncing multiple days.
    """
    print(request.dict())
    
    # Validate and normalize the record type
    method = validate_record_type(method)
    
    data = request.data
    if not isinstance(data, list):
        data = [data]
    print(f"Syncing {method}: {len(data)} records")

    userid = user_id

    db = mongo[settings.MONGO_DB]
    usrStore = db['users']

    try: 
        user = usrStore.find_one({'_id': userid})
    except InvalidId: 
        raise HTTPException(status_code=400, detail='invalid user id')

    print(f"User: {user.get('_id') if user else 'Not found'}")

    db = mongo['hh_'+userid]
    collection = db[method]
    
    # Convert incoming records to internal format
    internal_records = []
    for item in data:
        dataObj = {}
        for k, v in item.items():
            if k != "metadata" and k != "time" and k != "startTime" and k != "endTime":
                dataObj[k] = v

        if "time" in item:
            starttime = item['time']
            endtime = None
        else:
            starttime = item['startTime']
            endtime = item.get('endTime')

        internal_records.append({
            'data': dataObj,
            'app': item['metadata']['dataOrigin'] if 'metadata' in item else {},
            'start': starttime,
            'end': endtime
        })
    
    # Group records by date
    grouped_by_date = group_records_by_date(internal_records)
    
    # Get today's date for comparison
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # Separate today's data from historical data
    today_data = grouped_by_date.pop(today, None)
    historical_dates = grouped_by_date
    
    # Prepare bulk operations for historical data (one DB operation)
    bulk_operations = []
    if historical_dates:
        for date, records in historical_dates.items():
            aggregated = aggregate_records(records, method)
            
            if aggregated:
                # Prepare document for upsert
                doc = {
                    "_id": date,
                    "type": method,
                    "date": date,
                    **aggregated
                }
                
                # Add to bulk operations (ReplaceOne with upsert=True)
                bulk_operations.append(
                    pymongo.ReplaceOne(
                        {"_id": date},
                        doc,
                        upsert=True
                    )
                )
        
        # Execute all historical updates in ONE database operation
        if bulk_operations:
            result = collection.bulk_write(bulk_operations, ordered=False)
            print(f"Bulk operation: {result.upserted_count} inserted, "
                  f"{result.modified_count} modified for {len(historical_dates)} days")
    
    # Handle today's data separately (can be updated incrementally)
    if today_data:
        aggregated = aggregate_records(today_data, method)
        
        if aggregated:
            doc = {
                "_id": today,
                "type": method,
                "date": today,
                **aggregated
            }
            
            collection.replace_one(
                {"_id": today},
                doc,
                upsert=True
            )
            print(f"Updated today's data ({today})")
    
    total_days = len(historical_dates) + (1 if today_data else 0)
    return SuccessResponse(
        success=True, 
        message=f"Synced {len(data)} records across {total_days} days "
                f"({len(historical_dates)} historical, {'1 today' if today_data else '0 today'})"
    )

@router.post("/{method}/fetch")
def fetch(
    method: str, 
    request: FetchRequest, 
    user_id: str = Depends(verify_token),
    granularity: Optional[str] = Query(None, description="Set to 'raw' to get detailed internal data")
):
    """
    Fetch health records. Returns aggregated data by default.
    Use ?granularity=raw to include detailed internal data (hourly, measurements, etc.)
    """
    # Validate and normalize the record type
    method = validate_record_type(method)
    
    userid = user_id
    db = mongo[settings.MONGO_DB]
    usrStore = db['users']

    try: 
        usrStore.find_one({'_id': userid})
    except InvalidId: 
        raise HTTPException(status_code=400, detail='invalid user id')

    queries = request.queries if request.queries else []
    
    db = mongo['hh_'+userid]
    collection = db[method]
    
    docs = []
    query_dict = {}
    if queries:
        # Combine queries into a single filter
        for q in queries:
            query_dict.update(q)
    
    # Projection based on granularity
    projection = None
    if granularity != "raw":
        # Exclude detailed internal data for default queries
        projection = {
            "hourly": 0,
            "measurements": 0,
            "sessions": 0,
            "entries": 0
        }
    
    for doc in collection.find(query_dict, projection):
        docs.append(doc)

    return docs

@router.patch("/{method}/update", response_model=SuccessResponse)
def update_internal_data(
    method: str,
    request: UpdateRequest,
    user_id: str = Depends(verify_token)
):
    """
    Update internal sub-records (hourly data, measurements, sessions, entries).
    Allows adding, updating, or deleting specific internal records without replacing the entire day.
    
    Examples:
    - Add hourly heart rate: {"date": "2025-10-14", "operation": "add", "data": {"hour": 15, "avg": 75, ...}}
    - Update measurement: {"date": "2025-10-14", "operation": "update", "data": {"timestamp": "...", "value": 120}}
    - Delete session: {"date": "2025-10-14", "operation": "delete", "data": {"sessionId": "..."}}
    """
    # Validate and normalize the record type
    method = validate_record_type(method)
    
    userid = user_id
    date = request.date
    operation = request.operation
    data = request.data
    
    db = mongo[settings.MONGO_DB]
    usrStore = db['users']

    try: 
        usrStore.find_one({'_id': userid})
    except InvalidId: 
        raise HTTPException(status_code=400, detail='invalid user id')

    db = mongo['hh_'+userid]
    collection = db[method]
    
    # Check if document exists
    existing_doc = collection.find_one({"_id": date})
    if not existing_doc:
        raise HTTPException(status_code=404, detail=f'No record found for date {date}')
    
    # Determine which array field to update based on record type
    from aggregators import (
        CATEGORY_3_HOURLY, CATEGORY_4_MEDICAL, 
        CATEGORY_5_SESSIONS, CATEGORY_6_REPRODUCTIVE
    )
    
    array_field = None
    if method in CATEGORY_3_HOURLY:
        array_field = "hourly"
    elif method in CATEGORY_4_MEDICAL:
        array_field = "measurements"
    elif method in CATEGORY_5_SESSIONS:
        array_field = "sessions"
    elif method in CATEGORY_6_REPRODUCTIVE:
        array_field = "entries"
    else:
        raise HTTPException(
            status_code=400, 
            detail=f'Record type {method} does not support internal updates'
        )
    
    # Perform operation
    if operation == "add":
        # Add new entry to array
        collection.update_one(
            {"_id": date},
            {"$push": {array_field: data}}
        )
        return SuccessResponse(success=True, message=f"Added entry to {array_field}")
    
    elif operation == "update":
        # Update existing entry in array
        # Requires a unique identifier in data
        identifier_key = None
        identifier_value = None
        
        if array_field == "hourly" and "hour" in data:
            identifier_key = "hour"
            identifier_value = data["hour"]
        elif "timestamp" in data:
            identifier_key = "timestamp"
            identifier_value = data["timestamp"]
        elif "sessionId" in data:
            identifier_key = "sessionId"
            identifier_value = data["sessionId"]
        else:
            raise HTTPException(
                status_code=400,
                detail='Update requires identifier (hour, timestamp, or sessionId)'
            )
        
        # Update the matching element in array
        update_result = collection.update_one(
            {"_id": date, f"{array_field}.{identifier_key}": identifier_value},
            {"$set": {f"{array_field}.$": data}}
        )
        
        if update_result.modified_count == 0:
            raise HTTPException(
                status_code=404,
                detail=f'No matching entry found with {identifier_key}={identifier_value}'
            )
        
        return SuccessResponse(success=True, message=f"Updated entry in {array_field}")
    
    elif operation == "delete":
        # Remove entry from array
        identifier_key = None
        identifier_value = None
        
        if array_field == "hourly" and "hour" in data:
            identifier_key = "hour"
            identifier_value = data["hour"]
        elif "timestamp" in data:
            identifier_key = "timestamp"
            identifier_value = data["timestamp"]
        elif "sessionId" in data:
            identifier_key = "sessionId"
            identifier_value = data["sessionId"]
        else:
            raise HTTPException(
                status_code=400,
                detail='Delete requires identifier (hour, timestamp, or sessionId)'
            )
        
        collection.update_one(
            {"_id": date},
            {"$pull": {array_field: {identifier_key: identifier_value}}}
        )
        
        return SuccessResponse(success=True, message=f"Deleted entry from {array_field}")
    
    else:
        raise HTTPException(status_code=400, detail=f'Invalid operation: {operation}')

@router.put("/{method}/push", response_model=SuccessResponse)
def push_data(method: str, request: PushRequest, user_id: str = Depends(verify_token)):
    # Validate and normalize the record type
    method = validate_record_type(method)
    
    userid = user_id
    data = request.data
    if not isinstance(data, list):
        data = [data]

    fixedMethodName = method[0].upper() + method[1:]
    for r in data:
        r['recordType'] = fixedMethodName
        if "time" not in r and ("startTime" not in r or "endTime" not in r):
            raise HTTPException(
                status_code=400, 
                detail='no start time or end time provided. If only one time is to be used, then use the "time" attribute instead.'
            )
        if ("startTime" in r and "endTime" not in r) or ("startTime" not in r and "endTime" in r):
            raise HTTPException(
                status_code=400, 
                detail='start time and end time must be provided together.'
            )

    db = mongo[settings.MONGO_DB]
    usrStore = db['users']

    try: 
        user = usrStore.find_one({'_id': userid})
    except InvalidId: 
        raise HTTPException(status_code=400, detail='invalid user id')

    fcmToken = user.get('fcmToken')
    if not fcmToken:
        raise HTTPException(status_code=404, detail='no fcm token found')

    fcm = FCMNotification(service_account_file='service-account.json', project_id=os.environ['FCM_PROJECT_ID'])

    try:
        fcm.notify(fcm_token=fcmToken, data_payload={
            "op": "PUSH",
            "data": json.dumps(data),
        })
    except Exception:
        raise HTTPException(status_code=500, detail='Message delivery failed')

    return SuccessResponse(success=True, message="request has been sent to device.")

@router.delete("/{method}/delete", response_model=SuccessResponse)
def del_data(method: str, request: DeleteRequest, user_id: str = Depends(verify_token)):
    # Validate and normalize the record type
    method = validate_record_type(method)
    
    userid = user_id
    uuids = request.uuid
    if not isinstance(uuids, list):
        uuids = [uuids]

    fixedMethodName = method[0].upper() + method[1:]

    db = mongo[settings.MONGO_DB]
    usrStore = db['users']

    try: 
        user = usrStore.find_one({'_id': userid})
    except InvalidId: 
        raise HTTPException(status_code=400, detail='invalid user id')

    fcmToken = user.get('fcmToken')
    if not fcmToken:
        raise HTTPException(status_code=404, detail='no fcm token found')

    fcm = FCMNotification(service_account_file='service-account.json', project_id=os.environ['FCM_PROJECT_ID'])

    try:
        fcm.notify(fcm_token=fcmToken, data_payload={
            "op": "DEL",
            "data": json.dumps({
                "uuids": uuids,
                "recordType": fixedMethodName
            }),
        })
    except Exception:
        raise HTTPException(status_code=500, detail='Message delivery failed')

    return SuccessResponse(success=True, message="request has been sent to device.")


@router.delete("/{method}", response_model=SuccessResponse)
def del_from_db(method: str, request: DeleteRequest, user_id: str = Depends(verify_token)):
    # Validate and normalize the record type
    method = validate_record_type(method)
    
    userid = user_id
    uuids = request.uuid

    if not isinstance(uuids, list):
        uuids = [uuids]

    db = mongo[f'{settings.MONGO_DB}_{userid}']
    collection = db[method]
    print(collection)
    for uuid in uuids:
        print(uuid)
        try: 
            collection.delete_one({"_id": uuid})
        except Exception as e: 
            print(e)

    return SuccessResponse(success=True)
