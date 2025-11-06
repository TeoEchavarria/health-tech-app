from fastapi import APIRouter, UploadFile, File, HTTPException
from io import BytesIO
from openai import OpenAI
from config import settings
from pydantic import BaseModel

router = APIRouter()

# Initialize OpenAI client
client = OpenAI(
    api_key=settings.OPENAI_API_KEY,
)

# Response model
class TranscriptionResponse(BaseModel):
    text: str

# Valid audio formats supported by OpenAI
VALID_AUDIO_FORMATS = {
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/mpeg4',
    'audio/m4a', 'audio/wav', 'audio/webm', 'audio/mpga',
    'audio/x-m4a', 'audio/vnd.wave'
}

VALID_AUDIO_EXTENSIONS = {
    'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'
}

@router.post("/ai-merge", response_model=TranscriptionResponse)
async def ai_merge(
    file: UploadFile = File(..., description="Audio file to transcribe (.mpeg4, .mp3, .mp4, .wav, etc.)"),
):
    """
    Transcribe an audio file using OpenAI's transcription API.
    
    Args:
        file: Audio file to transcribe (supports mp3, mp4, mpeg, mpga, m4a, wav, webm)
    
    Returns:
        TranscriptionResponse with the transcribed text
    """
    try:
        # Validate file format
        content_type = file.content_type or ""
        filename = file.filename or ""
        
        # Check content type
        is_valid_content_type = (
            content_type.startswith('audio/') or 
            content_type in VALID_AUDIO_FORMATS
        )
        
        # Check file extension as fallback
        file_extension = filename.split('.')[-1].lower() if '.' in filename else ''
        is_valid_extension = file_extension in VALID_AUDIO_EXTENSIONS
        
        if not is_valid_content_type and not is_valid_extension:
            raise HTTPException(
                status_code=400,
                detail=f"File must be an audio file. Received content_type: {content_type}, extension: {file_extension}. "
                       f"Supported formats: {', '.join(VALID_AUDIO_EXTENSIONS)}"
            )
        
        # Read file content
        file_content = await file.read()
        
        if not file_content:
            raise HTTPException(
                status_code=400,
                detail="File is empty"
            )
        
        # Create a file-like object from bytes
        file_obj = BytesIO(file_content)
        file_obj.name = filename or "audio.mp3"
        
        # Call OpenAI transcription API
        # Note: Using "whisper-1" as the standard model, but user specified "gpt-4o-transcribe"
        # Trying gpt-4o-transcribe first, falling back to whisper-1 if not available
        try:
            transcript = client.audio.transcriptions.create(
                model="gpt-4o-transcribe",
                file=file_obj
            )
        except Exception as model_error:
            # If gpt-4o-transcribe is not available, try whisper-1
            if "gpt-4o-transcribe" in str(model_error).lower():
                file_obj.seek(0)  # Reset file pointer
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=file_obj
                )
            else:
                raise
        
        # Extract text from response
        transcribed_text = transcript.text
        
        return TranscriptionResponse(text=transcribed_text)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error transcribing audio: {str(e)}"
        )

