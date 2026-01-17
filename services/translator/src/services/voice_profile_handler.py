"""
Voice Profile Audio Processing Handler (Internal ZMQ)

This handler processes voice profile audio sent by Gateway via ZMQ.
Gateway handles: authentication, consent, database persistence
Translator handles: audio analysis, fingerprint generation, embeddings

Message types:
- voice_profile_analyze: Analyze audio for profile creation/update
- voice_profile_verify: Verify audio matches existing profile (fingerprint comparison)
"""

import logging
import tempfile
import uuid
import os
from pathlib import Path
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from datetime import datetime

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# CONSTANTS
# ═══════════════════════════════════════════════════════════════════════════

# Minimum audio duration for dedicated profile registration (10 seconds)
MIN_PROFILE_AUDIO_DURATION_MS = 10000

# Minimum similarity threshold for profile updates
UPDATE_SIMILARITY_THRESHOLD = 0.80


# ═══════════════════════════════════════════════════════════════════════════
# RESPONSE DATACLASSES
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class TranscriptionData:
    """Transcription data matching shared types"""
    text: str
    language: str
    confidence: float
    duration_ms: int
    source: str  # "whisper" or "mobile"
    model: Optional[str] = None
    segments: Optional[list] = None  # [{text, start_ms, end_ms, confidence}, ...]
    processing_time_ms: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class VoicePreviewSample:
    """A voice preview sample in a specific language"""
    language: str  # Target language code (e.g., 'en', 'fr', 'es')
    original_text: str  # Text in source language
    translated_text: str  # Text translated to target language
    audio_base64: str  # Base64-encoded audio (MP3 or WAV)
    audio_format: str  # 'mp3' or 'wav'
    duration_ms: int  # Audio duration in milliseconds
    generated_at: str  # ISO timestamp

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class VoiceProfileAnalysisResult:
    """Result of voice profile audio analysis"""
    success: bool
    user_id: str
    profile_id: Optional[str] = None
    quality_score: float = 0.0
    audio_duration_ms: int = 0
    voice_characteristics: Optional[Dict[str, Any]] = None
    fingerprint: Optional[Dict[str, Any]] = None
    fingerprint_id: Optional[str] = None
    signature_short: Optional[str] = None
    embedding_path: Optional[str] = None
    embedding_data: Optional[str] = None  # Base64-encoded embedding binary (for Gateway storage)
    embedding_dimension: int = 256  # Embedding vector dimension
    transcription: Optional[Dict[str, Any]] = None  # Full transcription data (if requested)
    voice_previews: Optional[List[Dict[str, Any]]] = None  # Voice previews in multiple languages
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class VoiceProfileVerifyResult:
    """Result of voice profile verification"""
    success: bool
    user_id: str
    is_match: bool = False
    similarity_score: float = 0.0
    threshold: float = UPDATE_SIMILARITY_THRESHOLD
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ═══════════════════════════════════════════════════════════════════════════
# HANDLER CLASS
# ═══════════════════════════════════════════════════════════════════════════

