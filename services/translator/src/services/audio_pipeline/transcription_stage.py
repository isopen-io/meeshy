"""
Transcription Stage - Audio Pipeline
=====================================

Handles audio transcription with caching and mobile metadata support.

Responsibilities:
- Audio hash computation for cache keys
- Transcription from mobile metadata
- Server-side transcription with Whisper
- Redis cache management for transcriptions

Architecture:
- Stateless stage (no pipeline knowledge)
- Dependency injection for services
- Cache-first strategy
"""

import os
import logging
import asyncio
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

# Import services
from ..transcription_service import (
    TranscriptionService,
    TranscriptionResult,
    get_transcription_service
)
from ..redis_service import (
    AudioCacheService,
    get_audio_cache_service
)

# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class AudioMessageMetadata:
    """Metadata provided by mobile client"""
    transcription: Optional[str] = None  # Mobile transcription
    language: Optional[str] = None       # Language detected by mobile
    confidence: Optional[float] = None   # Confidence score
    source: Optional[str] = None         # Source (ios_speech, android_speech, etc.)
    segments: Optional[List] = None      # Segments with timestamps (List[Dict] or List[TranscriptionSegment])


@dataclass
class TranscriptionStageResult:
    """Result from transcription stage with speaker diarization support"""
    text: str
    language: str
    confidence: float
    duration_ms: int
    source: str  # "mobile", "whisper", or "cache"
    segments: Optional[List] = None      # List[TranscriptionSegment] or List[Dict]
    audio_hash: str = ""
    # Speaker diarization fields
    speaker_count: Optional[int] = None
    primary_speaker_id: Optional[str] = None
    sender_voice_identified: Optional[bool] = None
    sender_speaker_id: Optional[str] = None
    speaker_analysis: Optional[Dict[str, Any]] = None


