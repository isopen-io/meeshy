#!/usr/bin/env python3
"""
Test 08 - Speaker Diarization Integration Tests
Tests for multi-speaker detection, identification, and translation context
Uses actual translator functions without unnecessary mocks
"""

import sys
import os
import logging
import asyncio
import pytest
import tempfile
import shutil
import struct
import wave
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional
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
    temp_path = tempfile.mkdtemp(prefix="diarization_test_")
    yield Path(temp_path)
    shutil.rmtree(temp_path, ignore_errors=True)


@pytest.fixture
def voice_cache_dir():
    """Create temporary voice cache directory"""
    temp_dir = tempfile.mkdtemp(prefix="voice_cache_")
    yield Path(temp_dir)
    shutil.rmtree(temp_dir, ignore_errors=True)


def create_audio_file(path: Path, duration_seconds: float = 1.0, frequency: int = 440) -> Path:
    """Create a test audio file with a sine wave tone"""
    sample_rate = 44100
    n_samples = int(sample_rate * duration_seconds)

    with wave.open(str(path), 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)

        # Generate sine wave
        for i in range(n_samples):
            t = i / sample_rate
            sample = int(16000 * np.sin(2 * np.pi * frequency * t))
            wav_file.writeframes(struct.pack('h', sample))

    return path


@pytest.fixture
def audio_file(temp_dir) -> Path:
    """Create a basic test audio file"""
    return create_audio_file(temp_dir / "test_audio.wav", duration_seconds=2.0)


@pytest.fixture
def long_audio_file(temp_dir) -> Path:
    """Create a longer test audio file for multi-speaker scenarios"""
    return create_audio_file(temp_dir / "long_audio.wav", duration_seconds=15.0)


# ═══════════════════════════════════════════════════════════════
# VOICE ANALYZER DIARIZATION TESTS
# ═══════════════════════════════════════════════════════════════

