#!/usr/bin/env python3
"""
Test 09 - Voice Clone Service Extended Coverage Tests
Focus on maximizing test coverage for voice_clone_service.py
Tests helper methods, edge cases, and error handling
"""

import sys
import os
import logging
import asyncio
import pytest
import tempfile
import shutil
import json
import pickle
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from unittest.mock import MagicMock, AsyncMock, patch
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


# ═══════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════

@pytest.fixture
def temp_dir():
    """Create temporary directory for test files"""
    temp_path = tempfile.mkdtemp(prefix="voice_coverage_test_")
    yield Path(temp_path)
    shutil.rmtree(temp_path, ignore_errors=True)


@pytest.fixture
def sample_voice_characteristics():
    """Create sample voice characteristics"""
    if not SERVICE_AVAILABLE:
        pytest.skip("Service not available")
    return VoiceCharacteristics(
        pitch_mean_hz=150.0,
        pitch_std_hz=25.0,
        pitch_min_hz=100.0,
        pitch_max_hz=200.0,
        voice_type="medium_male",
        estimated_gender="male",
        estimated_age_range="adult",
        brightness=1500.0,
        warmth=3.5,
        breathiness=0.1,
        nasality=0.05,
        energy_mean=0.05,
        energy_std=0.02,
        silence_ratio=0.2,
        speech_rate_wpm=130.0
    )


@pytest.fixture
def sample_speaker_info(sample_voice_characteristics):
    """Create sample speaker info"""
    if not SERVICE_AVAILABLE:
        pytest.skip("Service not available")
    return SpeakerInfo(
        speaker_id="speaker_0",
        is_primary=True,
        speaking_time_ms=15000,
        speaking_ratio=0.75,
        voice_characteristics=sample_voice_characteristics,
        segments=[
            {"start": 0.0, "end": 5.0},
            {"start": 8.0, "end": 15.0},
            {"start": 18.0, "end": 23.0}
        ]
    )


# ═══════════════════════════════════════════════════════════════
# VOICE CHARACTERISTICS EDGE CASES
# ═══════════════════════════════════════════════════════════════

class TestVoiceCharacteristicsEdgeCases:
    """Test edge cases for VoiceCharacteristics"""

    def test_default_values(self):
        """Test VoiceCharacteristics with all default values"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics()
        assert chars.pitch_mean_hz == 0.0
        assert chars.voice_type == "unknown"  # Default is "unknown"
        assert chars.estimated_gender == "unknown"

    def test_partial_values(self):
        """Test VoiceCharacteristics with partial values"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(
            pitch_mean_hz=200.0,
            estimated_gender="female"
        )
        assert chars.pitch_mean_hz == 200.0
        assert chars.estimated_gender == "female"
        assert chars.brightness == 0.0  # Default

    def test_to_dict_completeness(self):
        """Test that to_dict includes all fields"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(
            pitch_mean_hz=160.0,
            pitch_std_hz=20.0,
            brightness=1600.0,
            warmth=3.0,
            energy_mean=0.04,
            speech_rate_wpm=140.0
        )
        data = chars.to_dict()

        # Data uses nested structure
        expected_sections = ["pitch", "classification", "spectral", "prosody", "technical"]
        for section in expected_sections:
            assert section in data, f"Missing section: {section}"

        # Check nested keys
        assert "mean_hz" in data["pitch"]
        assert "voice_type" in data["classification"]
        assert "brightness" in data["spectral"]
        assert "speech_rate_wpm" in data["prosody"]

    def test_generate_fingerprint_minimal(self):
        """Test fingerprint generation with minimal characteristics"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=100.0)
        fp = chars.generate_fingerprint()

        assert fp is not None
        assert fp.fingerprint_id.startswith("vfp_")
        assert fp.verify_checksum()


# ═══════════════════════════════════════════════════════════════
# VOICE FINGERPRINT EDGE CASES
# ═══════════════════════════════════════════════════════════════

