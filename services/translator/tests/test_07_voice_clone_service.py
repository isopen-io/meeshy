#!/usr/bin/env python3
"""
Test 07 - VoiceCloneService Unit Tests
Tests for voice cloning, caching, model management, fingerprinting, and multi-speaker translation
"""

import sys
import os
import logging
import asyncio
import pytest
import json
import pickle
import tempfile
import shutil
import hashlib
from pathlib import Path
from datetime import datetime, timedelta
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
def voice_cache_dir():
    """Create temporary voice cache directory"""
    temp_dir = tempfile.mkdtemp(prefix="voice_cache_")
    yield Path(temp_dir)
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def mock_voice_model_data():
    """Sample voice model metadata"""
    return {
        "user_id": "user_123",
        "embedding_path": "/tmp/test/embedding.pkl",
        "audio_count": 3,
        "total_duration_ms": 25000,
        "quality_score": 0.75,
        "version": 2,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "next_recalibration_at": (datetime.now() + timedelta(days=30)).isoformat()
    }


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - VoiceCloneService
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_voice_clone_singleton(voice_cache_dir):
    """Test singleton pattern"""
    logger.info("Test 07.1: Singleton pattern")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    # Reset singleton for testing
    VoiceCloneService._instance = None

    service1 = VoiceCloneService(voice_cache_dir=str(voice_cache_dir))
    service2 = VoiceCloneService()

    assert service1 is service2
    logger.info("Singleton pattern works correctly")


@pytest.mark.asyncio
async def test_voice_clone_initialization(voice_cache_dir):
    """Test service initialization"""
    logger.info("Test 07.2: Service initialization")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    # Reset singleton
    VoiceCloneService._instance = None

    service = VoiceCloneService(voice_cache_dir=str(voice_cache_dir))
    service._initialized = True
    service.is_initialized = False

    result = await service.initialize()

    assert result is True
    assert service.is_initialized is True
    logger.info("Service initialized successfully")


@pytest.mark.asyncio
async def test_voice_model_dataclass(mock_voice_model_data):
    """Test VoiceModel dataclass"""
    logger.info("Test 07.3: VoiceModel dataclass")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    # Create from dict
    model = VoiceModel.from_dict(mock_voice_model_data)

    assert model.user_id == "user_123"
    assert model.audio_count == 3
    assert model.total_duration_ms == 25000
    assert model.quality_score == 0.75
    assert model.version == 2

    # Convert back to dict
    model_dict = model.to_dict()
    assert model_dict["user_id"] == "user_123"
    assert model_dict["audio_count"] == 3

    logger.info("VoiceModel dataclass works correctly")


@pytest.mark.asyncio
async def test_voice_clone_quality_score(voice_cache_dir):
    """Test quality score calculation"""
    logger.info("Test 07.4: Quality score calculation")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    VoiceCloneService._instance = None
    service = VoiceCloneService(voice_cache_dir=str(voice_cache_dir))

    # Test different duration thresholds
    test_cases = [
        (5000, 1, 0.3),    # 5s, 1 audio -> low
        (15000, 1, 0.5),   # 15s, 1 audio -> medium
        (45000, 1, 0.7),   # 45s, 1 audio -> good
        (90000, 1, 0.9),   # 90s, 1 audio -> excellent
        (15000, 3, 0.6),   # 15s, 3 audios -> medium + bonus
    ]

    for duration_ms, audio_count, expected_score in test_cases:
        score = service._calculate_quality_score(duration_ms, audio_count)
        assert abs(score - expected_score) < 0.01, f"Expected {expected_score}, got {score}"
        logger.info(f"Duration {duration_ms}ms, {audio_count} audios -> score {score:.2f}")

    logger.info("Quality score calculation works correctly")


@pytest.mark.asyncio
async def test_voice_model_cache_save_load(voice_cache_dir):
    """Test model cache save and load"""
    logger.info("Test 07.5: Cache save and load")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    VoiceCloneService._instance = None
    service = VoiceCloneService(voice_cache_dir=str(voice_cache_dir))

    # Create a model
    model = VoiceModel(
        user_id="test_user_456",
        embedding_path=str(voice_cache_dir / "test_user_456" / "embedding.pkl"),
        audio_count=2,
        total_duration_ms=20000,
        quality_score=0.6,
        version=1,
        created_at=datetime.now(),
        updated_at=datetime.now(),
        embedding=np.random.randn(256).astype(np.float32)
    )

    # Save
    await service._save_model_to_cache(model)

    # Check files exist
    user_dir = voice_cache_dir / "test_user_456"
    assert (user_dir / "metadata.json").exists()
    assert (user_dir / "embedding.pkl").exists()

    # Load
    loaded_model = await service._load_cached_model("test_user_456")

    assert loaded_model is not None
    assert loaded_model.user_id == "test_user_456"
    assert loaded_model.audio_count == 2
    assert loaded_model.quality_score == 0.6

    logger.info("Cache save and load works correctly")


