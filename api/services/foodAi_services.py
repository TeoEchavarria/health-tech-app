
from openai import OpenAI
from pydantic import BaseModel
from typing import Optional
from config import settings

client = OpenAI(
    api_key=settings.OPENAI_API_KEY,
)

class NutritionInfo(BaseModel):
    protein: float
    carbs: float
    fat: float
    calories: float


def analyze_food_image(image_url: str, description: Optional[str] = None) -> NutritionInfo:
    """
    Given a food image URL (e.g., from S3) and an optional user-provided text description,
    this function uses OpenAI's vision model to estimate the food's macronutrients:
    protein, carbohydrates, fat (all in grams), and total calories.
    """
    # Create the content for the user message dynamically
    user_content = [
        {
            "type": "input_text",
            "text": (
                "Analyze this meal and estimate its macronutrients. "
                "Return numeric estimates for protein, carbohydrates, fat, and calories."
            ),
        },
        {"type": "input_image", "image_url": image_url},
    ]

    # If a text description was provided, include it as context
    if description:
        user_content.insert(
            0, {"type": "input_text", "text": f"Description of the meal: {description}"}
        )

    # Call OpenAI API with structured output
    response = client.responses.parse(
        model="gpt-4o-mini",  # use "gpt-4o" for higher accuracy
        input=[
            {
                "role": "system",
                "content": (
                    "You are a nutrition expert specialized in visual food analysis. "
                    "Given an image and a short text description of a meal, "
                    "estimate the nutritional content in grams for protein, carbohydrates, and fat, "
                    "and the total calories. Respond with realistic numeric values only."
                ),
            },
            {"role": "user", "content": user_content},
        ],
        text_format=NutritionInfo,
    )

    return response.output_parsed