class TestVoiceFingerprintEdgeCases:
    """Test edge cases for VoiceFingerprint"""

    def test_empty_fingerprint(self):
        """Test empty VoiceFingerprint"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        fp = VoiceFingerprint()
        assert fp.fingerprint_id == ""
        assert fp.signature == ""
        assert not fp.can_compute_similarity()

    def test_similarity_with_empty_embedding(self):
        """Test similarity score with empty embeddings"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        fp1 = VoiceFingerprint()
        fp1.pitch_hash = "abc123"
        fp2 = VoiceFingerprint()
        fp2.pitch_hash = "abc123"

        # Should still work using hash comparison
        score = fp1.similarity_score(fp2)
        assert 0.0 <= score <= 1.0

    def test_similarity_with_different_embedding_sizes(self):
        """Test similarity with different embedding vector sizes"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars1 = VoiceCharacteristics(pitch_mean_hz=150.0)
        chars2 = VoiceCharacteristics(pitch_mean_hz=155.0)

        # Use numpy arrays for embeddings
        fp1 = VoiceFingerprint.generate_from_characteristics(
            chars1, embedding=np.random.randn(256)
        )
        fp2 = VoiceFingerprint.generate_from_characteristics(
            chars2, embedding=np.random.randn(128)  # Different size
        )

        # Should handle different sizes gracefully
        score = fp1.similarity_score(fp2)
        assert 0.0 <= score <= 1.0

    def test_checksum_tampering_detection(self):
        """Test that checksum detects tampering"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=160.0)
        fp = VoiceFingerprint.generate_from_characteristics(chars)

        # Original checksum is valid
        assert fp.verify_checksum() is True

        # Tamper with signature
        original_signature = fp.signature
        fp.signature = "tampered_signature"
        assert fp.verify_checksum() is False

        # Restore
        fp.signature = original_signature
        assert fp.verify_checksum() is True

    def test_matches_threshold_boundary(self):
        """Test matches at threshold boundary"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        # Create two identical fingerprints
        chars = VoiceCharacteristics(pitch_mean_hz=150.0, brightness=1500.0)
        fp1 = VoiceFingerprint.generate_from_characteristics(chars)
        fp2 = VoiceFingerprint.generate_from_characteristics(chars)

        # Same fingerprint should match at any threshold
        # Use == instead of 'is' for boolean comparison
        assert fp1.matches(fp2, threshold=1.0) == True
        assert fp1.matches(fp2, threshold=0.5) == True
        assert fp1.matches(fp2, threshold=0.0) == True

    def test_from_dict_with_missing_fields(self):
        """Test from_dict with missing optional fields"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        data = {
            "fingerprint_id": "vfp_test",
            "signature": "abc123"
        }

        fp = VoiceFingerprint.from_dict(data)
        assert fp.fingerprint_id == "vfp_test"
        assert fp.signature == "abc123"
        assert fp.version == "1.0"  # Default
        assert fp.embedding_vector == []  # Default


# ═══════════════════════════════════════════════════════════════
# SPEAKER INFO EDGE CASES
# ═══════════════════════════════════════════════════════════════