@pytest.mark.asyncio
async def test_voice_model_embedding_load(voice_cache_dir):
    """Test embedding loading from pickle"""
    logger.info("Test 07.6: Embedding load")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    VoiceCloneService._instance = None
    service = VoiceCloneService(voice_cache_dir=str(voice_cache_dir))

    # Create user dir and embedding
    user_dir = voice_cache_dir / "embed_test_user"
    user_dir.mkdir(parents=True)

    embedding = np.random.randn(256).astype(np.float32)
    embedding_path = user_dir / "embedding.pkl"

    with open(embedding_path, 'wb') as f:
        pickle.dump(embedding, f)

    # Create model without embedding loaded
    model = VoiceModel(
        user_id="embed_test_user",
        embedding_path=str(embedding_path),
        audio_count=1,
        total_duration_ms=10000,
        quality_score=0.5
    )

    assert model.embedding is None

    # Load embedding
    loaded_model = await service._load_embedding(model)

    assert loaded_model.embedding is not None
    assert loaded_model.embedding.shape == (256,)
    np.testing.assert_array_almost_equal(loaded_model.embedding, embedding)

    logger.info("Embedding load works correctly")


@pytest.mark.asyncio
async def test_voice_clone_get_or_create_cached(voice_cache_dir):
    """Test get_or_create with cached model"""
    logger.info("Test 07.7: Get or create with cache")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    VoiceCloneService._instance = None
    service = VoiceCloneService(voice_cache_dir=str(voice_cache_dir))
    service.is_initialized = True

    # Pre-create a cached model
    user_id = "cached_user"
    user_dir = voice_cache_dir / user_id
    user_dir.mkdir(parents=True)

    # Save metadata
    metadata = {
        "user_id": user_id,
        "embedding_path": str(user_dir / "embedding.pkl"),
        "audio_count": 2,
        "total_duration_ms": 30000,
        "quality_score": 0.7,
        "version": 1,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "next_recalibration_at": (datetime.now() + timedelta(days=25)).isoformat()
    }

    with open(user_dir / "metadata.json", 'w') as f:
        json.dump(metadata, f)

    # Save embedding
    embedding = np.random.randn(256).astype(np.float32)
    with open(user_dir / "embedding.pkl", 'wb') as f:
        pickle.dump(embedding, f)

    # Get model (should use cache)
    model = await service.get_or_create_voice_model(user_id=user_id)

    assert model is not None
    assert model.user_id == user_id
    assert model.audio_count == 2
    assert model.quality_score == 0.7
    assert model.embedding is not None

    logger.info("Cached model retrieved successfully")


@pytest.mark.asyncio
async def test_voice_clone_model_improvement(voice_cache_dir, mock_audio_file):
    """Test model improvement with new audio"""
    logger.info("Test 07.8: Model improvement")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    VoiceCloneService._instance = None
    service = VoiceCloneService(voice_cache_dir=str(voice_cache_dir))
    service.is_initialized = True

    # Create initial model
    user_id = "improve_test_user"
    initial_embedding = np.random.randn(256).astype(np.float32)

    initial_quality_score = 0.5
    initial_model = VoiceModel(
        user_id=user_id,
        embedding_path=str(voice_cache_dir / user_id / "embedding.pkl"),
        audio_count=1,
        total_duration_ms=10000,
        quality_score=initial_quality_score,
        version=1,
        created_at=datetime.now(),
        updated_at=datetime.now() - timedelta(days=1),  # Updated yesterday
        embedding=initial_embedding
    )

    # Mock embedding extraction
    new_embedding = np.random.randn(256).astype(np.float32)

    with patch.object(service, '_extract_voice_embedding', new_callable=AsyncMock) as mock_extract:
        mock_extract.return_value = new_embedding

        improved_model = await service._improve_model(initial_model, str(mock_audio_file))

    assert improved_model.version == 2
    assert improved_model.audio_count == 2
    # The model is mutated in place, so check against the captured initial value
    assert improved_model.quality_score > initial_quality_score
    assert improved_model.embedding is not None

    # Check weighted average was applied
    expected_embedding = service.IMPROVEMENT_WEIGHT_OLD * initial_embedding + service.IMPROVEMENT_WEIGHT_NEW * new_embedding
    np.testing.assert_array_almost_equal(improved_model.embedding, expected_embedding)

    logger.info("Model improvement works correctly")


@pytest.mark.asyncio
async def test_voice_clone_get_stats(voice_cache_dir):
    """Test get_stats method"""
    logger.info("Test 07.9: Get stats")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    VoiceCloneService._instance = None
    service = VoiceCloneService(voice_cache_dir=str(voice_cache_dir))
    service.is_initialized = True

    stats = await service.get_stats()

    assert "service" in stats
    assert stats["service"] == "VoiceCloneService"
    assert "initialized" in stats
    assert "openvoice_available" in stats
    assert "cache_dir" in stats
    assert "min_audio_duration_ms" in stats
    assert "max_age_days" in stats

    logger.info(f"Stats: {stats}")


@pytest.mark.asyncio
async def test_voice_clone_recalibration_needed(voice_cache_dir):
    """Test detection of models needing recalibration"""
    logger.info("Test 07.10: Recalibration detection")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    VoiceCloneService._instance = None
    service = VoiceCloneService(voice_cache_dir=str(voice_cache_dir))

    # Create an old model that needs recalibration
    user_dir = voice_cache_dir / "old_user"
    user_dir.mkdir(parents=True)

    old_date = datetime.now() - timedelta(days=35)
    metadata = {
        "user_id": "old_user",
        "embedding_path": str(user_dir / "embedding.pkl"),
        "audio_count": 1,
        "total_duration_ms": 10000,
        "quality_score": 0.5,
        "version": 1,
        "created_at": old_date.isoformat(),
        "updated_at": old_date.isoformat(),
        "next_recalibration_at": (old_date + timedelta(days=30)).isoformat()
    }

    with open(user_dir / "metadata.json", 'w') as f:
        json.dump(metadata, f)

    # Create embedding
    with open(user_dir / "embedding.pkl", 'wb') as f:
        pickle.dump(np.zeros(256), f)

    # Load model
    model = await service._load_cached_model("old_user")

    assert model is not None
    assert model.next_recalibration_at < datetime.now()

    logger.info("Recalibration detection works correctly")


