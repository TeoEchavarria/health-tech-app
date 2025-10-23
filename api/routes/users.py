from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional
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

class UserInfo(BaseModel):
    id: str = Field(..., alias="_id")
    username: str
    name: Optional[str] = None
    email: Optional[str] = None
    created_at: str
    updated_at: str

    class Config:
        populate_by_name = True

class BatchUsersRequest(BaseModel):
    user_ids: List[str] = Field(..., description="List of user IDs to fetch")

class BatchUsersResponse(BaseModel):
    users: List[UserInfo]

class UserResponse(BaseModel):
    id: str = Field(..., alias="_id")
    username: str
    name: Optional[str] = None
    email: Optional[str] = None
    created_at: str
    updated_at: str

    class Config:
        populate_by_name = True

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

@router.post("/users/batch", response_model=BatchUsersResponse)
def get_users_batch(request: BatchUsersRequest, user_id: str = Depends(verify_token)):
    """
    Get information for multiple users by their IDs.
    """
    users = get_user_collection()
    
    # Get all users by IDs
    user_docs = list(users.find({"_id": {"$in": request.user_ids}}))
    
    # Create UserInfo objects
    user_list = []
    for user in user_docs:
        user_list.append(UserInfo(
            _id=user["_id"],
            username=user.get("username", ""),
            name=user.get("name"),
            email=user.get("email"),
            created_at=user.get("created_at", datetime.datetime.now()).isoformat(),
            updated_at=user.get("updated_at", datetime.datetime.now()).isoformat()
        ))
    
    return BatchUsersResponse(users=user_list)


@router.get("/user/{user_id}", response_model=UserResponse)
def get_user_by_id(user_id: str, current_user_id: str = Depends(verify_token)):
    """
    Get information for a specific user by their ID.
    """
    users = get_user_collection()
    
    # Find the user
    user = users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(
        _id=user["_id"],
        username=user.get("username", ""),
        name=user.get("name"),
        email=user.get("email"),
        created_at=user.get("created_at", datetime.datetime.now()).isoformat(),
        updated_at=user.get("updated_at", datetime.datetime.now()).isoformat()
    )


@router.get("/user/profile", response_model=UserResponse)
def get_user_profile(user_id: str = Depends(verify_token)):
    """
    Get the profile information of the authenticated user.
    """
    users = get_user_collection()
    
    # Get the current user
    user = users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(
        _id=user["_id"],
        username=user.get("username", ""),
        name=user.get("name"),
        email=user.get("email"),
        created_at=user.get("created_at", datetime.datetime.now()).isoformat(),
        updated_at=user.get("updated_at", datetime.datetime.now()).isoformat()
    )