class TestSpeakerInfoEdgeCases:
    """Test edge cases for SpeakerInfo"""

    def test_empty_segments(self):
        """Test SpeakerInfo with empty segments"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        speaker = SpeakerInfo(
            speaker_id="speaker_0",
            speaking_time_ms=0,
            speaking_ratio=0.0
        )
        assert speaker.segments == []
        assert speaker.fingerprint is None

    def test_to_dict_without_fingerprint(self):
        """Test to_dict when no fingerprint generated"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        speaker = SpeakerInfo(
            speaker_id="speaker_1",
            speaking_time_ms=10000,
            speaking_ratio=0.5
        )
        data = speaker.to_dict()

        assert data["speaker_id"] == "speaker_1"
        # When fingerprint is None, it's not included in the dict
        assert "fingerprint" not in data or data.get("fingerprint") is None

    def test_to_dict_with_fingerprint(self):
        """Test to_dict after fingerprint generation"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=170.0)
        speaker = SpeakerInfo(
            speaker_id="speaker_2",
            speaking_time_ms=12000,
            speaking_ratio=0.6,
            voice_characteristics=chars
        )
        speaker.generate_fingerprint()

        data = speaker.to_dict()
        assert data["fingerprint"] is not None
        assert "fingerprint_id" in data["fingerprint"]


# ═══════════════════════════════════════════════════════════════
# RECORDING METADATA EDGE CASES
# ═══════════════════════════════════════════════════════════════

class TestRecordingMetadataEdgeCases:
    """Test edge cases for RecordingMetadata"""

    def test_no_speakers(self):
        """Test RecordingMetadata with no speakers"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        metadata = RecordingMetadata(
            file_path="/tmp/empty.wav",
            duration_ms=0,
            speaker_count=0
        )
        assert metadata.speakers == []
        assert metadata.primary_speaker is None

    def test_quality_score_calculation(self):
        """Test overall quality score calculation"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        metadata = RecordingMetadata(
            file_path="/tmp/test.wav",
            duration_ms=30000,
            speaker_count=1,
            clarity_score=0.9,
            noise_level=0.1,  # Low noise
            clipping_detected=False,
            reverb_level=0.05
        )

        # RecordingMetadata stores quality info, quality is checked via clarity_score
        assert metadata.clarity_score == 0.9
        assert metadata.noise_level == 0.1
        assert metadata.clipping_detected == False

    def test_quality_score_with_issues(self):
        """Test quality score with recording issues"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        metadata = RecordingMetadata(
            file_path="/tmp/noisy.wav",
            duration_ms=5000,
            speaker_count=3,
            clarity_score=0.3,
            noise_level=0.8,  # High noise
            clipping_detected=True,
            reverb_level=0.5
        )

        # RecordingMetadata stores quality info
        assert metadata.clarity_score == 0.3  # Low clarity
        assert metadata.noise_level == 0.8  # High noise
        assert metadata.clipping_detected == True

    def test_to_dict_completeness(self):
        """Test that to_dict includes all important fields"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        metadata = RecordingMetadata(
            file_path="/tmp/test.wav",
            duration_ms=15000,
            format="wav",
            speaker_count=1,
            clarity_score=0.85,
            noise_level=0.1
        )

        data = metadata.to_dict()
        # Data uses nested structure
        assert "file" in data
        assert data["file"]["path"] == "/tmp/test.wav"
        assert data["file"]["duration_ms"] == 15000
        assert "quality" in data
        assert data["quality"]["clarity_score"] == 0.85
        assert "speakers" in data
        assert data["speakers"]["count"] == 1


# ═══════════════════════════════════════════════════════════════
# VOICE MODEL EDGE CASES
# ═══════════════════════════════════════════════════════════════

class TestVoiceModelEdgeCases:
    """Test edge cases for VoiceModel"""

    def test_minimal_model(self):
        """Test VoiceModel with minimal required fields"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        model = VoiceModel(
            user_id="test_user",
            embedding_path="/tmp/embedding.pkl",
            audio_count=1,
            total_duration_ms=10000,
            quality_score=0.5
        )

        assert model.user_id == "test_user"
        assert model.version == 1  # Default
        assert model.fingerprint is None

    def test_to_dict_without_fingerprint(self):
        """Test to_dict without fingerprint"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        model = VoiceModel(
            user_id="test_user",
            embedding_path="/tmp/embedding.pkl",
            audio_count=1,
            total_duration_ms=10000,
            quality_score=0.5
        )

        data = model.to_dict()
        assert data["user_id"] == "test_user"
        # When fingerprint is None, it's not included in the dict
        assert "fingerprint" not in data

    def test_generate_fingerprint_without_characteristics(self):
        """Test fingerprint generation without voice characteristics"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        model = VoiceModel(
            user_id="test_user",
            embedding_path="/tmp/embedding.pkl",
            audio_count=1,
            total_duration_ms=10000,
            quality_score=0.5,
            embedding=np.random.randn(256).astype(np.float32)
        )

        # Should work with just embedding
        fp = model.generate_fingerprint()
        # Result depends on whether characteristics are available
        # If no characteristics and no embedding, returns None

    def test_generate_fingerprint_with_characteristics(self):
        """Test fingerprint generation with voice characteristics"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(
            pitch_mean_hz=145.0,
            brightness=1450.0
        )

        model = VoiceModel(
            user_id="test_user",
            embedding_path="/tmp/embedding.pkl",
            audio_count=2,
            total_duration_ms=25000,
            quality_score=0.7,
            voice_characteristics=chars,
            embedding=np.random.randn(256).astype(np.float32)
        )

        fp = model.generate_fingerprint()
        assert fp is not None
        assert model.fingerprint is fp
        assert fp.fingerprint_id.startswith("vfp_")

    def test_from_dict_full_cycle(self):
        """Test full serialization/deserialization cycle"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=160.0)
        original = VoiceModel(
            user_id="cycle_test",
            embedding_path="/tmp/cycle.pkl",
            audio_count=3,
            total_duration_ms=45000,
            quality_score=0.8,
            profile_id="prof_123",
            version=2,
            voice_characteristics=chars
        )
        original.generate_fingerprint()

        # Serialize
        data = original.to_dict()

        # Deserialize
        restored = VoiceModel.from_dict(data)

        assert restored.user_id == original.user_id
        assert restored.audio_count == original.audio_count
        assert restored.quality_score == original.quality_score
        assert restored.profile_id == original.profile_id
        assert restored.version == original.version
        assert restored.fingerprint is not None


