from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
from config import settings
import pymongo
import datetime
from .login import verify_token

# Initialize MongoDB connection
mongo = pymongo.MongoClient(settings.MONGO_URI)

router = APIRouter()

# ============================================================================
# Pydantic Models
# ============================================================================

class UpdatePersonalInfoRequest(BaseModel):
    personal_info: Dict[str, Any] = Field(..., description="Personal information to update or merge")

class PersonalInfoResponse(BaseModel):
    success: bool
    personal_info: Dict[str, Any]
    message: Optional[str] = None

class SuccessResponse(BaseModel):
    success: bool
    message: Optional[str] = None

# ============================================================================
# Helper Functions
# ============================================================================

def get_user_collection():
    """Get the users collection from MongoDB"""
    db = mongo[settings.MONGO_DB]
    return db['users']

# ============================================================================
# Routes
# ============================================================================

@router.get("/personal-info", response_model=PersonalInfoResponse)
def get_personal_info(user_id: str = Depends(verify_token)):
    """
    Get the personal_info dictionary for the current user.
    """
    users = get_user_collection()
    
    # Get the user document
    user = users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    personal_info = user.get("personal_info", {})
    
    return PersonalInfoResponse(
        success=True,
        personal_info=personal_info
    )


@router.patch("/personal-info", response_model=PersonalInfoResponse)
def update_personal_info(
    request: UpdatePersonalInfoRequest, 
    user_id: str = Depends(verify_token)
):
    """
    Update (merge) personal_info for the current user.
    This endpoint merges the new data with existing data without removing existing fields.
    
    Example:
    - First call: {"altura": 180, "edad": 30, "nacionalidad": "Colombia"}
    - Second call: {"nacionalidad": "Argentina"}
    - Result: {"altura": 180, "edad": 30, "nacionalidad": "Argentina"}
    """
    users = get_user_collection()
    
    # Get the user document
    user = users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get current personal_info or empty dict
    current_personal_info = user.get("personal_info", {})
    
    # Merge the new data with existing data
    current_personal_info.update(request.personal_info)
    
    # Update the user document
    users.update_one(
        {"_id": user_id},
        {
            "$set": {
                "personal_info": current_personal_info,
                "updated_at": datetime.datetime.now()
            }
        }
    )
    
    print(f"Updated personal_info for user {user_id}")
    
    return PersonalInfoResponse(
        success=True,
        personal_info=current_personal_info,
        message="Personal information updated successfully"
    )


@router.put("/personal-info", response_model=PersonalInfoResponse)
def replace_personal_info(
    request: UpdatePersonalInfoRequest, 
    user_id: str = Depends(verify_token)
):
    """
    Replace (not merge) the entire personal_info dictionary for the current user.
    This will completely replace the existing personal_info with the new data.
    """
    users = get_user_collection()
    
    # Get the user document
    user = users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Replace the personal_info completely
    users.update_one(
        {"_id": user_id},
        {
            "$set": {
                "personal_info": request.personal_info,
                "updated_at": datetime.datetime.now()
            }
        }
    )
    
    print(f"Replaced personal_info for user {user_id}")
    
    return PersonalInfoResponse(
        success=True,
        personal_info=request.personal_info,
        message="Personal information replaced successfully"
    )


@router.delete("/personal-info", response_model=SuccessResponse)
def delete_personal_info(user_id: str = Depends(verify_token)):
    """
    Delete the entire personal_info dictionary for the current user.
    """
    users = get_user_collection()
    
    # Get the user document
    user = users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Remove the personal_info field
    users.update_one(
        {"_id": user_id},
        {
            "$unset": {"personal_info": ""},
            "$set": {"updated_at": datetime.datetime.now()}
        }
    )
    
    print(f"Deleted personal_info for user {user_id}")
    
    return SuccessResponse(
        success=True,
        message="Personal information deleted successfully"
    )