@pytest.mark.asyncio
async def test_voice_clone_close(voice_cache_dir):
    """Test close method"""
    logger.info("Test 07.11: Close method")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    VoiceCloneService._instance = None
    service = VoiceCloneService(voice_cache_dir=str(voice_cache_dir))
    service.tone_color_converter = MagicMock()
    service.se_extractor_module = MagicMock()
    service.is_initialized = True

    await service.close()

    assert service.tone_color_converter is None
    assert service.se_extractor_module is None
    assert service.is_initialized is False

    logger.info("Close method works correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - VoiceCharacteristics
# ═══════════════════════════════════════════════════════════════

def test_voice_characteristics_creation():
    """Test VoiceCharacteristics dataclass creation"""
    logger.info("Test 07.13: VoiceCharacteristics creation")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    # Create with default values
    chars = VoiceCharacteristics()
    assert chars.pitch_mean_hz == 0.0
    assert chars.voice_type == "unknown"
    assert chars.estimated_gender == "unknown"

    # Create with specific values
    chars = VoiceCharacteristics(
        pitch_mean_hz=150.0,
        pitch_std_hz=25.0,
        pitch_min_hz=100.0,
        pitch_max_hz=200.0,
        voice_type="medium_male",
        estimated_gender="male",
        estimated_age_range="adult",
        brightness=1500.0,
        warmth=3.5,
        energy_mean=0.05,
        silence_ratio=0.2
    )

    assert chars.pitch_mean_hz == 150.0
    assert chars.voice_type == "medium_male"
    assert chars.estimated_gender == "male"

    logger.info("VoiceCharacteristics creation works correctly")


def test_voice_characteristics_to_dict():
    """Test VoiceCharacteristics serialization"""
    logger.info("Test 07.14: VoiceCharacteristics to_dict")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    chars = VoiceCharacteristics(
        pitch_mean_hz=180.0,
        pitch_std_hz=30.0,
        voice_type="medium_female",
        estimated_gender="female",
        brightness=2000.0,
        energy_mean=0.03
    )

    result = chars.to_dict()

    assert "pitch" in result
    assert result["pitch"]["mean_hz"] == 180.0
    assert "classification" in result
    assert result["classification"]["voice_type"] == "medium_female"
    assert result["classification"]["estimated_gender"] == "female"
    assert "spectral" in result
    assert result["spectral"]["brightness"] == 2000.0
    assert "prosody" in result
    assert result["prosody"]["energy_mean"] == 0.03

    logger.info("VoiceCharacteristics to_dict works correctly")


def test_voice_characteristics_generate_fingerprint():
    """Test fingerprint generation from VoiceCharacteristics"""
    logger.info("Test 07.15: VoiceCharacteristics generate_fingerprint")

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
        silence_ratio=0.2
    )

    fingerprint = chars.generate_fingerprint(audio_duration_ms=15000)

    assert fingerprint is not None
    assert isinstance(fingerprint, VoiceFingerprint)
    assert fingerprint.fingerprint_id.startswith("vfp_")
    assert len(fingerprint.signature) == 64  # SHA-256 hex
    assert len(fingerprint.signature_short) == 12
    assert fingerprint.audio_duration_ms == 15000
    assert len(fingerprint.embedding_vector) > 0

    logger.info("VoiceCharacteristics generate_fingerprint works correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - VoiceFingerprint
# ═══════════════════════════════════════════════════════════════

def test_voice_fingerprint_generation():
    """Test VoiceFingerprint generation from characteristics"""
    logger.info("Test 07.16: VoiceFingerprint generation")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    chars = VoiceCharacteristics(
        pitch_mean_hz=120.0,
        pitch_std_hz=20.0,
        pitch_min_hz=80.0,
        pitch_max_hz=160.0,
        voice_type="low_male",
        estimated_gender="male",
        brightness=1200.0,
        warmth=4.0,
        breathiness=0.1,
        nasality=0.05,
        energy_mean=0.04,
        energy_std=0.01,
        silence_ratio=0.15,
        speech_rate_wpm=130.0
    )

    embedding = np.random.randn(256).astype(np.float32)
    fingerprint = VoiceFingerprint.generate_from_characteristics(
        chars,
        audio_duration_ms=20000,
        embedding=embedding
    )

    assert fingerprint.fingerprint_id != ""
    assert fingerprint.version == "1.0"
    assert fingerprint.signature != ""
    assert len(fingerprint.pitch_hash) == 16
    assert len(fingerprint.spectral_hash) == 16
    assert len(fingerprint.prosody_hash) == 16
    assert fingerprint.audio_duration_ms == 20000
    assert fingerprint.checksum != ""

    # Embedding vector should include characteristics + embedding values
    assert len(fingerprint.embedding_vector) > 9  # 9 base + 16 from embedding

    logger.info("VoiceFingerprint generation works correctly")


def test_voice_fingerprint_verify_checksum():
    """Test VoiceFingerprint checksum verification"""
    logger.info("Test 07.17: VoiceFingerprint checksum verification")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    chars = VoiceCharacteristics(
        pitch_mean_hz=200.0,
        estimated_gender="female"
    )

    fingerprint = VoiceFingerprint.generate_from_characteristics(chars)

    # Valid checksum
    assert fingerprint.verify_checksum() is True

    # Tampered checksum
    original_checksum = fingerprint.checksum
    fingerprint.checksum = "00000000"
    assert fingerprint.verify_checksum() is False

    # Restore
    fingerprint.checksum = original_checksum
    assert fingerprint.verify_checksum() is True

    logger.info("VoiceFingerprint checksum verification works correctly")


def test_voice_fingerprint_similarity():
    """Test VoiceFingerprint similarity scoring"""
    logger.info("Test 07.18: VoiceFingerprint similarity")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    # Same voice characteristics → same fingerprint → similarity = 1.0
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
        speech_rate_wpm=120.0
    )

    fp1 = VoiceFingerprint.generate_from_characteristics(chars1)
    fp2 = VoiceFingerprint.generate_from_characteristics(chars1)  # Same characteristics

    similarity = fp1.similarity_score(fp2)
    assert similarity == 1.0, f"Same fingerprints should have similarity 1.0, got {similarity}"

    # Different voice characteristics → different fingerprint
    chars2 = VoiceCharacteristics(
        pitch_mean_hz=250.0,  # Much higher pitch
        pitch_std_hz=35.0,
        pitch_min_hz=180.0,
        pitch_max_hz=320.0,
        voice_type="high_female",
        estimated_gender="female",
        brightness=2500.0,
        warmth=2.0,
        energy_mean=0.07,
        energy_std=0.03,
        silence_ratio=0.1,
        speech_rate_wpm=150.0
    )

    fp3 = VoiceFingerprint.generate_from_characteristics(chars2)
    similarity_diff = fp1.similarity_score(fp3)
    assert similarity_diff < 1.0, f"Different fingerprints should have similarity < 1.0, got {similarity_diff}"

    logger.info(f"Same voice similarity: {similarity}, Different voice similarity: {similarity_diff}")
    logger.info("VoiceFingerprint similarity scoring works correctly")


