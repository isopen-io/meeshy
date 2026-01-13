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
from typing import Dict, Any, Optional
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
    """

    def __init__(self, voice_clone_service=None):
        self.voice_clone_service = voice_clone_service
        self.temp_dir = Path(tempfile.gettempdir()) / "voice_profiles"
        self.temp_dir.mkdir(parents=True, exist_ok=True)

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
                    embedding_dimension=embedding_dimension
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


def get_voice_profile_handler(voice_clone_service=None) -> VoiceProfileHandler:
    """Get or create the voice profile handler singleton"""
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = VoiceProfileHandler(voice_clone_service)
    return _handler_instance
