from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from config import settings
from bson.errors import InvalidId
import base64
from cryptography.fernet import Fernet
import json
import os
import pymongo
from pyfcm import FCMNotification
import datetime
from .login import verify_token

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

class SuccessResponse(BaseModel):
    success: bool
    message: Optional[str] = None

@router.post("/{method}", response_model=SuccessResponse)
def sync(method: str, request: SyncRequest, user_id: str = Depends(verify_token)):
    print(request.dict())
    method = method[0].lower() + method[1:]
    
    data = request.data
    if not isinstance(data, list):
        data = [data]
    print(method, len(data))

    userid = user_id

    db = mongo[settings.MONGO_DB]
    usrStore = db['users']

    try: 
        user = usrStore.find_one({'_id': userid})
    except InvalidId: 
        raise HTTPException(status_code=400, detail='invalid user id')

    print(user)
    hashed_password = user['password']
    key = base64.urlsafe_b64encode(hashed_password.encode("utf-8").ljust(32)[:32])
    fernet = Fernet(key)

    db = mongo['hacking-health_'+userid]
    collection = db[method]
    
    for item in data:
        itemid = item['metadata']['id']
        dataObj = {}
        for k, v in item.items():
            if k != "metadata" and k != "time" and k != "startTime" and k != "endTime":
                dataObj[k] = v

        if "time" in item:
            starttime = item['time']
            endtime = None
        else:
            starttime = item['startTime']
            endtime = item['endTime']

        toencrypt = json.dumps(dataObj).encode()
        encrypted = fernet.encrypt(toencrypt).decode()

        try:
            print("creating")
            collection.insert_one({
                "_id": itemid, 
                "id": itemid, 
                'data': encrypted, 
                "app": item['metadata']['dataOrigin'], 
                "start": starttime, 
                "end": endtime
            })
        except Exception:
            print("updating")
            collection.update_one(
                {"_id": itemid}, 
                {"$set": {
                    'data': encrypted, 
                    "app": item['metadata']['dataOrigin'], 
                    "start": starttime, 
                    "end": endtime
                }}
            )

    return SuccessResponse(success=True)

@router.post("/{method}/fetch")
def fetch(method: str, request: FetchRequest, user_id: str = Depends(verify_token)):
    userid = user_id
    db = mongo[settings.MONGO_DB]
    usrStore = db['users']

    try: 
        user = usrStore.find_one({'_id': userid})
    except InvalidId: 
        raise HTTPException(status_code=400, detail='invalid user id')

    hashed_password = user['password']
    key = base64.urlsafe_b64encode(hashed_password.encode("utf-8").ljust(32)[:32])
    fernet = Fernet(key)

    queries = request.queries if request.queries else []
    
    db = mongo['hacking-health_'+userid]
    collection = db[method]
    
    docs = []
    query_dict = {}
    if queries:
        # Combine queries into a single filter
        for q in queries:
            query_dict.update(q)
    
    for doc in collection.find(query_dict):
        doc['data'] = json.loads(fernet.decrypt(doc['data'].encode()).decode())
        docs.append(doc)

    return docs

@router.put("/{method}/push", response_model=SuccessResponse)
def push_data(method: str, request: PushRequest, user_id: str = Depends(verify_token)):
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
    method = method[0].lower() + method[1:]
    
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