def test_voice_fingerprint_matches():
    """Test VoiceFingerprint matching"""
    logger.info("Test 07.19: VoiceFingerprint matches")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    chars = VoiceCharacteristics(
        pitch_mean_hz=140.0,
        estimated_gender="male"
    )

    fp1 = VoiceFingerprint.generate_from_characteristics(chars)
    fp2 = VoiceFingerprint.generate_from_characteristics(chars)

    # Same fingerprint should match
    assert fp1.matches(fp2, threshold=0.85) == True

    # Different fingerprint (different characteristics)
    chars_different = VoiceCharacteristics(
        pitch_mean_hz=280.0,
        estimated_gender="child"
    )
    fp3 = VoiceFingerprint.generate_from_characteristics(chars_different)

    # Should not match with default threshold
    assert fp1.matches(fp3, threshold=0.85) == False

    logger.info("VoiceFingerprint matches works correctly")


def test_voice_fingerprint_serialization():
    """Test VoiceFingerprint to_dict and from_dict"""
    logger.info("Test 07.20: VoiceFingerprint serialization")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    chars = VoiceCharacteristics(
        pitch_mean_hz=160.0,
        brightness=1800.0,
        estimated_gender="male"
    )

    original = VoiceFingerprint.generate_from_characteristics(chars, audio_duration_ms=10000)

    # Serialize (default: NO embedding_vector to save space)
    data = original.to_dict()
    assert "fingerprint_id" in data
    assert "signature" in data
    assert "components" in data
    assert "checksum" in data
    assert "metadata" in data
    assert data["metadata"]["audio_duration_ms"] == 10000
    assert "embedding_vector" not in data  # NOT included by default (stored in binary file)
    assert "embedding_dimensions" in data["metadata"]  # Only dimensions stored

    # Serialize with embedding (for debug/export only)
    data_with_embedding = original.to_dict(include_embedding=True)
    assert "embedding_vector" in data_with_embedding
    assert len(data_with_embedding["embedding_vector"]) > 0

    # Deserialize (without embedding)
    restored = VoiceFingerprint.from_dict(data)
    assert restored.fingerprint_id == original.fingerprint_id
    assert restored.signature == original.signature
    assert restored.pitch_hash == original.pitch_hash
    assert restored.checksum == original.checksum
    assert not restored.can_compute_similarity()  # No embedding loaded

    # Deserialize with embedding
    restored_with_embedding = VoiceFingerprint.from_dict(data_with_embedding)
    assert restored_with_embedding.can_compute_similarity()  # Embedding loaded

    logger.info("VoiceFingerprint serialization works correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - SpeakerInfo
# ═══════════════════════════════════════════════════════════════

def test_speaker_info_creation():
    """Test SpeakerInfo dataclass creation"""
    logger.info("Test 07.21: SpeakerInfo creation")

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
        speaking_ratio=0.7,
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
    assert speaker.speaking_ratio == 0.7
    assert len(speaker.segments) == 3

    logger.info("SpeakerInfo creation works correctly")


def test_speaker_info_generate_fingerprint():
    """Test SpeakerInfo fingerprint generation"""
    logger.info("Test 07.22: SpeakerInfo generate_fingerprint")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    voice_chars = VoiceCharacteristics(
        pitch_mean_hz=130.0,
        pitch_std_hz=20.0,
        estimated_gender="male",
        brightness=1400.0,
        energy_mean=0.04
    )

    speaker = SpeakerInfo(
        speaker_id="speaker_1",
        is_primary=False,
        speaking_time_ms=12000,
        speaking_ratio=0.3,
        voice_characteristics=voice_chars
    )

    assert speaker.fingerprint is None

    # Generate fingerprint
    embedding = np.random.randn(128).astype(np.float32)
    fingerprint = speaker.generate_fingerprint(embedding=embedding)

    assert fingerprint is not None
    assert speaker.fingerprint is fingerprint
    assert fingerprint.audio_duration_ms == 12000  # Uses speaking_time_ms

    logger.info("SpeakerInfo generate_fingerprint works correctly")


def test_speaker_info_to_dict():
    """Test SpeakerInfo serialization"""
    logger.info("Test 07.23: SpeakerInfo to_dict")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    voice_chars = VoiceCharacteristics(
        pitch_mean_hz=200.0,
        estimated_gender="female"
    )

    speaker = SpeakerInfo(
        speaker_id="speaker_0",
        is_primary=True,
        speaking_time_ms=15000,
        speaking_ratio=0.6,
        voice_characteristics=voice_chars,
        segments=[{"start": 0.0, "end": 5.0}]
    )

    # Generate fingerprint
    speaker.generate_fingerprint()

    result = speaker.to_dict()

    assert result["speaker_id"] == "speaker_0"
    assert result["is_primary"] is True
    assert result["speaking_time_ms"] == 15000
    assert "voice_characteristics" in result
    assert "fingerprint" in result  # Should include fingerprint

    logger.info("SpeakerInfo to_dict works correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - TemporaryVoiceProfile
# ═══════════════════════════════════════════════════════════════

def test_temporary_voice_profile_creation():
    """Test TemporaryVoiceProfile dataclass creation"""
    logger.info("Test 07.24: TemporaryVoiceProfile creation")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    voice_chars = VoiceCharacteristics(pitch_mean_hz=150.0)
    speaker_info = SpeakerInfo(
        speaker_id="speaker_0",
        is_primary=True,
        speaking_time_ms=10000,
        speaking_ratio=0.5,
        voice_characteristics=voice_chars
    )

    profile = TemporaryVoiceProfile(
        speaker_id="speaker_0",
        speaker_info=speaker_info,
        audio_path="/tmp/speaker_0.wav",
        embedding=np.zeros(256),
        matched_user_id=None,
        is_user_match=False,
        original_segments=[{"start": 0.0, "end": 5.0}]
    )

    assert profile.speaker_id == "speaker_0"
    assert profile.is_user_match is False
    assert profile.matched_user_id is None
    assert len(profile.original_segments) == 1

    logger.info("TemporaryVoiceProfile creation works correctly")


def test_temporary_voice_profile_user_match():
    """Test TemporaryVoiceProfile with user match"""
    logger.info("Test 07.25: TemporaryVoiceProfile user match")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    voice_chars = VoiceCharacteristics(pitch_mean_hz=140.0)
    speaker_info = SpeakerInfo(
        speaker_id="speaker_1",
        voice_characteristics=voice_chars
    )

    profile = TemporaryVoiceProfile(
        speaker_id="speaker_1",
        speaker_info=speaker_info,
        audio_path="/tmp/speaker_1.wav",
        matched_user_id="user_abc123",
        is_user_match=True
    )

    assert profile.is_user_match is True
    assert profile.matched_user_id == "user_abc123"

    result = profile.to_dict()
    assert result["is_user_match"] is True
    assert result["matched_user_id"] == "user_abc123"

    logger.info("TemporaryVoiceProfile user match works correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - MultiSpeakerTranslationContext
# ═══════════════════════════════════════════════════════════════

def test_multi_speaker_context_creation():
    """Test MultiSpeakerTranslationContext creation"""
    logger.info("Test 07.26: MultiSpeakerTranslationContext creation")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    # Create profiles
    profiles = []
    for i in range(3):
        voice_chars = VoiceCharacteristics(pitch_mean_hz=120 + i * 50)
        speaker_info = SpeakerInfo(
            speaker_id=f"speaker_{i}",
            is_primary=(i == 0),
            speaking_time_ms=10000 * (3 - i),
            voice_characteristics=voice_chars
        )
        profile = TemporaryVoiceProfile(
            speaker_id=f"speaker_{i}",
            speaker_info=speaker_info,
            audio_path=f"/tmp/speaker_{i}.wav"
        )
        profiles.append(profile)

    context = MultiSpeakerTranslationContext(
        source_audio_path="/tmp/source.wav",
        source_duration_ms=45000,
        speaker_count=3,
        profiles=profiles,
        user_profile=profiles[0]  # First speaker is user
    )

    assert context.speaker_count == 3
    assert len(context.profiles) == 3
    assert context.user_profile is not None
    assert context.user_profile.speaker_id == "speaker_0"

    logger.info("MultiSpeakerTranslationContext creation works correctly")


def test_multi_speaker_context_get_profile():
    """Test MultiSpeakerTranslationContext get_profile method"""
    logger.info("Test 07.27: MultiSpeakerTranslationContext get_profile")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    profiles = []
    for i in range(2):
        voice_chars = VoiceCharacteristics(pitch_mean_hz=150 + i * 80)
        speaker_info = SpeakerInfo(
            speaker_id=f"speaker_{i}",
            voice_characteristics=voice_chars
        )
        profile = TemporaryVoiceProfile(
            speaker_id=f"speaker_{i}",
            speaker_info=speaker_info,
            audio_path=f"/tmp/speaker_{i}.wav"
        )
        profiles.append(profile)

    context = MultiSpeakerTranslationContext(
        source_audio_path="/tmp/source.wav",
        source_duration_ms=30000,
        speaker_count=2,
        profiles=profiles
    )

    # Get existing profile
    found = context.get_profile("speaker_0")
    assert found is not None
    assert found.speaker_id == "speaker_0"

    found = context.get_profile("speaker_1")
    assert found is not None
    assert found.speaker_id == "speaker_1"

    # Get non-existing profile
    not_found = context.get_profile("speaker_99")
    assert not_found is None

    logger.info("MultiSpeakerTranslationContext get_profile works correctly")


def test_multi_speaker_context_to_dict():
    """Test MultiSpeakerTranslationContext serialization"""
    logger.info("Test 07.28: MultiSpeakerTranslationContext to_dict")

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
        audio_path="/tmp/speaker_0.wav"
    )

    context = MultiSpeakerTranslationContext(
        source_audio_path="/tmp/source.wav",
        source_duration_ms=20000,
        speaker_count=1,
        profiles=[profile],
        user_profile=profile
    )

    result = context.to_dict()

    assert result["source_audio_path"] == "/tmp/source.wav"
    assert result["source_duration_ms"] == 20000
    assert result["speaker_count"] == 1
    assert len(result["profiles"]) == 1
    assert result["user_speaker_id"] == "speaker_0"

    logger.info("MultiSpeakerTranslationContext to_dict works correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - VoiceAnalyzer
# ═══════════════════════════════════════════════════════════════

def test_voice_analyzer_singleton():
    """Test VoiceAnalyzer singleton access"""
    logger.info("Test 07.29: VoiceAnalyzer singleton")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    analyzer1 = get_voice_analyzer()
    analyzer2 = get_voice_analyzer()

    assert analyzer1 is analyzer2

    logger.info("VoiceAnalyzer singleton works correctly")


def test_voice_analyzer_identify_primary_speaker():
    """Test VoiceAnalyzer primary speaker identification"""
    logger.info("Test 07.30: VoiceAnalyzer identify primary speaker")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    analyzer = VoiceAnalyzer()

    # Create speakers with different speaking times
    speakers = [
        SpeakerInfo(
            speaker_id="speaker_0",
            speaking_time_ms=5000,
            speaking_ratio=0.2,
            voice_characteristics=VoiceCharacteristics(pitch_mean_hz=180.0)
        ),
        SpeakerInfo(
            speaker_id="speaker_1",
            speaking_time_ms=15000,  # Most speaking time
            speaking_ratio=0.6,
            voice_characteristics=VoiceCharacteristics(pitch_mean_hz=140.0)
        ),
        SpeakerInfo(
            speaker_id="speaker_2",
            speaking_time_ms=5000,
            speaking_ratio=0.2,
            voice_characteristics=VoiceCharacteristics(pitch_mean_hz=200.0)
        )
    ]

    primary = analyzer._identify_primary_speaker(speakers)

    assert primary is not None
    assert primary.speaker_id == "speaker_1"  # The one who speaks most
    assert primary.is_primary is True

    logger.info("VoiceAnalyzer identify primary speaker works correctly")


def test_voice_analyzer_identify_user_speaker():
    """Test VoiceAnalyzer user speaker identification by fingerprint"""
    logger.info("Test 07.31: VoiceAnalyzer identify user speaker")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    analyzer = VoiceAnalyzer()

    # Create user's fingerprint
    user_chars = VoiceCharacteristics(
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
        speech_rate_wpm=120.0
    )
    user_fingerprint = user_chars.generate_fingerprint()

    # Create speakers - one matching, one different
    matching_chars = VoiceCharacteristics(
        pitch_mean_hz=150.0,  # Same as user
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
        speech_rate_wpm=120.0
    )

    different_chars = VoiceCharacteristics(
        pitch_mean_hz=280.0,  # Very different
        pitch_std_hz=40.0,
        pitch_min_hz=220.0,
        pitch_max_hz=350.0,
        voice_type="high_female",
        estimated_gender="female",
        brightness=2800.0,
        warmth=2.0,
        energy_mean=0.08,
        energy_std=0.04,
        silence_ratio=0.1,
        speech_rate_wpm=160.0
    )

    speakers = [
        SpeakerInfo(
            speaker_id="speaker_0",
            speaking_time_ms=10000,
            voice_characteristics=different_chars
        ),
        SpeakerInfo(
            speaker_id="speaker_1",
            speaking_time_ms=15000,
            voice_characteristics=matching_chars  # This one should match
        )
    ]

    # Generate fingerprints for speakers
    for s in speakers:
        s.generate_fingerprint()

    # Identify user
    matched = analyzer.identify_user_speaker(speakers, user_fingerprint, similarity_threshold=0.75)

    assert matched is not None
    assert matched.speaker_id == "speaker_1"  # The matching one

    logger.info("VoiceAnalyzer identify user speaker works correctly")


def test_voice_analyzer_can_create_profile():
    """Test VoiceAnalyzer can_create_user_profile rules"""
    logger.info("Test 07.32: VoiceAnalyzer can_create_user_profile")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    analyzer = VoiceAnalyzer()

    # Case 1: Single speaker with good quality → can create
    single_speaker = SpeakerInfo(
        speaker_id="speaker_0",
        is_primary=True,
        speaking_time_ms=15000,
        speaking_ratio=1.0,
        voice_characteristics=VoiceCharacteristics(pitch_mean_hz=150.0)
    )
    single_speaker.generate_fingerprint()

    metadata_single = RecordingMetadata(
        file_path="/tmp/test.wav",
        duration_ms=15000,
        speaker_count=1,
        speakers=[single_speaker],
        primary_speaker=single_speaker,
        clarity_score=0.8
    )

    can_create, reason = analyzer.can_create_user_profile(metadata_single)
    assert can_create is True
    logger.info(f"Single speaker: can_create={can_create}, reason={reason}")

    # Case 2: Multiple speakers but primary doesn't dominate → cannot create
    speaker1 = SpeakerInfo(
        speaker_id="speaker_0",
        is_primary=True,
        speaking_time_ms=5000,
        speaking_ratio=0.4,  # Only 40%
        voice_characteristics=VoiceCharacteristics(pitch_mean_hz=150.0)
    )
    speaker2 = SpeakerInfo(
        speaker_id="speaker_1",
        speaking_time_ms=7500,
        speaking_ratio=0.6,
        voice_characteristics=VoiceCharacteristics(pitch_mean_hz=200.0)
    )

    metadata_multi = RecordingMetadata(
        file_path="/tmp/test.wav",
        duration_ms=12500,
        speaker_count=2,
        speakers=[speaker1, speaker2],
        primary_speaker=speaker1,
        clarity_score=0.8
    )

    can_create2, reason2 = analyzer.can_create_user_profile(metadata_multi)
    assert can_create2 is False
    logger.info(f"Multiple speakers (no dominant): can_create={can_create2}, reason={reason2}")

    # Case 3: Low quality audio → cannot create
    metadata_low_quality = RecordingMetadata(
        file_path="/tmp/test.wav",
        duration_ms=15000,
        speaker_count=1,
        speakers=[single_speaker],
        primary_speaker=single_speaker,
        clarity_score=0.3  # Too low
    )

    can_create3, reason3 = analyzer.can_create_user_profile(metadata_low_quality)
    assert can_create3 is False
    logger.info(f"Low quality: can_create={can_create3}, reason={reason3}")

    logger.info("VoiceAnalyzer can_create_user_profile works correctly")


def test_voice_analyzer_can_update_profile():
    """Test VoiceAnalyzer can_update_user_profile rules"""
    logger.info("Test 07.33: VoiceAnalyzer can_update_user_profile")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    analyzer = VoiceAnalyzer()

    # Create existing user fingerprint
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
        speech_rate_wpm=120.0
    )
    existing_fingerprint = existing_chars.generate_fingerprint()

    # Case 1: Matching speaker → can update
    matching_speaker = SpeakerInfo(
        speaker_id="speaker_0",
        is_primary=True,
        speaking_time_ms=12000,
        speaking_ratio=0.8,
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
            speech_rate_wpm=120.0
        )
    )

    metadata_match = RecordingMetadata(
        file_path="/tmp/test.wav",
        duration_ms=15000,
        speaker_count=1,
        speakers=[matching_speaker],
        primary_speaker=matching_speaker,
        clarity_score=0.8
    )

    can_update, reason, speaker = analyzer.can_update_user_profile(
        metadata_match, existing_fingerprint
    )
    assert can_update is True
    logger.info(f"Matching signature: can_update={can_update}, reason={reason}")

    # Case 2: Different speaker → cannot update
    different_speaker = SpeakerInfo(
        speaker_id="speaker_0",
        is_primary=True,
        speaking_time_ms=12000,
        speaking_ratio=0.8,
        voice_characteristics=VoiceCharacteristics(
            pitch_mean_hz=280.0,  # Very different
            pitch_std_hz=40.0,
            pitch_min_hz=220.0,
            pitch_max_hz=350.0,
            voice_type="high_female",
            estimated_gender="female",
            brightness=2800.0,
            warmth=2.0,
            energy_mean=0.08,
            energy_std=0.04,
            silence_ratio=0.1,
            speech_rate_wpm=160.0
        )
    )

    metadata_diff = RecordingMetadata(
        file_path="/tmp/test.wav",
        duration_ms=15000,
        speaker_count=1,
        speakers=[different_speaker],
        primary_speaker=different_speaker,
        clarity_score=0.8
    )

    can_update2, reason2, _ = analyzer.can_update_user_profile(
        metadata_diff, existing_fingerprint
    )
    assert can_update2 is False
    logger.info(f"Different signature: can_update={can_update2}, reason={reason2}")

    logger.info("VoiceAnalyzer can_update_user_profile works correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - VoiceModel with Fingerprint
# ═══════════════════════════════════════════════════════════════

def test_voice_model_with_fingerprint():
    """Test VoiceModel with voice characteristics and fingerprint"""
    logger.info("Test 07.34: VoiceModel with fingerprint")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    voice_chars = VoiceCharacteristics(
        pitch_mean_hz=145.0,
        pitch_std_hz=22.0,
        voice_type="medium_male",
        estimated_gender="male",
        brightness=1400.0,
        energy_mean=0.045
    )

    embedding = np.random.randn(256).astype(np.float32)

    model = VoiceModel(
        user_id="test_user",
        embedding_path="/tmp/test/embedding.pkl",
        audio_count=2,
        total_duration_ms=25000,
        quality_score=0.7,
        voice_characteristics=voice_chars,
        embedding=embedding
    )

    # Generate fingerprint
    fingerprint = model.generate_fingerprint()

    assert fingerprint is not None
    assert model.fingerprint is fingerprint
    assert fingerprint.fingerprint_id.startswith("vfp_")

    logger.info("VoiceModel with fingerprint works correctly")


def test_voice_model_serialization_with_fingerprint(voice_cache_dir):
    """Test VoiceModel serialization with fingerprint"""
    logger.info("Test 07.35: VoiceModel serialization with fingerprint")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    voice_chars = VoiceCharacteristics(
        pitch_mean_hz=175.0,
        estimated_gender="female",
        brightness=2000.0
    )

    model = VoiceModel(
        user_id="test_serial_user",
        embedding_path=str(voice_cache_dir / "test_serial_user" / "embedding.pkl"),
        audio_count=1,
        total_duration_ms=15000,
        quality_score=0.65,
        voice_characteristics=voice_chars,
        embedding=np.random.randn(256).astype(np.float32)
    )

    # Generate fingerprint
    model.generate_fingerprint()

    # Serialize
    data = model.to_dict()

    assert "voice_characteristics" in data
    assert "fingerprint" in data
    assert data["voice_characteristics"]["pitch"]["mean_hz"] == 175.0
    assert data["fingerprint"]["fingerprint_id"].startswith("vfp_")

    # Deserialize
    restored = VoiceModel.from_dict(data)

    assert restored.voice_characteristics is not None
    assert restored.voice_characteristics.pitch_mean_hz == 175.0
    assert restored.fingerprint is not None
    assert restored.fingerprint.fingerprint_id == model.fingerprint.fingerprint_id

    logger.info("VoiceModel serialization with fingerprint works correctly")


@pytest.mark.asyncio
async def test_voice_clone_list_all_cached(voice_cache_dir):
    """Test listing all cached models"""
    logger.info("Test 07.12: List all cached models")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    VoiceCloneService._instance = None
    service = VoiceCloneService(voice_cache_dir=str(voice_cache_dir))

    # Create multiple cached models
    for i in range(3):
        user_id = f"list_test_user_{i}"
        user_dir = voice_cache_dir / user_id
        user_dir.mkdir(parents=True)

        metadata = {
            "user_id": user_id,
            "embedding_path": str(user_dir / "embedding.pkl"),
            "audio_count": i + 1,
            "total_duration_ms": 10000 * (i + 1),
            "quality_score": 0.5 + (i * 0.1),
            "version": 1,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }

        with open(user_dir / "metadata.json", 'w') as f:
            json.dump(metadata, f)

    # List all models
    models = await service._list_all_cached_models()

    assert len(models) == 3
    user_ids = [m.user_id for m in models]
    assert "list_test_user_0" in user_ids
    assert "list_test_user_1" in user_ids
    assert "list_test_user_2" in user_ids

    logger.info(f"Listed {len(models)} cached models")


# ═══════════════════════════════════════════════════════════════
# RUN ALL TESTS
# ═══════════════════════════════════════════════════════════════

async def run_all_tests():
    """Run all voice clone service tests"""
    logger.info("Starting VoiceCloneService Tests (Test 07)")
    logger.info("=" * 60)

    # Create temp dir for tests
    temp_dir = Path(tempfile.mkdtemp())

    tests = [
        ("Singleton pattern", test_voice_clone_singleton),
        ("Service initialization", lambda: test_voice_clone_initialization(temp_dir)),
        ("VoiceModel dataclass", lambda: test_voice_model_dataclass({
            "user_id": "user_123",
            "embedding_path": "/tmp/test/embedding.pkl",
            "audio_count": 3,
            "total_duration_ms": 25000,
            "quality_score": 0.75,
            "version": 2,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "next_recalibration_at": (datetime.now() + timedelta(days=30)).isoformat()
        })),
        ("Quality score calculation", test_voice_clone_quality_score),
        ("Cache save and load", lambda: test_voice_model_cache_save_load(temp_dir)),
        ("Embedding load", lambda: test_voice_model_embedding_load(temp_dir)),
        ("Get stats", lambda: test_voice_clone_get_stats(temp_dir)),
        ("Close method", lambda: test_voice_clone_close(temp_dir)),
        ("List cached models", lambda: test_voice_clone_list_all_cached(temp_dir)),
    ]

    passed = 0
    total = len(tests)

    for test_name, test_func in tests:
        logger.info(f"\n Test: {test_name}...")
        try:
            result = test_func()
            if asyncio.iscoroutine(result):
                await result
            passed += 1
            logger.info(f"PASSED: {test_name}")
        except Exception as e:
            logger.error(f"FAILED: {test_name} - {e}")
            import traceback
            traceback.print_exc()

    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)

    logger.info("\n" + "=" * 60)
    logger.info(f"Results Test 07: {passed}/{total} tests passed")

    if passed == total:
        logger.info("All VoiceCloneService tests passed!")
        return True
    else:
        logger.error(f"{total - passed} test(s) failed")
        return False


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
