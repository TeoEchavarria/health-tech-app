import boto3
from botocore.exceptions import ClientError
from typing import BinaryIO, Union
from datetime import datetime
import uuid
from api.config import settings


class S3Manager:
    """
    Gestor de S3 para subir archivos temporales y generar presigned URLs.
    AWS S3 Lifecycle Policy elimina automáticamente los archivos después de 24 horas.
    """
    
    def __init__(self):
        """Inicializa el cliente de S3 con las credenciales de la configuración."""
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY
        )
        self.bucket_name = settings.AWS_S3_BUCKET
        self.temp_folder = "temp-uploads"
    
    def upload_temp_file(
        self,
        file_content: Union[bytes, BinaryIO],
        file_extension: str = "jpg",
        content_type: str = "image/jpeg",
        expiration_hours: int = 24
    ) -> str:
        """
        Sube un archivo temporal a S3 y retorna una presigned URL.
        
        Args:
            file_content: Contenido del archivo (bytes o file-like object)
            file_extension: Extensión del archivo (sin el punto)
            content_type: Tipo MIME del archivo
            expiration_hours: Horas de expiración de la presigned URL (máx 12 horas recomendado)
            
        Returns:
            str: Presigned URL pública que puede ser usada por APIs externas como OpenAI
            
        Raises:
            ClientError: Si hay un error al subir el archivo a S3
        """
        try:
            # Generar nombre único para el archivo
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            unique_id = str(uuid.uuid4())[:8]
            file_key = f"{self.temp_folder}/{timestamp}_{unique_id}.{file_extension}"
            
            # Configurar metadata para lifecycle policy
            metadata = {
                'uploaded-at': datetime.utcnow().isoformat(),
                'temp-file': 'true'
            }
            
            # Configurar tags para lifecycle policy (expiración automática)
            tagging = f"Type=temporary&ExpiresIn={expiration_hours}h"
            
            # Subir archivo a S3
            if isinstance(file_content, bytes):
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=file_key,
                    Body=file_content,
                    ContentType=content_type,
                    Metadata=metadata,
                    Tagging=tagging
                )
            else:
                self.s3_client.upload_fileobj(
                    file_content,
                    self.bucket_name,
                    file_key,
                    ExtraArgs={
                        'ContentType': content_type,
                        'Metadata': metadata,
                        'Tagging': tagging
                    }
                )
            
            # Generar presigned URL (máximo 12 horas por seguridad)
            presigned_url = self.generate_presigned_url(
                file_key,
                expiration_hours=min(expiration_hours, 12)
            )
            
            return presigned_url
            
        except ClientError as e:
            raise Exception(f"Error al subir archivo a S3: {str(e)}")
    
    def generate_presigned_url(self, file_key: str, expiration_hours: int = 12) -> str:
        """
        Genera una presigned URL para un archivo existente en S3.
        
        Args:
            file_key: Key del archivo en S3
            expiration_hours: Horas de validez de la URL (máx 12 horas)
            
        Returns:
            str: Presigned URL pública
        """
        try:
            expiration_seconds = min(expiration_hours, 12) * 3600  # Máximo 12 horas
            
            presigned_url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': file_key
                },
                ExpiresIn=expiration_seconds
            )
            
            return presigned_url
            
        except ClientError as e:
            raise Exception(f"Error al generar presigned URL: {str(e)}")


# Instancia global del gestor de S3
s3_manager = S3Manager()


# Función helper para uso directo
def upload_temp_file_to_s3(
    file_content: Union[bytes, BinaryIO],
    file_extension: str = "jpg",
    content_type: str = "image/jpeg",
    expiration_hours: int = 12
) -> str:
    """
    Función helper para subir archivos temporales a S3 y obtener presigned URL.
    
    Args:
        file_content: Contenido del archivo (bytes o file-like object)
        file_extension: Extensión del archivo (sin el punto)
        content_type: Tipo MIME del archivo
        expiration_hours: Horas de expiración de la presigned URL (máx 12 horas)
        
    Returns:
        str: Presigned URL pública que puede ser usada por OpenAI API
        
    Example:
        >>> with open("image.jpg", "rb") as f:
        >>>     url = upload_temp_file_to_s3(f, "jpg", "image/jpeg")
        >>>     # Usar url con OpenAI Vision API
    """
    return s3_manager.upload_temp_file(
        file_content=file_content,
        file_extension=file_extension,
        content_type=content_type,
        expiration_hours=expiration_hours
    )

