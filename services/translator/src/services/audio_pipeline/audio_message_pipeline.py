"""
Audio Message Pipeline - Orchestrator
======================================

Main orchestrator for audio message processing pipeline.

Coordinates:
1. Transcription Stage: Audio → Text
2. Translation Stage: Text → Translated Audio (multiple languages)
3. Voice Profile Management

Architecture:
- Orchestrator pattern (no business logic)
- Delegates to specialized stages
- Manages data flow between stages
- No database persistence (Gateway handles this)

Pipeline Flow:
Audio → Transcription → Translation (parallel) → Results
"""

import os
import logging
import time
import asyncio
import threading
import base64
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime

# Import stages
from .transcription_stage import (
    TranscriptionStage,
    AudioMessageMetadata,
    TranscriptionStageResult,
    create_transcription_stage
)
from .translation_stage import (
    TranslationStage,
    TranslatedAudioVersion,
    create_translation_stage
)

# Import services for dependency injection
from ..redis_service import get_redis_service

# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class OriginalAudio:
    """Original audio data"""
    audio_path: str
    audio_url: str
    transcription: str
    language: str
    duration_ms: int
    confidence: float
    source: str  # "mobile", "whisper", or "cache"
    segments: Optional[List[Dict]] = None


@dataclass
class NewVoiceProfileData:
    """New voice profile data for Gateway to save"""
    user_id: str
    profile_id: str
    embedding_base64: str
    quality_score: float
    audio_count: int
    total_duration_ms: int
    version: int
    fingerprint: Optional[Dict[str, Any]] = None
    voice_characteristics: Optional[Dict[str, Any]] = None


@dataclass
class AudioMessageResult:
    """Complete audio message processing result"""
    message_id: str
    attachment_id: str
    original: OriginalAudio
    translations: Dict[str, TranslatedAudioVersion]
    voice_model_user_id: str
    voice_model_quality: float
    processing_time_ms: int
    timestamp: datetime = field(default_factory=datetime.now)
    new_voice_profile: Optional[NewVoiceProfileData] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "message_id": self.message_id,
            "attachment_id": self.attachment_id,
            "original": {
                "audio_path": self.original.audio_path,
                "audio_url": self.original.audio_url,
                "transcription": self.original.transcription,
                "language": self.original.language,
                "duration_ms": self.original.duration_ms,
                "confidence": self.original.confidence,
                "source": self.original.source,
                "segments": self.original.segments
            },
            "translations": {
                lang: {
                    "language": t.language,
                    "translated_text": t.translated_text,
                    "audio_path": t.audio_path,
                    "audio_url": t.audio_url,
                    "duration_ms": t.duration_ms,
                    "format": t.format,
                    "voice_cloned": t.voice_cloned,
                    "voice_quality": t.voice_quality,
                    "audio_data_base64": t.audio_data_base64,
                    "audio_mime_type": t.audio_mime_type
                }
                for lang, t in self.translations.items()
            },
            "voice_model_user_id": self.voice_model_user_id,
            "voice_model_quality": self.voice_model_quality,
            "processing_time_ms": self.processing_time_ms,
            "timestamp": self.timestamp.isoformat(),
            "new_voice_profile": self._serialize_voice_profile() if self.new_voice_profile else None
        }

    def _serialize_voice_profile(self) -> Optional[Dict[str, Any]]:
        """Serialize new voice profile data"""
        if not self.new_voice_profile:
            return None

        return {
            "user_id": self.new_voice_profile.user_id,
            "profile_id": self.new_voice_profile.profile_id,
            "embedding_base64": self.new_voice_profile.embedding_base64,
            "quality_score": self.new_voice_profile.quality_score,
            "audio_count": self.new_voice_profile.audio_count,
            "total_duration_ms": self.new_voice_profile.total_duration_ms,
            "version": self.new_voice_profile.version,
            "fingerprint": self.new_voice_profile.fingerprint,
            "voice_characteristics": self.new_voice_profile.voice_characteristics
        }


