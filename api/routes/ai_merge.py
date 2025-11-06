from fastapi import APIRouter, UploadFile, File, HTTPException
from io import BytesIO
from openai import OpenAI
from config import settings
from pydantic import BaseModel
import logging

# Configure logger
logger = logging.getLogger(__name__)

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
        # Log request information
        logger.info("=== AI Merge Request Received ===")
        
        # Validate file format
        content_type = file.content_type or ""
        filename = file.filename or ""
        
        # Log file metadata
        logger.info(f"Filename: {filename}")
        logger.info(f"Content-Type: {content_type}")
        logger.info(f"File headers: {dict(file.headers) if hasattr(file, 'headers') else 'N/A'}")
        
        # Check content type
        is_valid_content_type = (
            content_type.startswith('audio/') or 
            content_type in VALID_AUDIO_FORMATS
        )
        
        # Check file extension as fallback
        file_extension = filename.split('.')[-1].lower() if '.' in filename else ''
        is_valid_extension = file_extension in VALID_AUDIO_EXTENSIONS
        
        logger.info(f"File extension: {file_extension}")
        logger.info(f"Is valid content type: {is_valid_content_type}")
        logger.info(f"Is valid extension: {is_valid_extension}")
        
        if not is_valid_content_type and not is_valid_extension:
            logger.warning(f"BAD REQUEST: Invalid file format - content_type: {content_type}, extension: {file_extension}")
            raise HTTPException(
                status_code=400,
                detail=f"File must be an audio file. Received content_type: {content_type}, extension: {file_extension}. "
                       f"Supported formats: {', '.join(VALID_AUDIO_EXTENSIONS)}"
            )
        
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        
        logger.info(f"File size: {file_size} bytes")
        
        if not file_content:
            logger.warning("BAD REQUEST: File is empty")
            raise HTTPException(
                status_code=400,
                detail="File is empty"
            )
        
        # Create a file-like object from bytes
        file_obj = BytesIO(file_content)
        file_obj.name = filename or "audio.mp3"
        
        logger.info(f"Calling OpenAI transcription API with model: gpt-4o-transcribe")
        
        # Call OpenAI transcription API
        # Note: Using "whisper-1" as the standard model, but user specified "gpt-4o-transcribe"
        # Trying gpt-4o-transcribe first, falling back to whisper-1 if not available
        try:
            transcript = client.audio.transcriptions.create(
                model="gpt-4o-transcribe",
                file=file_obj
            )
            logger.info("Transcription successful with gpt-4o-transcribe")
        except Exception as model_error:
            logger.warning(f"Error with gpt-4o-transcribe: {str(model_error)}")
            # If gpt-4o-transcribe is not available, try whisper-1
            if "gpt-4o-transcribe" in str(model_error).lower():
                logger.info("Falling back to whisper-1 model")
                file_obj.seek(0)  # Reset file pointer
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=file_obj
                )
                logger.info("Transcription successful with whisper-1")
            else:
                logger.error(f"Error in OpenAI API call: {str(model_error)}")
                raise
        
        # Extract text from response
        transcribed_text = transcript.text
        
        logger.info(f"Transcription completed. Text length: {len(transcribed_text)} characters")
        logger.info("=== AI Merge Request Completed Successfully ===")
        
        return TranscriptionResponse(text=transcribed_text)
        
    except HTTPException as http_exc:
        logger.error(f"HTTPException raised: status_code={http_exc.status_code}, detail={http_exc.detail}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in ai_merge: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error transcribing audio: {str(e)}"
        )

