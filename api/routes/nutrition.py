from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
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

class MealEntry(BaseModel):
    carbohydrates: float = Field(..., description="Carbohydrates in grams", ge=0)
    protein: float = Field(..., description="Protein in grams", ge=0)
    fat: float = Field(..., description="Fat in grams", ge=0)
    calories: float = Field(..., description="Calories in kcal", ge=0)
    timestamp: Optional[str] = Field(None, description="ISO 8601 timestamp for the meal entry (optional, defaults to now)")

class NutritionResponse(BaseModel):
    success: bool
    date: str
    total_carbohydrates: float
    total_protein: float
    total_fat: float
    total_calories: float
    meal_count: int
    message: Optional[str] = None

class DailyNutritionResponse(BaseModel):
    success: bool
    date: str
    total_carbohydrates: float
    total_protein: float
    total_fat: float
    total_calories: float
    internal_registers: List[Dict[str, Any]]

class SuccessResponse(BaseModel):
    success: bool
    message: Optional[str] = None

class BulkMealRequest(BaseModel):
    meals: List[MealEntry] = Field(..., description="List of meal entries to add")

class BulkNutritionResponse(BaseModel):
    success: bool
    total_meals_added: int
    dates_affected: List[str]
    daily_summaries: List[Dict[str, Any]]
    message: Optional[str] = None

# ============================================================================
# Helper Functions
# ============================================================================

def get_user_nutrition_collection(user_id: str):
    """Get the nutrition collection for a specific user"""
    db = mongo[f'hh_{user_id}']
    return db['nutrition']

def parse_timestamp(timestamp: Optional[str]) -> datetime.datetime:
    """Parse timestamp string to datetime, or return current time if None"""
    if timestamp:
        try:
            # Try parsing ISO format
            return datetime.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid timestamp format: {timestamp}. Use ISO 8601 format (e.g., 2025-10-17T14:30:00Z)"
            )
    return datetime.datetime.now(datetime.timezone.utc)

def get_date_from_timestamp(dt: datetime.datetime) -> str:
    """Extract date string (YYYY-MM-DD) from datetime"""
    return dt.strftime('%Y-%m-%d')

# ============================================================================
# Routes
# ============================================================================

