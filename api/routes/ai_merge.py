from fastapi import APIRouter, Request, HTTPException
from io import BytesIO
from openai import OpenAI
from config import settings
from pydantic import BaseModel
import logging, re, tempfile, os, subprocess, shlex

logger = logging.getLogger(__name__)
router = APIRouter()
client = OpenAI(api_key=settings.OPENAI_API_KEY)

class TranscriptionResponse(BaseModel):
    text: str

SUPPORTED_FOR_OPENAI = {"mp3","mp4","mpeg","mpga","m4a","wav","webm"}

def _safe_ext_from_content_type(ct: str) -> str:
    m = {
        "audio/mpeg":"mp3", "audio/mp3":"mp3", "audio/mpga":"mpga",
        "audio/mp4":"mp4", "audio/m4a":"m4a", "audio/x-m4a":"m4a",
        "audio/wav":"wav", "audio/vnd.wave":"wav",
        "audio/webm":"webm", "video/webm":"webm",
        "video/mp4":"mp4", "video/mpeg":"mpeg",
        "audio/aac":"aac", "audio/x-aac":"aac", "audio/aacp":"aac",
    }
    return m.get(ct, "")

def transcode_to_wav(input_path: str) -> str:
    out_fd, out_path = tempfile.mkstemp(suffix=".wav")
    os.close(out_fd)
    cmd = f'ffmpeg -y -i {shlex.quote(input_path)} -ac 1 -ar 16000 -c:a pcm_s16le {shlex.quote(out_path)}'
    proc = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0 or not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr.decode(errors='ignore')[:4000]}")
    return out_path

@router.post("/ai-merge", response_model=TranscriptionResponse)
async def ai_merge(request: Request):
    try:
        logger.info("=== AI Merge Request Received ===")
        logger.info(f"Request URL: {request.url}")
        logger.info(f"Request method: {request.method}")

        content_type = request.headers.get("content-type","").split(";")[0].strip()
        content_disposition = request.headers.get("content-disposition","")
        filename = ""
        if content_disposition:
            m = re.search(r'filename[^;=\n]*=(([\'"]).*?\2|[^;\n]*)', content_disposition)
            if m:
                filename = m.group(1).strip('"\'')
        headers_dict = {k:v for k,v in request.headers.items()}
        logger.info(f"Request headers: {headers_dict}")

        body = await request.body()
        if not body:
            raise HTTPException(status_code=400, detail="File is empty")

        # Escribe input a un archivo temporal
        in_ext = filename.split(".")[-1].lower() if "." in filename else _safe_ext_from_content_type(content_type) or "bin"
        in_fd, in_path = tempfile.mkstemp(suffix=f".{in_ext}")
        os.close(in_fd)
        with open(in_path, "wb") as f:
            f.write(body)
        logger.info(f"Saved input to {in_path} ({len(body)} bytes)")

        # Si no es un formato 100% seguro, transcodificamos a WAV
        needs_transcode = (in_ext not in SUPPORTED_FOR_OPENAI) or (content_type in {"audio/aac","audio/x-aac","audio/aacp"})
        try:
            if needs_transcode:
                out_path = transcode_to_wav(in_path)
                openai_path = out_path
                openai_filename = "audio.wav"
                logger.info(f"Transcoded {in_path} -> {openai_path}")
            else:
                # Aun así, muchas “mp4/m4a” problemáticas se arreglan transcodificando.
                # Si quieres forzar robustez total, descomenta la siguiente línea:
                # openai_path = transcode_to_wav(in_path); openai_filename = "audio.wav"
                openai_path = in_path
                openai_filename = os.path.basename(in_path)

            with open(openai_path, "rb") as f:
                try:
                    transcript = client.audio.transcriptions.create(
                        model="gpt-4o-transcribe",  # o "gpt-4o-mini-transcribe" / "whisper-1"
                        file=(openai_filename, f, "audio/wav" if openai_filename.endswith(".wav") else None)
                    )
                    text = transcript.text
                except Exception as e1:
                    logger.warning(f"gpt-4o-transcribe failed: {e1}")
                    f.seek(0)
                    transcript = client.audio.transcriptions.create(
                        model="whisper-1",
                        file=(openai_filename, f, "audio/wav" if openai_filename.endswith(".wav") else None)
                    )
                    text = transcript.text

            return TranscriptionResponse(text=text)
        finally:
            # Limpieza
            try: os.remove(in_path)
            except: pass
            try:
                if 'out_path' in locals() and os.path.exists(out_path):
                    os.remove(out_path)
            except: pass

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in ai_merge: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error transcribing audio: {e}")
