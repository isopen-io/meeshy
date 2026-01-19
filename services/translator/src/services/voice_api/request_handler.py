"""
Request Handler - HTTP request validation and payload processing
Handles request parsing, validation, and audio data conversion.
"""

import base64
import logging
import os
import tempfile
from typing import Dict, Optional
from contextlib import asynccontextmanager
import uuid

logger = logging.getLogger(__name__)


class RequestHandler:
    """
    Handles HTTP request validation, payload parsing, and audio data conversion.
    Validates inputs and converts between different audio formats (base64, file paths).
    """

    def __init__(self, temp_dir: Optional[str] = None):
        """
        Initialize request handler.

        Args:
            temp_dir: Directory for temporary audio files
        """
        self.temp_dir = temp_dir or tempfile.gettempdir()
        logger.info("[RequestHandler] Initialized")

    def validate_translate_request(self, request_data: Dict) -> tuple[bool, Optional[str], Optional[str]]:
        """
        Validate translation request payload.

        Args:
            request_data: Request payload dictionary

        Returns:
            Tuple of (is_valid, error_message, error_code)
        """
        audio_base64 = request_data.get('audioBase64')
        audio_path = request_data.get('audioPath')
        target_languages = request_data.get('targetLanguages', [])

        # Check audio input
        if not audio_base64 and not audio_path:
            return False, "Audio data or path required", "INVALID_REQUEST"

        # Check target languages
        if not target_languages:
            return False, "Target languages required", "INVALID_REQUEST"

        if not isinstance(target_languages, list):
            return False, "Target languages must be a list", "INVALID_REQUEST"

        return True, None, None

    def validate_analyze_request(self, request_data: Dict) -> tuple[bool, Optional[str], Optional[str]]:
        """
        Validate analysis request payload.

        Args:
            request_data: Request payload dictionary

        Returns:
            Tuple of (is_valid, error_message, error_code)
        """
        audio_base64 = request_data.get('audioBase64')
        audio_path = request_data.get('audioPath')

        if not audio_base64 and not audio_path:
            return False, "Audio data or path required", "INVALID_REQUEST"

        return True, None, None

    def validate_compare_request(self, request_data: Dict) -> tuple[bool, Optional[str], Optional[str]]:
        """
        Validate voice comparison request payload.

        Args:
            request_data: Request payload dictionary

        Returns:
            Tuple of (is_valid, error_message, error_code)
        """
        audio_base64_1 = request_data.get('audioBase64_1')
        audio_path_1 = request_data.get('audioPath_1')
        audio_base64_2 = request_data.get('audioBase64_2')
        audio_path_2 = request_data.get('audioPath_2')

        if not (audio_base64_1 or audio_path_1):
            return False, "First audio data or path required", "INVALID_REQUEST"

        if not (audio_base64_2 or audio_path_2):
            return False, "Second audio data or path required", "INVALID_REQUEST"

        return True, None, None

    def validate_profile_create_request(self, request_data: Dict) -> tuple[bool, Optional[str], Optional[str]]:
        """
        Validate profile creation request payload.

        Args:
            request_data: Request payload dictionary

        Returns:
            Tuple of (is_valid, error_message, error_code)
        """
        user_id = request_data.get('userId')
        audio_base64 = request_data.get('audioBase64')
        audio_path = request_data.get('audioPath')

        if not user_id:
            return False, "User ID required", "INVALID_REQUEST"

        if not audio_base64 and not audio_path:
            return False, "Audio data or path required", "INVALID_REQUEST"

        return True, None, None

    def validate_feedback_request(self, request_data: Dict) -> tuple[bool, Optional[str], Optional[str]]:
        """
        Validate feedback submission request.

        Args:
            request_data: Request payload dictionary

        Returns:
            Tuple of (is_valid, error_message, error_code)
        """
        user_id = request_data.get('userId')
        translation_id = request_data.get('translationId')
        rating = request_data.get('rating')

        if not user_id:
            return False, "User ID required", "INVALID_REQUEST"

        if not translation_id:
            return False, "Translation ID required", "INVALID_REQUEST"

        if rating is None:
            return False, "Rating required", "INVALID_REQUEST"

        if not isinstance(rating, (int, float)) or rating < 0 or rating > 5:
            return False, "Rating must be between 0 and 5", "INVALID_REQUEST"

        return True, None, None

    async def save_audio_base64(self, audio_base64: str, persist: bool = False) -> str:
        """
        Save base64-encoded audio to temporary file.

        Args:
            audio_base64: Base64-encoded audio data
            persist: Whether to persist the file in temp_dir

        Returns:
            Path to saved audio file

        Raises:
            ValueError: If base64 decoding fails
        """
        try:
            # Decode base64
            audio_data = base64.b64decode(audio_base64)

            # Create temp file
            suffix = '.wav'  # Default to WAV
            if persist:
                fd, path = tempfile.mkstemp(suffix=suffix, dir=self.temp_dir)
            else:
                fd, path = tempfile.mkstemp(suffix=suffix)

            with os.fdopen(fd, 'wb') as f:
                f.write(audio_data)

            logger.debug(f"Saved audio to {path} ({len(audio_data)} bytes)")
            return path

        except Exception as e:
            logger.error(f"Error saving audio: {e}")
            raise ValueError(f"Failed to decode audio data: {e}")

    def extract_audio_paths(
        self,
        request_data: Dict,
        audio_key: str = 'audioBase64',
        path_key: str = 'audioPath',
        persist: bool = False
    ) -> tuple[Optional[str], Optional[str]]:
        """
        Extract audio path from request, converting base64 if needed.

        Args:
            request_data: Request payload
            audio_key: Key for base64 audio data
            path_key: Key for audio file path
            persist: Whether to persist temporary files

        Returns:
            Tuple of (audio_path, temp_path_to_cleanup)
        """
        audio_base64 = request_data.get(audio_key)
        audio_path = request_data.get(path_key)

        if audio_base64 and not audio_path:
            # Convert base64 to file synchronously
            import asyncio
            loop = asyncio.get_event_loop()
            temp_path = loop.run_until_complete(self.save_audio_base64(audio_base64, persist))
            return temp_path, temp_path

        return audio_path, None

    def cleanup_temp_file(self, file_path: Optional[str]) -> None:
        """
        Clean up temporary file if it exists.

        Args:
            file_path: Path to file to delete
        """
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.debug(f"Cleaned up temp file: {file_path}")
            except Exception as e:
                logger.warning(f"Failed to cleanup temp file {file_path}: {e}")

    def cleanup_temp_files(self, file_paths: list[str]) -> None:
        """
        Clean up multiple temporary files.

        Args:
            file_paths: List of file paths to delete
        """
        for path in file_paths:
            self.cleanup_temp_file(path)

    @asynccontextmanager
    async def temp_audio_file(self, audio_base64: str, persist: bool = False):
        """
        STABILITÉ: Context manager pour gérer automatiquement le cycle de vie
        des fichiers audio temporaires.

        Usage:
            async with request_handler.temp_audio_file(audio_base64) as temp_path:
                # Utiliser temp_path
                result = await process_audio(temp_path)
            # Le fichier est automatiquement nettoyé, même en cas d'exception

        Args:
            audio_base64: Audio encodé en base64
            persist: Si True, persiste dans temp_dir (pour async jobs)

        Yields:
            str: Chemin vers le fichier temporaire

        Raises:
            ValueError: Si le décodage échoue
        """
        temp_path = None
        try:
            temp_path = await self.save_audio_base64(audio_base64, persist)
            logger.debug(f"[TEMP-MANAGER] 📁 Fichier créé: {temp_path}")
            yield temp_path
        finally:
            # STABILITÉ: Nettoyage garanti même si exception
            if temp_path and not persist:
                self.cleanup_temp_file(temp_path)
                logger.debug(f"[TEMP-MANAGER] 🗑️ Fichier nettoyé: {temp_path}")

    def extract_pagination_params(self, request_data: Dict) -> tuple[int, int]:
        """
        Extract pagination parameters from request.

        Args:
            request_data: Request payload

        Returns:
            Tuple of (limit, offset)
        """
        limit = request_data.get('limit', 20)
        offset = request_data.get('offset', 0)

        # Validate limits
        limit = max(1, min(limit, 100))  # Clamp between 1-100
        offset = max(0, offset)

        return limit, offset

    def extract_date_range(self, request_data: Dict) -> tuple[Optional[str], Optional[str]]:
        """
        Extract date range parameters from request.

        Args:
            request_data: Request payload

        Returns:
            Tuple of (start_date, end_date)
        """
        start_date = request_data.get('startDate')
        end_date = request_data.get('endDate')
        return start_date, end_date

    def generate_task_id(self, request_data: Dict) -> str:
        """
        Generate or extract task ID from request.

        Args:
            request_data: Request payload

        Returns:
            Task ID string
        """
        return request_data.get('taskId', str(uuid.uuid4()))

    def build_success_response(
        self,
        task_id: str,
        request_type: str,
        result: Dict,
        processing_time_ms: int
    ) -> Dict:
        """
        Build standardized success response.

        Args:
            task_id: Task identifier
            request_type: Type of request
            result: Result data
            processing_time_ms: Processing time in milliseconds

        Returns:
            Response dictionary
        """
        import time
        return {
            'type': 'voice_api_success',
            'taskId': task_id,
            'requestType': request_type,
            'result': result,
            'processingTimeMs': processing_time_ms,
            'timestamp': time.time()
        }

    def build_error_response(
        self,
        task_id: str,
        request_type: str,
        error: str,
        error_code: str = 'INTERNAL_ERROR'
    ) -> Dict:
        """
        Build standardized error response.

        Args:
            task_id: Task identifier
            request_type: Type of request
            error: Error message
            error_code: Error code

        Returns:
            Response dictionary
        """
        import time
        return {
            'type': 'voice_api_error',
            'taskId': task_id,
            'requestType': request_type,
            'error': error,
            'errorCode': error_code,
            'timestamp': time.time()
        }
