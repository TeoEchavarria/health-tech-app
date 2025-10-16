from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
from services.foodAi_services import analyze_food_image, NutritionInfo
from utils.s3_utils import upload_temp_file_to_s3

router = APIRouter()


@router.post("/analyze-food", response_model=NutritionInfo)
async def analyze_food(
    image: UploadFile = File(..., description="Food image to analyze"),
    description: Optional[str] = Form(None, description="Optional text description of the food")
):
    """
    Analyzes a food image and returns estimated nutritional information.
    
    This endpoint:
    1. Receives a food image
    2. Uploads it temporarily to S3 (automatically deleted after 24 hours)
    3. Uses OpenAI Vision API to analyze the image
    4. Returns nutritional information: protein, carbohydrates, fat, and calories
    
    Args:
        image: Image file (JPEG, PNG, etc.)
        description: Optional text description of the food to improve analysis
        
    Returns:
        NutritionInfo: Estimated nutritional information with protein, carbs, fat, and calories
        
    Raises:
        HTTPException: If there's an error processing the image or analyzing it
    """
    try:
        # Validate that the file is an image
        if not image.content_type.startswith('image/'):
            raise HTTPException(
                status_code=400,
                detail=f"File must be an image. Received type: {image.content_type}"
            )
        
        # Read file content
        file_content = await image.read()
        
        # Determine file extension
        file_extension = image.filename.split('.')[-1] if '.' in image.filename else 'jpg'
        
        # Upload image to S3 and get temporary public URL
        image_url = upload_temp_file_to_s3(
            file_content=file_content,
            file_extension=file_extension,
            content_type=image.content_type,
            expiration_hours=12
        )
        
        # Analyze the image with OpenAI Vision API
        nutrition_info = analyze_food_image(
            image_url=image_url,
            description=description
        )
        
        return nutrition_info
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error analyzing image: {str(e)}"
        )

