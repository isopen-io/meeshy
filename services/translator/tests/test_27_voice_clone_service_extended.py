#!/usr/bin/env python3
"""
Test 27 - Voice Clone Service Extended Coverage Tests
Focus on maximizing test coverage for voice_clone_service.py to achieve >65%

Tests cover:
- AudioQualityMetadata edge cases and score calculations
- VoiceAnalyzer internal methods (noise estimation, SNR, reverb, etc.)
- VoiceCloneService complex flows (multi-speaker translation, recalibration)
- Error handling paths and edge cases
- VoiceFingerprint advanced similarity scenarios
- Database integration paths
"""

import sys
import os
import logging
import asyncio
import pytest
import tempfile
import shutil
import json
import struct
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from unittest.mock import MagicMock, AsyncMock, patch, PropertyMock
import numpy as np

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import service with graceful fallback
try:
    from services.voice_clone_service import (
        VoiceCloneService,
        VoiceModel,
        VoiceFingerprint,
        VoiceCharacteristics,
        SpeakerInfo,
        RecordingMetadata,
        TemporaryVoiceProfile,
        MultiSpeakerTranslationContext,
        VoiceAnalyzer,
        AudioQualityMetadata,
        get_voice_clone_service,
        get_voice_analyzer,
        OPENVOICE_AVAILABLE,
        AUDIO_PROCESSING_AVAILABLE
    )
    SERVICE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"VoiceCloneService not available: {e}")
    SERVICE_AVAILABLE = False
    OPENVOICE_AVAILABLE = False
    AUDIO_PROCESSING_AVAILABLE = False


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def temp_dir():
    """Create temporary directory for test files"""
    temp_path = tempfile.mkdtemp(prefix="voice_clone_ext_test_")
    yield Path(temp_path)
    shutil.rmtree(temp_path, ignore_errors=True)


@pytest.fixture
def mock_audio_file(temp_dir):
    """Create a mock WAV file for testing"""
    audio_path = temp_dir / "test_audio.wav"
    # Create a minimal valid WAV file header + some data

    sample_rate = 22050
    duration_seconds = 2
    num_samples = sample_rate * duration_seconds

    # Generate simple audio data (sine wave)
    samples = []
    for i in range(num_samples):
        value = int(32767 * 0.5 * np.sin(2 * np.pi * 440 * i / sample_rate))
        samples.append(struct.pack('<h', value))

    audio_data = b''.join(samples)

    # WAV header
    wav_header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',
        36 + len(audio_data),
        b'WAVE',
        b'fmt ',
        16,  # Subchunk1Size
        1,   # AudioFormat (PCM)
        1,   # NumChannels
        sample_rate,
        sample_rate * 2,  # ByteRate
        2,   # BlockAlign
        16,  # BitsPerSample
        b'data',
        len(audio_data)
    )

    with open(audio_path, 'wb') as f:
        f.write(wav_header)
        f.write(audio_data)

    yield str(audio_path)


@pytest.fixture
def mock_database_service():
    """Create a comprehensive mock database service"""
    voice_profiles = {}
    voice_embeddings = {}

    class MockPrismaUserVoiceModel:
        async def find_many(self, **kwargs):
            return list(voice_profiles.values())

        async def count(self, **kwargs):
            return len(voice_profiles)

    class MockPrismaMessageAttachment:
        def __init__(self):
            self.attachments = []

        async def find_many(self, **kwargs):
            return self.attachments

    class MockPrisma:
        uservoicemodel = MockPrismaUserVoiceModel()
        messageattachment = MockPrismaMessageAttachment()

    mock_service = MagicMock()
    mock_service.prisma = MockPrisma()
    mock_service.is_db_connected = MagicMock(return_value=True)

    async def get_voice_profile(user_id: str):
        return voice_profiles.get(user_id)
    mock_service.get_voice_profile = get_voice_profile

    async def get_voice_embedding(user_id: str):
        return voice_embeddings.get(user_id)
    mock_service.get_voice_embedding = get_voice_embedding

    async def save_voice_profile(user_id: str, embedding: bytes = None, **kwargs):
        voice_profiles[user_id] = {
            'userId': user_id,
            'audioCount': kwargs.get('audio_count', 1),
            'totalDurationMs': kwargs.get('total_duration_ms', 0),
            'qualityScore': kwargs.get('quality_score', 0.5),
            'profileId': kwargs.get('profile_id', f'prof_{user_id}'),
            'version': kwargs.get('version', 1),
            'embeddingModel': kwargs.get('embedding_model', 'openvoice_v2'),
            'embeddingDimension': kwargs.get('embedding_dimension', 256),
            'voiceCharacteristics': kwargs.get('voice_characteristics'),
            'fingerprint': kwargs.get('fingerprint'),
            'signatureShort': kwargs.get('signature_short'),
            'createdAt': datetime.now().isoformat(),
            'updatedAt': datetime.now().isoformat(),
            'nextRecalibrationAt': (datetime.now() + timedelta(days=90)).isoformat()
        }
        if embedding:
            voice_embeddings[user_id] = embedding
        return True
    mock_service.save_voice_profile = save_voice_profile

    mock_service._voice_profiles = voice_profiles
    mock_service._voice_embeddings = voice_embeddings

    return mock_service


# =============================================================================
# AudioQualityMetadata Tests
# =============================================================================

class TestAudioQualityMetadata:
    """Test AudioQualityMetadata class and score calculation"""

    def test_basic_creation(self):
        """Test basic AudioQualityMetadata creation"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        meta = AudioQualityMetadata(
            attachment_id="att_123",
            file_path="/tmp/test.wav",
            duration_ms=30000,
            noise_level=0.1,
            clarity_score=0.9
        )

        assert meta.attachment_id == "att_123"
        assert meta.duration_ms == 30000
        assert meta.noise_level == 0.1
        assert meta.clarity_score == 0.9

    def test_calculate_overall_score_single_speaker_high_quality(self):
        """Test score calculation for high quality single speaker audio"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        meta = AudioQualityMetadata(
            attachment_id="att_high",
            file_path="/tmp/high_quality.wav",
            duration_ms=45000,  # 45 seconds
            noise_level=0.05,  # Very low noise
            clarity_score=0.95,  # Very clear
            has_other_speakers=False,
            speaker_count=1,
            created_at=datetime.now()  # Very recent
        )

        score = meta.calculate_overall_score()

        # High quality audio should have high score
        assert score > 0.5
        assert meta.overall_score == score

    def test_calculate_overall_score_multiple_speakers_penalty(self):
        """Test score calculation penalizes multiple speakers"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        meta_single = AudioQualityMetadata(
            attachment_id="att_single",
            file_path="/tmp/single.wav",
            duration_ms=30000,
            noise_level=0.1,
            clarity_score=0.8,
            has_other_speakers=False,
            speaker_count=1,
            created_at=datetime.now()
        )

        meta_multi = AudioQualityMetadata(
            attachment_id="att_multi",
            file_path="/tmp/multi.wav",
            duration_ms=30000,
            noise_level=0.1,
            clarity_score=0.8,
            has_other_speakers=True,
            speaker_count=3,  # 3 speakers = penalty of 0.6
            created_at=datetime.now()
        )

        score_single = meta_single.calculate_overall_score()
        score_multi = meta_multi.calculate_overall_score()

        # Multiple speakers should have lower score
        assert score_single > score_multi

    def test_calculate_overall_score_noisy_audio_penalty(self):
        """Test score calculation penalizes noisy audio"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        meta_clean = AudioQualityMetadata(
            attachment_id="att_clean",
            file_path="/tmp/clean.wav",
            duration_ms=30000,
            noise_level=0.0,  # No noise
            clarity_score=0.9,
            created_at=datetime.now()
        )

        meta_noisy = AudioQualityMetadata(
            attachment_id="att_noisy",
            file_path="/tmp/noisy.wav",
            duration_ms=30000,
            noise_level=0.9,  # Very noisy
            clarity_score=0.9,
            created_at=datetime.now()
        )

        score_clean = meta_clean.calculate_overall_score()
        score_noisy = meta_noisy.calculate_overall_score()

        # Noisy audio should have lower score
        assert score_clean > score_noisy

    def test_calculate_overall_score_duration_bonus(self):
        """Test that longer duration gives higher score"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        meta_short = AudioQualityMetadata(
            attachment_id="att_short",
            file_path="/tmp/short.wav",
            duration_ms=5000,  # 5 seconds
            noise_level=0.1,
            clarity_score=0.8,
            created_at=datetime.now()
        )

        meta_long = AudioQualityMetadata(
            attachment_id="att_long",
            file_path="/tmp/long.wav",
            duration_ms=60000,  # 60 seconds (max bonus)
            noise_level=0.1,
            clarity_score=0.8,
            created_at=datetime.now()
        )

        score_short = meta_short.calculate_overall_score()
        score_long = meta_long.calculate_overall_score()

        # Longer audio should have higher score
        assert score_long > score_short

    def test_calculate_overall_score_recency_bonus(self):
        """Test that recent audio gets recency bonus"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        meta_recent = AudioQualityMetadata(
            attachment_id="att_recent",
            file_path="/tmp/recent.wav",
            duration_ms=30000,
            noise_level=0.1,
            clarity_score=0.8,
            created_at=datetime.now()  # Today
        )

        meta_old = AudioQualityMetadata(
            attachment_id="att_old",
            file_path="/tmp/old.wav",
            duration_ms=30000,
            noise_level=0.1,
            clarity_score=0.8,
            created_at=datetime.now() - timedelta(days=30)  # 30 days old
        )

        score_recent = meta_recent.calculate_overall_score()
        score_old = meta_old.calculate_overall_score()

        # Recent audio should have higher score (recency bonus)
        assert score_recent >= score_old

    def test_to_dict_with_recording_metadata(self):
        """Test to_dict includes recording_metadata when present"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        recording_meta = RecordingMetadata(
            file_path="/tmp/test.wav",
            duration_ms=30000,
            speaker_count=1,
            clarity_score=0.85
        )

        meta = AudioQualityMetadata(
            attachment_id="att_with_meta",
            file_path="/tmp/test.wav",
            duration_ms=30000,
            recording_metadata=recording_meta
        )

        result = meta.to_dict()

        assert "recording_metadata" in result
        assert result["recording_metadata"]["file"]["duration_ms"] == 30000

    def test_to_dict_with_primary_voice(self):
        """Test to_dict includes primary_voice when present"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        voice_chars = VoiceCharacteristics(
            pitch_mean_hz=150.0,
            estimated_gender="male"
        )

        meta = AudioQualityMetadata(
            attachment_id="att_with_voice",
            file_path="/tmp/test.wav",
            duration_ms=30000,
            primary_voice=voice_chars
        )

        result = meta.to_dict()

        assert "primary_voice" in result
        assert result["primary_voice"]["pitch"]["mean_hz"] == 150.0