class TranscriptionStage:
    """
    Transcription stage for audio pipeline.

    Orchestrates:
    1. Audio hash computation (for cache key)
    2. Cache lookup by audio hash
    3. Mobile transcription fallback
    4. Server-side Whisper transcription
    5. Cache storage

    Design:
    - Single responsibility: transcription only
    - No database persistence
    - Cache-first architecture
    - Mobile-first when metadata available
    """

    def __init__(
        self,
        transcription_service: Optional[TranscriptionService] = None,
        audio_cache: Optional[AudioCacheService] = None
    ):
        """
        Initialize transcription stage.

        Args:
            transcription_service: Service for Whisper transcription
            audio_cache: Redis cache service for transcriptions
        """
        self.transcription_service = transcription_service or get_transcription_service()
        self.audio_cache = audio_cache or get_audio_cache_service()

        self._initialized = False
        self._init_lock = None  # Sera créé dans initialize()

        logger.info("[TRANSCRIPTION_STAGE] Transcription stage created")

    async def initialize(self) -> bool:
        """Initialize transcription stage services"""
        if self._initialized:
            return True

        # Créer le lock dans le contexte async si nécessaire
        if self._init_lock is None:
            self._init_lock = asyncio.Lock()

        async with self._init_lock:
            if self._initialized:
                return True

            logger.info("[TRANSCRIPTION_STAGE] Initializing...")

            try:
                await self.transcription_service.initialize()
                self._initialized = True
                logger.info("[TRANSCRIPTION_STAGE] ✅ Initialized successfully")
                return True

            except Exception as e:
                logger.error(f"[TRANSCRIPTION_STAGE] ❌ Initialization failed: {e}")
                import traceback
                traceback.print_exc()
                return False

    async def process(
        self,
        audio_path: str,
        attachment_id: str,
        metadata: Optional[AudioMessageMetadata] = None,
        use_cache: bool = True
    ) -> TranscriptionStageResult:
        """
        Process audio transcription with caching.

        Pipeline:
        1. Compute audio hash (for cache key)
        2. Check cache by hash
        3. If cache miss:
           a. Try mobile metadata transcription
           b. Fallback to Whisper transcription
        4. Store in cache

        Args:
            audio_path: Path to audio file
            attachment_id: Unique attachment ID
            metadata: Optional mobile metadata
            use_cache: Enable cache lookup/storage

        Returns:
            TranscriptionStageResult with text, language, confidence
        """
        logger.info(
            f"[TRANSCRIPTION_STAGE] Processing: "
            f"attachment={attachment_id}, "
            f"has_metadata={metadata is not None}"
        )

        # Ensure initialized
        if not self._initialized:
            await self.initialize()

        # ═══════════════════════════════════════════════════════════════
        # STEP 1: COMPUTE AUDIO HASH (cache key)
        # ═══════════════════════════════════════════════════════════════
        audio_hash = await self._compute_audio_hash(attachment_id, audio_path)
        logger.info(f"[TRANSCRIPTION_STAGE] 🔑 Audio hash: {audio_hash[:8]}...")

        # ═══════════════════════════════════════════════════════════════
        # STEP 2: CHECK CACHE
        # ═══════════════════════════════════════════════════════════════
        if use_cache:
            cached_result = await self._get_cached_transcription(audio_hash)
            if cached_result:
                logger.info(
                    f"[TRANSCRIPTION_STAGE] ⚡ Cache hit: "
                    f"'{cached_result.text[:50]}...' "
                    f"(lang={cached_result.language})"
                )

                # Log des infos de diarisation si présentes
                if cached_result.speaker_count:
                    logger.info(
                        f"[TRANSCRIPTION_STAGE] 🎤 Diarisation cachée: "
                        f"{cached_result.speaker_count} speaker(s), "
                        f"primary={cached_result.primary_speaker_id}, "
                        f"segments={len(cached_result.segments) if cached_result.segments else 0}"
                    )

                return cached_result

        # ═══════════════════════════════════════════════════════════════
        # STEP 3: TRANSCRIBE (mobile or Whisper)
        # ═══════════════════════════════════════════════════════════════
        transcription_result = await self._transcribe_audio(
            audio_path=audio_path,
            metadata=metadata
        )

        # ═══════════════════════════════════════════════════════════════
        # STEP 4: CACHE RESULT
        # ═══════════════════════════════════════════════════════════════
        result = TranscriptionStageResult(
            text=transcription_result.text,
            language=transcription_result.language,
            confidence=transcription_result.confidence,
            duration_ms=transcription_result.duration_ms,
            source=transcription_result.source,
            segments=transcription_result.segments,
            audio_hash=audio_hash,
            speaker_count=transcription_result.speaker_count,
            primary_speaker_id=transcription_result.primary_speaker_id,
            sender_voice_identified=transcription_result.sender_voice_identified,
            sender_speaker_id=transcription_result.sender_speaker_id,
            speaker_analysis=transcription_result.speaker_analysis
        )

        if use_cache:
            await self._cache_transcription(audio_hash, result)

            # Log confirmation sauvegarde avec speakers
            if result.speaker_count:
                logger.info(
                    f"[TRANSCRIPTION_STAGE] 💾 Transcription+Diarisation cachée: "
                    f"{result.speaker_count} speaker(s), "
                    f"primary={result.primary_speaker_id}, "
                    f"segments={len(result.segments) if result.segments else 0}"
                )

        logger.info(
            f"[TRANSCRIPTION_STAGE] ✅ Transcribed: "
            f"'{result.text[:50]}...' "
            f"(lang={result.language}, source={result.source})"
        )

        return result

    async def _compute_audio_hash(
        self,
        attachment_id: str,
        audio_path: str
    ) -> str:
        """Compute or retrieve audio hash for cache key"""
        try:
            audio_hash = await self.audio_cache.get_or_compute_audio_hash(
                attachment_id,
                audio_path
            )
            return audio_hash
        except Exception as e:
            logger.warning(
                f"[TRANSCRIPTION_STAGE] Hash computation failed: {e}, "
                f"using attachment_id as fallback"
            )
            return f"fallback_{attachment_id}"

    async def _get_cached_transcription(
        self,
        audio_hash: str
    ) -> Optional[TranscriptionStageResult]:
        """Retrieve cached transcription by audio hash"""
        try:
            cached = await self.audio_cache.get_transcription_by_hash(audio_hash)

            if cached:
                return TranscriptionStageResult(
                    text=cached.get("text", ""),
                    language=cached.get("language", "en"),
                    confidence=cached.get("confidence", 0.9),
                    duration_ms=cached.get("duration_ms", 0),
                    source="cache",
                    segments=cached.get("segments"),
                    audio_hash=audio_hash,
                    speaker_count=cached.get("speaker_count"),
                    primary_speaker_id=cached.get("primary_speaker_id"),
                    sender_voice_identified=cached.get("sender_voice_identified"),
                    sender_speaker_id=cached.get("sender_speaker_id"),
                    speaker_analysis=cached.get("speaker_analysis")
                )

            return None

        except Exception as e:
            logger.warning(f"[TRANSCRIPTION_STAGE] Cache lookup failed: {e}")
            return None

    async def _transcribe_audio(
        self,
        audio_path: str,
        metadata: Optional[AudioMessageMetadata] = None
    ) -> TranscriptionResult:
        """
        Transcribe audio using mobile metadata or Whisper.

        Priority:
        1. Mobile metadata (if available and confident)
        2. Whisper server-side transcription
        """
        # Prepare mobile transcription data if available
        mobile_transcription = None
        if metadata and metadata.transcription:
            mobile_transcription = {
                "text": metadata.transcription,
                "language": metadata.language,
                "confidence": metadata.confidence or 0.85,
                "source": metadata.source or "mobile",
                "segments": metadata.segments
            }
            logger.info(
                f"[TRANSCRIPTION_STAGE] Mobile metadata available: "
                f"lang={metadata.language}, confidence={metadata.confidence}"
            )

        # Transcribe with service (handles mobile fallback)
        transcription = await self.transcription_service.transcribe(
            audio_path=audio_path,
            mobile_transcription=mobile_transcription,
            return_timestamps=True
        )

        return transcription

    async def _cache_transcription(
        self,
        audio_hash: str,
        result: TranscriptionStageResult
    ) -> bool:
        """Store transcription result in cache"""
        try:
            # Convertir les segments (dataclasses) en dictionnaires pour sérialisation JSON
            segments_as_dicts = [
                {
                    "text": seg.text,
                    "startMs": seg.start_ms,
                    "endMs": seg.end_ms,
                    "confidence": seg.confidence,
                    "speakerId": seg.speaker_id if hasattr(seg, 'speaker_id') and seg.speaker_id else None,
                    "voiceSimilarityScore": seg.voice_similarity_score if isinstance(seg.voice_similarity_score, (int, float)) else None,
                    "language": seg.language if hasattr(seg, 'language') and seg.language else None
                }
                for seg in (result.segments or [])
            ]

            cache_data = {
                "text": result.text,
                "language": result.language,
                "confidence": result.confidence,
                "duration_ms": result.duration_ms,
                "source": result.source,
                "segments": segments_as_dicts,  # Segments en dictionnaires JSON-compatibles
                # Diarization fields
                "speaker_count": result.speaker_count,
                "primary_speaker_id": result.primary_speaker_id,
                "sender_voice_identified": result.sender_voice_identified,
                "sender_speaker_id": result.sender_speaker_id,
                "speaker_analysis": result.speaker_analysis
            }

            await self.audio_cache.set_transcription_by_hash(audio_hash, cache_data)
            logger.debug(f"[TRANSCRIPTION_STAGE] Cached transcription: {audio_hash[:8]}...")
            return True

        except Exception as e:
            logger.warning(f"[TRANSCRIPTION_STAGE] Cache storage failed: {e}")
            return False

    async def get_stats(self) -> Dict[str, Any]:
        """Return stage statistics"""
        return {
            "stage": "transcription",
            "initialized": self._initialized,
            "transcription_service": await self.transcription_service.get_stats(),
            "cache": self.audio_cache.get_stats()
        }

    async def close(self):
        """Release resources"""
        logger.info("[TRANSCRIPTION_STAGE] Closing...")
        await self.transcription_service.close()
        self._initialized = False


# Factory function
def create_transcription_stage(
    transcription_service: Optional[TranscriptionService] = None,
    audio_cache: Optional[AudioCacheService] = None
) -> TranscriptionStage:
    """
    Create a new transcription stage instance.

    Args:
        transcription_service: Optional transcription service
        audio_cache: Optional audio cache service

    Returns:
        TranscriptionStage instance
    """
    return TranscriptionStage(
        transcription_service=transcription_service,
        audio_cache=audio_cache
    )
