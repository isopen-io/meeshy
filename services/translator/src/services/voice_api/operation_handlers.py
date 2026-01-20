"""
Operation Handlers - Core business logic for voice operations
Handles translation, analysis, profiles, jobs, and analytics operations.
"""

import logging
import os
import uuid
from dataclasses import dataclass
from typing import Dict, List, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class VoiceAPIResult:
    """Result wrapper for Voice API responses"""
    success: bool
    data: Optional[Dict] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    processing_time_ms: int = 0


class OperationHandlers:
    """
    Handles core voice operation business logic.
    Delegates to appropriate services based on operation type.
    """

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
        Initialize operation handlers with service dependencies.

        Args:
            transcription_service: Whisper transcription service
            translation_service: NLLB translation service
            voice_clone_service: Voice cloning service
            tts_service: Text-to-speech service
            voice_analyzer: Voice analysis service
            translation_pipeline: Translation pipeline orchestrator
            analytics_service: Analytics and metrics service
        """
        self.transcription_service = transcription_service
        self.translation_service = translation_service
        self.voice_clone_service = voice_clone_service
        self.tts_service = tts_service
        self.voice_analyzer = voice_analyzer
        self.translation_pipeline = translation_pipeline
        self.analytics_service = analytics_service

        logger.info("[OperationHandlers] Initialized")

    # ═══════════════════════════════════════════════════════════════════════════
    # TRANSLATION OPERATIONS
    # ═══════════════════════════════════════════════════════════════════════════

    async def handle_translate(
        self,
        audio_path: str,
        target_languages: List[str],
        source_language: Optional[str],
        user_id: str,
        generate_voice_clone: bool,
        mobile_transcription: Optional[dict] = None
    ) -> VoiceAPIResult:
        """Handle synchronous voice translation"""
        try:
            # Use translation pipeline if available
            if self.translation_pipeline:
                result = await self.translation_pipeline.translate_sync(
                    audio_path=audio_path,
                    target_languages=target_languages,
                    source_language=source_language,
                    user_id=user_id,
                    generate_voice_clone=generate_voice_clone,
                    mobile_transcription=mobile_transcription
                )

                return VoiceAPIResult(
                    success=True,
                    data=result.to_dict() if hasattr(result, 'to_dict') else result
                )
            else:
                # Fallback: manual pipeline execution
                return await self.execute_translation_pipeline(
                    audio_path=audio_path,
                    target_languages=target_languages,
                    source_language=source_language,
                    user_id=user_id,
                    generate_voice_clone=generate_voice_clone
                )

        except Exception as e:
            logger.error(f"Translation error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="TRANSLATION_FAILED"
            )

    async def handle_translate_async(
        self,
        audio_path: str,
        target_languages: List[str],
        source_language: Optional[str],
        user_id: str,
        generate_voice_clone: bool,
        webhook_url: Optional[str],
        priority: int,
        mobile_transcription: Optional[dict] = None
    ) -> VoiceAPIResult:
        """Handle asynchronous voice translation"""
        try:
            if not self.translation_pipeline:
                return VoiceAPIResult(
                    success=False,
                    error="Translation pipeline not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            # Submit job to pipeline
            job = await self.translation_pipeline.submit_job(
                audio_path=audio_path,
                target_languages=target_languages,
                source_language=source_language,
                user_id=user_id,
                generate_voice_clone=generate_voice_clone,
                webhook_url=webhook_url,
                priority=priority,
                mobile_transcription=mobile_transcription
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

    async def execute_translation_pipeline(
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
    # VOICE ANALYSIS OPERATIONS
    # ═══════════════════════════════════════════════════════════════════════════

    async def handle_analyze(self, audio_path: str, analysis_types: Optional[List[str]]) -> VoiceAPIResult:
        """Handle voice analysis"""
        try:
            if not self.voice_analyzer:
                return VoiceAPIResult(
                    success=False,
                    error="Voice analyzer not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            result = await self.voice_analyzer.analyze(
                audio_path=audio_path,
                analysis_types=analysis_types
            )

            return VoiceAPIResult(
                success=True,
                data=result.to_dict() if hasattr(result, 'to_dict') else result
            )

        except Exception as e:
            logger.error(f"Analysis error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def handle_compare(self, audio_path_1: str, audio_path_2: str) -> VoiceAPIResult:
        """Handle voice comparison"""
        try:
            if not self.voice_analyzer:
                return VoiceAPIResult(
                    success=False,
                    error="Voice analyzer not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            result = await self.voice_analyzer.compare_voices(
                audio_path_1=audio_path_1,
                audio_path_2=audio_path_2
            )

            return VoiceAPIResult(
                success=True,
                data=result.to_dict() if hasattr(result, 'to_dict') else result
            )

        except Exception as e:
            logger.error(f"Comparison error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    # ═══════════════════════════════════════════════════════════════════════════
    # VOICE PROFILE OPERATIONS
    # ═══════════════════════════════════════════════════════════════════════════

    async def handle_profile_get(self, user_id: str, profile_id: str) -> VoiceAPIResult:
        """Get voice profile"""
        try:
            if not self.voice_clone_service:
                return VoiceAPIResult(
                    success=False,
                    error="Voice clone service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

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

    async def handle_profile_create(
        self,
        user_id: str,
        audio_path: str,
        name: Optional[str] = None,
        metadata: Optional[Dict] = None
    ) -> VoiceAPIResult:
        """Create voice profile"""
        try:
            if not self.voice_clone_service:
                return VoiceAPIResult(
                    success=False,
                    error="Voice clone service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

            profile = await self.voice_clone_service.create_profile(
                user_id=user_id,
                name=name,
                audio_path=audio_path,
                metadata=metadata or {}
            )

            return VoiceAPIResult(
                success=True,
                data=profile.to_dict() if hasattr(profile, 'to_dict') else profile
            )

        except Exception as e:
            logger.error(f"Create profile error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="VOICE_CLONE_FAILED"
            )

    async def handle_profile_update(
        self,
        user_id: str,
        profile_id: str,
        name: Optional[str] = None,
        audio_path: Optional[str] = None,
        metadata: Optional[Dict] = None
    ) -> VoiceAPIResult:
        """Update voice profile"""
        try:
            if not self.voice_clone_service:
                return VoiceAPIResult(
                    success=False,
                    error="Voice clone service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

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

        except Exception as e:
            logger.error(f"Update profile error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def handle_profile_delete(self, user_id: str, profile_id: str) -> VoiceAPIResult:
        """Delete voice profile"""
        try:
            if not self.voice_clone_service:
                return VoiceAPIResult(
                    success=False,
                    error="Voice clone service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

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

    async def handle_profile_list(self, user_id: str, limit: int, offset: int) -> VoiceAPIResult:
        """List voice profiles"""
        try:
            if not self.voice_clone_service:
                return VoiceAPIResult(
                    success=False,
                    error="Voice clone service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

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
    # JOB OPERATIONS
    # ═══════════════════════════════════════════════════════════════════════════

    async def handle_job_status(self, job_id: str) -> VoiceAPIResult:
        """Get job status"""
        try:
            if not self.translation_pipeline:
                return VoiceAPIResult(
                    success=False,
                    error="Translation pipeline not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

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

    async def handle_job_cancel(self, job_id: str) -> VoiceAPIResult:
        """Cancel a job"""
        try:
            if not self.translation_pipeline:
                return VoiceAPIResult(
                    success=False,
                    error="Translation pipeline not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

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
    # ANALYTICS OPERATIONS
    # ═══════════════════════════════════════════════════════════════════════════

    async def handle_feedback(
        self,
        user_id: str,
        translation_id: str,
        rating: float,
        feedback_type: str,
        comment: Optional[str],
        metadata: Dict
    ) -> VoiceAPIResult:
        """Submit feedback"""
        try:
            if not self.analytics_service:
                return VoiceAPIResult(
                    success=False,
                    error="Analytics service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

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

    async def handle_history(
        self,
        user_id: str,
        limit: int,
        offset: int,
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> VoiceAPIResult:
        """Get translation history"""
        try:
            if not self.analytics_service:
                return VoiceAPIResult(
                    success=False,
                    error="Analytics service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

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

    async def handle_stats(self, user_id: str, period: str) -> VoiceAPIResult:
        """Get user stats"""
        try:
            if not self.analytics_service:
                return VoiceAPIResult(
                    success=False,
                    error="Analytics service not available",
                    error_code="SERVICE_UNAVAILABLE"
                )

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