@router.post("/nutrition/add-meal", response_model=NutritionResponse)
def add_meal(
    meal: MealEntry,
    user_id: str = Depends(verify_token)
):
    """
    Add a new meal entry to the nutrition tracker.
    
    This endpoint:
    - Accepts carbohydrates, protein, fat, and calories
    - Groups entries by date
    - Maintains running totals for the day
    - Stores individual meal entries with timestamps
    - Uses current time if no timestamp is provided
    
    Example request:
    ```json
    {
        "carbohydrates": 45.5,
        "protein": 25.0,
        "fat": 12.3,
        "calories": 380.0,
        "timestamp": "2025-10-17T14:30:00Z"  // optional
    }
    ```
    """
    # Verify user exists
    db = mongo[settings.MONGO_DB]
    users_collection = db['users']
    user = users_collection.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Parse timestamp and extract date
    meal_datetime = parse_timestamp(meal.timestamp)
    date_key = get_date_from_timestamp(meal_datetime)
    
    # Get user's nutrition collection
    nutrition_collection = get_user_nutrition_collection(user_id)
    
    # Create meal entry
    meal_entry = {
        "carbohydrates": meal.carbohydrates,
        "protein": meal.protein,
        "fat": meal.fat,
        "calories": meal.calories,
        "timestamp": meal_datetime.isoformat()
    }
    
    # Get existing daily record or create new one
    existing_record = nutrition_collection.find_one({"_id": date_key})
    
    if existing_record:
        # Update existing record
        new_total_carbs = existing_record.get("total_carbohydrates", 0) + meal.carbohydrates
        new_total_protein = existing_record.get("total_protein", 0) + meal.protein
        new_total_fat = existing_record.get("total_fat", 0) + meal.fat
        new_total_calories = existing_record.get("total_calories", 0) + meal.calories
        
        internal_registers = existing_record.get("internal_registers", [])
        internal_registers.append(meal_entry)
        
        nutrition_collection.update_one(
            {"_id": date_key},
            {
                "$set": {
                    "total_carbohydrates": new_total_carbs,
                    "total_protein": new_total_protein,
                    "total_fat": new_total_fat,
                    "total_calories": new_total_calories,
                    "internal_registers": internal_registers,
                    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
                }
            }
        )
        
        return NutritionResponse(
            success=True,
            date=date_key,
            total_carbohydrates=new_total_carbs,
            total_protein=new_total_protein,
            total_fat=new_total_fat,
            total_calories=new_total_calories,
            meal_count=len(internal_registers),
            message=f"Meal entry added successfully to {date_key}"
        )
    else:
        # Create new daily record
        new_record = {
            "_id": date_key,
            "date": date_key,
            "type": "nutrition",
            "total_carbohydrates": meal.carbohydrates,
            "total_protein": meal.protein,
            "total_fat": meal.fat,
            "total_calories": meal.calories,
            "internal_registers": [meal_entry],
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        
        nutrition_collection.insert_one(new_record)
        
        return NutritionResponse(
            success=True,
            date=date_key,
            total_carbohydrates=meal.carbohydrates,
            total_protein=meal.protein,
            total_fat=meal.fat,
            total_calories=meal.calories,
            meal_count=1,
            message=f"First meal entry created for {date_key}"
        )


@router.post("/nutrition/bulk-add-meals", response_model=BulkNutritionResponse)
def bulk_add_meals(
    request: BulkMealRequest,
    user_id: str = Depends(verify_token)
):
    """
    Add multiple meal entries at once to the nutrition tracker.
    
    This endpoint efficiently processes multiple meals, grouping them by date
    and updating daily totals in bulk.
    
    Example request:
    ```json
    {
        "meals": [
            {
                "carbohydrates": 45.5,
                "protein": 25.0,
                "fat": 12.3,
                "calories": 380.0,
                "timestamp": "2025-10-17T08:30:00Z"
            },
            {
                "carbohydrates": 60.0,
                "protein": 30.0,
                "fat": 15.0,
                "calories": 500.0,
                "timestamp": "2025-10-17T14:30:00Z"
            },
            {
                "carbohydrates": 40.0,
                "protein": 20.0,
                "fat": 10.0,
                "calories": 330.0,
                "timestamp": "2025-10-18T09:00:00Z"
            }
        ]
    }
    ```
    """
    # Verify user exists
    db = mongo[settings.MONGO_DB]
    users_collection = db['users']
    user = users_collection.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not request.meals or len(request.meals) == 0:
        raise HTTPException(status_code=400, detail="No meals provided")
    
    # Get user's nutrition collection
    nutrition_collection = get_user_nutrition_collection(user_id)
    
    # Group meals by date
    meals_by_date = {}
    for meal in request.meals:
        meal_datetime = parse_timestamp(meal.timestamp)
        date_key = get_date_from_timestamp(meal_datetime)
        
        meal_entry = {
            "carbohydrates": meal.carbohydrates,
            "protein": meal.protein,
            "fat": meal.fat,
            "calories": meal.calories,
            "timestamp": meal_datetime.isoformat()
        }
        
        if date_key not in meals_by_date:
            meals_by_date[date_key] = []
        meals_by_date[date_key].append(meal_entry)
    
    # Fetch existing records for all affected dates
    affected_dates = list(meals_by_date.keys())
    existing_records = {}
    for record in nutrition_collection.find({"_id": {"$in": affected_dates}}):
        existing_records[record["_id"]] = record
    
    # Prepare bulk operations
    bulk_operations = []
    daily_summaries = []
    
    for date_key, new_meals in meals_by_date.items():
        existing_record = existing_records.get(date_key)
        
        if existing_record:
            # Update existing record
            current_internal_registers = existing_record.get("internal_registers", [])
            updated_internal_registers = current_internal_registers + new_meals
            
            new_total_carbs = existing_record.get("total_carbohydrates", 0)
            new_total_protein = existing_record.get("total_protein", 0)
            new_total_fat = existing_record.get("total_fat", 0)
            new_total_calories = existing_record.get("total_calories", 0)
            
            for meal in new_meals:
                new_total_carbs += meal["carbohydrates"]
                new_total_protein += meal["protein"]
                new_total_fat += meal["fat"]
                new_total_calories += meal["calories"]
            
            bulk_operations.append(
                pymongo.UpdateOne(
                    {"_id": date_key},
                    {
                        "$set": {
                            "total_carbohydrates": new_total_carbs,
                            "total_protein": new_total_protein,
                            "total_fat": new_total_fat,
                            "total_calories": new_total_calories,
                            "internal_registers": updated_internal_registers,
                            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
                        }
                    }
                )
            )
            
            daily_summaries.append({
                "date": date_key,
                "total_carbohydrates": new_total_carbs,
                "total_protein": new_total_protein,
                "total_fat": new_total_fat,
                "total_calories": new_total_calories,
                "meal_count": len(updated_internal_registers),
                "new_meals_added": len(new_meals)
            })
        else:
            # Create new daily record
            total_carbs = sum(meal["carbohydrates"] for meal in new_meals)
            total_protein = sum(meal["protein"] for meal in new_meals)
            total_fat = sum(meal["fat"] for meal in new_meals)
            total_calories = sum(meal["calories"] for meal in new_meals)
            
            new_record = {
                "_id": date_key,
                "date": date_key,
                "type": "nutrition",
                "total_carbohydrates": total_carbs,
                "total_protein": total_protein,
                "total_fat": total_fat,
                "total_calories": total_calories,
                "internal_registers": new_meals,
                "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            
            bulk_operations.append(
                pymongo.ReplaceOne(
                    {"_id": date_key},
                    new_record,
                    upsert=True
                )
            )
            
            daily_summaries.append({
                "date": date_key,
                "total_carbohydrates": total_carbs,
                "total_protein": total_protein,
                "total_fat": total_fat,
                "total_calories": total_calories,
                "meal_count": len(new_meals),
                "new_meals_added": len(new_meals)
            })
    
    # Execute bulk operations
    if bulk_operations:
        result = nutrition_collection.bulk_write(bulk_operations, ordered=False)
        print(f"Bulk meal add: {result.upserted_count} days created, "
              f"{result.modified_count} days updated, {len(request.meals)} total meals added")
    
    # Sort daily summaries by date
    daily_summaries.sort(key=lambda x: x["date"])
    
    return BulkNutritionResponse(
        success=True,
        total_meals_added=len(request.meals),
        dates_affected=sorted(affected_dates),
        daily_summaries=daily_summaries,
        message=f"Successfully added {len(request.meals)} meals across {len(affected_dates)} day(s)"
    )


@router.get("/nutrition/daily", response_model=DailyNutritionResponse)
def get_daily_nutrition(
    date: Optional[str] = None,
    user_id: str = Depends(verify_token)
):
    """
    Get nutrition data for a specific date.
    
    If no date is provided, returns data for today.
    
    Example: GET /nutrition/daily?date=2025-10-17
    """
    # Verify user exists
    db = mongo[settings.MONGO_DB]
    users_collection = db['users']
    user = users_collection.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Use provided date or today's date
    if date:
        try:
            # Validate date format
            datetime.datetime.strptime(date, '%Y-%m-%d')
            date_key = date
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid date format: {date}. Use YYYY-MM-DD format (e.g., 2025-10-17)"
            )
    else:
        date_key = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
    
    # Get user's nutrition collection
    nutrition_collection = get_user_nutrition_collection(user_id)
    
    # Find the daily record
    record = nutrition_collection.find_one({"_id": date_key})
    
    if not record:
        # Return empty data if no records exist for this date
        return DailyNutritionResponse(
            success=True,
            date=date_key,
            total_carbohydrates=0.0,
            total_protein=0.0,
            total_fat=0.0,
            total_calories=0.0,
            internal_registers=[]
        )
    
    return DailyNutritionResponse(
        success=True,
        date=date_key,
        total_carbohydrates=record.get("total_carbohydrates", 0.0),
        total_protein=record.get("total_protein", 0.0),
        total_fat=record.get("total_fat", 0.0),
        total_calories=record.get("total_calories", 0.0),
        internal_registers=record.get("internal_registers", [])
    )


@router.delete("/nutrition/meal", response_model=SuccessResponse)
def delete_meal_entry(
    date: str,
    timestamp: str,
    user_id: str = Depends(verify_token)
):
    """
    Delete a specific meal entry from a date.
    
    Parameters:
    - date: Date in YYYY-MM-DD format
    - timestamp: ISO 8601 timestamp of the meal to delete
    
    Example: DELETE /nutrition/meal?date=2025-10-17&timestamp=2025-10-17T14:30:00Z
    """
    # Verify user exists
    db = mongo[settings.MONGO_DB]
    users_collection = db['users']
    user = users_collection.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Validate date format
    try:
        datetime.datetime.strptime(date, '%Y-%m-%d')
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date format: {date}. Use YYYY-MM-DD format"
        )
    
    # Get user's nutrition collection
    nutrition_collection = get_user_nutrition_collection(user_id)
    
    # Find the daily record
    record = nutrition_collection.find_one({"_id": date})
    
    if not record:
        raise HTTPException(status_code=404, detail=f"No nutrition data found for {date}")
    
    # Find and remove the meal entry
    internal_registers = record.get("internal_registers", [])
    meal_to_remove = None
    updated_registers = []
    
    for meal in internal_registers:
        if meal.get("timestamp") == timestamp:
            meal_to_remove = meal
        else:
            updated_registers.append(meal)
    
    if not meal_to_remove:
        raise HTTPException(
            status_code=404,
            detail=f"No meal entry found with timestamp {timestamp} on {date}"
        )
    
    # Recalculate totals
    new_total_carbs = record.get("total_carbohydrates", 0) - meal_to_remove.get("carbohydrates", 0)
    new_total_protein = record.get("total_protein", 0) - meal_to_remove.get("protein", 0)
    new_total_fat = record.get("total_fat", 0) - meal_to_remove.get("fat", 0)
    new_total_calories = record.get("total_calories", 0) - meal_to_remove.get("calories", 0)
    
    # Update or delete the daily record
    if len(updated_registers) == 0:
        # Delete the entire daily record if no meals left
        nutrition_collection.delete_one({"_id": date})
        return SuccessResponse(
            success=True,
            message=f"Last meal entry deleted. Daily record for {date} removed."
        )
    else:
        # Update the record with new totals and registers
        nutrition_collection.update_one(
            {"_id": date},
            {
                "$set": {
                    "total_carbohydrates": max(0, new_total_carbs),
                    "total_protein": max(0, new_total_protein),
                    "total_fat": max(0, new_total_fat),
                    "total_calories": max(0, new_total_calories),
                    "internal_registers": updated_registers,
                    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
                }
            }
        )
        
        return SuccessResponse(
            success=True,
            message=f"Meal entry deleted from {date}. {len(updated_registers)} meals remaining."
        )


@router.delete("/nutrition/daily", response_model=SuccessResponse)
def delete_daily_nutrition(
    date: str,
    user_id: str = Depends(verify_token)
):
    """
    Delete all nutrition data for a specific date.
    
    Example: DELETE /nutrition/daily?date=2025-10-17
    """
    # Verify user exists
    db = mongo[settings.MONGO_DB]
    users_collection = db['users']
    user = users_collection.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Validate date format
    try:
        datetime.datetime.strptime(date, '%Y-%m-%d')
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date format: {date}. Use YYYY-MM-DD format"
        )
    
    # Get user's nutrition collection
    nutrition_collection = get_user_nutrition_collection(user_id)
    
    # Delete the daily record
    result = nutrition_collection.delete_one({"_id": date})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"No nutrition data found for {date}")
    
    return SuccessResponse(
        success=True,
        message=f"All nutrition data for {date} deleted successfully"
    )