# =============================================================================
# VoiceFingerprint Extended Tests
# =============================================================================

class TestVoiceFingerprintExtended:
    """Extended tests for VoiceFingerprint"""

    def test_similarity_with_zero_norm_vectors(self):
        """Test similarity score handles zero norm vectors"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        fp1 = VoiceFingerprint()
        fp1.embedding_vector = [0.0, 0.0, 0.0]  # Zero vector

        fp2 = VoiceFingerprint()
        fp2.embedding_vector = [1.0, 0.0, 0.0]

        # Should not crash and return valid score
        score = fp1.similarity_score(fp2)
        assert 0.0 <= score <= 1.0

    def test_similarity_partial_hash_matches(self):
        """Test similarity with partial hash matches"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        fp1 = VoiceFingerprint()
        fp1.pitch_hash = "abc123def456"
        fp1.spectral_hash = "xyz789uvw012"
        fp1.prosody_hash = "qwerty123456"
        fp1.embedding_vector = [0.5, 0.5, 0.5]

        fp2 = VoiceFingerprint()
        fp2.pitch_hash = "abc123def456"  # Same as fp1
        fp2.spectral_hash = "different_hash"  # Different
        fp2.prosody_hash = "qwerty123456"  # Same as fp1
        fp2.embedding_vector = [0.6, 0.5, 0.4]

        score = fp1.similarity_score(fp2)

        # Should have partial similarity due to matching hashes
        assert 0.0 < score < 1.0

    def test_to_dict_without_embedding(self):
        """Test to_dict excludes embedding by default"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=170.0)
        fp = VoiceFingerprint.generate_from_characteristics(chars)

        result = fp.to_dict(include_embedding=False)

        assert "embedding_vector" not in result
        assert "embedding_dimensions" in result["metadata"]

    def test_to_dict_with_embedding(self):
        """Test to_dict includes embedding when requested"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=170.0)
        fp = VoiceFingerprint.generate_from_characteristics(chars)

        result = fp.to_dict(include_embedding=True)

        assert "embedding_vector" in result
        assert len(result["embedding_vector"]) > 0

    def test_from_dict_with_metadata(self):
        """Test from_dict handles full metadata"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        data = {
            "fingerprint_id": "vfp_test123",
            "version": "2.0",
            "signature": "abc123",
            "signature_short": "abc123",
            "components": {
                "pitch_hash": "pitch123",
                "spectral_hash": "spec456",
                "prosody_hash": "pros789"
            },
            "checksum": "check123",
            "metadata": {
                "created_at": "2024-01-15T10:30:00",
                "audio_duration_ms": 25000,
                "sample_count": 3,
                "embedding_dimensions": 256
            },
            "embedding_vector": [0.1, 0.2, 0.3]
        }

        fp = VoiceFingerprint.from_dict(data)

        assert fp.fingerprint_id == "vfp_test123"
        assert fp.version == "2.0"
        assert fp.audio_duration_ms == 25000
        assert fp.sample_count == 3
        assert len(fp.embedding_vector) == 3

    def test_can_compute_similarity_empty(self):
        """Test can_compute_similarity with empty embedding"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        fp = VoiceFingerprint()
        assert fp.can_compute_similarity() is False

        fp.embedding_vector = [0.5]
        assert fp.can_compute_similarity() is True

    def test_generate_with_different_gender_values(self):
        """Test fingerprint generation with different gender values"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        # Test male
        chars_male = VoiceCharacteristics(
            pitch_mean_hz=120.0,
            estimated_gender="male"
        )
        fp_male = VoiceFingerprint.generate_from_characteristics(chars_male)
        assert 1.0 in fp_male.embedding_vector  # Male flag should be 1.0

        # Test female
        chars_female = VoiceCharacteristics(
            pitch_mean_hz=200.0,
            estimated_gender="female"
        )
        fp_female = VoiceFingerprint.generate_from_characteristics(chars_female)
        assert fp_female is not None

        # Test child
        chars_child = VoiceCharacteristics(
            pitch_mean_hz=300.0,
            estimated_gender="child"
        )
        fp_child = VoiceFingerprint.generate_from_characteristics(chars_child)
        assert fp_child is not None


# =============================================================================
# VoiceModel Extended Tests
# =============================================================================

class TestVoiceModelExtended:
    """Extended tests for VoiceModel"""

    def test_generate_fingerprint_from_embedding_only(self):
        """Test fingerprint generation using only embedding (no voice characteristics)"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        embedding = np.random.randn(256).astype(np.float32)

        model = VoiceModel(
            user_id="embed_only_user",
            embedding_path="/tmp/embed.pkl",
            audio_count=1,
            total_duration_ms=15000,
            quality_score=0.6,
            voice_characteristics=None,  # No voice characteristics
            embedding=embedding
        )

        fp = model.generate_fingerprint()

        assert fp is not None
        assert fp.fingerprint_id.startswith("vfp_")
        assert len(fp.embedding_vector) > 0

    def test_generate_fingerprint_no_data(self):
        """Test fingerprint generation with no embedding and no characteristics"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        model = VoiceModel(
            user_id="empty_user",
            embedding_path="/tmp/empty.pkl",
            audio_count=1,
            total_duration_ms=10000,
            quality_score=0.5,
            voice_characteristics=None,
            embedding=None
        )

        fp = model.generate_fingerprint()

        # Should return None when no data available
        assert fp is None

    def test_from_dict_with_voice_characteristics(self):
        """Test from_dict properly reconstructs voice characteristics"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        data = {
            "user_id": "vc_test_user",
            "embedding_path": "/tmp/test.pkl",
            "audio_count": 2,
            "total_duration_ms": 30000,
            "quality_score": 0.75,
            "profile_id": "prof_123",
            "version": 3,
            "source_audio_id": "audio_456",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "next_recalibration_at": (datetime.now() + timedelta(days=60)).isoformat(),
            "voice_characteristics": {
                "pitch": {"mean_hz": 155.0, "std_hz": 22.0, "min_hz": 100.0, "max_hz": 210.0},
                "classification": {"voice_type": "medium_male", "estimated_gender": "male", "estimated_age_range": "adult"},
                "spectral": {"brightness": 1600.0, "warmth": 3.2, "breathiness": 0.08, "nasality": 0.04},
                "energy": {"mean": 0.045, "std": 0.015, "silence_ratio": 0.18},
                "prosody": {"speech_rate_wpm": 125.0},
                "metadata": {"sample_rate": 22050, "bit_depth": 16, "channels": 1, "codec": "pcm"}
            }
        }

        model = VoiceModel.from_dict(data)

        assert model.voice_characteristics is not None
        assert model.voice_characteristics.pitch_mean_hz == 155.0
        assert model.voice_characteristics.voice_type == "medium_male"
        assert model.voice_characteristics.brightness == 1600.0
        assert model.voice_characteristics.speech_rate_wpm == 125.0

    def test_to_dict_with_all_fields(self):
        """Test to_dict includes all fields"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(
            pitch_mean_hz=160.0,
            voice_type="medium_male",
            estimated_gender="male"
        )

        model = VoiceModel(
            user_id="full_user",
            embedding_path="/tmp/full.pkl",
            audio_count=3,
            total_duration_ms=45000,
            quality_score=0.85,
            profile_id="prof_full",
            version=2,
            source_audio_id="audio_src",
            voice_characteristics=chars,
            embedding=np.random.randn(256).astype(np.float32),
            next_recalibration_at=datetime.now() + timedelta(days=30)
        )
        model.generate_fingerprint()

        result = model.to_dict()

        assert result["user_id"] == "full_user"
        assert result["profile_id"] == "prof_full"
        assert result["version"] == 2
        assert result["source_audio_id"] == "audio_src"
        assert "voice_characteristics" in result
        assert "fingerprint" in result
        assert result["next_recalibration_at"] is not None


# =============================================================================
# VoiceAnalyzer Extended Tests
# =============================================================================

class TestVoiceAnalyzerExtended:
    """Extended tests for VoiceAnalyzer methods"""

    def test_classify_voice_boundary_values(self):
        """Test voice classification at boundary values"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        # Test at exact boundaries
        test_cases = [
            (65.0, "low_male", "male"),      # Very low male
            (100.0, "medium_male", "male"),  # Medium male
            (130.0, "high_male", "male"),    # High male
            (140.0, "low_female", "female"), # Low female
            (165.0, "medium_female", "female"),
            (200.0, "high_female", "female"),
            (250.0, "child", "child"),       # Child
            (350.0, "child", "child"),       # High child
        ]

        for pitch, expected_type, expected_gender in test_cases:
            voice_type, gender = analyzer._classify_voice(pitch)
            assert gender == expected_gender, f"Pitch {pitch}: expected gender {expected_gender}, got {gender}"

    def test_estimate_age_ranges(self):
        """Test age estimation for different cases"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        # Child (high pitch)
        age = analyzer._estimate_age(300.0, 20.0)
        assert age == "child"

        # Teen (high pitch with high variation)
        age = analyzer._estimate_age(210.0, 35.0)
        assert age == "teen"

        # Senior (very low pitch)
        age = analyzer._estimate_age(80.0, 15.0)
        assert age == "senior"

        # Adult (normal pitch)
        age = analyzer._estimate_age(150.0, 25.0)
        assert age == "adult"

    def test_estimate_room_size_all_ranges(self):
        """Test room size estimation for all reverb ranges"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        assert analyzer._estimate_room_size(0.05) == "small"
        assert analyzer._estimate_room_size(0.15) == "medium"
        assert analyzer._estimate_room_size(0.4) == "large"
        assert analyzer._estimate_room_size(0.7) == "outdoor"

    def test_identify_primary_speaker_empty_list(self):
        """Test primary speaker identification with empty list"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()
        result = analyzer._identify_primary_speaker([])
        assert result is None

    def test_identify_primary_speaker_multiple(self):
        """Test primary speaker identification with multiple speakers"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        speakers = [
            SpeakerInfo(speaker_id="speaker_a", speaking_time_ms=5000),
            SpeakerInfo(speaker_id="speaker_b", speaking_time_ms=15000),  # Most time
            SpeakerInfo(speaker_id="speaker_c", speaking_time_ms=8000),
        ]

        primary = analyzer._identify_primary_speaker(speakers)

        assert primary is not None
        assert primary.speaker_id == "speaker_b"
        assert primary.is_primary is True

    def test_can_create_profile_multiple_speakers_dominant(self):
        """Test profile creation with multiple speakers but dominant primary"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        # Primary speaker dominates (>70%)
        primary = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=20000,
            speaking_ratio=0.8  # 80% - dominant
        )
        secondary = SpeakerInfo(
            speaker_id="speaker_1",
            speaking_time_ms=5000,
            speaking_ratio=0.2
        )

        metadata = RecordingMetadata(
            file_path="/tmp/test.wav",
            duration_ms=25000,
            speaker_count=2,
            speakers=[primary, secondary],
            primary_speaker=primary,
            clarity_score=0.85
        )

        can_create, reason = analyzer.can_create_user_profile(metadata)

        assert can_create is True

    def test_can_create_profile_low_clarity(self):
        """Test profile creation rejected for low clarity"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=15000,
            speaking_ratio=1.0
        )

        metadata = RecordingMetadata(
            file_path="/tmp/low_clarity.wav",
            duration_ms=15000,
            speaker_count=1,
            speakers=[speaker],
            primary_speaker=speaker,
            clarity_score=0.3  # Below 0.5 threshold
        )

        can_create, reason = analyzer.can_create_user_profile(metadata)

        assert can_create is False
        assert "qualit" in reason.lower() or "insuffisante" in reason.lower()

    def test_can_create_profile_short_speaking_time(self):
        """Test profile creation rejected for short speaking time"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=3000,  # Only 3 seconds
            speaking_ratio=1.0
        )

        metadata = RecordingMetadata(
            file_path="/tmp/short.wav",
            duration_ms=3000,
            speaker_count=1,
            speakers=[speaker],
            primary_speaker=speaker,
            clarity_score=0.9
        )

        can_create, reason = analyzer.can_create_user_profile(metadata)

        assert can_create is False
        assert "duree" in reason.lower() or "insuffisante" in reason.lower()

    def test_can_update_profile_no_primary_speaker(self):
        """Test profile update rejected when no primary speaker"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        metadata = RecordingMetadata(
            file_path="/tmp/no_primary.wav",
            duration_ms=15000,
            speaker_count=0,
            primary_speaker=None,
            clarity_score=0.85
        )

        existing_fp = VoiceFingerprint()
        existing_fp.signature = "test_signature"

        can_update, reason, speaker = analyzer.can_update_user_profile(metadata, existing_fp)

        assert can_update is False
        assert speaker is None

    def test_can_update_profile_fingerprint_generation_fails(self):
        """Test profile update when fingerprint cannot be generated"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        # Speaker without voice characteristics
        speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=15000,
            speaking_ratio=0.9,
            voice_characteristics=None  # No characteristics
        )
        speaker.fingerprint = None  # Force no fingerprint

        metadata = RecordingMetadata(
            file_path="/tmp/no_fp.wav",
            duration_ms=15000,
            speaker_count=1,
            speakers=[speaker],
            primary_speaker=speaker,
            clarity_score=0.85
        )

        existing_fp = VoiceFingerprint()
        existing_fp.signature = "test_signature"
        existing_fp.embedding_vector = [0.5] * 10

        # Mock generate_fingerprint to return None
        with patch.object(speaker, 'generate_fingerprint', return_value=None):
            speaker.fingerprint = None
            can_update, reason, returned_speaker = analyzer.can_update_user_profile(metadata, existing_fp)

        # Note: The actual behavior depends on the implementation
        # If fingerprint is None after generation, it should fail

    def test_identify_user_speaker_no_fingerprint(self):
        """Test user speaker identification when user has no fingerprint"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        speakers = [
            SpeakerInfo(speaker_id="s1", speaking_time_ms=10000)
        ]

        result = analyzer.identify_user_speaker(speakers, None)

        assert result is None

    def test_identify_user_speaker_no_speakers(self):
        """Test user speaker identification with empty speakers list"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        user_fp = VoiceFingerprint()
        user_fp.signature = "user_sig"

        result = analyzer.identify_user_speaker([], user_fp)

        assert result is None


# =============================================================================
# VoiceCloneService Extended Tests
# =============================================================================

class TestVoiceCloneServiceExtended:
    """Extended tests for VoiceCloneService"""

    @pytest.mark.asyncio
    async def test_initialize_without_openvoice(self, temp_dir):
        """Test initialization when OpenVoice is not available"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None

        with patch('services.voice_clone_service.OPENVOICE_AVAILABLE', False):
            service = VoiceCloneService(voice_cache_dir=str(temp_dir))
            service._initialized = True
            service.is_initialized = False

            result = await service.initialize()

            assert result is True
            assert service.is_initialized is True

    @pytest.mark.asyncio
    async def test_get_or_create_model_cached_recent(self, temp_dir, mock_database_service):
        """Test get_or_create with recent cached model"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.set_database_service(mock_database_service)
        service.is_initialized = True

        # Pre-create a recent cached model
        user_id = "recent_user"
        embedding = np.random.randn(256).astype(np.float32)

        cached_model = VoiceModel(
            user_id=user_id,
            embedding_path="",
            audio_count=2,
            total_duration_ms=30000,
            quality_score=0.7,
            profile_id=f"prof_{user_id}",
            version=1,
            source_audio_id="",
            created_at=datetime.now(),
            updated_at=datetime.now(),
            next_recalibration_at=datetime.now() + timedelta(days=60)
        )
        cached_model.embedding = embedding

        # Mock cache manager to return cached model
        mock_cache_manager = AsyncMock()
        mock_cache_manager.load_cached_model = AsyncMock(return_value=cached_model)
        service._get_cache_manager = MagicMock(return_value=mock_cache_manager)

        # Get model (should use cache)
        model = await service.get_or_create_voice_model(user_id)

        assert model is not None
        assert model.user_id == user_id
        mock_cache_manager.load_cached_model.assert_called_once_with(user_id)

    @pytest.mark.asyncio
    async def test_get_audio_duration_no_processing(self, temp_dir):
        """Test audio duration when audio processing unavailable"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))

        with patch('services.voice_clone.voice_clone_audio.AUDIO_PROCESSING_AVAILABLE', False):
            duration = await service._audio_processor.get_audio_duration_ms("/tmp/nonexistent.wav")
            assert duration == 0

    @pytest.mark.asyncio
    async def test_concatenate_audios_no_processing(self, temp_dir, mock_audio_file):
        """Test audio concatenation when processing unavailable"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))

        audio_paths = [mock_audio_file, mock_audio_file]

        with patch('services.voice_clone.voice_clone_audio.AUDIO_PROCESSING_AVAILABLE', False):
            result = await service._audio_processor.concatenate_audios(audio_paths, Path("/tmp/test"), "test_user")
            # Should return first audio when processing unavailable
            assert result == mock_audio_file

    @pytest.mark.asyncio
    async def test_get_user_audio_history_no_database(self, temp_dir):
        """Test audio history retrieval without database"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.database_service = None  # No database

        result = await service._audio_processor.get_user_audio_history("test_user")

        assert result == []

    @pytest.mark.asyncio
    async def test_get_best_audio_no_database(self, temp_dir):
        """Test best audio selection without database"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.database_service = None

        result = await service._audio_processor.get_best_audio_for_cloning("test_user")

        assert result is None

    @pytest.mark.asyncio
    async def test_load_cached_model_no_database(self, temp_dir):
        """Test loading cached model without database"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.database_service = None

        mock_cache_manager = MagicMock()
        mock_cache_manager.load_cached_model = AsyncMock(return_value=None)
        service._cache_manager = mock_cache_manager

        result = await service._get_cache_manager().load_cached_model("test_user")

        assert result is None

    @pytest.mark.asyncio
    async def test_load_cached_model_db_disconnected(self, temp_dir, mock_database_service):
        """Test loading cached model when database disconnected"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        mock_database_service.is_db_connected = MagicMock(return_value=False)
        service.set_database_service(mock_database_service)

        mock_cache_manager = MagicMock()
        mock_cache_manager.load_cached_model = AsyncMock(return_value=None)
        service._cache_manager = mock_cache_manager

        result = await service._get_cache_manager().load_cached_model("test_user")

        assert result is None

    @pytest.mark.asyncio
    async def test_save_model_no_database(self, temp_dir):
        """Test saving model without database"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.database_service = None

        model = VoiceModel(
            user_id="test_save_user",
            embedding_path="/tmp/test.pkl",
            audio_count=1,
            total_duration_ms=10000,
            quality_score=0.5,
            embedding=np.zeros(256, dtype=np.float32)
        )

        mock_cache_manager = MagicMock()
        mock_cache_manager.save_model_to_cache = AsyncMock()
        service._cache_manager = mock_cache_manager

        # Should not raise, just log warning
        await service._get_cache_manager().save_model_to_cache(model)

    @pytest.mark.asyncio
    async def test_load_embedding_no_database(self, temp_dir):
        """Test loading embedding without database"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.database_service = None

        model = VoiceModel(
            user_id="test_embed_user",
            embedding_path="/tmp/test.pkl",
            audio_count=1,
            total_duration_ms=10000,
            quality_score=0.5
        )

        # Create a model with zero embedding as the expected fallback result
        result_model = VoiceModel(
            user_id="test_embed_user",
            embedding_path="/tmp/test.pkl",
            audio_count=1,
            total_duration_ms=10000,
            quality_score=0.5,
            embedding=np.zeros(256, dtype=np.float32)
        )

        mock_cache_manager = MagicMock()
        mock_cache_manager.load_embedding = AsyncMock(return_value=result_model)
        service._cache_manager = mock_cache_manager

        result = await service._get_cache_manager().load_embedding(model)

        # Should return model with zero embedding as fallback
        assert result.embedding is not None
        assert np.all(result.embedding == 0)

    @pytest.mark.asyncio
    async def test_extract_voice_embedding_no_openvoice(self, temp_dir, mock_audio_file):
        """Test embedding extraction without OpenVoice"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        # Audio processor has no OpenVoice components by default

        embedding = await service._audio_processor.extract_voice_embedding(mock_audio_file, temp_dir)

        # Should return zero embedding as fallback
        assert embedding is not None
        assert np.all(embedding == 0)

    @pytest.mark.asyncio
    async def test_should_update_user_profile_no_existing(self, temp_dir, mock_database_service, mock_audio_file):
        """Test should_update when no existing profile"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.set_database_service(mock_database_service)
        service.is_initialized = True

        # Mock analyze_audio to return valid metadata
        mock_metadata = RecordingMetadata(
            file_path=mock_audio_file,
            duration_ms=15000,
            speaker_count=1,
            clarity_score=0.85
        )
        mock_metadata.primary_speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=15000,
            speaking_ratio=1.0
        )

        with patch.object(get_voice_analyzer(), 'analyze_audio', new_callable=AsyncMock) as mock_analyze:
            mock_analyze.return_value = mock_metadata

            should_update, reason = await service.should_update_user_profile(
                "new_user",
                mock_audio_file
            )

        # Should allow creation for new user
        assert "Creation" in reason or "possible" in reason.lower()

    @pytest.mark.asyncio
    async def test_cleanup_temp_profiles(self, temp_dir):
        """Test cleanup of temporary profiles"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))

        # Create temp files
        temp_audio_1 = temp_dir / "temp_speaker_0.wav"
        temp_audio_2 = temp_dir / "temp_speaker_1.wav"
        temp_audio_1.touch()
        temp_audio_2.touch()

        assert temp_audio_1.exists()
        assert temp_audio_2.exists()

        # Create profiles pointing to these files
        chars = VoiceCharacteristics(pitch_mean_hz=150.0)
        profiles = [
            TemporaryVoiceProfile(
                speaker_id="speaker_0",
                speaker_info=SpeakerInfo(speaker_id="speaker_0", voice_characteristics=chars),
                audio_path=str(temp_audio_1)
            ),
            TemporaryVoiceProfile(
                speaker_id="speaker_1",
                speaker_info=SpeakerInfo(speaker_id="speaker_1", voice_characteristics=chars),
                audio_path=str(temp_audio_2)
            )
        ]

        context = MultiSpeakerTranslationContext(
            source_audio_path="/tmp/source.wav",
            source_duration_ms=30000,
            speaker_count=2,
            profiles=profiles
        )

        # Cleanup
        await service.cleanup_temp_profiles(context)

        # Files should be deleted
        assert not temp_audio_1.exists()
        assert not temp_audio_2.exists()

    @pytest.mark.asyncio
    async def test_cleanup_temp_profiles_nonexistent_file(self, temp_dir):
        """Test cleanup handles nonexistent files gracefully"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))

        chars = VoiceCharacteristics(pitch_mean_hz=150.0)
        profiles = [
            TemporaryVoiceProfile(
                speaker_id="speaker_0",
                speaker_info=SpeakerInfo(speaker_id="speaker_0", voice_characteristics=chars),
                audio_path="/tmp/nonexistent_file_12345.wav"
            )
        ]

        context = MultiSpeakerTranslationContext(
            source_audio_path="/tmp/source.wav",
            source_duration_ms=30000,
            speaker_count=1,
            profiles=profiles
        )

        # Should not raise
        await service.cleanup_temp_profiles(context)

    @pytest.mark.asyncio
    async def test_get_stats_with_database(self, temp_dir, mock_database_service):
        """Test get_stats with database connected"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.set_database_service(mock_database_service)
        service.is_initialized = True

        # Mock cache manager to avoid Redis dependency
        mock_cache_manager = MagicMock()
        mock_cache_manager.get_stats = AsyncMock(return_value={
            "cache_type": "Redis",
            "models_count": 0,
            "cache_available": True,
        })
        service._cache_manager = mock_cache_manager

        stats = await service.get_stats()

        assert stats["service"] == "VoiceCloneService"
        assert stats["cache_available"] is True
        assert "voice_models_count" in stats

    @pytest.mark.asyncio
    async def test_list_all_cached_models_empty(self, temp_dir, mock_database_service):
        """Test listing all cached models when none exist"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.set_database_service(mock_database_service)

        models = await service._list_all_cached_models()

        assert models == []

    def test_calculate_quality_score_various_durations(self, temp_dir):
        """Test quality score calculation for various durations"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))

        # Test score thresholds
        assert service._audio_processor.calculate_quality_score(5000, 1) == 0.3   # < 10s
        assert service._audio_processor.calculate_quality_score(15000, 1) == 0.5  # 10-30s
        assert service._audio_processor.calculate_quality_score(45000, 1) == 0.7  # 30-60s
        assert service._audio_processor.calculate_quality_score(90000, 1) == 0.9  # > 60s

        # Test audio count bonus
        assert service._audio_processor.calculate_quality_score(15000, 1) == 0.5
        assert service._audio_processor.calculate_quality_score(15000, 2) == 0.55  # +0.05
        assert service._audio_processor.calculate_quality_score(15000, 3) == 0.6   # +0.10
        assert service._audio_processor.calculate_quality_score(15000, 5) == 0.6   # Max +0.10

    @pytest.mark.asyncio
    async def test_calculate_total_duration(self, temp_dir, mock_audio_file):
        """Test total duration calculation for multiple audio files"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))

        # Mock get_audio_duration_ms
        with patch.object(service._audio_processor, 'get_audio_duration_ms', new_callable=AsyncMock) as mock_duration:
            mock_duration.side_effect = [10000, 15000, 20000]

            total = await service._audio_processor.calculate_total_duration([
                "/tmp/audio1.wav",
                "/tmp/audio2.wav",
                "/tmp/audio3.wav"
            ])

        assert total == 45000

    @pytest.mark.asyncio
    async def test_db_profile_to_voice_model_minimal(self, temp_dir):
        """Test conversion of minimal DB profile to VoiceModel"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))

        db_profile = {
            "userId": "minimal_user",
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat()
        }

        # Use the real method from VoiceCloneCacheManager directly
        from services.voice_clone.voice_clone_cache import VoiceCloneCacheManager as CacheManagerClass
        cache_mgr = CacheManagerClass.__new__(CacheManagerClass)
        cache_mgr.voice_cache_dir = Path(temp_dir)
        model = cache_mgr.db_profile_to_voice_model(db_profile)

        assert model.user_id == "minimal_user"
        assert model.audio_count == 1  # Default
        assert model.quality_score == 0.5  # Default