class VoiceProfileHandler:
    """
    Handler for voice profile audio processing via ZMQ.

    Gateway sends audio → Translator analyzes → Returns fingerprint/characteristics
    + NEW: Generate voice previews in multiple languages for client-side storage
    """

    def __init__(self, voice_clone_service=None, transcription_service=None, tts_service=None, translation_service=None):
        self.voice_clone_service = voice_clone_service
        self.transcription_service = transcription_service
        self.tts_service = tts_service  # For generating voice previews
        self.translation_service = translation_service  # For translating preview text
        self.temp_dir = Path(tempfile.gettempdir()) / "voice_profiles"
        self.temp_dir.mkdir(parents=True, exist_ok=True)

        # Default preview languages (can be overridden per request)
        self.default_preview_languages = ['en', 'fr', 'es', 'de', 'pt']

        # Default preview text (short phrase that works well for voice cloning demo)
        self.default_preview_texts = {
            'en': "Hello, this is a preview of my cloned voice.",
            'fr': "Bonjour, ceci est un aperçu de ma voix clonée.",
            'es': "Hola, esta es una vista previa de mi voz clonada.",
            'de': "Hallo, dies ist eine Vorschau meiner geklonten Stimme.",
            'pt': "Olá, esta é uma prévia da minha voz clonada.",
            'it': "Ciao, questa è un'anteprima della mia voce clonata.",
            'nl': "Hallo, dit is een voorbeeld van mijn gekloonde stem.",
            'pl': "Cześć, to jest podgląd mojego sklonowanego głosu.",
            'ru': "Привет, это превью моего клонированного голоса.",
            'zh': "你好，这是我克隆语音的预览。",
            'ja': "こんにちは、これは私のクローン音声のプレビューです。",
            'ko': "안녕하세요, 제 복제된 목소리의 미리보기입니다.",
            'ar': "مرحبا، هذه معاينة لصوتي المستنسخ."
        }

    def is_voice_profile_request(self, message_type: str) -> bool:
        """Check if message type is a voice profile request"""
        return message_type in [
            'voice_profile_analyze',
            'voice_profile_verify',
            'voice_profile_compare'
        ]

    async def handle_request(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Route voice profile requests to appropriate handler.

        Args:
            request_data: ZMQ message data

        Returns:
            Response dict to send back via ZMQ
        """
        message_type = request_data.get('type')

        if message_type == 'voice_profile_analyze':
            result = await self.handle_analyze(request_data)
        elif message_type == 'voice_profile_verify':
            result = await self.handle_verify(request_data)
        elif message_type == 'voice_profile_compare':
            result = await self.handle_compare(request_data)
        else:
            result = {
                'success': False,
                'error': f'Unknown message type: {message_type}'
            }

        # Add response type
        result['type'] = f'{message_type}_result'
        result['request_id'] = request_data.get('request_id')

        return result

    async def handle_analyze(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze audio for voice profile creation/update.

        Expected request format:
        {
            "type": "voice_profile_analyze",
            "request_id": "uuid",
            "user_id": "user_id",
            "audio_data": "base64_encoded_audio",
            "audio_format": "wav",  # or mp3, ogg, etc.
            "is_update": false,  # true if updating existing profile
            "existing_fingerprint": {...}  # only if is_update=true
        }

        Returns:
        {
            "type": "voice_profile_analyze_result",
            "success": true,
            "user_id": "user_id",
            "profile_id": "vp_xxx",
            "quality_score": 0.85,
            "audio_duration_ms": 15000,
            "voice_characteristics": {...},
            "fingerprint": {...},
            "fingerprint_id": "vfp_xxx",
            "signature_short": "abc123def456",
            "embedding_path": "/path/to/embedding.pkl"
        }
        """
        user_id = request_data.get('user_id')

        if not user_id:
            return VoiceProfileAnalysisResult(
                success=False,
                user_id='',
                error='user_id is required'
            ).to_dict()

        if not self.voice_clone_service:
            return VoiceProfileAnalysisResult(
                success=False,
                user_id=user_id,
                error='Voice clone service not available'
            ).to_dict()

        try:
            # Decode and save audio to temp file
            audio_data = request_data.get('audio_data')
            audio_format = request_data.get('audio_format', 'wav')

            if not audio_data:
                return VoiceProfileAnalysisResult(
                    success=False,
                    user_id=user_id,
                    error='audio_data is required'
                ).to_dict()

            # Decode base64 audio
            import base64
            try:
                audio_bytes = base64.b64decode(audio_data)
            except Exception as e:
                return VoiceProfileAnalysisResult(
                    success=False,
                    user_id=user_id,
                    error=f'Invalid base64 audio data: {e}'
                ).to_dict()

            # Save to temp file
            temp_file = self.temp_dir / f"{user_id}_{uuid.uuid4().hex}.{audio_format}"
            with open(temp_file, 'wb') as f:
                f.write(audio_bytes)

            try:
                # Get audio duration
                audio_duration_ms = await self.voice_clone_service._get_audio_duration_ms(str(temp_file))

                # Validate minimum duration
                if audio_duration_ms < MIN_PROFILE_AUDIO_DURATION_MS:
                    return VoiceProfileAnalysisResult(
                        success=False,
                        user_id=user_id,
                        audio_duration_ms=audio_duration_ms,
                        error=f'Audio too short. Minimum {MIN_PROFILE_AUDIO_DURATION_MS/1000:.0f}s required, got {audio_duration_ms/1000:.1f}s'
                    ).to_dict()

                # Check if this is an update and verify fingerprint match
                is_update = request_data.get('is_update', False)
                existing_fingerprint = request_data.get('existing_fingerprint')

                if is_update and existing_fingerprint:
                    # Verify the new audio matches the existing fingerprint
                    verify_result = await self._verify_fingerprint_match(
                        temp_file, existing_fingerprint
                    )
                    if not verify_result['is_match']:
                        return VoiceProfileAnalysisResult(
                            success=False,
                            user_id=user_id,
                            error=f"Voice mismatch. Similarity: {verify_result['similarity']:.2%}, required: {UPDATE_SIMILARITY_THRESHOLD:.0%}"
                        ).to_dict()

                # Create voice model with full analysis
                model = await self.voice_clone_service._create_voice_model(
                    user_id=user_id,
                    audio_paths=[str(temp_file)],
                    total_duration_ms=audio_duration_ms
                )

                # Generate fingerprint
                if model.voice_characteristics or model.embedding is not None:
                    model.generate_fingerprint()

                # Save to cache (embeddings stored as .pkl files)
                await self.voice_clone_service._save_model_to_cache(model)

                # Encode embedding as base64 for Gateway to store in MongoDB
                embedding_data = None
                embedding_dimension = 256
                if model.embedding is not None:
                    import numpy as np
                    # Convert numpy array to bytes and then base64
                    embedding_bytes = model.embedding.astype(np.float32).tobytes()
                    embedding_data = base64.b64encode(embedding_bytes).decode('utf-8')
                    embedding_dimension = len(model.embedding)

                # Transcribe audio if requested
                transcription_data = None
                transcribed_text = ""
                detected_language = "en"
                include_transcription = request_data.get('include_transcription', False)

                if include_transcription and self.transcription_service:
                    try:
                        transcription_result = await self.transcription_service.transcribe(
                            audio_path=str(temp_file),
                            return_timestamps=True
                        )
                        if transcription_result:
                            transcribed_text = transcription_result.text
                            detected_language = transcription_result.language

                            # Convert segments to dict format
                            segments = None
                            if transcription_result.segments:
                                segments = [
                                    {
                                        'text': seg.text,
                                        'start_ms': seg.start_ms,
                                        'end_ms': seg.end_ms,
                                        'confidence': seg.confidence
                                    }
                                    for seg in transcription_result.segments
                                ]

                            transcription_data = TranscriptionData(
                                text=transcription_result.text,
                                language=transcription_result.language,
                                confidence=transcription_result.confidence,
                                duration_ms=transcription_result.duration_ms,
                                source=transcription_result.source,
                                model=transcription_result.model,
                                segments=segments,
                                processing_time_ms=transcription_result.processing_time_ms
                            ).to_dict()
                    except Exception as e:
                        logger.warning(f"Failed to transcribe audio for profile: {e}")
                        # Don't fail the whole operation if transcription fails

                # ═══════════════════════════════════════════════════════════════
                # VOICE PREVIEWS: Generate samples in multiple languages
                # These are returned to the client for local storage (IndexedDB)
                # ═══════════════════════════════════════════════════════════════
                voice_previews_data = None
                generate_previews = request_data.get('generate_previews', False)
                preview_languages = request_data.get('preview_languages', self.default_preview_languages)

                if generate_previews and (self.tts_service or self.voice_clone_service):
                    try:
                        logger.info(f"[VOICE_PROFILE] Generating voice previews for languages: {preview_languages}")

                        # Use transcribed text if available, otherwise use default preview texts
                        source_text = transcribed_text if transcribed_text else ""

                        voice_previews = await self._generate_voice_previews(
                            user_id=user_id,
                            source_audio_path=str(temp_file),
                            source_text=source_text,
                            source_language=detected_language,
                            target_languages=preview_languages,
                            voice_model=model
                        )

                        if voice_previews:
                            voice_previews_data = [p.to_dict() for p in voice_previews]
                            logger.info(f"[VOICE_PROFILE] ✅ Generated {len(voice_previews)} voice previews")

                    except Exception as e:
                        logger.error(f"[VOICE_PROFILE] Failed to generate voice previews: {e}")
                        # Don't fail the whole operation if preview generation fails

                return VoiceProfileAnalysisResult(
                    success=True,
                    user_id=user_id,
                    profile_id=model.profile_id or f"vp_{user_id[:12]}",
                    quality_score=model.quality_score,
                    audio_duration_ms=model.total_duration_ms,
                    voice_characteristics=model.voice_characteristics.to_dict() if model.voice_characteristics else None,
                    fingerprint=model.fingerprint.to_dict() if model.fingerprint else None,
                    fingerprint_id=model.fingerprint.fingerprint_id if model.fingerprint else None,
                    signature_short=model.fingerprint.signature_short if model.fingerprint else None,
                    embedding_path=model.embedding_path,
                    embedding_data=embedding_data,
                    embedding_dimension=embedding_dimension,
                    transcription=transcription_data,
                    voice_previews=voice_previews_data  # NEW: Voice samples in multiple languages
                ).to_dict()

            finally:
                # Cleanup temp file
                if temp_file.exists():
                    temp_file.unlink()

        except Exception as e:
            logger.error(f"Error analyzing voice profile: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return VoiceProfileAnalysisResult(
                success=False,
                user_id=user_id,
                error=str(e)
            ).to_dict()

    async def handle_verify(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Verify if audio matches an existing voice profile.

        Expected request format:
        {
            "type": "voice_profile_verify",
            "request_id": "uuid",
            "user_id": "user_id",
            "audio_data": "base64_encoded_audio",
            "audio_format": "wav",
            "existing_fingerprint": {...}
        }

        Returns:
        {
            "type": "voice_profile_verify_result",
            "success": true,
            "user_id": "user_id",
            "is_match": true,
            "similarity_score": 0.92,
            "threshold": 0.80
        }
        """
        user_id = request_data.get('user_id')

        if not user_id:
            return VoiceProfileVerifyResult(
                success=False,
                user_id='',
                error='user_id is required'
            ).to_dict()

        existing_fingerprint = request_data.get('existing_fingerprint')
        if not existing_fingerprint:
            return VoiceProfileVerifyResult(
                success=False,
                user_id=user_id,
                error='existing_fingerprint is required for verification'
            ).to_dict()

        try:
            # Decode and save audio
            audio_data = request_data.get('audio_data')
            audio_format = request_data.get('audio_format', 'wav')

            if not audio_data:
                return VoiceProfileVerifyResult(
                    success=False,
                    user_id=user_id,
                    error='audio_data is required'
                ).to_dict()

            import base64
            audio_bytes = base64.b64decode(audio_data)

            temp_file = self.temp_dir / f"verify_{user_id}_{uuid.uuid4().hex}.{audio_format}"
            with open(temp_file, 'wb') as f:
                f.write(audio_bytes)

            try:
                result = await self._verify_fingerprint_match(temp_file, existing_fingerprint)

                return VoiceProfileVerifyResult(
                    success=True,
                    user_id=user_id,
                    is_match=result['is_match'],
                    similarity_score=result['similarity'],
                    threshold=UPDATE_SIMILARITY_THRESHOLD
                ).to_dict()

            finally:
                if temp_file.exists():
                    temp_file.unlink()

        except Exception as e:
            logger.error(f"Error verifying voice profile: {e}")
            return VoiceProfileVerifyResult(
                success=False,
                user_id=user_id,
                error=str(e)
            ).to_dict()

    async def handle_compare(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compare two fingerprints directly (no audio processing).

        Expected request format:
        {
            "type": "voice_profile_compare",
            "request_id": "uuid",
            "fingerprint_a": {...},
            "fingerprint_b": {...}
        }

        Returns:
        {
            "type": "voice_profile_compare_result",
            "success": true,
            "similarity_score": 0.85,
            "is_match": true,
            "threshold": 0.80
        }
        """
        fingerprint_a = request_data.get('fingerprint_a')
        fingerprint_b = request_data.get('fingerprint_b')

        if not fingerprint_a or not fingerprint_b:
            return {
                'success': False,
                'error': 'Both fingerprint_a and fingerprint_b are required'
            }

        try:
            from services.voice_clone_service import VoiceFingerprint

            # Reconstruct fingerprint objects
            fp_a = VoiceFingerprint.from_dict(fingerprint_a)
            fp_b = VoiceFingerprint.from_dict(fingerprint_b)

            # Compute similarity
            similarity = fp_a.similarity_score(fp_b)

            return {
                'success': True,
                'similarity_score': similarity,
                'is_match': similarity >= UPDATE_SIMILARITY_THRESHOLD,
                'threshold': UPDATE_SIMILARITY_THRESHOLD
            }

        except Exception as e:
            logger.error(f"Error comparing fingerprints: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    async def _generate_voice_previews(
        self,
        user_id: str,
        source_audio_path: str,
        source_text: str,
        source_language: str,
        target_languages: List[str],
        voice_model=None
    ) -> List[VoicePreviewSample]:
        """
        Generate voice previews in multiple languages using the cloned voice.

        Args:
            user_id: User ID for the voice profile
            source_audio_path: Path to the original audio (for voice cloning reference)
            source_text: Transcribed text from the original audio
            source_language: Detected language of the source text
            target_languages: List of languages to generate previews for
            voice_model: Optional pre-loaded voice model

        Returns:
            List of VoicePreviewSample with audio data in base64
        """
        previews = []
        import base64

        # Check if we have the required services
        if not self.tts_service:
            logger.warning("[VOICE_PREVIEW] TTS service not available, skipping previews")
            return []

        logger.info(f"[VOICE_PREVIEW] Generating previews for {len(target_languages)} languages: {target_languages}")

        for target_lang in target_languages:
            try:
                # Determine the text to use
                if target_lang == source_language:
                    # Same language: use original text or default
                    preview_text = source_text[:100] if source_text else self.default_preview_texts.get(target_lang, self.default_preview_texts['en'])
                else:
                    # Different language: translate the source text or use default
                    if source_text and self.translation_service:
                        try:
                            # Translate the source text
                            translation_result = await self.translation_service.translate(
                                text=source_text[:100],  # Limit text length
                                source_language=source_language,
                                target_language=target_lang,
                                model_type='basic',
                                source_channel='voice_preview'
                            )
                            preview_text = translation_result.get('translated_text', self.default_preview_texts.get(target_lang, ''))
                        except Exception as e:
                            logger.warning(f"[VOICE_PREVIEW] Translation failed for {target_lang}: {e}")
                            preview_text = self.default_preview_texts.get(target_lang, self.default_preview_texts['en'])
                    else:
                        # Use default preview text
                        preview_text = self.default_preview_texts.get(target_lang, self.default_preview_texts['en'])

                if not preview_text:
                    logger.warning(f"[VOICE_PREVIEW] No preview text for {target_lang}, skipping")
                    continue

                # Generate TTS with cloned voice
                logger.info(f"[VOICE_PREVIEW] Generating TTS for {target_lang}: '{preview_text[:50]}...'")

                # Try to use the TTS service with voice cloning
                audio_result = None

                if hasattr(self.tts_service, 'synthesize_with_voice'):
                    # Use voice cloning TTS
                    audio_result = await self.tts_service.synthesize_with_voice(
                        text=preview_text,
                        language=target_lang,
                        voice_audio_path=source_audio_path,
                        output_format='mp3'
                    )
                elif hasattr(self.tts_service, 'synthesize'):
                    # Fallback to regular TTS (without voice cloning)
                    audio_result = await self.tts_service.synthesize(
                        text=preview_text,
                        language=target_lang,
                        output_format='mp3'
                    )

                if audio_result and audio_result.get('audio_path'):
                    # Read the generated audio file
                    audio_path = Path(audio_result['audio_path'])
                    if audio_path.exists():
                        audio_bytes = audio_path.read_bytes()
                        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')

                        # Get duration
                        duration_ms = audio_result.get('duration_ms', 0)
                        if duration_ms == 0 and self.voice_clone_service:
                            try:
                                duration_ms = await self.voice_clone_service._get_audio_duration_ms(str(audio_path))
                            except Exception:
                                duration_ms = len(audio_bytes) // 32  # Rough estimate

                        preview = VoicePreviewSample(
                            language=target_lang,
                            original_text=source_text[:100] if source_text else '',
                            translated_text=preview_text,
                            audio_base64=audio_base64,
                            audio_format=audio_result.get('format', 'mp3'),
                            duration_ms=duration_ms,
                            generated_at=datetime.now().isoformat()
                        )
                        previews.append(preview)
                        logger.info(f"[VOICE_PREVIEW] ✅ Generated preview for {target_lang} ({duration_ms}ms)")

                        # Cleanup temp audio file
                        try:
                            audio_path.unlink()
                        except Exception:
                            pass

                elif audio_result and audio_result.get('audio_data'):
                    # Audio data returned directly (base64)
                    preview = VoicePreviewSample(
                        language=target_lang,
                        original_text=source_text[:100] if source_text else '',
                        translated_text=preview_text,
                        audio_base64=audio_result['audio_data'],
                        audio_format=audio_result.get('format', 'mp3'),
                        duration_ms=audio_result.get('duration_ms', 0),
                        generated_at=datetime.now().isoformat()
                    )
                    previews.append(preview)
                    logger.info(f"[VOICE_PREVIEW] ✅ Generated preview for {target_lang}")

            except Exception as e:
                logger.error(f"[VOICE_PREVIEW] Error generating preview for {target_lang}: {e}")
                continue

        logger.info(f"[VOICE_PREVIEW] Generated {len(previews)}/{len(target_languages)} previews successfully")
        return previews

    async def _verify_fingerprint_match(
        self,
        audio_path: Path,
        existing_fingerprint: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Verify if audio matches an existing fingerprint.

        Returns:
            {'is_match': bool, 'similarity': float}
        """
        try:
            from services.voice_clone_service import VoiceFingerprint, get_voice_analyzer

            # Analyze the new audio
            voice_analyzer = get_voice_analyzer()
            metadata = await voice_analyzer.analyze_audio(str(audio_path))

            if not metadata.primary_speaker:
                return {'is_match': False, 'similarity': 0.0}

            # Generate fingerprint for new audio (without embedding for hash-based comparison)
            new_fp = metadata.primary_speaker.generate_fingerprint()

            if not new_fp:
                return {'is_match': False, 'similarity': 0.0}

            # Reconstruct existing fingerprint
            existing_fp = VoiceFingerprint.from_dict(existing_fingerprint)

            # Compare
            similarity = existing_fp.similarity_score(new_fp)

            return {
                'is_match': similarity >= UPDATE_SIMILARITY_THRESHOLD,
                'similarity': similarity
            }

        except Exception as e:
            logger.error(f"Error verifying fingerprint: {e}")
            return {'is_match': False, 'similarity': 0.0}


# ═══════════════════════════════════════════════════════════════════════════
# SINGLETON
# ═══════════════════════════════════════════════════════════════════════════

_handler_instance: Optional[VoiceProfileHandler] = None


def get_voice_profile_handler(
    voice_clone_service=None,
    transcription_service=None,
    tts_service=None,
    translation_service=None
) -> VoiceProfileHandler:
    """Get or create the voice profile handler singleton"""
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = VoiceProfileHandler(
            voice_clone_service,
            transcription_service,
            tts_service,
            translation_service
        )
    return _handler_instance