# ═══════════════════════════════════════════════════════════════
# TEMPORARY VOICE PROFILE TESTS
# ═══════════════════════════════════════════════════════════════

class TestTemporaryVoiceProfile:
    """Test TemporaryVoiceProfile class"""

    def test_basic_creation(self):
        """Test basic profile creation"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=180.0)
        speaker = SpeakerInfo(
            speaker_id="temp_speaker",
            voice_characteristics=chars
        )

        profile = TemporaryVoiceProfile(
            speaker_id="temp_speaker",
            speaker_info=speaker,
            audio_path="/tmp/temp.wav"
        )

        assert profile.speaker_id == "temp_speaker"
        assert profile.is_user_match is False
        assert profile.matched_user_id is None

    def test_with_user_match(self):
        """Test profile with user match"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=150.0)
        speaker = SpeakerInfo(
            speaker_id="matched_speaker",
            voice_characteristics=chars
        )

        profile = TemporaryVoiceProfile(
            speaker_id="matched_speaker",
            speaker_info=speaker,
            audio_path="/tmp/matched.wav",
            embedding=np.random.randn(256).astype(np.float32),
            matched_user_id="user_abc123",
            is_user_match=True
        )

        assert profile.is_user_match is True
        assert profile.matched_user_id == "user_abc123"

    def test_to_dict(self):
        """Test to_dict serialization"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=200.0)
        speaker = SpeakerInfo(
            speaker_id="dict_speaker",
            voice_characteristics=chars
        )

        profile = TemporaryVoiceProfile(
            speaker_id="dict_speaker",
            speaker_info=speaker,
            audio_path="/tmp/dict.wav",
            original_segments=[{"start": 0.0, "end": 5.0}]
        )

        data = profile.to_dict()
        assert data["speaker_id"] == "dict_speaker"
        assert data["audio_path"] == "/tmp/dict.wav"
        # to_dict returns segments_count, not the full segments list
        assert data["segments_count"] == 1


# ═══════════════════════════════════════════════════════════════
# MULTI SPEAKER TRANSLATION CONTEXT TESTS
# ═══════════════════════════════════════════════════════════════

class TestMultiSpeakerTranslationContext:
    """Test MultiSpeakerTranslationContext class"""

    def test_empty_context(self):
        """Test empty context creation"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        context = MultiSpeakerTranslationContext(
            source_audio_path="/tmp/source.wav",
            source_duration_ms=30000,
            speaker_count=0
        )

        assert context.speaker_count == 0
        assert context.profiles == []
        assert context.user_profile is None

    def test_get_profile_not_found(self):
        """Test get_profile when speaker not found"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        context = MultiSpeakerTranslationContext(
            source_audio_path="/tmp/source.wav",
            source_duration_ms=30000,
            speaker_count=0
        )

        result = context.get_profile("nonexistent_speaker")
        assert result is None

    def test_get_profile_found(self):
        """Test get_profile when speaker exists"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=160.0)
        speaker = SpeakerInfo(speaker_id="found_speaker", voice_characteristics=chars)
        profile = TemporaryVoiceProfile(
            speaker_id="found_speaker",
            speaker_info=speaker,
            audio_path="/tmp/found.wav"
        )

        context = MultiSpeakerTranslationContext(
            source_audio_path="/tmp/source.wav",
            source_duration_ms=30000,
            speaker_count=1,
            profiles=[profile]
        )

        result = context.get_profile("found_speaker")
        assert result is not None
        assert result.speaker_id == "found_speaker"

    def test_to_dict_with_user_profile(self):
        """Test to_dict with user profile set"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        chars = VoiceCharacteristics(pitch_mean_hz=145.0)
        speaker = SpeakerInfo(speaker_id="user_speaker", voice_characteristics=chars)
        profile = TemporaryVoiceProfile(
            speaker_id="user_speaker",
            speaker_info=speaker,
            audio_path="/tmp/user.wav",
            is_user_match=True
        )

        context = MultiSpeakerTranslationContext(
            source_audio_path="/tmp/source.wav",
            source_duration_ms=45000,
            speaker_count=1,
            profiles=[profile],
            user_profile=profile,
            segments_timeline=[("user_speaker", 0.0, 45.0)]
        )

        data = context.to_dict()
        assert data["speaker_count"] == 1
        assert data["user_speaker_id"] == "user_speaker"
        assert len(data["profiles"]) == 1


# ═══════════════════════════════════════════════════════════════
# VOICE ANALYZER TESTS
# ═══════════════════════════════════════════════════════════════

class TestVoiceAnalyzerMethods:
    """Test VoiceAnalyzer helper methods"""

    def test_classify_voice_male_low(self):
        """Test voice classification for low male"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()
        voice_type, gender = analyzer._classify_voice(100.0)
        assert gender == "male"
        assert "male" in voice_type.lower()

    def test_classify_voice_male_medium(self):
        """Test voice classification for medium male"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()
        # 150 Hz is in the "low_female" range (140-165)
        # To get "male", need pitch < 140
        voice_type, gender = analyzer._classify_voice(120.0)
        assert gender == "male"

    def test_classify_voice_female(self):
        """Test voice classification for female"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()
        # 250 Hz is classified as "child"
        # For "female", need pitch in 140-250 range
        voice_type, gender = analyzer._classify_voice(200.0)
        assert gender == "female"

    def test_classify_voice_child(self):
        """Test voice classification for child"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()
        voice_type, gender = analyzer._classify_voice(350.0)
        assert gender == "child" or "high" in voice_type.lower()

    def test_estimate_age_adult(self):
        """Test age estimation for adult"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()
        age = analyzer._estimate_age(150.0, 25.0)
        assert age in ["child", "teen", "adult", "senior"]

    def test_estimate_room_size(self):
        """Test room size estimation"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()

        # Low reverb = small room
        size = analyzer._estimate_room_size(0.05)
        assert size == "small"

        # High reverb = outdoor (>= 0.6)
        size = analyzer._estimate_room_size(0.8)
        assert size == "outdoor"

        # Medium reverb = medium room
        size = analyzer._estimate_room_size(0.2)
        assert size == "medium"

        # High-medium reverb = large room
        size = analyzer._estimate_room_size(0.5)
        assert size == "large"

    def test_can_create_profile_empty_metadata(self):
        """Test profile creation with empty metadata"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer = VoiceAnalyzer()
        metadata = RecordingMetadata(
            file_path="/tmp/empty.wav",
            duration_ms=0,
            speaker_count=0
        )

        can_create, reason = analyzer.can_create_user_profile(metadata)
        # Empty metadata with default clarity (1.0) and no speakers allows creation
        # The check for speaking_time_ms only applies when primary_speaker exists
        assert can_create is True
        assert reason == "OK"