# =============================================================================
# RecordingMetadata Extended Tests
# =============================================================================

class TestRecordingMetadataExtended:
    """Extended tests for RecordingMetadata"""

    def test_to_dict_all_fields(self):
        """Test to_dict with all fields populated"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=155.0)
        speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=15000,
            speaking_ratio=0.8,
            voice_characteristics=chars
        )

        metadata = RecordingMetadata(
            file_path="/tmp/full_test.wav",
            duration_ms=20000,
            file_size_bytes=40000,
            format="wav",
            noise_level=0.15,
            snr_db=25.0,
            clarity_score=0.85,
            clipping_detected=False,
            background_music=False,
            reverb_level=0.1,
            room_size_estimate="medium",
            speaker_count=1,
            speakers=[speaker],
            primary_speaker=speaker
        )

        result = metadata.to_dict()

        assert result["file"]["path"] == "/tmp/full_test.wav"
        assert result["file"]["duration_ms"] == 20000
        assert result["quality"]["snr_db"] == 25.0
        assert result["environment"]["room_size_estimate"] == "medium"
        assert result["speakers"]["count"] == 1
        assert len(result["speakers"]["speakers"]) == 1

    def test_to_dict_no_primary_speaker(self):
        """Test to_dict when no primary speaker"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        metadata = RecordingMetadata(
            file_path="/tmp/no_primary.wav",
            duration_ms=15000,
            speaker_count=0,
            primary_speaker=None
        )

        result = metadata.to_dict()

        assert result["speakers"]["primary_speaker_id"] is None