class TestVoiceAnalyzerDiarization:
    """Tests for VoiceAnalyzer speaker diarization functions"""

    def test_voice_analyzer_initialization(self):
        """Test VoiceAnalyzer can be initialized"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        # Use the singleton function for proper singleton behavior
        analyzer = get_voice_analyzer()
        assert analyzer is not None

        # Verify singleton
        analyzer2 = get_voice_analyzer()
        assert analyzer is analyzer2

        logger.info("VoiceAnalyzer initialization test passed")

    def test_create_voice_characteristics_from_values(self):
        """Test creating VoiceCharacteristics with realistic values"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        # Male voice characteristics
        male_chars = VoiceCharacteristics(
            pitch_mean_hz=120.0,
            pitch_std_hz=18.0,
            pitch_min_hz=85.0,
            pitch_max_hz=170.0,
            voice_type="low_male",
            estimated_gender="male",
            estimated_age_range="adult",
            brightness=1200.0,
            warmth=4.0,
            breathiness=0.08,
            nasality=0.03,
            energy_mean=0.045,
            energy_std=0.015,
            silence_ratio=0.18,
            speech_rate_wpm=125.0
        )

        assert male_chars.pitch_mean_hz == 120.0
        assert male_chars.estimated_gender == "male"
        assert male_chars.voice_type == "low_male"

        # Female voice characteristics
        female_chars = VoiceCharacteristics(
            pitch_mean_hz=220.0,
            pitch_std_hz=35.0,
            pitch_min_hz=165.0,
            pitch_max_hz=300.0,
            voice_type="medium_female",
            estimated_gender="female",
            estimated_age_range="adult",
            brightness=2200.0,
            warmth=2.5,
            breathiness=0.12,
            nasality=0.05,
            energy_mean=0.035,
            energy_std=0.012,
            silence_ratio=0.15,
            speech_rate_wpm=140.0
        )

        assert female_chars.pitch_mean_hz == 220.0
        assert female_chars.estimated_gender == "female"

        logger.info("Voice characteristics creation test passed")

    def test_fingerprint_creation_from_characteristics(self):
        """Test VoiceFingerprint generation from VoiceCharacteristics"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        chars = VoiceCharacteristics(
            pitch_mean_hz=150.0,
            pitch_std_hz=25.0,
            pitch_min_hz=100.0,
            pitch_max_hz=200.0,
            voice_type="medium_male",
            estimated_gender="male",
            brightness=1500.0,
            warmth=3.5,
            energy_mean=0.05,
            energy_std=0.02,
            silence_ratio=0.2,
            speech_rate_wpm=130.0
        )

        # Generate fingerprint
        fingerprint = chars.generate_fingerprint(audio_duration_ms=20000)

        # Verify fingerprint properties
        assert fingerprint is not None
        assert fingerprint.fingerprint_id.startswith("vfp_")
        assert len(fingerprint.signature) == 64  # SHA-256
        assert len(fingerprint.signature_short) == 12
        assert fingerprint.audio_duration_ms == 20000
        assert fingerprint.verify_checksum() is True

        logger.info("Fingerprint creation test passed")

    def test_fingerprint_similarity_same_voice(self):
        """Test fingerprint similarity for same voice characteristics"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        # Create identical voice characteristics
        chars1 = VoiceCharacteristics(
            pitch_mean_hz=145.0,
            pitch_std_hz=22.0,
            pitch_min_hz=95.0,
            pitch_max_hz=195.0,
            voice_type="medium_male",
            estimated_gender="male",
            brightness=1450.0,
            warmth=3.2,
            energy_mean=0.048,
            energy_std=0.018,
            silence_ratio=0.22,
            speech_rate_wpm=128.0
        )

        chars2 = VoiceCharacteristics(
            pitch_mean_hz=145.0,
            pitch_std_hz=22.0,
            pitch_min_hz=95.0,
            pitch_max_hz=195.0,
            voice_type="medium_male",
            estimated_gender="male",
            brightness=1450.0,
            warmth=3.2,
            energy_mean=0.048,
            energy_std=0.018,
            silence_ratio=0.22,
            speech_rate_wpm=128.0
        )

        fp1 = chars1.generate_fingerprint()
        fp2 = chars2.generate_fingerprint()

        # Same characteristics = same fingerprint
        similarity = fp1.similarity_score(fp2)
        assert similarity == 1.0, f"Same voice should have similarity 1.0, got {similarity}"
        assert fp1.matches(fp2, threshold=0.85) == True

        logger.info(f"Same voice similarity: {similarity}")

    def test_fingerprint_similarity_different_voices(self):
        """Test fingerprint similarity for different voice characteristics"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        # Male voice
        male_chars = VoiceCharacteristics(
            pitch_mean_hz=120.0,
            pitch_std_hz=18.0,
            pitch_min_hz=85.0,
            pitch_max_hz=170.0,
            voice_type="low_male",
            estimated_gender="male",
            brightness=1200.0,
            warmth=4.0,
            energy_mean=0.05,
            energy_std=0.02,
            silence_ratio=0.2,
            speech_rate_wpm=120.0
        )

        # Female voice (very different)
        female_chars = VoiceCharacteristics(
            pitch_mean_hz=260.0,
            pitch_std_hz=40.0,
            pitch_min_hz=200.0,
            pitch_max_hz=340.0,
            voice_type="high_female",
            estimated_gender="female",
            brightness=2600.0,
            warmth=2.0,
            energy_mean=0.03,
            energy_std=0.01,
            silence_ratio=0.12,
            speech_rate_wpm=160.0
        )

        fp_male = male_chars.generate_fingerprint()
        fp_female = female_chars.generate_fingerprint()

        similarity = fp_male.similarity_score(fp_female)

        # Different voices should have lower similarity
        assert similarity < 0.7, f"Different voices should have similarity < 0.7, got {similarity}"
        assert fp_male.matches(fp_female, threshold=0.85) == False

        logger.info(f"Male-Female similarity: {similarity}")

    def test_fingerprint_similarity_similar_voices(self):
        """Test fingerprint similarity for similar but not identical voices"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        # Same person, slightly different recording
        chars1 = VoiceCharacteristics(
            pitch_mean_hz=150.0,
            pitch_std_hz=25.0,
            pitch_min_hz=100.0,
            pitch_max_hz=200.0,
            voice_type="medium_male",
            estimated_gender="male",
            brightness=1500.0,
            warmth=3.5,
            energy_mean=0.05,
            energy_std=0.02,
            silence_ratio=0.2,
            speech_rate_wpm=130.0
        )

        # Slightly different (same person, different conditions)
        chars2 = VoiceCharacteristics(
            pitch_mean_hz=152.0,  # Slightly higher
            pitch_std_hz=26.0,
            pitch_min_hz=102.0,
            pitch_max_hz=205.0,
            voice_type="medium_male",
            estimated_gender="male",
            brightness=1520.0,
            warmth=3.4,
            energy_mean=0.052,
            energy_std=0.021,
            silence_ratio=0.19,
            speech_rate_wpm=132.0
        )

        fp1 = chars1.generate_fingerprint()
        fp2 = chars2.generate_fingerprint()

        similarity = fp1.similarity_score(fp2)

        # Similar voices should have moderate to high similarity
        # The algorithm considers multiple factors, so similarity may vary
        assert 0.3 < similarity < 1.0, f"Similar voices should have similarity > 0.3, got {similarity}"

        logger.info(f"Similar voice similarity: {similarity}")


