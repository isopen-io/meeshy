"""
Voice API Handler - Facade orchestrator for voice operations
Coordinates between request handling, operations, and system handlers.
"""

import asyncio
import logging
import time
import uuid
from typing import Dict, Optional

from .request_handler import RequestHandler
from .operation_handlers import OperationHandlers, VoiceAPIResult
from .system_handlers import SystemHandlers

logger = logging.getLogger(__name__)


class VoiceAPIHandler:
    """
    Main facade for Voice API operations.
    Orchestrates request validation, operation dispatch, and response building.
    """

    # Supported Voice API request types
    SUPPORTED_TYPES = {
        'voice_translate',
        'voice_translate_async',
        'voice_analyze',
        'voice_compare',
        'voice_profile_get',
        'voice_profile_create',
        'voice_profile_update',
        'voice_profile_delete',
        'voice_profile_list',
        'voice_job_status',
        'voice_job_cancel',
        'voice_feedback',
        'voice_history',
        'voice_stats',
        'voice_admin_metrics',
        'voice_health',
        'voice_languages'
    }

    def __init__(
        self,
        transcription_service=None,
        translation_service=None,
        voice_clone_service=None,
        tts_service=None,
        voice_analyzer=None,
        translation_pipeline=None,
        analytics_service=None
    ):
        """
        Initialize Voice API Handler with service dependencies.

        Args:
            transcription_service: Whisper transcription service
            translation_service: NLLB translation service
            voice_clone_service: Voice cloning service
            tts_service: Text-to-speech service
            voice_analyzer: Voice analysis service
            translation_pipeline: Translation pipeline orchestrator
            analytics_service: Analytics and metrics service
        """
        # Initialize specialized handlers
        self.request_handler = RequestHandler()
        self.operation_handlers = OperationHandlers(
            transcription_service=transcription_service,
            translation_service=translation_service,
            voice_clone_service=voice_clone_service,
            tts_service=tts_service,
            voice_analyzer=voice_analyzer,
            translation_pipeline=translation_pipeline,
            analytics_service=analytics_service
        )
        self.system_handlers = SystemHandlers(
            transcription_service=transcription_service,
            translation_service=translation_service,
            voice_clone_service=voice_clone_service,
            tts_service=tts_service,
            translation_pipeline=translation_pipeline,
            analytics_service=analytics_service
        )

        logger.info("[VoiceAPIHandler] Initialized with modular architecture")

    def is_voice_api_request(self, request_type: str) -> bool:
        """Check if request type is a Voice API request"""
        return request_type in self.SUPPORTED_TYPES

    async def handle_request(self, request_data: Dict) -> Dict:
        """
        Main entry point for handling Voice API requests.
        Returns response dict to be published via ZMQ.
        """
        start_time = time.time()
        task_id = self.request_handler.generate_task_id(request_data)
        request_type = request_data.get('type', '')

        try:
            logger.info(f"[VoiceAPI] Processing request: {request_type} (taskId={task_id})")

            # Dispatch to appropriate handler
            result = await self._dispatch(request_type, request_data)

            processing_time = int((time.time() - start_time) * 1000)

            if result.success:
                return self.request_handler.build_success_response(
                    task_id=task_id,
                    request_type=request_type,
                    result=result.data,
                    processing_time_ms=processing_time
                )
            else:
                return self.request_handler.build_error_response(
                    task_id=task_id,
                    request_type=request_type,
                    error=result.error or 'Unknown error',
                    error_code=result.error_code or 'INTERNAL_ERROR'
                )

        except Exception as e:
            logger.error(f"[VoiceAPI] Error handling request {request_type}: {e}")
            import traceback
            traceback.print_exc()

            return self.request_handler.build_error_response(
                task_id=task_id,
                request_type=request_type,
                error=str(e),
                error_code='INTERNAL_ERROR'
            )

    async def _dispatch(self, request_type: str, request_data: Dict) -> VoiceAPIResult:
        """Dispatch request to appropriate handler"""
        handlers = {
            'voice_translate': self._handle_translate,
            'voice_translate_async': self._handle_translate_async,
            'voice_analyze': self._handle_analyze,
            'voice_compare': self._handle_compare,
            'voice_profile_get': self._handle_profile_get,
            'voice_profile_create': self._handle_profile_create,
            'voice_profile_update': self._handle_profile_update,
            'voice_profile_delete': self._handle_profile_delete,
            'voice_profile_list': self._handle_profile_list,
            'voice_job_status': self._handle_job_status,
            'voice_job_cancel': self._handle_job_cancel,
            'voice_feedback': self._handle_feedback,
            'voice_history': self._handle_history,
            'voice_stats': self._handle_stats,
            'voice_admin_metrics': self._handle_admin_metrics,
            'voice_health': self._handle_health,
            'voice_languages': self._handle_languages
        }

        handler = handlers.get(request_type)
        if not handler:
            return VoiceAPIResult(
                success=False,
                error=f"Unknown request type: {request_type}",
                error_code="INVALID_REQUEST"
            )

        return await handler(request_data)

    # ═══════════════════════════════════════════════════════════════════════════
    # TRANSLATION REQUEST HANDLERS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _handle_translate(self, request_data: Dict) -> VoiceAPIResult:
        """Handle synchronous voice translation request"""
        # Validate request
        is_valid, error, error_code = self.request_handler.validate_translate_request(request_data)
        if not is_valid:
            return VoiceAPIResult(success=False, error=error, error_code=error_code)

        # Extract parameters
        user_id = request_data.get('userId')
        audio_base64 = request_data.get('audioBase64')
        audio_path = request_data.get('audioPath')
        target_languages = request_data.get('targetLanguages', [])
        source_language = request_data.get('sourceLanguage')
        generate_voice_clone = request_data.get('generateVoiceClone', True)

        # STABILITÉ: Utiliser context manager pour nettoyage automatique
        if audio_base64 and not audio_path:
            async with self.request_handler.temp_audio_file(audio_base64) as temp_path:
                return await self.operation_handlers.handle_translate(
                    audio_path=temp_path,
                    target_languages=target_languages,
                    source_language=source_language,
                    user_id=user_id,
                    generate_voice_clone=generate_voice_clone
                )
            # Fichier automatiquement nettoyé après le with, même si exception

        # Pas de conversion base64 nécessaire
        return await self.operation_handlers.handle_translate(
            audio_path=audio_path,
            target_languages=target_languages,
            source_language=source_language,
            user_id=user_id,
            generate_voice_clone=generate_voice_clone
        )

    async def _handle_translate_async(self, request_data: Dict) -> VoiceAPIResult:
        """Handle asynchronous voice translation request"""
        # Validate request
        is_valid, error, error_code = self.request_handler.validate_translate_request(request_data)
        if not is_valid:
            return VoiceAPIResult(success=False, error=error, error_code=error_code)

        # Extract parameters
        user_id = request_data.get('userId')
        audio_base64 = request_data.get('audioBase64')
        audio_path = request_data.get('audioPath')
        target_languages = request_data.get('targetLanguages', [])
        source_language = request_data.get('sourceLanguage')
        generate_voice_clone = request_data.get('generateVoiceClone', True)
        webhook_url = request_data.get('webhookUrl')
        priority = request_data.get('priority', 1)

        # Convert base64 to file if needed (persist for async processing)
        if audio_base64 and not audio_path:
            audio_path = await self.request_handler.save_audio_base64(audio_base64, persist=True)

        # Execute async translation
        return await self.operation_handlers.handle_translate_async(
            audio_path=audio_path,
            target_languages=target_languages,
            source_language=source_language,
            user_id=user_id,
            generate_voice_clone=generate_voice_clone,
            webhook_url=webhook_url,
            priority=priority
        )

    # ═══════════════════════════════════════════════════════════════════════════
    # ANALYSIS REQUEST HANDLERS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _handle_analyze(self, request_data: Dict) -> VoiceAPIResult:
        """Handle voice analysis request"""
        # Validate request
        is_valid, error, error_code = self.request_handler.validate_analyze_request(request_data)
        if not is_valid:
            return VoiceAPIResult(success=False, error=error, error_code=error_code)

        # Extract parameters
        audio_base64 = request_data.get('audioBase64')
        audio_path = request_data.get('audioPath')
        analysis_types = request_data.get('analysisTypes')

        # Convert base64 to temp file if needed
        temp_audio_path = None
        if audio_base64 and not audio_path:
            temp_audio_path = await self.request_handler.save_audio_base64(audio_base64)
            audio_path = temp_audio_path

        try:
            return await self.operation_handlers.handle_analyze(
                audio_path=audio_path,
                analysis_types=analysis_types
            )
        finally:
            self.request_handler.cleanup_temp_file(temp_audio_path)

    async def _handle_compare(self, request_data: Dict) -> VoiceAPIResult:
        """Handle voice comparison request"""
        # Validate request
        is_valid, error, error_code = self.request_handler.validate_compare_request(request_data)
        if not is_valid:
            return VoiceAPIResult(success=False, error=error, error_code=error_code)

        # Extract parameters
        audio_base64_1 = request_data.get('audioBase64_1')
        audio_path_1 = request_data.get('audioPath_1')
        audio_base64_2 = request_data.get('audioBase64_2')
        audio_path_2 = request_data.get('audioPath_2')

        # Convert base64 to temp files if needed
        temp_paths = []

        if audio_base64_1 and not audio_path_1:
            audio_path_1 = await self.request_handler.save_audio_base64(audio_base64_1)
            temp_paths.append(audio_path_1)

        if audio_base64_2 and not audio_path_2:
            audio_path_2 = await self.request_handler.save_audio_base64(audio_base64_2)
            temp_paths.append(audio_path_2)

        try:
            return await self.operation_handlers.handle_compare(
                audio_path_1=audio_path_1,
                audio_path_2=audio_path_2
            )
        finally:
            self.request_handler.cleanup_temp_files(temp_paths)

    # ═══════════════════════════════════════════════════════════════════════════
    # PROFILE REQUEST HANDLERS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _handle_profile_get(self, request_data: Dict) -> VoiceAPIResult:
        """Handle get voice profile request"""
        user_id = request_data.get('userId')
        profile_id = request_data.get('profileId')
        return await self.operation_handlers.handle_profile_get(user_id, profile_id)

    async def _handle_profile_create(self, request_data: Dict) -> VoiceAPIResult:
        """Handle create voice profile request"""
        # Validate request
        is_valid, error, error_code = self.request_handler.validate_profile_create_request(request_data)
        if not is_valid:
            return VoiceAPIResult(success=False, error=error, error_code=error_code)

        # Extract parameters
        user_id = request_data.get('userId')
        name = request_data.get('name')
        audio_base64 = request_data.get('audioBase64')
        audio_path = request_data.get('audioPath')
        metadata = request_data.get('metadata', {})

        # Convert base64 to temp file if needed
        temp_audio_path = None
        if audio_base64 and not audio_path:
            temp_audio_path = await self.request_handler.save_audio_base64(audio_base64)
            audio_path = temp_audio_path

        try:
            return await self.operation_handlers.handle_profile_create(
                user_id=user_id,
                audio_path=audio_path,
                name=name,
                metadata=metadata
            )
        finally:
            self.request_handler.cleanup_temp_file(temp_audio_path)

    async def _handle_profile_update(self, request_data: Dict) -> VoiceAPIResult:
        """Handle update voice profile request"""
        user_id = request_data.get('userId')
        profile_id = request_data.get('profileId')
        name = request_data.get('name')
        audio_base64 = request_data.get('audioBase64')
        audio_path = request_data.get('audioPath')
        metadata = request_data.get('metadata')

        # Convert base64 to temp file if needed
        temp_audio_path = None
        if audio_base64 and not audio_path:
            temp_audio_path = await self.request_handler.save_audio_base64(audio_base64)
            audio_path = temp_audio_path

        try:
            return await self.operation_handlers.handle_profile_update(
                user_id=user_id,
                profile_id=profile_id,
                name=name,
                audio_path=audio_path,
                metadata=metadata
            )
        finally:
            self.request_handler.cleanup_temp_file(temp_audio_path)

    async def _handle_profile_delete(self, request_data: Dict) -> VoiceAPIResult:
        """Handle delete voice profile request"""
        user_id = request_data.get('userId')
        profile_id = request_data.get('profileId')
        return await self.operation_handlers.handle_profile_delete(user_id, profile_id)

    async def _handle_profile_list(self, request_data: Dict) -> VoiceAPIResult:
        """Handle list voice profiles request"""
        user_id = request_data.get('userId')
        limit, offset = self.request_handler.extract_pagination_params(request_data)
        return await self.operation_handlers.handle_profile_list(user_id, limit, offset)

    # ═══════════════════════════════════════════════════════════════════════════
    # JOB REQUEST HANDLERS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _handle_job_status(self, request_data: Dict) -> VoiceAPIResult:
        """Handle get job status request"""
        job_id = request_data.get('jobId')
        return await self.operation_handlers.handle_job_status(job_id)

    async def _handle_job_cancel(self, request_data: Dict) -> VoiceAPIResult:
        """Handle cancel job request"""
        job_id = request_data.get('jobId')
        return await self.operation_handlers.handle_job_cancel(job_id)

    # ═══════════════════════════════════════════════════════════════════════════
    # ANALYTICS REQUEST HANDLERS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _handle_feedback(self, request_data: Dict) -> VoiceAPIResult:
        """Handle submit feedback request"""
        # Validate request
        is_valid, error, error_code = self.request_handler.validate_feedback_request(request_data)
        if not is_valid:
            return VoiceAPIResult(success=False, error=error, error_code=error_code)

        # Extract parameters
        user_id = request_data.get('userId')
        translation_id = request_data.get('translationId')
        rating = request_data.get('rating')
        feedback_type = request_data.get('feedbackType', 'quality')
        comment = request_data.get('comment')
        metadata = request_data.get('metadata', {})

        return await self.operation_handlers.handle_feedback(
            user_id=user_id,
            translation_id=translation_id,
            rating=rating,
            feedback_type=feedback_type,
            comment=comment,
            metadata=metadata
        )

    async def _handle_history(self, request_data: Dict) -> VoiceAPIResult:
        """Handle get translation history request"""
        user_id = request_data.get('userId')
        limit, offset = self.request_handler.extract_pagination_params(request_data)
        start_date, end_date = self.request_handler.extract_date_range(request_data)

        return await self.operation_handlers.handle_history(
            user_id=user_id,
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date
        )

    async def _handle_stats(self, request_data: Dict) -> VoiceAPIResult:
        """Handle get user stats request"""
        user_id = request_data.get('userId')
        period = request_data.get('period', 'all')
        return await self.operation_handlers.handle_stats(user_id, period)

    # ═══════════════════════════════════════════════════════════════════════════
    # SYSTEM REQUEST HANDLERS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _handle_admin_metrics(self, request_data: Dict) -> VoiceAPIResult:
        """Handle get admin metrics request"""
        return await self.system_handlers.handle_admin_metrics()

    async def _handle_health(self, request_data: Dict) -> VoiceAPIResult:
        """Handle health check request"""
        return await self.system_handlers.handle_health()

    async def _handle_languages(self, request_data: Dict) -> VoiceAPIResult:
        """Handle get supported languages request"""
        return await self.system_handlers.handle_languages()


# ═══════════════════════════════════════════════════════════════════════════
# SINGLETON PATTERN
# ═══════════════════════════════════════════════════════════════════════════

_voice_api_handler: Optional[VoiceAPIHandler] = None


def get_voice_api_handler(**kwargs) -> VoiceAPIHandler:
    """Get or create VoiceAPIHandler singleton"""
    global _voice_api_handler
    if _voice_api_handler is None:
        _voice_api_handler = VoiceAPIHandler(**kwargs)
    return _voice_api_handler


def reset_voice_api_handler():
    """Reset singleton for testing"""
    global _voice_api_handler
    _voice_api_handler = None