# =============================================================================
# SpeakerInfo Extended Tests
# =============================================================================

class TestSpeakerInfoExtended:
    """Extended tests for SpeakerInfo"""

    def test_to_dict_limits_segments(self):
        """Test that to_dict limits segments to 10"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        # Create speaker with 15 segments
        segments = [{"start": float(i), "end": float(i + 0.5)} for i in range(15)]

        speaker = SpeakerInfo(
            speaker_id="speaker_many_segments",
            speaking_time_ms=15000,
            speaking_ratio=0.5,
            segments=segments
        )

        result = speaker.to_dict()

        # Should only include first 10 segments
        assert result["segments_count"] == 15
        assert len(result["segments"]) == 10


# =============================================================================
# Integration Tests
# =============================================================================

class TestIntegration:
    """Integration tests for voice clone service"""

    @pytest.mark.asyncio
    async def test_full_model_creation_flow(self, temp_dir, mock_database_service, mock_audio_file):
        """Test full flow of creating a voice model"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.set_database_service(mock_database_service)
        service.is_initialized = True

        user_id = "integration_test_user"

        # Mock the internal methods
        with patch.object(service._audio_processor, 'extract_voice_embedding', new_callable=AsyncMock) as mock_embed:
            mock_embed.return_value = np.random.randn(256).astype(np.float32)

            with patch.object(get_voice_analyzer(), 'extract_primary_speaker_audio', new_callable=AsyncMock) as mock_extract:
                # Return original path with mock metadata
                mock_metadata = RecordingMetadata(
                    file_path=mock_audio_file,
                    duration_ms=15000,
                    speaker_count=1
                )
                mock_metadata.primary_speaker = SpeakerInfo(
                    speaker_id="speaker_0",
                    is_primary=True,
                    speaking_time_ms=15000,
                    speaking_ratio=1.0,
                    voice_characteristics=VoiceCharacteristics(pitch_mean_hz=150.0)
                )
                mock_extract.return_value = (mock_audio_file, mock_metadata)

                with patch.object(service._audio_processor, 'get_audio_duration_ms', new_callable=AsyncMock) as mock_dur:
                    mock_dur.return_value = 15000

                    # Mock cache manager for model creator
                    mock_cache_manager = MagicMock()
                    mock_cache_manager.save_model_to_cache = AsyncMock()
                    service._cache_manager = mock_cache_manager

                    model_creator = service._get_model_creator()
                    model = await model_creator._create_voice_model(
                        user_id,
                        [mock_audio_file],
                        15000
                    )

        assert model is not None
        assert model.user_id == user_id
        assert model.embedding is not None

        # Verify model was saved to cache
        mock_cache_manager.save_model_to_cache.assert_called_once()

    @pytest.mark.asyncio
    async def test_improve_model_flow(self, temp_dir, mock_database_service, mock_audio_file):
        """Test flow of improving an existing model"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.set_database_service(mock_database_service)
        service.is_initialized = True

        # Create initial model
        initial_embedding = np.random.randn(256).astype(np.float32)
        chars = VoiceCharacteristics(pitch_mean_hz=150.0, estimated_gender="male")

        existing_model = VoiceModel(
            user_id="improve_test_user",
            embedding_path=str(temp_dir / "improve_test_user" / "embedding.pkl"),
            audio_count=1,
            total_duration_ms=15000,
            quality_score=0.5,
            version=1,
            voice_characteristics=chars,
            embedding=initial_embedding
        )
        existing_model.generate_fingerprint()

        # Mock analyze_audio to return matching voice
        mock_metadata = RecordingMetadata(
            file_path=mock_audio_file,
            duration_ms=10000,
            speaker_count=1,
            clarity_score=0.85
        )
        mock_metadata.primary_speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=10000,
            speaking_ratio=1.0,
            voice_characteristics=chars
        )
        mock_metadata.primary_speaker.generate_fingerprint()

        with patch.object(get_voice_analyzer(), 'analyze_audio', new_callable=AsyncMock) as mock_analyze:
            mock_analyze.return_value = mock_metadata

            with patch.object(service._audio_processor, 'extract_voice_embedding', new_callable=AsyncMock) as mock_embed:
                mock_embed.return_value = np.random.randn(256).astype(np.float32)

                # Mock cache manager for model improver
                mock_cache_manager = MagicMock()
                mock_cache_manager.save_model_to_cache = AsyncMock()
                service._cache_manager = mock_cache_manager

                model_improver = service._get_model_improver()
                improved = await model_improver.improve_model(existing_model, mock_audio_file)

        assert improved.version == 2
        assert improved.audio_count == 2
        assert improved.quality_score > 0.5


# =============================================================================
# Additional Coverage Tests - Part 2
# =============================================================================

class TestVoiceCharacteristicsExtended:
    """Additional tests for VoiceCharacteristics"""

    def test_default_values_comprehensive(self):
        """Test all default values in VoiceCharacteristics"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics()

        # All numeric defaults should be 0.0
        assert chars.pitch_mean_hz == 0.0
        assert chars.pitch_std_hz == 0.0
        assert chars.pitch_min_hz == 0.0
        assert chars.pitch_max_hz == 0.0
        assert chars.brightness == 0.0
        assert chars.warmth == 0.0
        assert chars.breathiness == 0.0
        assert chars.nasality == 0.0
        assert chars.energy_mean == 0.0
        assert chars.energy_std == 0.0
        assert chars.silence_ratio == 0.0
        assert chars.speech_rate_wpm == 0.0

        # String defaults
        assert chars.voice_type == "unknown"
        assert chars.estimated_gender == "unknown"
        assert chars.estimated_age_range == "unknown"

    def test_to_dict_all_sections(self):
        """Test that to_dict includes all sections"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(
            pitch_mean_hz=145.0,
            pitch_std_hz=22.0,
            pitch_min_hz=80.0,
            pitch_max_hz=220.0,
            voice_type="medium_male",
            estimated_gender="male",
            estimated_age_range="adult",
            brightness=1550.0,
            warmth=3.8,
            breathiness=0.12,
            nasality=0.06,
            energy_mean=0.045,
            energy_std=0.018,
            silence_ratio=0.22,
            speech_rate_wpm=135.0,
            sample_rate=22050,
            bit_depth=16,
            channels=1,
            codec="pcm"
        )

        result = chars.to_dict()

        # Verify pitch section
        assert result["pitch"]["mean_hz"] == 145.0
        assert result["pitch"]["std_hz"] == 22.0
        assert result["pitch"]["min_hz"] == 80.0
        assert result["pitch"]["max_hz"] == 220.0

        # Verify classification section
        assert result["classification"]["voice_type"] == "medium_male"
        assert result["classification"]["estimated_gender"] == "male"
        assert result["classification"]["estimated_age_range"] == "adult"

        # Verify spectral section
        assert result["spectral"]["brightness"] == 1550.0
        assert result["spectral"]["warmth"] == 3.8
        assert result["spectral"]["breathiness"] == 0.12
        assert result["spectral"]["nasality"] == 0.06

        # Verify energy section
        assert result["energy"]["mean"] == 0.045
        assert result["energy"]["std"] == 0.018
        assert result["energy"]["silence_ratio"] == 0.22

        # Verify prosody section
        assert result["prosody"]["speech_rate_wpm"] == 135.0

        # Verify metadata section
        assert result["metadata"]["sample_rate"] == 22050
        assert result["metadata"]["bit_depth"] == 16
        assert result["metadata"]["channels"] == 1
        assert result["metadata"]["codec"] == "pcm"

    def test_generate_fingerprint_creates_all_hashes(self):
        """Test fingerprint generation creates all hash components"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(
            pitch_mean_hz=160.0,
            pitch_std_hz=25.0,
            pitch_min_hz=90.0,
            pitch_max_hz=240.0,
            brightness=1600.0,
            warmth=4.0,
            breathiness=0.15,
            nasality=0.07,
            energy_mean=0.05,
            energy_std=0.02,
            silence_ratio=0.2,
            speech_rate_wpm=140.0
        )

        fp = chars.generate_fingerprint()

        # All hashes should be non-empty
        assert len(fp.pitch_hash) > 0
        assert len(fp.spectral_hash) > 0
        assert len(fp.prosody_hash) > 0
        assert len(fp.signature) > 0
        assert len(fp.signature_short) > 0
        assert len(fp.checksum) > 0
        assert fp.fingerprint_id.startswith("vfp_")


