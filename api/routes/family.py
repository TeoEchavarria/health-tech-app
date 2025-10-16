from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from config import settings
from bson.errors import InvalidId
from bson.objectid import ObjectId
import pymongo
import datetime
from .login import verify_token

# Initialize MongoDB connection
mongo = pymongo.MongoClient(settings.MONGO_URI)

router = APIRouter()

# ============================================================================
# Pydantic Models
# ============================================================================

class CreateFamilyRequest(BaseModel):
    name: Optional[str] = Field(None, description="Optional name for the family")
    members: Optional[List[str]] = Field(default_factory=list, description="List of user IDs to add as members")

class AddMemberRequest(BaseModel):
    user_id: str = Field(..., description="User ID to add to the family")

class UpdateFridgeRequest(BaseModel):
    fridge: Dict[str, Any] = Field(..., description="Fridge data to update")

class FamilyResponse(BaseModel):
    id: str = Field(..., alias="_id")
    name: Optional[str]
    members: List[str]
    fridge: Dict[str, Any]
    created_at: str
    updated_at: str

    class Config:
        populate_by_name = True

class FamilyListResponse(BaseModel):
    families: List[FamilyResponse]

class SuccessResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    family_id: Optional[str] = None

# ============================================================================
# Helper Functions
# ============================================================================

def get_family_collection():
    """Get the family collection from MongoDB"""
    db = mongo[settings.MONGO_DB]
    return db['family']

def get_user_collection():
    """Get the users collection from MongoDB"""
    db = mongo[settings.MONGO_DB]
    return db['users']

def validate_user_exists(user_id: str) -> bool:
    """Check if a user exists"""
    users = get_user_collection()
    try:
        user = users.find_one({'_id': user_id})
        return user is not None
    except InvalidId:
        return False