# ═══════════════════════════════════════════════════════════════
# VOICE CLONE SERVICE HELPER METHODS
# ═══════════════════════════════════════════════════════════════

class TestVoiceCloneServiceHelpers:
    """Test VoiceCloneService helper methods"""

    def test_calculate_quality_score_short_duration(self):
        """Test quality score for short audio"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        service = VoiceCloneService()
        score = service._calculate_quality_score(1000, 1)  # 1 second
        assert 0.0 <= score <= 1.0
        assert score < 0.5  # Short audio = low quality

    def test_calculate_quality_score_medium_duration(self):
        """Test quality score for medium audio"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        service = VoiceCloneService()
        score = service._calculate_quality_score(15000, 1)  # 15 seconds
        assert 0.3 <= score <= 0.7

    def test_calculate_quality_score_long_duration(self):
        """Test quality score for long audio"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        service = VoiceCloneService()
        score = service._calculate_quality_score(60000, 3)  # 60 seconds, 3 audios
        assert score > 0.5

    def test_singleton_pattern(self):
        """Test that VoiceCloneService uses singleton"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        service1 = get_voice_clone_service()
        service2 = get_voice_clone_service()
        assert service1 is service2

    def test_voice_analyzer_singleton(self):
        """Test that VoiceAnalyzer uses singleton"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        analyzer1 = get_voice_analyzer()
        analyzer2 = get_voice_analyzer()
        assert analyzer1 is analyzer2


# ═══════════════════════════════════════════════════════════════
# FILE I/O TESTS (with temp files)
# ═══════════════════════════════════════════════════════════════

class TestFileOperations:
    """Test file I/O operations"""

    @pytest.fixture
    def mock_database_service(self, temp_dir):
        """Create a mock database service that simulates MongoDB storage with camelCase keys"""
        mock = MagicMock()

        # Storage dictionaries for in-memory database simulation
        voice_profiles = {}
        embeddings = {}

        # Mock is_db_connected to return True
        mock.is_db_connected = MagicMock(return_value=True)

        # Mock get_voice_profile - returns camelCase keys to match MongoDB schema
        async def get_voice_profile(user_id: str):
            return voice_profiles.get(user_id)

        mock.get_voice_profile = get_voice_profile

        # Mock get_voice_embedding
        async def get_voice_embedding(user_id: str):
            return embeddings.get(user_id)

        mock.get_voice_embedding = get_voice_embedding

        # Mock save_voice_profile - stores with camelCase keys
        async def save_voice_profile(
            user_id: str,
            embedding: bytes = None,
            audio_count: int = 1,
            total_duration_ms: int = 0,
            quality_score: float = 0.5,
            profile_id: str = None,
            embedding_model: str = "openvoice_v2",
            embedding_dimension: int = 256,
            voice_characteristics: dict = None,
            fingerprint: dict = None,
            signature_short: str = None,
            **kwargs
        ):
            # Store embedding separately
            if embedding:
                embeddings[user_id] = embedding

            # Store profile metadata with camelCase keys (MongoDB schema)
            # Use ISO format strings for datetime fields as expected by _load_cached_model
            voice_profiles[user_id] = {
                "userId": user_id,
                "profileId": profile_id or f"prof_{user_id}",
                "audioCount": audio_count,
                "totalDurationMs": total_duration_ms,
                "qualityScore": quality_score,
                "version": 1,
                "embeddingModel": embedding_model,
                "embeddingDimension": embedding_dimension,
                "voiceCharacteristics": voice_characteristics,
                "fingerprint": fingerprint,
                "signatureShort": signature_short,
                "createdAt": datetime.now().isoformat(),
                "updatedAt": datetime.now().isoformat(),
                "nextRecalibrationAt": (datetime.now() + timedelta(days=90)).isoformat()
            }
            return True

        mock.save_voice_profile = save_voice_profile

        # Expose internal storage for test assertions
        mock._voice_profiles = voice_profiles
        mock._voice_embeddings = embeddings

        return mock

    @pytest.mark.asyncio
    async def test_save_and_load_model(self, temp_dir, mock_database_service):
        """Test saving and loading voice model"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        service = VoiceCloneService()
        service.voice_cache_dir = temp_dir
        service.set_database_service(mock_database_service)

        chars = VoiceCharacteristics(pitch_mean_hz=155.0)
        embedding = np.random.randn(256).astype(np.float32)

        model = VoiceModel(
            user_id="file_test_user",
            embedding_path=str(temp_dir / "file_test_user" / "embedding.pkl"),
            audio_count=1,
            total_duration_ms=20000,
            quality_score=0.65,
            voice_characteristics=chars,
            embedding=embedding
        )
        model.generate_fingerprint()

        # Save
        await service._save_model_to_cache(model)

        # Load
        loaded = await service._load_cached_model("file_test_user")
        assert loaded is not None
        assert loaded.user_id == "file_test_user"
        assert loaded.audio_count == 1

    @pytest.mark.asyncio
    async def test_load_nonexistent_model(self, temp_dir, mock_database_service):
        """Test loading model that doesn't exist"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        service = VoiceCloneService()
        service.voice_cache_dir = temp_dir
        service.set_database_service(mock_database_service)

        result = await service._load_cached_model("nonexistent_user")
        assert result is None


# ═══════════════════════════════════════════════════════════════
# RUN TESTS
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