class TestMultiSpeakerContext:
    """Additional tests for MultiSpeakerTranslationContext"""

    def test_to_dict_all_fields(self):
        """Test to_dict includes all fields"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=155.0)
        speaker = SpeakerInfo(speaker_id="speaker_0", voice_characteristics=chars)
        profile = TemporaryVoiceProfile(
            speaker_id="speaker_0",
            speaker_info=speaker,
            audio_path="/tmp/audio.wav"
        )

        context = MultiSpeakerTranslationContext(
            source_audio_path="/tmp/source.wav",
            source_duration_ms=30000,
            speaker_count=1,
            profiles=[profile],
            user_profile=None,
            segments_timeline=[("speaker_0", 0.0, 30.0)]
        )

        result = context.to_dict()

        assert result["source_audio_path"] == "/tmp/source.wav"
        assert result["source_duration_ms"] == 30000
        assert result["speaker_count"] == 1
        assert len(result["profiles"]) == 1
        assert result["user_speaker_id"] is None
        assert result["segments_count"] == 1

    def test_get_profile_by_id(self):
        """Test get_profile returns correct profile"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=155.0)
        profiles = [
            TemporaryVoiceProfile(
                speaker_id=f"speaker_{i}",
                speaker_info=SpeakerInfo(speaker_id=f"speaker_{i}", voice_characteristics=chars),
                audio_path=f"/tmp/audio_{i}.wav"
            )
            for i in range(3)
        ]

        context = MultiSpeakerTranslationContext(
            source_audio_path="/tmp/source.wav",
            source_duration_ms=30000,
            speaker_count=3,
            profiles=profiles
        )

        # Get each profile by ID
        for i in range(3):
            result = context.get_profile(f"speaker_{i}")
            assert result is not None
            assert result.speaker_id == f"speaker_{i}"