def normalize_fridge_keys(fridge_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize all keys in the fridge data to lowercase.
    Handles nested dictionaries recursively.
    """
    if not isinstance(fridge_data, dict):
        return fridge_data
    
    normalized = {}
    for key, value in fridge_data.items():
        # Convert key to lowercase
        normalized_key = key.lower()
        
        # If value is a dict, recursively normalize it
        if isinstance(value, dict):
            normalized[normalized_key] = normalize_fridge_keys(value)
        # If value is a list, check if it contains dicts and normalize them
        elif isinstance(value, list):
            normalized[normalized_key] = [
                normalize_fridge_keys(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            normalized[normalized_key] = value
    
    return normalized

# ============================================================================
# Routes
# ============================================================================

@router.post("/family", response_model=SuccessResponse, status_code=201)
def create_family(request: CreateFamilyRequest, user_id: str = Depends(verify_token)):
    """
    Create a new family. The requesting user is automatically added as a member.
    Optionally add other members and set a family name.
    """
    families = get_family_collection()
    users = get_user_collection()
    
    # Validate that the requesting user exists
    if not validate_user_exists(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    
    # Start with the requesting user as a member
    members = [user_id]
    
    # Validate and add additional members if provided
    if request.members:
        for member_id in request.members:
            if member_id not in members:  # Avoid duplicates
                if validate_user_exists(member_id):
                    members.append(member_id)
                else:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"User {member_id} not found"
                    )
    
    # Create the family document
    now = datetime.datetime.now()
    family_doc = {
        "_id": str(ObjectId()),  # Generate a new unique ID
        "name": request.name,
        "members": members,
        "fridge": {},
        "created_at": now,
        "updated_at": now
    }
    
    # Insert the family
    families.insert_one(family_doc)
    family_id = family_doc["_id"]
    
    # Update all members to add this family to their families list
    users.update_many(
        {"_id": {"$in": members}},
        {"$addToSet": {"families": family_id}}
    )
    
    print(f"Created family {family_id} with {len(members)} members")
    
    return SuccessResponse(
        success=True,
        message=f"Family created successfully with {len(members)} member(s)",
        family_id=family_id
    )


@router.get("/family", response_model=FamilyListResponse)
def get_user_families(user_id: str = Depends(verify_token)):
    """
    Get all families that the current user belongs to.
    """
    users = get_user_collection()
    families = get_family_collection()
    
    # Get the user document
    user = users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get the user's family IDs
    family_ids = user.get("families", [])
    
    if not family_ids:
        return FamilyListResponse(families=[])
    
    # Fetch all families
    family_docs = list(families.find({"_id": {"$in": family_ids}}))
    
    # Convert to response model
    family_responses = []
    for doc in family_docs:
        family_responses.append(FamilyResponse(
            _id=doc["_id"],
            name=doc.get("name"),
            members=doc.get("members", []),
            fridge=doc.get("fridge", {}),
            created_at=doc.get("created_at", datetime.datetime.now()).isoformat(),
            updated_at=doc.get("updated_at", datetime.datetime.now()).isoformat()
        ))
    
    return FamilyListResponse(families=family_responses)


@router.get("/family/{family_id}", response_model=FamilyResponse)
def get_family(family_id: str, user_id: str = Depends(verify_token)):
    """
    Get details of a specific family. User must be a member of the family.
    """
    families = get_family_collection()
    
    # Find the family
    family = families.find_one({"_id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    # Check if user is a member
    if user_id not in family.get("members", []):
        raise HTTPException(
            status_code=403, 
            detail="You are not a member of this family"
        )
    
    return FamilyResponse(
        _id=family["_id"],
        name=family.get("name"),
        members=family.get("members", []),
        fridge=family.get("fridge", {}),
        created_at=family.get("created_at", datetime.datetime.now()).isoformat(),
        updated_at=family.get("updated_at", datetime.datetime.now()).isoformat()
    )


@router.post("/family/{family_id}/member", response_model=SuccessResponse)
def add_family_member(
    family_id: str, 
    request: AddMemberRequest, 
    user_id: str = Depends(verify_token)
):
    """
    Add a new member to a family. Only existing family members can add new members.
    """
    families = get_family_collection()
    users = get_user_collection()
    
    # Find the family
    family = families.find_one({"_id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    # Check if requesting user is a member
    if user_id not in family.get("members", []):
        raise HTTPException(
            status_code=403, 
            detail="Only family members can add new members"
        )
    
    # Check if the new member exists
    new_member_id = request.user_id
    if not validate_user_exists(new_member_id):
        raise HTTPException(status_code=404, detail="User to add not found")
    
    # Check if already a member
    if new_member_id in family.get("members", []):
        raise HTTPException(status_code=400, detail="User is already a member")
    
    # Add member to family
    families.update_one(
        {"_id": family_id},
        {
            "$push": {"members": new_member_id},
            "$set": {"updated_at": datetime.datetime.now()}
        }
    )
    
    # Add family to user's families list
    users.update_one(
        {"_id": new_member_id},
        {"$addToSet": {"families": family_id}}
    )
    
    print(f"Added user {new_member_id} to family {family_id}")
    
    return SuccessResponse(
        success=True,
        message=f"Member added successfully to family",
        family_id=family_id
    )


@router.delete("/family/{family_id}/member/{member_id}", response_model=SuccessResponse)
def remove_family_member(
    family_id: str, 
    member_id: str, 
    user_id: str = Depends(verify_token)
):
    """
    Remove a member from a family. Users can remove themselves, or any member can remove others.
    If the last member leaves, the family is deleted.
    """
    families = get_family_collection()
    users = get_user_collection()
    
    # Find the family
    family = families.find_one({"_id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    # Check if requesting user is a member
    if user_id not in family.get("members", []):
        raise HTTPException(
            status_code=403, 
            detail="You are not a member of this family"
        )
    
    # Check if member to remove exists in family
    if member_id not in family.get("members", []):
        raise HTTPException(status_code=400, detail="User is not a member of this family")
    
    # Remove member from family
    families.update_one(
        {"_id": family_id},
        {
            "$pull": {"members": member_id},
            "$set": {"updated_at": datetime.datetime.now()}
        }
    )
    
    # Remove family from user's families list
    users.update_one(
        {"_id": member_id},
        {"$pull": {"families": family_id}}
    )
    
    # Check if family is now empty
    updated_family = families.find_one({"_id": family_id})
    if not updated_family.get("members", []):
        # Delete the family if no members left
        families.delete_one({"_id": family_id})
        print(f"Deleted empty family {family_id}")
        return SuccessResponse(
            success=True,
            message="Member removed and family deleted (no members left)"
        )
    
    print(f"Removed user {member_id} from family {family_id}")
    
    return SuccessResponse(
        success=True,
        message="Member removed successfully from family",
        family_id=family_id
    )


@router.put("/family/{family_id}/fridge", response_model=SuccessResponse)
def update_family_fridge(
    family_id: str, 
    request: UpdateFridgeRequest, 
    user_id: str = Depends(verify_token)
):
    """
    Update the fridge data for a family. Only family members can update the fridge.
    All keys are automatically normalized to lowercase.
    """
    families = get_family_collection()
    
    # Find the family
    family = families.find_one({"_id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    # Check if user is a member
    if user_id not in family.get("members", []):
        raise HTTPException(
            status_code=403, 
            detail="Only family members can update the fridge"
        )
    
    # Normalize all keys to lowercase
    normalized_fridge = normalize_fridge_keys(request.fridge)
    
    # Update the fridge
    families.update_one(
        {"_id": family_id},
        {
            "$set": {
                "fridge": normalized_fridge,
                "updated_at": datetime.datetime.now()
            }
        }
    )
    
    print(f"Updated fridge for family {family_id}")
    
    return SuccessResponse(
        success=True,
        message="Fridge updated successfully",
        family_id=family_id
    )


@router.patch("/family/{family_id}/fridge", response_model=SuccessResponse)
def patch_family_fridge(
    family_id: str, 
    request: UpdateFridgeRequest, 
    user_id: str = Depends(verify_token)
):
    """
    Partially update the fridge data (merge with existing). Only family members can update.
    All keys are automatically normalized to lowercase.
    """
    families = get_family_collection()
    
    # Find the family
    family = families.find_one({"_id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    # Check if user is a member
    if user_id not in family.get("members", []):
        raise HTTPException(
            status_code=403, 
            detail="Only family members can update the fridge"
        )
    
    # Normalize incoming data keys to lowercase
    normalized_new_data = normalize_fridge_keys(request.fridge)
    
    # Merge the fridge data (current fridge should already be normalized from previous updates)
    current_fridge = family.get("fridge", {})
    current_fridge.update(normalized_new_data)
    
    families.update_one(
        {"_id": family_id},
        {
            "$set": {
                "fridge": current_fridge,
                "updated_at": datetime.datetime.now()
            }
        }
    )
    
    print(f"Patched fridge for family {family_id}")
    
    return SuccessResponse(
        success=True,
        message="Fridge updated successfully",
        family_id=family_id
    )


@router.delete("/family/{family_id}", response_model=SuccessResponse)
def delete_family(family_id: str, user_id: str = Depends(verify_token)):
    """
    Delete a family. Only family members can delete the family.
    All members will have this family removed from their families list.
    """
    families = get_family_collection()
    users = get_user_collection()
    
    # Find the family
    family = families.find_one({"_id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    # Check if user is a member
    if user_id not in family.get("members", []):
        raise HTTPException(
            status_code=403, 
            detail="Only family members can delete the family"
        )
    
    # Remove family from all members' families lists
    members = family.get("members", [])
    users.update_many(
        {"_id": {"$in": members}},
        {"$pull": {"families": family_id}}
    )
    
    # Delete the family
    families.delete_one({"_id": family_id})
    
    print(f"Deleted family {family_id}")
    
    return SuccessResponse(
        success=True,
        message="Family deleted successfully"
    )
