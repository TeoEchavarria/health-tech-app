from fastapi import APIRouter
from pydantic import BaseModel
import datetime

router = APIRouter()

# Pydantic Models
class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str
    service: str

@router.get("/health", response_model=HealthResponse)
def health_check():
    """
    Health check endpoint to verify the API is running
    """
    return HealthResponse(
        status="healthy",
        timestamp=datetime.datetime.now().isoformat(),
        version="2.0.0",
        service="HC Gateway API"
    )