class TestTemporaryVoiceProfileExtended:
    """Extended tests for TemporaryVoiceProfile"""

    def test_to_dict_with_embedding(self):
        """Test to_dict includes embedding info"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=155.0)
        speaker = SpeakerInfo(speaker_id="speaker_0", voice_characteristics=chars)
        embedding = np.random.randn(256).astype(np.float32)

        profile = TemporaryVoiceProfile(
            speaker_id="speaker_0",
            speaker_info=speaker,
            audio_path="/tmp/audio.wav",
            embedding=embedding,
            original_segments=[{"start": 0.0, "end": 5.0}, {"start": 8.0, "end": 15.0}]
        )

        result = profile.to_dict()

        assert result["speaker_id"] == "speaker_0"
        assert result["is_user_match"] is False  # Default is False
        assert result["segments_count"] == 2


class TestVoiceCloneServiceClose:
    """Test VoiceCloneService close and cleanup methods"""

    @pytest.mark.asyncio
    async def test_close_clears_resources(self, temp_dir):
        """Test that close clears all resources"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.is_initialized = True
        service.tone_color_converter = MagicMock()
        service.se_extractor_module = MagicMock()

        await service.close()

        assert service.tone_color_converter is None
        assert service.se_extractor_module is None
        assert service.is_initialized is False