class AudioMessagePipeline:
    """
    Audio Message Pipeline Orchestrator.

    Coordinates transcription and translation stages to process
    audio messages with voice cloning and multi-language support.

    Architecture:
    - Singleton pattern
    - Stage-based pipeline
    - Dependency injection
    - No database persistence (Gateway handles this)

    Pipeline:
    1. Transcription Stage: Audio → Text + Language
    2. Translation Stage: Text → Translated Audio (all languages)
    3. Voice Profile Serialization (for Gateway)
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        """Singleton pattern"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized_flag = False
        return cls._instance

    def __init__(
        self,
        translation_service=None,
        database_service=None
    ):
        """
        Initialize pipeline orchestrator.

        Args:
            translation_service: ML translation service (injected)
            database_service: Database service (for voice profiles read-only)
        """
        if self._initialized_flag:
            return

        # Create pipeline stages
        self.transcription_stage = create_transcription_stage()
        self.translation_stage = create_translation_stage(
            translation_service=translation_service
        )

        # Services
        self.translation_service = translation_service
        self.database_service = database_service
        self.redis_service = get_redis_service()

        # State
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        logger.info("[PIPELINE] AudioMessagePipeline orchestrator created")
        self._initialized_flag = True

    def set_translation_service(self, translation_service):
        """Inject translation service into stages"""
        self.translation_service = translation_service
        self.translation_stage.translation_service = translation_service

    def set_database_service(self, database_service):
        """
        Inject database service.
        NOTE: Used only for reading voice profiles, NOT for persistence.
        """
        self.database_service = database_service
        if self.translation_stage.voice_clone_service:
            self.translation_stage.voice_clone_service.set_database_service(database_service)

    async def initialize(self) -> bool:
        """Initialize all pipeline stages"""
        if self.is_initialized:
            return True

        async with self._init_lock:
            if self.is_initialized:
                return True

            logger.info("[PIPELINE] Initializing pipeline stages...")

            try:
                # Initialize stages and Redis in parallel
                results = await asyncio.gather(
                    self.transcription_stage.initialize(),
                    self.translation_stage.initialize(),
                    self.redis_service.initialize(),
                    return_exceptions=True
                )

                # Check for errors
                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        stage_names = ["transcription_stage", "translation_stage", "redis"]
                        logger.error(f"[PIPELINE] Error initializing {stage_names[i]}: {result}")

                self.is_initialized = True
                logger.info(
                    f"[PIPELINE] ✅ Pipeline initialized "
                    f"(Redis: {'OK' if self.redis_service.is_available() else 'memory'})"
                )
                return True

            except Exception as e:
                logger.error(f"[PIPELINE] ❌ Initialization failed: {e}")
                import traceback
                traceback.print_exc()
                return False

    async def process_audio_message(
        self,
        audio_path: str,
        audio_url: str,
        sender_id: str,
        conversation_id: str,
        message_id: str,
        attachment_id: str,
        audio_duration_ms: int = 0,
        metadata: Optional[AudioMessageMetadata] = None,
        target_languages: Optional[List[str]] = None,
        generate_voice_clone: bool = True,
        model_type: str = "medium",
        original_sender_id: Optional[str] = None,
        existing_voice_profile: Optional[Dict[str, Any]] = None,
        use_original_voice: bool = True,
        cloning_params: Optional[Dict[str, Any]] = None
    ) -> AudioMessageResult:
        """
        Process complete audio message through pipeline.

        Pipeline Orchestration:
        1. Transcription Stage → text + language
        2. Filter target languages (exclude source language)
        3. Translation Stage → voice model + translations
        4. Serialize voice profile for Gateway
        5. Build result

        Args:
            audio_path: Path to audio file
            audio_url: Accessible audio URL
            sender_id: User ID of sender
            conversation_id: Conversation ID
            message_id: Message ID
            attachment_id: Attachment ID
            audio_duration_ms: Audio duration (optional)
            metadata: Mobile metadata (optional)
            target_languages: Target languages (auto-detect if None)
            generate_voice_clone: Enable voice cloning
            model_type: Translation model type
            original_sender_id: Original sender ID (forwarded messages)
            existing_voice_profile: Voice profile from Gateway
            use_original_voice: Use original sender's voice
            cloning_params: Voice cloning parameters

        Returns:
            AudioMessageResult with transcription + translations
        """
        start_time = time.time()

        logger.info(
            f"[PIPELINE] Processing audio message: "
            f"msg={message_id}, sender={sender_id}"
        )

        # Ensure initialized
        if not self.is_initialized:
            await self.initialize()

        # ═══════════════════════════════════════════════════════════════
        # STAGE 1: TRANSCRIPTION
        # ═══════════════════════════════════════════════════════════════
        logger.info("[PIPELINE] Stage 1: Transcription")

        transcription = await self.transcription_stage.process(
            audio_path=audio_path,
            attachment_id=attachment_id,
            metadata=metadata,
            use_cache=True
        )

        logger.info(
            f"[PIPELINE] Transcribed: '{transcription.text[:50]}...' "
            f"(lang={transcription.language}, source={transcription.source})"
        )

        # ═══════════════════════════════════════════════════════════════
        # STAGE 2: DETERMINE TARGET LANGUAGES
        # ═══════════════════════════════════════════════════════════════
        logger.info("[PIPELINE] Stage 2: Target languages")

        if not target_languages:
            target_languages = await self._get_target_languages(
                conversation_id=conversation_id,
                source_language=transcription.language,
                sender_id=sender_id
            )

        logger.info(f"[PIPELINE] Initial target languages: {target_languages}")

        # Filter out source language (no need to translate to same language)
        source_language = transcription.language
        target_languages = [
            lang for lang in target_languages
            if lang != source_language
        ]

        logger.info(f"[PIPELINE] Filtered target languages: {target_languages}")

        # Early return if no translations needed
        if not target_languages:
            logger.info("[PIPELINE] No translations needed, returning transcription only")
            return self._build_transcription_only_result(
                message_id=message_id,
                attachment_id=attachment_id,
                audio_path=audio_path,
                audio_url=audio_url,
                transcription=transcription,
                sender_id=sender_id,
                start_time=start_time
            )

        # ═══════════════════════════════════════════════════════════════
        # STAGE 3: VOICE MODEL CREATION
        # ═══════════════════════════════════════════════════════════════
        logger.info("[PIPELINE] Stage 3: Voice model creation")

        voice_model, voice_model_user_id = await self.translation_stage.create_voice_model(
            sender_id=sender_id,
            audio_path=audio_path,
            audio_duration_ms=audio_duration_ms or transcription.duration_ms,
            original_sender_id=original_sender_id,
            existing_voice_profile=existing_voice_profile,
            use_original_voice=use_original_voice,
            generate_voice_clone=generate_voice_clone
        )

        # ═══════════════════════════════════════════════════════════════
        # STAGE 4: TRANSLATION + TTS (PARALLEL)
        # ═══════════════════════════════════════════════════════════════
        logger.info("[PIPELINE] Stage 4: Translation + TTS")

        max_workers = min(
            len(target_languages),
            int(os.getenv("TTS_MAX_WORKERS", "4"))
        )

        translations = await self.translation_stage.process_languages(
            target_languages=target_languages,
            source_text=transcription.text,
            source_language=source_language,
            audio_hash=transcription.audio_hash,
            voice_model=voice_model,
            message_id=message_id,
            attachment_id=attachment_id,
            model_type=model_type,
            cloning_params=cloning_params,
            max_workers=max_workers
        )

        logger.info(f"[PIPELINE] Generated {len(translations)} translations")

        # ═══════════════════════════════════════════════════════════════
        # STAGE 5: BUILD RESULT
        # ═══════════════════════════════════════════════════════════════
        processing_time = int((time.time() - start_time) * 1000)

        # Serialize voice profile for Gateway (if new profile created)
        new_voice_profile_data = None
        if voice_model and not existing_voice_profile and voice_model.embedding is not None:
            new_voice_profile_data = self._serialize_voice_model(
                voice_model=voice_model,
                user_id=voice_model_user_id
            )

        result = AudioMessageResult(
            message_id=message_id,
            attachment_id=attachment_id,
            original=OriginalAudio(
                audio_path=audio_path,
                audio_url=audio_url,
                transcription=transcription.text,
                language=transcription.language,
                duration_ms=transcription.duration_ms,
                confidence=transcription.confidence,
                source=transcription.source,
                segments=self._serialize_segments(transcription.segments)
            ),
            translations=translations,
            voice_model_user_id=voice_model_user_id,
            voice_model_quality=voice_model.quality_score if voice_model else 0.0,
            processing_time_ms=processing_time,
            new_voice_profile=new_voice_profile_data
        )

        logger.info(
            f"[PIPELINE] ✅ Pipeline complete: "
            f"{len(translations)} translations in {processing_time}ms"
        )

        return result

    def _build_transcription_only_result(
        self,
        message_id: str,
        attachment_id: str,
        audio_path: str,
        audio_url: str,
        transcription: TranscriptionStageResult,
        sender_id: str,
        start_time: float
    ) -> AudioMessageResult:
        """Build result with transcription only (no translations)"""
        processing_time = int((time.time() - start_time) * 1000)

        return AudioMessageResult(
            message_id=message_id,
            attachment_id=attachment_id,
            original=OriginalAudio(
                audio_path=audio_path,
                audio_url=audio_url,
                transcription=transcription.text,
                language=transcription.language,
                duration_ms=transcription.duration_ms,
                confidence=transcription.confidence,
                source=transcription.source,
                segments=self._serialize_segments(transcription.segments)
            ),
            translations={},
            voice_model_user_id=sender_id,
            voice_model_quality=0.0,
            processing_time_ms=processing_time
        )

    def _serialize_segments(self, segments: Optional[Any]) -> Optional[List[Dict]]:
        """Serialize transcription segments"""
        if not segments:
            return None

        try:
            if isinstance(segments, list):
                return [
                    {
                        "text": s.text if hasattr(s, 'text') else str(s),
                        "startMs": s.start_ms if hasattr(s, 'start_ms') else 0,
                        "endMs": s.end_ms if hasattr(s, 'end_ms') else 0
                    }
                    for s in segments
                ]
            return None
        except Exception:
            return None

    def _serialize_voice_model(
        self,
        voice_model,
        user_id: str
    ) -> Optional[NewVoiceProfileData]:
        """Serialize voice model for Gateway storage"""
        try:
            # Encode embedding to base64
            embedding_bytes = voice_model.embedding.tobytes()
            embedding_base64 = base64.b64encode(embedding_bytes).decode('utf-8')

            # Serialize fingerprint
            fingerprint_dict = None
            if voice_model.fingerprint:
                fingerprint_dict = {
                    'fingerprint_id': voice_model.fingerprint.fingerprint_id,
                    'signature': voice_model.fingerprint.signature,
                    'signature_short': voice_model.fingerprint.signature_short,
                    'audio_duration_ms': voice_model.fingerprint.audio_duration_ms,
                    'created_at': voice_model.fingerprint.created_at.isoformat()
                    if voice_model.fingerprint.created_at else None
                }

            # Serialize voice characteristics
            voice_chars_dict = None
            if voice_model.voice_characteristics:
                vc = voice_model.voice_characteristics
                voice_chars_dict = {
                    'pitch_mean_hz': vc.pitch_mean_hz,
                    'pitch_std_hz': vc.pitch_std_hz,
                    'pitch_range_hz': vc.pitch_range_hz,
                    'estimated_gender': vc.estimated_gender,
                    'speaking_rate_wpm': vc.speaking_rate_wpm,
                    'spectral_centroid_hz': vc.spectral_centroid_hz,
                    'spectral_bandwidth_hz': vc.spectral_bandwidth_hz,
                    'energy_mean': vc.energy_mean,
                    'energy_std': vc.energy_std,
                    'confidence': vc.confidence
                }

            return NewVoiceProfileData(
                user_id=user_id,
                profile_id=voice_model.profile_id,
                embedding_base64=embedding_base64,
                quality_score=voice_model.quality_score,
                audio_count=voice_model.audio_count,
                total_duration_ms=voice_model.total_duration_ms,
                version=voice_model.version,
                fingerprint=fingerprint_dict,
                voice_characteristics=voice_chars_dict
            )

        except Exception as e:
            logger.warning(f"[PIPELINE] Voice model serialization failed: {e}")
            return None

    async def _get_target_languages(
        self,
        conversation_id: str,
        source_language: str,
        sender_id: str
    ) -> List[str]:
        """
        Get target languages (fallback).

        NOTE: Gateway should provide target_languages.
        This is a fallback that returns defaults.
        """
        logger.warning(
            "[PIPELINE] target_languages not provided by Gateway, using fallback"
        )
        return ["en"] if source_language != "en" else ["fr"]

    async def get_stats(self) -> Dict[str, Any]:
        """Return pipeline statistics"""
        return {
            "service": "AudioMessagePipeline",
            "initialized": self.is_initialized,
            "mode": "orchestrator",
            "stages": {
                "transcription": await self.transcription_stage.get_stats(),
                "translation": await self.translation_stage.get_stats()
            },
            "redis": self.redis_service.get_stats(),
            "translation_service_available": self.translation_service is not None
        }

    async def close(self):
        """Release all pipeline resources"""
        logger.info("[PIPELINE] Closing pipeline...")
        await asyncio.gather(
            self.transcription_stage.close(),
            self.translation_stage.close(),
            self.redis_service.close(),
            return_exceptions=True
        )
        self.is_initialized = False


# Singleton getter
def get_audio_pipeline() -> AudioMessagePipeline:
    """Return singleton pipeline instance"""
    return AudioMessagePipeline()
