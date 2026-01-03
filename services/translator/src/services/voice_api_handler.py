"""
Voice API Handler - Handles Voice API requests from Gateway via ZMQ
Production-ready handler for all voice operations.
"""

import asyncio
import json
import logging
import time
import uuid
import base64
import tempfile
import os
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# DATA CLASSES
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class VoiceAPIResult:
    """Result wrapper for Voice API responses"""
    success: bool
    data: Optional[Dict] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    processing_time_ms: int = 0


# ═══════════════════════════════════════════════════════════════════════════
# VOICE API HANDLER
# ═══════════════════════════════════════════════════════════════════════════

class VoiceAPIHandler:
    """
    Handles Voice API requests from Gateway.
    Dispatches to appropriate services based on request type.
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
        self.transcription_service = transcription_service
        self.translation_service = translation_service
        self.voice_clone_service = voice_clone_service
        self.tts_service = tts_service
        self.voice_analyzer = voice_analyzer
        self.translation_pipeline = translation_pipeline
        self.analytics_service = analytics_service

        # Temp directory for audio files
        self.temp_dir = tempfile.gettempdir()

        logger.info("[VoiceAPIHandler] Initialized")

    def is_voice_api_request(self, request_type: str) -> bool:
        """Check if request type is a Voice API request"""
        return request_type in self.SUPPORTED_TYPES

    async def handle_request(self, request_data: Dict) -> Dict:
        """
        Main entry point for handling Voice API requests.
        Returns response dict to be published via ZMQ.
        """
        start_time = time.time()
        task_id = request_data.get('taskId', str(uuid.uuid4()))
        request_type = request_data.get('type', '')

        try:
            logger.info(f"🎤 [VoiceAPI] Processing request: {request_type} (taskId={task_id})")

            # Dispatch to appropriate handler
            result = await self._dispatch(request_type, request_data)

            processing_time = int((time.time() - start_time) * 1000)

            if result.success:
                return {
                    'type': 'voice_api_success',
                    'taskId': task_id,
                    'requestType': request_type,
                    'result': result.data,
                    'processingTimeMs': processing_time,
                    'timestamp': time.time()
                }
            else:
                return {
                    'type': 'voice_api_error',
                    'taskId': task_id,
                    'requestType': request_type,
                    'error': result.error or 'Unknown error',
                    'errorCode': result.error_code or 'INTERNAL_ERROR',
                    'timestamp': time.time()
                }

        except Exception as e:
            logger.error(f"❌ [VoiceAPI] Error handling request {request_type}: {e}")
            import traceback
            traceback.print_exc()

            return {
                'type': 'voice_api_error',
                'taskId': task_id,
                'requestType': request_type,
                'error': str(e),
                'errorCode': 'INTERNAL_ERROR',
                'timestamp': time.time()
            }

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
    # TRANSLATION HANDLERS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _handle_translate(self, request_data: Dict) -> VoiceAPIResult:
        """Handle synchronous voice translation"""
        try:
            user_id = request_data.get('userId')
            audio_base64 = request_data.get('audioBase64')
            audio_path = request_data.get('audioPath')
            target_languages = request_data.get('targetLanguages', [])
            source_language = request_data.get('sourceLanguage')
            generate_voice_clone = request_data.get('generateVoiceClone', True)

            # Validate input
            if not audio_base64 and not audio_path:
                return VoiceAPIResult(
                    success=False,
                    error="Audio data or path required",
                    error_code="INVALID_REQUEST"
                )

            if not target_languages:
                return VoiceAPIResult(
                    success=False,
                    error="Target languages required",
                    error_code="INVALID_REQUEST"
                )

            # Convert base64 to temp file if needed
            temp_audio_path = None
            if audio_base64 and not audio_path:
                temp_audio_path = await self._save_audio_base64(audio_base64)
                audio_path = temp_audio_path

            try:
                # Use translation pipeline if available
                if self.translation_pipeline:
                    result = await self.translation_pipeline.translate_sync(
                        audio_path=audio_path,
                        target_languages=target_languages,
                        source_language=source_language,
                        user_id=user_id,
                        generate_voice_clone=generate_voice_clone
                    )

                    return VoiceAPIResult(
                        success=True,
                        data=result.to_dict() if hasattr(result, 'to_dict') else result
                    )
                else:
                    # Fallback: manual pipeline execution
                    return await self._execute_translation_pipeline(
                        audio_path=audio_path,
                        target_languages=target_languages,
                        source_language=source_language,
                        user_id=user_id,
                        generate_voice_clone=generate_voice_clone
                    )
            finally:
                # Cleanup temp file
                if temp_audio_path and os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)

        except Exception as e:
            logger.error(f"Translation error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="TRANSLATION_FAILED"
            )

    async def _handle_translate_async(self, request_data: Dict) -> VoiceAPIResult:
        """Handle asynchronous voice translation"""
        try:
            if not self.translation_pipeline:
                return VoiceAPIResult(
                    success=False,
                    error="Translation pipeline not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            user_id = request_data.get('userId')
            audio_base64 = request_data.get('audioBase64')
            audio_path = request_data.get('audioPath')
            target_languages = request_data.get('targetLanguages', [])
            source_language = request_data.get('sourceLanguage')
            generate_voice_clone = request_data.get('generateVoiceClone', True)
            webhook_url = request_data.get('webhookUrl')
            priority = request_data.get('priority', 1)

            # Convert base64 to file if needed
            if audio_base64 and not audio_path:
                audio_path = await self._save_audio_base64(audio_base64, persist=True)

            # Submit job to pipeline
            job = await self.translation_pipeline.submit_job(
                audio_path=audio_path,
                target_languages=target_languages,
                source_language=source_language,
                user_id=user_id,
                generate_voice_clone=generate_voice_clone,
                webhook_url=webhook_url,
                priority=priority
            )

            return VoiceAPIResult(
                success=True,
                data={
                    'jobId': job.id if hasattr(job, 'id') else str(uuid.uuid4()),
                    'status': 'pending'
                }
            )

        except Exception as e:
            logger.error(f"Async translation error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="TRANSLATION_FAILED"
            )

    async def _execute_translation_pipeline(
        self,
        audio_path: str,
        target_languages: List[str],
        source_language: Optional[str],
        user_id: str,
        generate_voice_clone: bool
    ) -> VoiceAPIResult:
        """Execute translation pipeline manually when pipeline service not available"""
        translation_id = str(uuid.uuid4())
        translations = []

        # Step 1: Transcription
        transcription_text = ""
        detected_language = source_language or "en"
        transcription_confidence = 0.0

        if self.transcription_service:
            trans_result = await self.transcription_service.transcribe(audio_path)
            if trans_result:
                transcription_text = trans_result.text
                detected_language = trans_result.language or detected_language
                transcription_confidence = trans_result.confidence or 0.9

        # Step 2: Voice cloning (if enabled)
        voice_profile = None
        if generate_voice_clone and self.voice_clone_service:
            try:
                voice_profile = await self.voice_clone_service.create_profile(
                    audio_path=audio_path,
                    user_id=user_id
                )
            except Exception as e:
                logger.warning(f"Voice cloning failed: {e}")

        # Step 3: Translation + TTS for each target language
        for target_lang in target_languages:
            translated_text = transcription_text

            # Translate if needed
            if self.translation_service and target_lang != detected_language:
                try:
                    trans_result = await self.translation_service.translate(
                        text=transcription_text,
                        source_language=detected_language,
                        target_language=target_lang
                    )
                    translated_text = trans_result.get('translated_text', transcription_text)
                except Exception as e:
                    logger.warning(f"Translation to {target_lang} failed: {e}")

            # Generate TTS
            audio_base64 = None
            duration_ms = 0
            voice_cloned = False
            voice_quality = 0.0

            if self.tts_service:
                try:
                    tts_result = await self.tts_service.synthesize(
                        text=translated_text,
                        language=target_lang,
                        voice_profile=voice_profile
                    )
                    if tts_result:
                        audio_base64 = tts_result.audio_base64
                        duration_ms = tts_result.duration_ms
                        voice_cloned = tts_result.voice_cloned
                        voice_quality = tts_result.quality
                except Exception as e:
                    logger.warning(f"TTS for {target_lang} failed: {e}")

            translations.append({
                'targetLanguage': target_lang,
                'translatedText': translated_text,
                'audioBase64': audio_base64,
                'durationMs': duration_ms,
                'voiceCloned': voice_cloned,
                'voiceQuality': voice_quality
            })

        return VoiceAPIResult(
            success=True,
            data={
                'translationId': translation_id,
                'originalAudio': {
                    'transcription': transcription_text,
                    'language': detected_language,
                    'durationMs': 0,  # Would need audio analysis
                    'confidence': transcription_confidence
                },
                'translations': translations,
                'voiceProfile': {
                    'profileId': voice_profile.id if voice_profile else None,
                    'quality': voice_profile.quality if voice_profile else 0.0,
                    'isNew': True
                } if voice_profile else None,
                'processingTimeMs': 0  # Will be set by caller
            }
        )

    # ═══════════════════════════════════════════════════════════════════════════
    # VOICE ANALYSIS HANDLERS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _handle_analyze(self, request_data: Dict) -> VoiceAPIResult:
        """Handle voice analysis"""
        try:
            if not self.voice_analyzer:
                return VoiceAPIResult(
                    success=False,
                    error="Voice analyzer not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            audio_base64 = request_data.get('audioBase64')
            audio_path = request_data.get('audioPath')
            analysis_types = request_data.get('analysisTypes')

            # Convert base64 to temp file if needed
            temp_audio_path = None
            if audio_base64 and not audio_path:
                temp_audio_path = await self._save_audio_base64(audio_base64)
                audio_path = temp_audio_path

            try:
                result = await self.voice_analyzer.analyze(
                    audio_path=audio_path,
                    analysis_types=analysis_types
                )

                return VoiceAPIResult(
                    success=True,
                    data=result.to_dict() if hasattr(result, 'to_dict') else result
                )
            finally:
                if temp_audio_path and os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)

        except Exception as e:
            logger.error(f"Analysis error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def _handle_compare(self, request_data: Dict) -> VoiceAPIResult:
        """Handle voice comparison"""
        try:
            if not self.voice_analyzer:
                return VoiceAPIResult(
                    success=False,
                    error="Voice analyzer not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            audio_base64_1 = request_data.get('audioBase64_1')
            audio_path_1 = request_data.get('audioPath_1')
            audio_base64_2 = request_data.get('audioBase64_2')
            audio_path_2 = request_data.get('audioPath_2')

            # Convert base64 to temp files if needed
            temp_paths = []

            if audio_base64_1 and not audio_path_1:
                audio_path_1 = await self._save_audio_base64(audio_base64_1)
                temp_paths.append(audio_path_1)

            if audio_base64_2 and not audio_path_2:
                audio_path_2 = await self._save_audio_base64(audio_base64_2)
                temp_paths.append(audio_path_2)

            try:
                result = await self.voice_analyzer.compare_voices(
                    audio_path_1=audio_path_1,
                    audio_path_2=audio_path_2
                )

                return VoiceAPIResult(
                    success=True,
                    data=result.to_dict() if hasattr(result, 'to_dict') else result
                )
            finally:
                for path in temp_paths:
                    if os.path.exists(path):
                        os.remove(path)

        except Exception as e:
            logger.error(f"Comparison error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    # ═══════════════════════════════════════════════════════════════════════════
    # VOICE PROFILE HANDLERS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _handle_profile_get(self, request_data: Dict) -> VoiceAPIResult:
        """Get voice profile"""
        try:
            if not self.voice_clone_service:
                return VoiceAPIResult(
                    success=False,
                    error="Voice clone service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            user_id = request_data.get('userId')
            profile_id = request_data.get('profileId')

            profile = await self.voice_clone_service.get_profile(
                user_id=user_id,
                profile_id=profile_id
            )

            if not profile:
                return VoiceAPIResult(
                    success=False,
                    error="Profile not found",
                    error_code="NOT_FOUND"
                )

            return VoiceAPIResult(
                success=True,
                data=profile.to_dict() if hasattr(profile, 'to_dict') else profile
            )

        except Exception as e:
            logger.error(f"Get profile error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def _handle_profile_create(self, request_data: Dict) -> VoiceAPIResult:
        """Create voice profile"""
        try:
            if not self.voice_clone_service:
                return VoiceAPIResult(
                    success=False,
                    error="Voice clone service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            user_id = request_data.get('userId')
            name = request_data.get('name')
            audio_base64 = request_data.get('audioBase64')
            audio_path = request_data.get('audioPath')
            metadata = request_data.get('metadata', {})

            # Convert base64 to temp file if needed
            temp_audio_path = None
            if audio_base64 and not audio_path:
                temp_audio_path = await self._save_audio_base64(audio_base64)
                audio_path = temp_audio_path

            try:
                profile = await self.voice_clone_service.create_profile(
                    user_id=user_id,
                    name=name,
                    audio_path=audio_path,
                    metadata=metadata
                )

                return VoiceAPIResult(
                    success=True,
                    data=profile.to_dict() if hasattr(profile, 'to_dict') else profile
                )
            finally:
                if temp_audio_path and os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)

        except Exception as e:
            logger.error(f"Create profile error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="VOICE_CLONE_FAILED"
            )

    async def _handle_profile_update(self, request_data: Dict) -> VoiceAPIResult:
        """Update voice profile"""
        try:
            if not self.voice_clone_service:
                return VoiceAPIResult(
                    success=False,
                    error="Voice clone service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            user_id = request_data.get('userId')
            profile_id = request_data.get('profileId')
            name = request_data.get('name')
            audio_base64 = request_data.get('audioBase64')
            audio_path = request_data.get('audioPath')
            metadata = request_data.get('metadata')

            # Convert base64 to temp file if needed
            temp_audio_path = None
            if audio_base64 and not audio_path:
                temp_audio_path = await self._save_audio_base64(audio_base64)
                audio_path = temp_audio_path

            try:
                profile = await self.voice_clone_service.update_profile(
                    user_id=user_id,
                    profile_id=profile_id,
                    name=name,
                    audio_path=audio_path,
                    metadata=metadata
                )

                return VoiceAPIResult(
                    success=True,
                    data=profile.to_dict() if hasattr(profile, 'to_dict') else profile
                )
            finally:
                if temp_audio_path and os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)

        except Exception as e:
            logger.error(f"Update profile error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def _handle_profile_delete(self, request_data: Dict) -> VoiceAPIResult:
        """Delete voice profile"""
        try:
            if not self.voice_clone_service:
                return VoiceAPIResult(
                    success=False,
                    error="Voice clone service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            user_id = request_data.get('userId')
            profile_id = request_data.get('profileId')

            success = await self.voice_clone_service.delete_profile(
                user_id=user_id,
                profile_id=profile_id
            )

            return VoiceAPIResult(
                success=True,
                data={'success': success}
            )

        except Exception as e:
            logger.error(f"Delete profile error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def _handle_profile_list(self, request_data: Dict) -> VoiceAPIResult:
        """List voice profiles"""
        try:
            if not self.voice_clone_service:
                return VoiceAPIResult(
                    success=False,
                    error="Voice clone service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            user_id = request_data.get('userId')
            limit = request_data.get('limit', 20)
            offset = request_data.get('offset', 0)

            profiles, total = await self.voice_clone_service.list_profiles(
                user_id=user_id,
                limit=limit,
                offset=offset
            )

            return VoiceAPIResult(
                success=True,
                data={
                    'profiles': [p.to_dict() if hasattr(p, 'to_dict') else p for p in profiles],
                    'total': total
                }
            )

        except Exception as e:
            logger.error(f"List profiles error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    # ═══════════════════════════════════════════════════════════════════════════
    # JOB HANDLERS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _handle_job_status(self, request_data: Dict) -> VoiceAPIResult:
        """Get job status"""
        try:
            if not self.translation_pipeline:
                return VoiceAPIResult(
                    success=False,
                    error="Translation pipeline not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            job_id = request_data.get('jobId')

            job = await self.translation_pipeline.get_job(job_id)

            if not job:
                return VoiceAPIResult(
                    success=False,
                    error="Job not found",
                    error_code="NOT_FOUND"
                )

            return VoiceAPIResult(
                success=True,
                data=job.to_dict() if hasattr(job, 'to_dict') else job
            )

        except Exception as e:
            logger.error(f"Get job status error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def _handle_job_cancel(self, request_data: Dict) -> VoiceAPIResult:
        """Cancel a job"""
        try:
            if not self.translation_pipeline:
                return VoiceAPIResult(
                    success=False,
                    error="Translation pipeline not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            job_id = request_data.get('jobId')

            success, message = await self.translation_pipeline.cancel_job(job_id)

            return VoiceAPIResult(
                success=True,
                data={'success': success, 'message': message}
            )

        except Exception as e:
            logger.error(f"Cancel job error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    # ═══════════════════════════════════════════════════════════════════════════
    # ANALYTICS HANDLERS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _handle_feedback(self, request_data: Dict) -> VoiceAPIResult:
        """Submit feedback"""
        try:
            if not self.analytics_service:
                return VoiceAPIResult(
                    success=False,
                    error="Analytics service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            user_id = request_data.get('userId')
            translation_id = request_data.get('translationId')
            rating = request_data.get('rating')
            feedback_type = request_data.get('feedbackType', 'quality')
            comment = request_data.get('comment')
            metadata = request_data.get('metadata', {})

            feedback = await self.analytics_service.submit_feedback(
                user_id=user_id,
                translation_id=translation_id,
                rating=rating,
                feedback_type=feedback_type,
                comment=comment,
                metadata=metadata
            )

            return VoiceAPIResult(
                success=True,
                data={
                    'success': True,
                    'feedbackId': feedback.id if hasattr(feedback, 'id') else str(uuid.uuid4())
                }
            )

        except Exception as e:
            logger.error(f"Feedback error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def _handle_history(self, request_data: Dict) -> VoiceAPIResult:
        """Get translation history"""
        try:
            if not self.analytics_service:
                return VoiceAPIResult(
                    success=False,
                    error="Analytics service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            user_id = request_data.get('userId')
            limit = request_data.get('limit', 20)
            offset = request_data.get('offset', 0)
            start_date = request_data.get('startDate')
            end_date = request_data.get('endDate')

            history, total = await self.analytics_service.get_history(
                user_id=user_id,
                limit=limit,
                offset=offset,
                start_date=start_date,
                end_date=end_date
            )

            return VoiceAPIResult(
                success=True,
                data={
                    'history': [h.to_dict() if hasattr(h, 'to_dict') else h for h in history],
                    'total': total
                }
            )

        except Exception as e:
            logger.error(f"History error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def _handle_stats(self, request_data: Dict) -> VoiceAPIResult:
        """Get user stats"""
        try:
            if not self.analytics_service:
                return VoiceAPIResult(
                    success=False,
                    error="Analytics service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            user_id = request_data.get('userId')
            period = request_data.get('period', 'all')

            stats = await self.analytics_service.get_user_stats(
                user_id=user_id,
                period=period
            )

            return VoiceAPIResult(
                success=True,
                data=stats.to_dict() if hasattr(stats, 'to_dict') else stats
            )

        except Exception as e:
            logger.error(f"Stats error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def _handle_admin_metrics(self, request_data: Dict) -> VoiceAPIResult:
        """Get admin metrics"""
        try:
            import psutil

            metrics = {
                'activeJobs': 0,
                'queuedJobs': 0,
                'completedToday': 0,
                'failedToday': 0,
                'averageProcessingTimeMs': 0,
                'cpuUsage': psutil.cpu_percent(),
                'memoryUsageMb': psutil.Process().memory_info().rss / 1024 / 1024,
                'modelsLoaded': [],
                'uptime': 0,
                'version': '1.0.0'
            }

            # Get pipeline stats if available
            if self.translation_pipeline:
                pipeline_stats = await self.translation_pipeline.get_stats()
                metrics.update({
                    'activeJobs': pipeline_stats.get('active_jobs', 0),
                    'queuedJobs': pipeline_stats.get('queued_jobs', 0),
                    'completedToday': pipeline_stats.get('completed_today', 0),
                    'failedToday': pipeline_stats.get('failed_today', 0),
                    'averageProcessingTimeMs': pipeline_stats.get('avg_processing_time_ms', 0)
                })

            # Get loaded models
            models_loaded = []
            if self.transcription_service:
                models_loaded.append('whisper')
            if self.translation_service:
                models_loaded.append('nllb')
            if self.tts_service:
                models_loaded.append('xtts')
            if self.voice_clone_service:
                models_loaded.append('voice_clone')

            metrics['modelsLoaded'] = models_loaded

            return VoiceAPIResult(
                success=True,
                data=metrics
            )

        except Exception as e:
            logger.error(f"Admin metrics error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def _handle_health(self, request_data: Dict) -> VoiceAPIResult:
        """Get health status"""
        try:
            services = {
                'transcription': self.transcription_service is not None,
                'translation': self.translation_service is not None,
                'tts': self.tts_service is not None,
                'voiceClone': self.voice_clone_service is not None,
                'analytics': self.analytics_service is not None,
                'database': True  # Assume connected
            }

            # Determine overall status
            active_services = sum(services.values())
            total_services = len(services)

            if active_services == total_services:
                status = 'healthy'
            elif active_services >= total_services * 0.5:
                status = 'degraded'
            else:
                status = 'unhealthy'

            return VoiceAPIResult(
                success=True,
                data={
                    'status': status,
                    'services': services,
                    'latency': {
                        'transcriptionMs': 0,
                        'translationMs': 0,
                        'ttsMs': 0
                    },
                    'timestamp': datetime.now().isoformat()
                }
            )

        except Exception as e:
            logger.error(f"Health error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def _handle_languages(self, request_data: Dict) -> VoiceAPIResult:
        """Get supported languages"""
        try:
            # Common languages supported by NLLB and Whisper
            languages = [
                {'code': 'en', 'name': 'English', 'nativeName': 'English', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'fr', 'name': 'French', 'nativeName': 'Fran\u00e7ais', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'es', 'name': 'Spanish', 'nativeName': 'Espa\u00f1ol', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'de', 'name': 'German', 'nativeName': 'Deutsch', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'it', 'name': 'Italian', 'nativeName': 'Italiano', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'pt', 'name': 'Portuguese', 'nativeName': 'Portugu\u00eas', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'nl', 'name': 'Dutch', 'nativeName': 'Nederlands', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'pl', 'name': 'Polish', 'nativeName': 'Polski', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'ru', 'name': 'Russian', 'nativeName': '\u0420\u0443\u0441\u0441\u043a\u0438\u0439', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'ja', 'name': 'Japanese', 'nativeName': '\u65e5\u672c\u8a9e', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'ko', 'name': 'Korean', 'nativeName': '\ud55c\uad6d\uc5b4', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'zh', 'name': 'Chinese', 'nativeName': '\u4e2d\u6587', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'ar', 'name': 'Arabic', 'nativeName': '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'hi', 'name': 'Hindi', 'nativeName': '\u0939\u093f\u0928\u094d\u0926\u0940', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
                {'code': 'tr', 'name': 'Turkish', 'nativeName': 'T\u00fcrk\u00e7e', 'supportedFeatures': {'transcription': True, 'translation': True, 'tts': True, 'voiceClone': True}},
            ]

            return VoiceAPIResult(
                success=True,
                data=languages
            )

        except Exception as e:
            logger.error(f"Languages error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    # ═══════════════════════════════════════════════════════════════════════════
    # UTILITY METHODS
    # ═══════════════════════════════════════════════════════════════════════════

    async def _save_audio_base64(self, audio_base64: str, persist: bool = False) -> str:
        """Save base64 audio to temp file"""
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

            return path

        except Exception as e:
            logger.error(f"Error saving audio: {e}")
            raise


# Singleton instance
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