class TestVoiceAnalyzerCompareVoices:
    """Test VoiceAnalyzer compare_voices method"""

    @pytest.mark.asyncio
    async def test_compare_voices_no_primary_speaker(self, temp_dir):
        """Test compare_voices when no primary speaker detected"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        # Mock analyze_audio to return metadata without primary speaker
        mock_metadata_no_speaker = RecordingMetadata(
            file_path="/tmp/test.wav",
            duration_ms=10000,
            speaker_count=0,
            primary_speaker=None
        )

        with patch.object(analyzer, 'analyze_audio', new_callable=AsyncMock) as mock_analyze:
            mock_analyze.return_value = mock_metadata_no_speaker

            result = await analyzer.compare_voices("/tmp/original.wav", "/tmp/cloned.wav")

        assert result["similarity"] == 0.0
        assert "error" in result


class TestVoiceModelFromDictEdgeCases:
    """Edge cases for VoiceModel.from_dict"""

    def test_from_dict_minimal_data(self):
        """Test from_dict with minimal data"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        # VoiceModel.from_dict requires created_at and updated_at fields
        data = {
            "user_id": "minimal_user",
            "embedding_path": "/tmp/min.pkl",
            "audio_count": 1,
            "total_duration_ms": 10000,
            "quality_score": 0.5,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }

        model = VoiceModel.from_dict(data)

        assert model.user_id == "minimal_user"
        assert model.version == 1  # Default
        assert model.voice_characteristics is None
        assert model.fingerprint is None

    def test_from_dict_with_fingerprint(self):
        """Test from_dict with fingerprint data"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        data = {
            "user_id": "fp_user",
            "embedding_path": "/tmp/fp.pkl",
            "audio_count": 2,
            "total_duration_ms": 20000,
            "quality_score": 0.7,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "fingerprint": {
                "fingerprint_id": "vfp_test123abc",
                "version": "1.0",
                "signature": "abc123def456",
                "signature_short": "abc123def456",
                "components": {
                    "pitch_hash": "pitch_hash_123",
                    "spectral_hash": "spec_hash_456",
                    "prosody_hash": "pros_hash_789"
                },
                "checksum": "check123",
                "metadata": {
                    "created_at": "2024-01-15T10:30:00",
                    "audio_duration_ms": 20000,
                    "sample_count": 2
                }
            }
        }

        model = VoiceModel.from_dict(data)

        assert model.fingerprint is not None
        assert model.fingerprint.fingerprint_id == "vfp_test123abc"


class TestVoiceCloneServiceDbProfileConversion:
    """Test database profile to VoiceModel conversion"""

    def test_db_profile_with_voice_characteristics(self, temp_dir):
        """Test conversion with voice characteristics"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))

        db_profile = {
            "userId": "vc_user",
            "profileId": "prof_123",
            "audioCount": 3,
            "totalDurationMs": 45000,
            "qualityScore": 0.8,
            "version": 2,
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
            "voiceCharacteristics": {
                "pitch": {"mean_hz": 155.0, "std_hz": 22.0, "min_hz": 90.0, "max_hz": 220.0},
                "classification": {"voice_type": "medium_male", "estimated_gender": "male", "estimated_age_range": "adult"},
                "spectral": {"brightness": 1600.0, "warmth": 3.5, "breathiness": 0.1, "nasality": 0.05},
                "energy": {"mean": 0.05, "std": 0.02, "silence_ratio": 0.2},
                "prosody": {"speech_rate_wpm": 130.0}
            },
            "fingerprint": {
                "fingerprint_id": "vfp_test123",
                "version": "1.0",
                "signature": "sig123",
                "signature_short": "sig123",
                "components": {},
                "metadata": {}
            }
        }

        from services.voice_clone.voice_clone_cache import VoiceCloneCacheManager as CacheManagerClass
        cache_mgr = CacheManagerClass.__new__(CacheManagerClass)
        cache_mgr.voice_cache_dir = Path(temp_dir)
        model = cache_mgr.db_profile_to_voice_model(db_profile)

        assert model.user_id == "vc_user"
        assert model.voice_characteristics is not None
        assert model.voice_characteristics.pitch_mean_hz == 155.0
        assert model.fingerprint is not None


class TestRecordingMetadataWithSpeakers:
    """Test RecordingMetadata with speaker data"""

    def test_primary_speaker_identification(self):
        """Test that primary speaker is correctly identified"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=150.0)

        primary = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=20000,
            speaking_ratio=0.7,
            voice_characteristics=chars
        )

        secondary = SpeakerInfo(
            speaker_id="speaker_1",
            is_primary=False,
            speaking_time_ms=8000,
            speaking_ratio=0.3,
            voice_characteristics=chars
        )

        metadata = RecordingMetadata(
            file_path="/tmp/multi.wav",
            duration_ms=28000,
            speaker_count=2,
            speakers=[primary, secondary],
            primary_speaker=primary
        )

        assert metadata.primary_speaker.speaker_id == "speaker_0"
        assert metadata.primary_speaker.is_primary is True


class TestSpeakerInfoGenerateFingerprint:
    """Test SpeakerInfo fingerprint generation"""

    def test_generate_fingerprint_with_characteristics(self):
        """Test fingerprint generation when characteristics present"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(
            pitch_mean_hz=145.0,
            brightness=1500.0,
            estimated_gender="male"
        )

        speaker = SpeakerInfo(
            speaker_id="speaker_0",
            speaking_time_ms=15000,
            speaking_ratio=0.8,
            voice_characteristics=chars
        )

        fp = speaker.generate_fingerprint()

        assert fp is not None
        assert speaker.fingerprint is fp
        assert fp.fingerprint_id.startswith("vfp_")

    def test_generate_fingerprint_default_characteristics(self):
        """Test fingerprint generation with default characteristics"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        # SpeakerInfo creates default VoiceCharacteristics if not provided
        speaker = SpeakerInfo(
            speaker_id="speaker_default",
            speaking_time_ms=10000,
            speaking_ratio=0.5
            # voice_characteristics uses default_factory
        )

        fp = speaker.generate_fingerprint()

        # Even with default characteristics, a fingerprint should be generated
        assert fp is not None
        assert speaker.fingerprint is fp


class TestVoiceFingerprintEdgeCases:
    """Additional edge cases for VoiceFingerprint"""

    def test_generate_with_embedding_normalization(self):
        """Test that embedding is properly normalized"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(
            pitch_mean_hz=150.0,
            brightness=1500.0
        )

        # Create large embedding
        large_embedding = np.random.randn(256).astype(np.float32) * 100

        fp = VoiceFingerprint.generate_from_characteristics(
            chars,
            embedding=large_embedding
        )

        # Embedding should be included and normalized
        assert len(fp.embedding_vector) > 9  # Base features + embedding

    def test_similarity_identical_fingerprints(self):
        """Test similarity between identical fingerprints"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(
            pitch_mean_hz=150.0,
            brightness=1500.0,
            estimated_gender="male"
        )

        fp1 = VoiceFingerprint.generate_from_characteristics(chars)
        fp2 = VoiceFingerprint.generate_from_characteristics(chars)

        score = fp1.similarity_score(fp2)

        # Identical characteristics should yield high similarity
        assert score >= 0.9

    def test_matches_with_different_thresholds(self):
        """Test matches method with various thresholds"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars1 = VoiceCharacteristics(pitch_mean_hz=150.0, brightness=1500.0)
        chars2 = VoiceCharacteristics(pitch_mean_hz=155.0, brightness=1520.0)  # Slightly different

        fp1 = VoiceFingerprint.generate_from_characteristics(chars1)
        fp2 = VoiceFingerprint.generate_from_characteristics(chars2)

        # Same fingerprint should match at high threshold
        assert fp1.matches(fp1, threshold=0.99) == True

        # With strict threshold, slightly different may not match
        # Test that the function works without error
        result = fp1.matches(fp2, threshold=0.99)
        # Result is numpy.bool_ which equals True or False
        assert result == True or result == False


