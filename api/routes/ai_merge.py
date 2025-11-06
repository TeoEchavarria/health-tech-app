from fastapi import APIRouter, Request, HTTPException
from io import BytesIO
from openai import OpenAI
from config import settings
from pydantic import BaseModel
import logging
import re

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

# Valid audio and video formats supported by OpenAI Whisper
VALID_AUDIO_FORMATS = {
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/mpeg4',
    'audio/m4a', 'audio/wav', 'audio/webm', 'audio/mpga',
    'audio/x-m4a', 'audio/vnd.wave',
    'audio/aac', 'audio/x-aac', 'audio/aacp',
    'video/mp4', 'video/webm', 'video/mpeg'
}

VALID_AUDIO_EXTENSIONS = {
    'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'aac'
}

@router.post("/ai-merge", response_model=TranscriptionResponse)
async def ai_merge(request: Request):
    """
    Transcribe an audio or video file using OpenAI's transcription API.
    
    The file should be sent directly in the request body (Content-Type: audio/* or video/*).
    OpenAI Whisper can process both audio and video files, extracting audio from videos automatically.
    
    Args:
        request: FastAPI Request object containing the audio/video file in the body
    
    Returns:
        TranscriptionResponse with the transcribed text
    """
    try:
        # Log request information
        logger.info("=== AI Merge Request Received ===")
        logger.info(f"Request URL: {request.url}")
        logger.info(f"Request method: {request.method}")
        
        # Get content type from headers
        content_type = request.headers.get("content-type", "").split(";")[0].strip()
        
        # Try to get filename from Content-Disposition header
        filename = ""
        content_disposition = request.headers.get("content-disposition", "")
        if content_disposition:
            # Extract filename from Content-Disposition: attachment; filename="audio.mp4"
            filename_match = re.search(r'filename[^;=\n]*=(([\'"]).*?\2|[^;\n]*)', content_disposition)
            if filename_match:
                filename = filename_match.group(1).strip('"\'')
        
        # Log request headers
        headers_dict = {key: value for key, value in request.headers.items()}
        logger.info(f"Request headers: {headers_dict}")
        logger.info(f"Filename from headers: {filename}")
        logger.info(f"Content-Type: {content_type}")
        
        # Check content type
        is_valid_content_type = (
            content_type.startswith('audio/') or 
            content_type.startswith('video/') or 
            content_type in VALID_AUDIO_FORMATS
        )
        
        # Check file extension as fallback
        file_extension = ""
        if filename:
            file_extension = filename.split('.')[-1].lower() if '.' in filename else ''
        else:
            # Try to infer extension from content-type
            content_type_to_extension = {
                'audio/mpeg': 'mp3',
                'audio/mp3': 'mp3',
                'audio/mp4': 'mp4',
                'audio/mpeg4': 'mpeg4',
                'audio/m4a': 'm4a',
                'audio/x-m4a': 'm4a',
                'audio/wav': 'wav',
                'audio/vnd.wave': 'wav',
                'audio/webm': 'webm',
                'audio/mpga': 'mpga',
                'audio/aac': 'aac',
                'audio/x-aac': 'aac',
                'audio/aacp': 'aac',
                'video/mp4': 'mp4',
                'video/webm': 'webm',
                'video/mpeg': 'mpeg',
            }
            file_extension = content_type_to_extension.get(content_type, '')
        
        is_valid_extension = file_extension in VALID_AUDIO_EXTENSIONS if file_extension else False
        
        logger.info(f"File extension: {file_extension}")
        logger.info(f"Is valid content type: {is_valid_content_type}")
        logger.info(f"Is valid extension: {is_valid_extension}")
        
        if not is_valid_content_type and not is_valid_extension:
            logger.warning(f"BAD REQUEST: Invalid file format - content_type: {content_type}, extension: {file_extension}")
            raise HTTPException(
                status_code=400,
                detail=f"File must be an audio or video file. Received content_type: {content_type}, extension: {file_extension}. "
                       f"Supported formats: {', '.join(VALID_AUDIO_EXTENSIONS)}"
            )
        
        # Read file content from request body
        file_content = await request.body()
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
        # Set filename for OpenAI API (use extension if no filename)
        if filename:
            file_obj.name = filename
        elif file_extension:
            file_obj.name = f"audio.{file_extension}"
        else:
            file_obj.name = "audio.mp3"  # Default fallback
        
        logger.info(f"Using filename for OpenAI: {file_obj.name}")
        
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