# ═══════════════════════════════════════════════════════════════
# SPEAKER INFO TESTS
# ═══════════════════════════════════════════════════════════════

class TestSpeakerInfo:
    """Tests for SpeakerInfo class"""

    def test_speaker_info_basic_creation(self):
        """Test basic SpeakerInfo creation"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        voice_chars = VoiceCharacteristics(
            pitch_mean_hz=180.0,
            estimated_gender="female"
        )

        speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=25000,
            speaking_ratio=0.65,
            voice_characteristics=voice_chars,
            segments=[
                {"start": 0.0, "end": 5.0},
                {"start": 8.0, "end": 15.0},
                {"start": 20.0, "end": 28.0}
            ]
        )

        assert speaker.speaker_id == "speaker_0"
        assert speaker.is_primary is True
        assert speaker.speaking_time_ms == 25000
        assert speaker.speaking_ratio == 0.65
        assert len(speaker.segments) == 3
        assert speaker.fingerprint is None  # Not generated yet

        logger.info("SpeakerInfo basic creation test passed")

    def test_speaker_info_fingerprint_generation(self):
        """Test fingerprint generation for SpeakerInfo"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        voice_chars = VoiceCharacteristics(
            pitch_mean_hz=140.0,
            pitch_std_hz=22.0,
            voice_type="medium_male",
            estimated_gender="male",
            brightness=1400.0,
            energy_mean=0.045
        )

        speaker = SpeakerInfo(
            speaker_id="speaker_1",
            speaking_time_ms=18000,
            speaking_ratio=0.4,
            voice_characteristics=voice_chars
        )

        # Generate fingerprint with optional embedding
        embedding = np.random.randn(128).astype(np.float32)
        fingerprint = speaker.generate_fingerprint(embedding=embedding)

        assert fingerprint is not None
        assert speaker.fingerprint is fingerprint
        assert fingerprint.audio_duration_ms == 18000
        assert fingerprint.verify_checksum() is True

        logger.info("SpeakerInfo fingerprint generation test passed")

    def test_speaker_info_serialization(self):
        """Test SpeakerInfo serialization with fingerprint"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        voice_chars = VoiceCharacteristics(
            pitch_mean_hz=200.0,
            estimated_gender="female",
            brightness=2000.0
        )

        speaker = SpeakerInfo(
            speaker_id="speaker_2",
            is_primary=True,
            speaking_time_ms=20000,
            speaking_ratio=0.55,
            voice_characteristics=voice_chars,
            segments=[{"start": 0.0, "end": 10.0}]
        )

        # Generate fingerprint
        speaker.generate_fingerprint()

        # Serialize
        data = speaker.to_dict()

        assert "speaker_id" in data
        assert data["speaker_id"] == "speaker_2"
        assert data["is_primary"] is True
        assert "voice_characteristics" in data
        assert "fingerprint" in data
        assert data["fingerprint"]["fingerprint_id"].startswith("vfp_")

        logger.info("SpeakerInfo serialization test passed")


# ═══════════════════════════════════════════════════════════════
# RECORDING METADATA TESTS
# ═══════════════════════════════════════════════════════════════

class TestRecordingMetadata:
    """Tests for RecordingMetadata class"""

    def test_recording_metadata_single_speaker(self):
        """Test RecordingMetadata with single speaker"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        voice_chars = VoiceCharacteristics(pitch_mean_hz=150.0)
        speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=15000,
            speaking_ratio=1.0,
            voice_characteristics=voice_chars
        )

        metadata = RecordingMetadata(
            file_path="/tmp/audio.wav",
            duration_ms=15000,
            format="wav",
            speaker_count=1,
            speakers=[speaker],
            primary_speaker=speaker,
            clarity_score=0.85,
            noise_level=0.1
        )

        assert metadata.speaker_count == 1
        assert metadata.primary_speaker is speaker
        assert metadata.clarity_score == 0.85

        logger.info("RecordingMetadata single speaker test passed")

    def test_recording_metadata_multi_speaker(self):
        """Test RecordingMetadata with multiple speakers"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        speakers = []
        for i, (pitch, gender, time, ratio) in enumerate([
            (120.0, "male", 12000, 0.4),
            (200.0, "female", 15000, 0.5),
            (180.0, "male", 3000, 0.1)
        ]):
            voice_chars = VoiceCharacteristics(
                pitch_mean_hz=pitch,
                estimated_gender=gender
            )
            speakers.append(SpeakerInfo(
                speaker_id=f"speaker_{i}",
                is_primary=(i == 1),  # Speaker 1 has most speaking time
                speaking_time_ms=time,
                speaking_ratio=ratio,
                voice_characteristics=voice_chars
            ))

        metadata = RecordingMetadata(
            file_path="/tmp/multi_speaker.wav",
            duration_ms=30000,
            speaker_count=3,
            speakers=speakers,
            primary_speaker=speakers[1],  # The one who speaks most
            clarity_score=0.75
        )

        assert metadata.speaker_count == 3
        assert len(metadata.speakers) == 3
        assert metadata.primary_speaker.speaker_id == "speaker_1"

        logger.info("RecordingMetadata multi speaker test passed")

    def test_recording_metadata_serialization(self):
        """Test RecordingMetadata serialization"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        voice_chars = VoiceCharacteristics(pitch_mean_hz=160.0)
        speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=12000,
            speaking_ratio=1.0,
            voice_characteristics=voice_chars
        )

        metadata = RecordingMetadata(
            file_path="/tmp/test.wav",
            duration_ms=12000,
            speaker_count=1,
            speakers=[speaker],
            primary_speaker=speaker,
            clarity_score=0.9
        )

        data = metadata.to_dict()

        # Verify nested structure
        assert "file" in data
        assert data["file"]["path"] == "/tmp/test.wav"
        assert data["file"]["duration_ms"] == 12000
        assert "speakers" in data
        assert data["speakers"]["count"] == 1
        assert len(data["speakers"]["speakers"]) == 1

        logger.info("RecordingMetadata serialization test passed")