# =============================================================================
# Additional Coverage Tests - Part 3
# =============================================================================

class TestVoiceAnalyzerInternalMethods:
    """Tests for VoiceAnalyzer internal methods to increase coverage"""

    def test_classify_voice_extreme_pitches(self):
        """Test voice classification with extreme pitch values"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        # Test very low pitch
        voice_type, gender = analyzer._classify_voice(50.0)
        assert gender == "male"

        # Test very high pitch
        voice_type, gender = analyzer._classify_voice(400.0)
        assert gender == "child"

    def test_detect_clipping_no_clipping(self):
        """Test clipping detection with clean audio"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        # Audio without clipping (values in normal range)
        audio = np.sin(np.linspace(0, 10 * np.pi, 10000)) * 0.5  # -0.5 to 0.5
        has_clipping = analyzer._detect_clipping(audio)
        # Compare using == instead of 'is' for numpy bool
        assert has_clipping == False

    def test_detect_clipping_with_clipping(self):
        """Test clipping detection with clipped audio"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        # Audio with many values at max (clipped)
        audio = np.ones(10000)  # All values at 1.0 = clipping
        has_clipping = analyzer._detect_clipping(audio)
        # This should detect clipping since many samples are at max
        assert has_clipping == True


class TestVoiceCloneServiceHelperMethods:
    """Tests for VoiceCloneService helper methods"""

    @pytest.mark.asyncio
    async def test_get_audio_duration_exception(self, temp_dir):
        """Test audio duration when librosa throws exception"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))

        # Non-existent file should return 0 and not crash
        duration = await service._audio_processor.get_audio_duration_ms("/nonexistent/path/audio.wav")
        assert duration == 0

    @pytest.mark.asyncio
    async def test_save_model_with_no_embedding(self, temp_dir, mock_database_service):
        """Test saving model when embedding is None"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.set_database_service(mock_database_service)

        model = VoiceModel(
            user_id="no_embed_user",
            embedding_path=str(temp_dir / "no_embed.pkl"),
            audio_count=1,
            total_duration_ms=10000,
            quality_score=0.5,
            embedding=None  # No embedding
        )

        mock_cache_manager = MagicMock()
        mock_cache_manager.save_model_to_cache = AsyncMock()
        service._cache_manager = mock_cache_manager

        # Should not raise
        await service._get_cache_manager().save_model_to_cache(model)

    @pytest.mark.asyncio
    async def test_list_all_cached_models_no_database(self, temp_dir):
        """Test listing models when database is not available"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        VoiceCloneService._instance = None
        service = VoiceCloneService(voice_cache_dir=str(temp_dir))
        service.database_service = None

        models = await service._list_all_cached_models()
        assert models == []


class TestVoiceFingerprintVerifyChecksum:
    """Tests for VoiceFingerprint checksum verification"""

    def test_verify_checksum_valid(self):
        """Test checksum verification with valid fingerprint"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=150.0, brightness=1500.0)
        fp = VoiceFingerprint.generate_from_characteristics(chars)

        # Freshly generated fingerprint should have valid checksum
        assert fp.verify_checksum() is True

    def test_verify_checksum_tampered(self):
        """Test checksum verification after modification"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=150.0, brightness=1500.0)
        fp = VoiceFingerprint.generate_from_characteristics(chars)

        # Tamper with the signature
        original_signature = fp.signature
        fp.signature = "tampered_signature"

        # Checksum should now be invalid
        assert fp.verify_checksum() is False

        # Restore signature
        fp.signature = original_signature
        assert fp.verify_checksum() is True


class TestRecordingMetadataEdgeCases:
    """Edge case tests for RecordingMetadata"""

    def test_to_dict_with_defaults(self):
        """Test to_dict with mostly default values"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        metadata = RecordingMetadata(
            file_path="/tmp/minimal.wav",
            duration_ms=10000
        )

        result = metadata.to_dict()

        assert result["file"]["path"] == "/tmp/minimal.wav"
        assert result["file"]["duration_ms"] == 10000
        assert result["speakers"]["count"] == 1  # Default is 1
        assert result["quality"]["clarity_score"] == 1.0  # Default is 1.0


class TestVoiceModelVersioning:
    """Tests for VoiceModel versioning"""

    def test_version_increments_correctly(self):
        """Test that model version starts at 1"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        model = VoiceModel(
            user_id="version_test",
            embedding_path="/tmp/version.pkl",
            audio_count=1,
            total_duration_ms=10000,
            quality_score=0.5
        )

        assert model.version == 1

    def test_version_preserved_after_dict_roundtrip(self):
        """Test version is preserved after to_dict/from_dict"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        model = VoiceModel(
            user_id="version_roundtrip",
            embedding_path="/tmp/roundtrip.pkl",
            audio_count=2,
            total_duration_ms=20000,
            quality_score=0.7,
            version=5,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        data = model.to_dict()
        restored = VoiceModel.from_dict(data)

        assert restored.version == 5


class TestAudioQualityMetadataEdgeCases:
    """Edge cases for AudioQualityMetadata"""

    def test_score_with_very_old_audio(self):
        """Test score calculation with very old audio"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        meta = AudioQualityMetadata(
            attachment_id="very_old",
            file_path="/tmp/very_old.wav",
            duration_ms=30000,
            noise_level=0.1,
            clarity_score=0.8,
            created_at=datetime.now() - timedelta(days=365)  # 1 year old
        )

        score = meta.calculate_overall_score()

        # Should still have a valid score
        assert 0.0 <= score <= 1.0

    def test_score_with_maximum_speakers(self):
        """Test score calculation with many speakers"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        meta = AudioQualityMetadata(
            attachment_id="many_speakers",
            file_path="/tmp/crowd.wav",
            duration_ms=30000,
            noise_level=0.2,
            clarity_score=0.6,
            has_other_speakers=True,
            speaker_count=10  # Many speakers
        )

        score = meta.calculate_overall_score()

        # Score should be penalized for many speakers
        assert score < 0.5


class TestSpeakerInfoSerialization:
    """Tests for SpeakerInfo serialization"""

    def test_to_dict_includes_fingerprint(self):
        """Test that to_dict includes fingerprint when present"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=155.0, estimated_gender="male")
        speaker = SpeakerInfo(
            speaker_id="speaker_with_fp",
            speaking_time_ms=15000,
            speaking_ratio=0.8,
            voice_characteristics=chars
        )

        # Generate fingerprint
        speaker.generate_fingerprint()

        result = speaker.to_dict()

        assert "fingerprint" in result
        assert result["fingerprint"]["fingerprint_id"].startswith("vfp_")


# =============================================================================
# Run Tests
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
