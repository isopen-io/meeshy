#!/usr/bin/env python3
"""
Test 07 - VoiceCloneService Unit Tests
Tests for voice cloning, caching, and model management
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
        get_voice_clone_service,
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
async def test_voice_clone_singleton():
    """Test singleton pattern"""
    logger.info("Test 07.1: Singleton pattern")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    # Reset singleton for testing
    VoiceCloneService._instance = None

    service1 = VoiceCloneService()
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
async def test_voice_clone_quality_score():
    """Test quality score calculation"""
    logger.info("Test 07.4: Quality score calculation")

    if not SERVICE_AVAILABLE:
        pytest.skip("VoiceCloneService not available")

    VoiceCloneService._instance = None
    service = VoiceCloneService()

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