# ═══════════════════════════════════════════════════════════════
# PRIMARY SPEAKER IDENTIFICATION TESTS
# ═══════════════════════════════════════════════════════════════

class TestPrimarySpeakerIdentification:
    """Tests for primary speaker identification logic"""

    def test_identify_primary_speaker_by_speaking_time(self):
        """Test primary speaker identification by most speaking time"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        analyzer = VoiceAnalyzer()

        speakers = [
            SpeakerInfo(
                speaker_id="speaker_0",
                speaking_time_ms=5000,
                speaking_ratio=0.2,
                voice_characteristics=VoiceCharacteristics(pitch_mean_hz=180.0)
            ),
            SpeakerInfo(
                speaker_id="speaker_1",
                speaking_time_ms=18000,  # Most speaking time
                speaking_ratio=0.6,
                voice_characteristics=VoiceCharacteristics(pitch_mean_hz=140.0)
            ),
            SpeakerInfo(
                speaker_id="speaker_2",
                speaking_time_ms=7000,
                speaking_ratio=0.2,
                voice_characteristics=VoiceCharacteristics(pitch_mean_hz=220.0)
            )
        ]

        primary = analyzer._identify_primary_speaker(speakers)

        assert primary is not None
        assert primary.speaker_id == "speaker_1"  # Most speaking time
        assert primary.is_primary is True

        logger.info("Primary speaker identification test passed")

    def test_identify_primary_speaker_single_speaker(self):
        """Test primary speaker identification with single speaker"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        analyzer = VoiceAnalyzer()

        speakers = [
            SpeakerInfo(
                speaker_id="speaker_0",
                speaking_time_ms=30000,
                speaking_ratio=1.0,
                voice_characteristics=VoiceCharacteristics(pitch_mean_hz=150.0)
            )
        ]

        primary = analyzer._identify_primary_speaker(speakers)

        assert primary is not None
        assert primary.speaker_id == "speaker_0"
        assert primary.is_primary is True

        logger.info("Single speaker primary identification test passed")

    def test_identify_primary_speaker_empty_list(self):
        """Test primary speaker identification with empty speaker list"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        analyzer = VoiceAnalyzer()

        primary = analyzer._identify_primary_speaker([])

        assert primary is None

        logger.info("Empty speaker list test passed")


# ═══════════════════════════════════════════════════════════════
# USER SPEAKER IDENTIFICATION TESTS
# ═══════════════════════════════════════════════════════════════

class TestUserSpeakerIdentification:
    """Tests for user speaker identification by fingerprint"""

    def test_identify_user_speaker_match(self):
        """Test identifying user among speakers by fingerprint match"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        analyzer = VoiceAnalyzer()

        # User's known fingerprint
        user_chars = VoiceCharacteristics(
            pitch_mean_hz=145.0,
            pitch_std_hz=23.0,
            pitch_min_hz=98.0,
            pitch_max_hz=195.0,
            voice_type="medium_male",
            estimated_gender="male",
            brightness=1480.0,
            warmth=3.4,
            energy_mean=0.049,
            energy_std=0.019,
            silence_ratio=0.21,
            speech_rate_wpm=127.0
        )
        user_fingerprint = user_chars.generate_fingerprint()

        # Speakers in audio - one matches user
        matching_chars = VoiceCharacteristics(
            pitch_mean_hz=145.0,
            pitch_std_hz=23.0,
            pitch_min_hz=98.0,
            pitch_max_hz=195.0,
            voice_type="medium_male",
            estimated_gender="male",
            brightness=1480.0,
            warmth=3.4,
            energy_mean=0.049,
            energy_std=0.019,
            silence_ratio=0.21,
            speech_rate_wpm=127.0
        )

        other_chars = VoiceCharacteristics(
            pitch_mean_hz=250.0,
            pitch_std_hz=38.0,
            pitch_min_hz=190.0,
            pitch_max_hz=330.0,
            voice_type="high_female",
            estimated_gender="female",
            brightness=2500.0,
            warmth=2.2,
            energy_mean=0.035,
            energy_std=0.012,
            silence_ratio=0.14,
            speech_rate_wpm=145.0
        )

        speakers = [
            SpeakerInfo(
                speaker_id="speaker_0",
                speaking_time_ms=10000,
                voice_characteristics=other_chars
            ),
            SpeakerInfo(
                speaker_id="speaker_1",
                speaking_time_ms=15000,
                voice_characteristics=matching_chars  # Should match user
            )
        ]

        # Generate fingerprints for speakers
        for speaker in speakers:
            speaker.generate_fingerprint()

        matched = analyzer.identify_user_speaker(
            speakers, user_fingerprint, similarity_threshold=0.75
        )

        assert matched is not None
        assert matched.speaker_id == "speaker_1"

        logger.info("User speaker identification test passed")

    def test_identify_user_speaker_no_match(self):
        """Test user identification when no matching speaker"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        analyzer = VoiceAnalyzer()

        # User's fingerprint (male)
        user_chars = VoiceCharacteristics(
            pitch_mean_hz=130.0,
            estimated_gender="male",
            brightness=1300.0
        )
        user_fingerprint = user_chars.generate_fingerprint()

        # Speakers - both female, no match
        speakers = [
            SpeakerInfo(
                speaker_id="speaker_0",
                speaking_time_ms=12000,
                voice_characteristics=VoiceCharacteristics(
                    pitch_mean_hz=240.0,
                    estimated_gender="female",
                    brightness=2400.0
                )
            ),
            SpeakerInfo(
                speaker_id="speaker_1",
                speaking_time_ms=8000,
                voice_characteristics=VoiceCharacteristics(
                    pitch_mean_hz=260.0,
                    estimated_gender="female",
                    brightness=2600.0
                )
            )
        ]

        for speaker in speakers:
            speaker.generate_fingerprint()

        matched = analyzer.identify_user_speaker(
            speakers, user_fingerprint, similarity_threshold=0.75
        )

        assert matched is None  # No match found

        logger.info("No user match test passed")


# ═══════════════════════════════════════════════════════════════
# PROFILE CREATION/UPDATE RULES TESTS
# ═══════════════════════════════════════════════════════════════

class TestProfileCreationRules:
    """Tests for voice profile creation and update rules"""

    def test_can_create_profile_single_dominant_speaker(self):
        """Test profile creation with single dominant speaker (>70%)"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        analyzer = VoiceAnalyzer()

        speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=18000,
            speaking_ratio=0.9,  # 90% - very dominant
            voice_characteristics=VoiceCharacteristics(pitch_mean_hz=150.0)
        )
        speaker.generate_fingerprint()

        metadata = RecordingMetadata(
            file_path="/tmp/test.wav",
            duration_ms=20000,
            speaker_count=1,
            speakers=[speaker],
            primary_speaker=speaker,
            clarity_score=0.85
        )

        can_create, reason = analyzer.can_create_user_profile(metadata)

        assert can_create is True
        logger.info(f"Can create profile: {can_create}, reason: {reason}")

    def test_cannot_create_profile_multiple_speakers_no_dominant(self):
        """Test profile creation blocked when no single dominant speaker"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        analyzer = VoiceAnalyzer()

        # Two speakers with similar speaking time
        speaker1 = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=10000,
            speaking_ratio=0.45,  # 45%
            voice_characteristics=VoiceCharacteristics(pitch_mean_hz=140.0)
        )
        speaker2 = SpeakerInfo(
            speaker_id="speaker_1",
            speaking_time_ms=12000,
            speaking_ratio=0.55,  # 55% - not dominant enough
            voice_characteristics=VoiceCharacteristics(pitch_mean_hz=200.0)
        )

        metadata = RecordingMetadata(
            file_path="/tmp/test.wav",
            duration_ms=22000,
            speaker_count=2,
            speakers=[speaker1, speaker2],
            primary_speaker=speaker2,  # More speaking time but not >70%
            clarity_score=0.8
        )

        can_create, reason = analyzer.can_create_user_profile(metadata)

        assert can_create is False
        # Error message is in French: "Locuteur principal ne domine pas assez"
        assert "domine" in reason.lower() or "dominant" in reason.lower() or "%" in reason
        logger.info(f"Cannot create profile: {reason}")

    def test_cannot_create_profile_low_quality(self):
        """Test profile creation blocked for low quality audio"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        analyzer = VoiceAnalyzer()

        speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=15000,
            speaking_ratio=1.0,
            voice_characteristics=VoiceCharacteristics(pitch_mean_hz=150.0)
        )

        metadata = RecordingMetadata(
            file_path="/tmp/test.wav",
            duration_ms=15000,
            speaker_count=1,
            speakers=[speaker],
            primary_speaker=speaker,
            clarity_score=0.25  # Very low quality
        )

        can_create, reason = analyzer.can_create_user_profile(metadata)

        assert can_create is False
        # Error message is in French: "Qualité audio insuffisante"
        assert "qualité" in reason.lower() or "quality" in reason.lower() or "%" in reason
        logger.info(f"Cannot create profile (low quality): {reason}")

    def test_can_update_profile_matching_signature(self):
        """Test profile update with matching voice signature (>80%)"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        analyzer = VoiceAnalyzer()

        # Existing user fingerprint
        existing_chars = VoiceCharacteristics(
            pitch_mean_hz=150.0,
            pitch_std_hz=25.0,
            pitch_min_hz=100.0,
            pitch_max_hz=200.0,
            voice_type="medium_male",
            estimated_gender="male",
            brightness=1500.0,
            warmth=3.5,
            energy_mean=0.05,
            energy_std=0.02,
            silence_ratio=0.2,
            speech_rate_wpm=130.0
        )
        existing_fingerprint = existing_chars.generate_fingerprint()

        # New recording with same voice
        new_speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=15000,
            speaking_ratio=0.85,
            voice_characteristics=VoiceCharacteristics(
                pitch_mean_hz=150.0,
                pitch_std_hz=25.0,
                pitch_min_hz=100.0,
                pitch_max_hz=200.0,
                voice_type="medium_male",
                estimated_gender="male",
                brightness=1500.0,
                warmth=3.5,
                energy_mean=0.05,
                energy_std=0.02,
                silence_ratio=0.2,
                speech_rate_wpm=130.0
            )
        )

        metadata = RecordingMetadata(
            file_path="/tmp/test.wav",
            duration_ms=18000,
            speaker_count=1,
            speakers=[new_speaker],
            primary_speaker=new_speaker,
            clarity_score=0.8
        )

        can_update, reason, matched_speaker = analyzer.can_update_user_profile(
            metadata, existing_fingerprint, similarity_threshold=0.80
        )

        assert can_update is True
        assert matched_speaker is not None
        logger.info(f"Can update profile: {reason}")

    def test_cannot_update_profile_different_voice(self):
        """Test profile update blocked when voice doesn't match"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        analyzer = VoiceAnalyzer()

        # Existing user fingerprint (male)
        existing_chars = VoiceCharacteristics(
            pitch_mean_hz=130.0,
            voice_type="low_male",
            estimated_gender="male",
            brightness=1300.0
        )
        existing_fingerprint = existing_chars.generate_fingerprint()

        # New recording with different voice (female)
        new_speaker = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            speaking_time_ms=15000,
            speaking_ratio=0.9,
            voice_characteristics=VoiceCharacteristics(
                pitch_mean_hz=250.0,
                voice_type="high_female",
                estimated_gender="female",
                brightness=2500.0
            )
        )

        metadata = RecordingMetadata(
            file_path="/tmp/test.wav",
            duration_ms=17000,
            speaker_count=1,
            speakers=[new_speaker],
            primary_speaker=new_speaker,
            clarity_score=0.85
        )

        can_update, reason, matched_speaker = analyzer.can_update_user_profile(
            metadata, existing_fingerprint, similarity_threshold=0.80
        )

        assert can_update is False
        assert "signature" in reason.lower() or "match" in reason.lower()
        logger.info(f"Cannot update profile: {reason}")


# ═══════════════════════════════════════════════════════════════
# MULTI-SPEAKER TRANSLATION CONTEXT TESTS
# ═══════════════════════════════════════════════════════════════

class TestMultiSpeakerTranslationContext:
    """Tests for multi-speaker translation context management"""

    def test_context_creation_multiple_profiles(self):
        """Test creating translation context with multiple speaker profiles"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        profiles = []
        for i in range(3):
            voice_chars = VoiceCharacteristics(
                pitch_mean_hz=120 + i * 50,
                estimated_gender="male" if i < 2 else "female"
            )
            speaker_info = SpeakerInfo(
                speaker_id=f"speaker_{i}",
                is_primary=(i == 0),
                speaking_time_ms=10000 * (3 - i),
                speaking_ratio=[0.5, 0.3, 0.2][i],
                voice_characteristics=voice_chars
            )
            profile = TemporaryVoiceProfile(
                speaker_id=f"speaker_{i}",
                speaker_info=speaker_info,
                audio_path=f"/tmp/speaker_{i}.wav",
                embedding=np.random.randn(256).astype(np.float32)
            )
            profiles.append(profile)

        context = MultiSpeakerTranslationContext(
            source_audio_path="/tmp/source.wav",
            source_duration_ms=50000,
            speaker_count=3,
            profiles=profiles,
            user_profile=profiles[0],
            segments_timeline=[
                ("speaker_0", 0.0, 8.0),
                ("speaker_1", 8.0, 15.0),
                ("speaker_0", 15.0, 25.0),
                ("speaker_2", 25.0, 35.0),
                ("speaker_1", 35.0, 45.0),
                ("speaker_0", 45.0, 50.0)
            ]
        )

        assert context.speaker_count == 3
        assert len(context.profiles) == 3
        assert context.user_profile is not None
        assert context.user_profile.speaker_id == "speaker_0"
        assert len(context.segments_timeline) == 6

        logger.info("Multi-speaker context creation test passed")

    def test_context_get_profile(self):
        """Test getting speaker profile from context"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        profiles = []
        for i in range(2):
            voice_chars = VoiceCharacteristics(pitch_mean_hz=150 + i * 70)
            speaker_info = SpeakerInfo(
                speaker_id=f"speaker_{i}",
                voice_characteristics=voice_chars
            )
            profiles.append(TemporaryVoiceProfile(
                speaker_id=f"speaker_{i}",
                speaker_info=speaker_info,
                audio_path=f"/tmp/speaker_{i}.wav"
            ))

        context = MultiSpeakerTranslationContext(
            source_audio_path="/tmp/source.wav",
            source_duration_ms=30000,
            speaker_count=2,
            profiles=profiles
        )

        # Get existing profiles
        found0 = context.get_profile("speaker_0")
        assert found0 is not None
        assert found0.speaker_id == "speaker_0"

        found1 = context.get_profile("speaker_1")
        assert found1 is not None
        assert found1.speaker_id == "speaker_1"

        # Get non-existing profile
        not_found = context.get_profile("speaker_99")
        assert not_found is None

        logger.info("Context get_profile test passed")

    def test_context_serialization(self):
        """Test multi-speaker context serialization"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        voice_chars = VoiceCharacteristics(pitch_mean_hz=160.0)
        speaker_info = SpeakerInfo(
            speaker_id="speaker_0",
            is_primary=True,
            voice_characteristics=voice_chars
        )
        profile = TemporaryVoiceProfile(
            speaker_id="speaker_0",
            speaker_info=speaker_info,
            audio_path="/tmp/speaker_0.wav",
            matched_user_id="user_abc123",
            is_user_match=True
        )

        context = MultiSpeakerTranslationContext(
            source_audio_path="/tmp/source.wav",
            source_duration_ms=25000,
            speaker_count=1,
            profiles=[profile],
            user_profile=profile
        )

        data = context.to_dict()

        assert data["source_audio_path"] == "/tmp/source.wav"
        assert data["source_duration_ms"] == 25000
        assert data["speaker_count"] == 1
        assert len(data["profiles"]) == 1
        assert data["user_speaker_id"] == "speaker_0"

        logger.info("Context serialization test passed")

    def test_temporary_profile_user_match(self):
        """Test temporary profile with user identification"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        voice_chars = VoiceCharacteristics(
            pitch_mean_hz=145.0,
            estimated_gender="male"
        )
        speaker_info = SpeakerInfo(
            speaker_id="speaker_1",
            voice_characteristics=voice_chars
        )

        # Profile matched to existing user
        profile = TemporaryVoiceProfile(
            speaker_id="speaker_1",
            speaker_info=speaker_info,
            audio_path="/tmp/speaker_1.wav",
            embedding=np.random.randn(256).astype(np.float32),
            matched_user_id="user_xyz789",
            is_user_match=True,
            original_segments=[
                {"start": 0.0, "end": 5.0},
                {"start": 12.0, "end": 18.0}
            ]
        )

        assert profile.is_user_match is True
        assert profile.matched_user_id == "user_xyz789"
        assert len(profile.original_segments) == 2

        data = profile.to_dict()
        assert data["is_user_match"] is True
        assert data["matched_user_id"] == "user_xyz789"

        logger.info("Temporary profile user match test passed")


# ═══════════════════════════════════════════════════════════════
# VOICE MODEL WITH FINGERPRINT TESTS
# ═══════════════════════════════════════════════════════════════

class TestVoiceModelWithFingerprint:
    """Tests for VoiceModel with fingerprint integration"""

    def test_voice_model_fingerprint_generation(self):
        """Test fingerprint generation for VoiceModel"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        voice_chars = VoiceCharacteristics(
            pitch_mean_hz=148.0,
            pitch_std_hz=24.0,
            voice_type="medium_male",
            estimated_gender="male",
            brightness=1480.0,
            energy_mean=0.047
        )

        model = VoiceModel(
            user_id="test_user_fp",
            embedding_path="/tmp/embedding.pkl",
            audio_count=2,
            total_duration_ms=28000,
            quality_score=0.72,
            voice_characteristics=voice_chars,
            embedding=np.random.randn(256).astype(np.float32)
        )

        # Generate fingerprint
        fingerprint = model.generate_fingerprint()

        assert fingerprint is not None
        assert model.fingerprint is fingerprint
        assert fingerprint.fingerprint_id.startswith("vfp_")
        assert fingerprint.verify_checksum() is True

        logger.info("VoiceModel fingerprint generation test passed")

    def test_voice_model_serialization_with_fingerprint(self, voice_cache_dir):
        """Test VoiceModel serialization including fingerprint"""
        if not SERVICE_AVAILABLE:
            pytest.skip("VoiceCloneService not available")

        voice_chars = VoiceCharacteristics(
            pitch_mean_hz=180.0,
            estimated_gender="female",
            brightness=1800.0
        )

        model = VoiceModel(
            user_id="test_serial_fp",
            embedding_path=str(voice_cache_dir / "embedding.pkl"),
            audio_count=1,
            total_duration_ms=18000,
            quality_score=0.68,
            voice_characteristics=voice_chars,
            embedding=np.random.randn(256).astype(np.float32)
        )

        model.generate_fingerprint()

        # Serialize
        data = model.to_dict()

        assert "voice_characteristics" in data
        assert "fingerprint" in data
        assert data["fingerprint"]["fingerprint_id"].startswith("vfp_")

        # Deserialize
        restored = VoiceModel.from_dict(data)

        assert restored.voice_characteristics is not None
        assert restored.voice_characteristics.pitch_mean_hz == 180.0
        assert restored.fingerprint is not None
        assert restored.fingerprint.fingerprint_id == model.fingerprint.fingerprint_id

        logger.info("VoiceModel serialization with fingerprint test passed")


# ═══════════════════════════════════════════════════════════════
# RUN ALL TESTS
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
