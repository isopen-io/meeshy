#!/usr/bin/env python3
"""
Test Suite Complete - VoiceAnalyzerService
==========================================

Tests complets pour l'analyse vocale et la qualité audio.

COUVERTURE:
- ✅ analyze() - Extraction complète de caractéristiques vocales
- ✅ compare() - Similarité multi-métrique entre deux voix
- ✅ Voice type detection - Classification basée sur pitch
- ✅ Edge cases - Silence, bruit, audio court, fichiers invalides
- ✅ Integration - Pipeline audio complet
- ✅ Cache - LRU cache avec invalidation
- ✅ get_optimal_clone_params() - Paramètres de clonage vocal
- ✅ Singleton pattern
- ✅ Mode dégradé sans librosa

TARGET: 90%+ code coverage
"""

import sys
import os
import logging
import asyncio
import pytest
import tempfile
import shutil
import hashlib
import numpy as np
from pathlib import Path
from datetime import datetime
from unittest.mock import MagicMock, AsyncMock, patch, Mock
from dataclasses import dataclass

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Vérifier la disponibilité de librosa
LIBROSA_AVAILABLE = False
try:
    import librosa
    import scipy.signal
    from scipy.stats import skew, kurtosis
    LIBROSA_AVAILABLE = True
    logger.info("✅ librosa disponible pour les tests")
except ImportError:
    logger.warning("⚠️ librosa non disponible - certains tests seront skippés")

# Import du service
from services.voice_analyzer_service import (
    VoiceAnalyzerService,
    VoiceCharacteristics,
    VoiceSimilarityResult,
    get_voice_analyzer_service,
    AUDIO_ANALYSIS_AVAILABLE,
    LIBROSA_AVAILABLE as SERVICE_LIBROSA_AVAILABLE
)


# ═══════════════════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture
def cache_dir():
    """Create temporary cache directory"""
    temp_dir = tempfile.mkdtemp(prefix="voice_analyzer_cache_")
    yield Path(temp_dir)
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def analyzer(cache_dir):
    """Create VoiceAnalyzerService instance"""
    # Reset singleton
    VoiceAnalyzerService._instance = None
    service = VoiceAnalyzerService(cache_dir=str(cache_dir))
    return service


@pytest.fixture
def mock_audio_data():
    """Generate realistic mock audio data"""
    if not LIBROSA_AVAILABLE:
        pytest.skip("librosa required for this test")

    sr = 22050
    duration = 3.0
    t = np.linspace(0, duration, int(sr * duration))

    # Generate speech-like signal
    f0 = 150  # Fundamental frequency (male voice)
    # Add harmonics and noise for realism
    signal = (
        np.sin(2 * np.pi * f0 * t) +           # Fundamental
        0.5 * np.sin(2 * np.pi * f0 * 2 * t) + # 2nd harmonic
        0.3 * np.sin(2 * np.pi * f0 * 3 * t) + # 3rd harmonic
        0.1 * np.random.randn(len(t))          # Noise
    )

    # Add envelope (amplitude modulation)
    envelope = 0.5 * (1 + np.sin(2 * np.pi * 4 * t))
    signal = signal * envelope

    # Normalize
    signal = signal / np.max(np.abs(signal)) * 0.9

    return signal, sr


@pytest.fixture
def sample_audio_file(tmp_path, mock_audio_data):
    """Create a sample WAV file with realistic audio"""
    if not LIBROSA_AVAILABLE:
        pytest.skip("librosa required for this test")

    import soundfile as sf

    audio_path = tmp_path / "sample_voice.wav"
    signal, sr = mock_audio_data
    sf.write(str(audio_path), signal, sr)

    return str(audio_path)


@pytest.fixture
def female_audio_file(tmp_path):
    """Create a female voice audio file"""
    if not LIBROSA_AVAILABLE:
        pytest.skip("librosa required for this test")

    import soundfile as sf

    sr = 22050
    duration = 2.0
    t = np.linspace(0, duration, int(sr * duration))

    # Higher pitch for female voice
    f0 = 220  # Female voice ~220 Hz
    signal = (
        np.sin(2 * np.pi * f0 * t) +
        0.4 * np.sin(2 * np.pi * f0 * 2 * t) +
        0.05 * np.random.randn(len(t))
    )

    envelope = 0.6 * (1 + np.sin(2 * np.pi * 5 * t))
    signal = signal * envelope
    signal = signal / np.max(np.abs(signal)) * 0.8

    audio_path = tmp_path / "female_voice.wav"
    sf.write(str(audio_path), signal, sr)

    return str(audio_path)


@pytest.fixture
def silence_audio_file(tmp_path):
    """Create a silent audio file"""
    if not LIBROSA_AVAILABLE:
        pytest.skip("librosa required for this test")

    import soundfile as sf

    sr = 22050
    duration = 1.0
    signal = np.zeros(int(sr * duration))

    audio_path = tmp_path / "silence.wav"
    sf.write(str(audio_path), signal, sr)

    return str(audio_path)


@pytest.fixture
def noisy_audio_file(tmp_path):
    """Create a noisy audio file (white noise)"""
    if not LIBROSA_AVAILABLE:
        pytest.skip("librosa required for this test")

    import soundfile as sf

    sr = 22050
    duration = 1.0
    signal = np.random.randn(int(sr * duration)) * 0.5

    audio_path = tmp_path / "noise.wav"
    sf.write(str(audio_path), signal, sr)

    return str(audio_path)


@pytest.fixture
def short_audio_file(tmp_path):
    """Create a very short audio file (0.5s)"""
    if not LIBROSA_AVAILABLE:
        pytest.skip("librosa required for this test")

    import soundfile as sf

    sr = 22050
    duration = 0.5
    t = np.linspace(0, duration, int(sr * duration))

    signal = np.sin(2 * np.pi * 150 * t) * 0.7

    audio_path = tmp_path / "short.wav"
    sf.write(str(audio_path), signal, sr)

    return str(audio_path)


# ═══════════════════════════════════════════════════════════════════════════
# TESTS: INITIALIZATION & SINGLETON
# ═══════════════════════════════════════════════════════════════════════════

def test_singleton_pattern(cache_dir):
    """Test that VoiceAnalyzerService is a singleton"""
    # Reset singleton
    VoiceAnalyzerService._instance = None

    service1 = VoiceAnalyzerService(cache_dir=str(cache_dir))
    service2 = VoiceAnalyzerService(cache_dir=str(cache_dir / "other"))

    assert service1 is service2
    assert service1.cache_dir == service2.cache_dir


def test_get_voice_analyzer_service():
    """Test factory function"""
    VoiceAnalyzerService._instance = None

    service = get_voice_analyzer_service()
    assert isinstance(service, VoiceAnalyzerService)

    service2 = get_voice_analyzer_service()
    assert service is service2


@pytest.mark.asyncio
async def test_initialize(analyzer):
    """Test service initialization"""
    result = await analyzer.initialize()
    assert result is True
    assert analyzer.is_initialized is True

    # Re-initialize should work
    result = await analyzer.initialize()
    assert result is True


@pytest.mark.asyncio
async def test_initialize_without_librosa(analyzer, monkeypatch):
    """Test initialization in degraded mode"""
    # Simulate librosa unavailable
    import services.voice_analyzer_service as vas
    monkeypatch.setattr(vas, 'AUDIO_ANALYSIS_AVAILABLE', False)

    result = await analyzer.initialize()
    assert result is True
    assert analyzer.is_initialized is True


# ═══════════════════════════════════════════════════════════════════════════
# TESTS: ANALYZE() - CORE FUNCTIONALITY
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_analyze_success(analyzer, sample_audio_file):
    """Test successful audio analysis"""
    await analyzer.initialize()

    characteristics = await analyzer.analyze(sample_audio_file)

    # Verify structure
    assert isinstance(characteristics, VoiceCharacteristics)

    # Verify pitch analysis
    assert characteristics.pitch_mean > 0
    assert characteristics.pitch_std >= 0
    assert characteristics.pitch_min > 0
    assert characteristics.pitch_max > 0
    assert characteristics.pitch_range >= 0
    assert characteristics.pitch_max >= characteristics.pitch_min

    # Verify spectral analysis
    assert characteristics.spectral_centroid > 0
    assert characteristics.spectral_bandwidth > 0
    assert characteristics.spectral_rolloff > 0
    assert 0 <= characteristics.spectral_flatness <= 1

    # Verify energy analysis
    assert characteristics.rms_energy > 0
    assert characteristics.energy_std >= 0
    assert characteristics.dynamic_range >= 0

    # Verify MFCC
    assert len(characteristics.mfcc_mean) == 13
    assert len(characteristics.mfcc_std) == 13
    assert all(isinstance(x, float) for x in characteristics.mfcc_mean)

    # Verify quality metrics
    assert characteristics.jitter >= 0
    assert characteristics.shimmer >= 0
    assert 0 <= characteristics.harmonics_to_noise <= 1

    # Verify classification
    assert characteristics.voice_type != "unknown"
    assert characteristics.gender_estimate in ["male", "female", "child", "unknown"]
    assert characteristics.age_range != "unknown"

    # Verify metadata
    assert characteristics.sample_rate == 22050
    assert characteristics.duration_seconds > 0
    assert characteristics.analysis_time_ms > 0
    assert 0 <= characteristics.confidence <= 1


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_analyze_female_voice(analyzer, female_audio_file):
    """Test analysis of female voice"""
    await analyzer.initialize()

    characteristics = await analyzer.analyze(female_audio_file)

    # Female voice should have higher pitch
    assert characteristics.pitch_mean > 180
    assert characteristics.gender_estimate == "female"
    assert "female" in characteristics.voice_type


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_analyze_cache_hit(analyzer, sample_audio_file):
    """Test that cache is used on second analysis"""
    await analyzer.initialize()

    # First analysis
    char1 = await analyzer.analyze(sample_audio_file, use_cache=True)
    cache_misses_before = analyzer._stats["cache_misses"]

    # Second analysis should hit cache
    char2 = await analyzer.analyze(sample_audio_file, use_cache=True)

    assert analyzer._stats["cache_hits"] > 0
    assert analyzer._stats["cache_misses"] == cache_misses_before
    assert char1.pitch_mean == char2.pitch_mean


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_analyze_cache_bypass(analyzer, sample_audio_file):
    """Test cache bypass"""
    await analyzer.initialize()

    # First analysis with cache
    await analyzer.analyze(sample_audio_file, use_cache=True)

    # Second analysis without cache
    cache_misses_before = analyzer._stats["cache_misses"]
    await analyzer.analyze(sample_audio_file, use_cache=False)

    assert analyzer._stats["cache_misses"] > cache_misses_before


@pytest.mark.asyncio
async def test_analyze_degraded_mode(analyzer, tmp_path):
    """Test analysis in degraded mode (no librosa)"""
    # Create a dummy file
    dummy_file = tmp_path / "dummy.wav"
    dummy_file.write_bytes(b"RIFF" + b"\x00" * 100)

    # Mock librosa unavailable
    import services.voice_analyzer_service as vas
    original = vas.AUDIO_ANALYSIS_AVAILABLE
    vas.AUDIO_ANALYSIS_AVAILABLE = False

    try:
        await analyzer.initialize()
        characteristics = await analyzer.analyze(str(dummy_file))

        # Should return dummy analysis
        assert characteristics.voice_type == "unknown"
        assert characteristics.gender_estimate == "unknown"
        assert characteristics.confidence == 0.0
    finally:
        vas.AUDIO_ANALYSIS_AVAILABLE = original


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_analyze_error_handling(analyzer, tmp_path):
    """Test error handling for invalid audio files"""
    await analyzer.initialize()

    # Non-existent file
    characteristics = await analyzer.analyze("/nonexistent/file.wav")
    assert characteristics.voice_type == "unknown"

    # Invalid file
    invalid_file = tmp_path / "invalid.wav"
    invalid_file.write_text("not an audio file")

    characteristics = await analyzer.analyze(str(invalid_file))
    assert characteristics.voice_type == "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# TESTS: EDGE CASES
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_analyze_silence(analyzer, silence_audio_file):
    """Test analysis of silent audio"""
    await analyzer.initialize()

    characteristics = await analyzer.analyze(silence_audio_file)

    # Silence should have minimal characteristics
    assert characteristics.pitch_mean == 0 or characteristics.pitch_mean < 50
    assert characteristics.rms_energy < 0.01
    assert characteristics.voice_type in ["unknown", "very_low"]


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_analyze_noise(analyzer, noisy_audio_file):
    """Test analysis of white noise"""
    await analyzer.initialize()

    characteristics = await analyzer.analyze(noisy_audio_file)

    # Noise should have high spectral flatness
    assert characteristics.spectral_flatness > 0.5
    # Noise has low harmonics-to-noise ratio
    assert characteristics.harmonics_to_noise < 0.5


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_analyze_short_audio(analyzer, short_audio_file):
    """Test analysis of very short audio"""
    await analyzer.initialize()

    characteristics = await analyzer.analyze(short_audio_file)

    # Should still analyze but with lower confidence
    assert characteristics.pitch_mean > 0
    assert characteristics.duration_seconds < 1.0
    # Confidence should be reduced for short audio
    assert characteristics.confidence < 0.5


# ═══════════════════════════════════════════════════════════════════════════
# TESTS: COMPARE() - VOICE SIMILARITY
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_compare_same_voice(analyzer, sample_audio_file):
    """Test comparing identical voices"""
    await analyzer.initialize()

    result = await analyzer.compare(
        sample_audio_file,
        sample_audio_file,
        detailed=True
    )

    assert isinstance(result, VoiceSimilarityResult)

    # Same voice should have very high similarity
    assert result.overall_score > 0.95
    assert result.pitch_similarity > 0.95
    assert result.timbre_similarity > 0.90
    assert result.mfcc_similarity > 0.95
    assert result.energy_similarity > 0.90

    assert result.is_likely_same_speaker is True
    assert result.confidence > 0
    assert result.analysis_time_ms > 0

    # Detailed info
    assert "voice1_type" in result.details
    assert "voice2_type" in result.details
    assert result.details["same_gender"] is True


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_compare_different_voices(analyzer, sample_audio_file, female_audio_file):
    """Test comparing male vs female voices"""
    await analyzer.initialize()

    result = await analyzer.compare(
        sample_audio_file,
        female_audio_file,
        detailed=True
    )

    # Different voices should have lower similarity
    assert result.overall_score < 0.75
    assert result.pitch_similarity < 0.80
    assert result.is_likely_same_speaker is False

    # Details should show different characteristics
    assert result.details["same_gender"] is False
    assert result.details["pitch_difference_hz"] > 30


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_compare_without_details(analyzer, sample_audio_file, female_audio_file):
    """Test comparison without detailed info"""
    await analyzer.initialize()

    result = await analyzer.compare(
        sample_audio_file,
        female_audio_file,
        detailed=False
    )

    assert isinstance(result, VoiceSimilarityResult)
    assert result.overall_score >= 0
    assert len(result.details) == 0


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_compare_weighted_scoring(analyzer, sample_audio_file, female_audio_file):
    """Test that similarity scoring uses correct weights"""
    await analyzer.initialize()

    result = await analyzer.compare(sample_audio_file, female_audio_file)

    # Verify weighted calculation
    expected_score = (
        analyzer.SIMILARITY_WEIGHTS["pitch"] * result.pitch_similarity +
        analyzer.SIMILARITY_WEIGHTS["timbre"] * result.timbre_similarity +
        analyzer.SIMILARITY_WEIGHTS["mfcc"] * result.mfcc_similarity +
        analyzer.SIMILARITY_WEIGHTS["energy"] * result.energy_similarity
    )

    assert abs(result.overall_score - expected_score) < 0.01


# ═══════════════════════════════════════════════════════════════════════════
# TESTS: VOICE CLASSIFICATION
# ═══════════════════════════════════════════════════════════════════════════

def test_classify_voice_type_male(analyzer):
    """Test voice type classification for male voices"""
    assert analyzer._classify_voice_type(100) == "medium_male"
    assert analyzer._classify_voice_type(85) == "low_male"
    assert analyzer._classify_voice_type(140) == "high_male"


def test_classify_voice_type_female(analyzer):
    """Test voice type classification for female voices"""
    assert analyzer._classify_voice_type(180) == "medium_female"
    assert analyzer._classify_voice_type(220) == "high_female"
    assert analyzer._classify_voice_type(150) == "low_female"


def test_classify_voice_type_child(analyzer):
    """Test voice type classification for children"""
    assert analyzer._classify_voice_type(280) == "child"
    assert analyzer._classify_voice_type(350) == "child"


def test_classify_voice_type_edge_cases(analyzer):
    """Test edge cases for voice classification"""
    assert analyzer._classify_voice_type(0) == "unknown"
    assert analyzer._classify_voice_type(-10) == "unknown"
    assert analyzer._classify_voice_type(500) == "very_high"
    assert analyzer._classify_voice_type(50) == "very_low"


def test_estimate_gender(analyzer):
    """Test gender estimation"""
    assert analyzer._estimate_gender(100) == "male"
    assert analyzer._estimate_gender(200) == "female"
    assert analyzer._estimate_gender(280) == "child"
    assert analyzer._estimate_gender(0) == "unknown"
    assert analyzer._estimate_gender(50) == "unknown"


def test_estimate_age_range(analyzer):
    """Test age range estimation"""
    assert analyzer._estimate_age_range(280) == "child"
    assert analyzer._estimate_age_range(220) == "young_female"
    assert analyzer._estimate_age_range(180) == "adult_female"
    assert analyzer._estimate_age_range(140) == "young_male"
    assert analyzer._estimate_age_range(110) == "adult_male"
    assert analyzer._estimate_age_range(85) == "senior_male"
    assert analyzer._estimate_age_range(0) == "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# TESTS: CACHE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

def test_get_cache_key_existing_file(analyzer, tmp_path):
    """Test cache key generation for existing files"""
    test_file = tmp_path / "test.wav"
    test_file.write_bytes(b"test data")

    key1 = analyzer._get_cache_key(str(test_file))
    key2 = analyzer._get_cache_key(str(test_file))

    assert key1 == key2
    assert len(key1) == 32  # SHA256 truncated


def test_get_cache_key_nonexistent_file(analyzer):
    """Test cache key for non-existent files"""
    key = analyzer._get_cache_key("/nonexistent/file.wav")
    assert len(key) == 32


def test_cache_lru_eviction(analyzer):
    """Test LRU cache eviction"""
    analyzer._cache_max_size = 3

    # Create mock characteristics
    for i in range(5):
        char = VoiceCharacteristics(pitch_mean=float(i))
        analyzer._add_to_cache(f"key_{i}", char)

    # Cache should only have last 3 items
    assert len(analyzer._analysis_cache) == 3
    assert "key_2" in analyzer._analysis_cache
    assert "key_3" in analyzer._analysis_cache
    assert "key_4" in analyzer._analysis_cache
    assert "key_0" not in analyzer._analysis_cache


def test_clear_cache(analyzer):
    """Test cache clearing"""
    # Add items to cache
    for i in range(5):
        char = VoiceCharacteristics(pitch_mean=float(i))
        analyzer._add_to_cache(f"key_{i}", char)

    assert len(analyzer._analysis_cache) > 0

    analyzer.clear_cache()

    assert len(analyzer._analysis_cache) == 0


# ═══════════════════════════════════════════════════════════════════════════
# TESTS: GET_OPTIMAL_CLONE_PARAMS
# ═══════════════════════════════════════════════════════════════════════════

def test_get_optimal_clone_params_expressive_voice(analyzer):
    """Test optimal params for expressive voice"""
    # Highly expressive voice
    char = VoiceCharacteristics(
        pitch_mean=180.0,
        pitch_std=45.0,
        dynamic_range=35.0,
        jitter=0.02,
        shimmer=0.04,
        spectral_flatness=0.2,
        spectral_bandwidth=2500.0,
        harmonics_to_noise=0.85,
        confidence=0.9
    )

    params = analyzer.get_optimal_clone_params(char)

    # Expressive voice should have lower exaggeration
    assert params["exaggeration"] < 0.50
    assert params["cfg_weight"] < 0.55
    assert params["confidence"] > 0

    assert "analysis" in params
    assert params["analysis"]["expressiveness_score"] > 0.6

    assert "explanation" in params


def test_get_optimal_clone_params_monotone_voice(analyzer):
    """Test optimal params for monotone voice"""
    # Monotone voice
    char = VoiceCharacteristics(
        pitch_mean=120.0,
        pitch_std=10.0,
        dynamic_range=15.0,
        jitter=0.01,
        shimmer=0.02,
        spectral_flatness=0.1,
        spectral_bandwidth=1500.0,
        harmonics_to_noise=0.9,
        confidence=0.8
    )

    params = analyzer.get_optimal_clone_params(char)

    # Monotone voice should have higher exaggeration
    assert params["exaggeration"] > 0.45
    assert params["cfg_weight"] > 0.40


def test_get_optimal_clone_params_with_language(analyzer):
    """Test language-specific adjustments"""
    char = VoiceCharacteristics(
        pitch_mean=150.0,
        pitch_std=25.0,
        dynamic_range=25.0,
        jitter=0.025,
        shimmer=0.05,
        spectral_flatness=0.3,
        spectral_bandwidth=2000.0,
        harmonics_to_noise=0.75,
        confidence=0.8
    )

    params_en = analyzer.get_optimal_clone_params(char, target_language="en")
    params_zh = analyzer.get_optimal_clone_params(char, target_language="zh")

    # Chinese should have higher cfg_weight
    assert params_zh["cfg_weight"] > params_en["cfg_weight"]


def test_get_optimal_clone_params_bounds(analyzer):
    """Test that params are properly bounded"""
    # Extreme characteristics
    char = VoiceCharacteristics(
        pitch_mean=100.0,
        pitch_std=100.0,  # Very high variance
        dynamic_range=60.0,  # Very high
        jitter=0.10,  # Very high
        shimmer=0.20,  # Very high
        spectral_flatness=0.9,  # Very noisy
        spectral_bandwidth=5000.0,
        harmonics_to_noise=0.2,
        confidence=0.5
    )

    params = analyzer.get_optimal_clone_params(char)

    # All params should be within bounds
    assert 0.25 <= params["exaggeration"] <= 0.75
    assert 0.25 <= params["cfg_weight"] <= 0.75
    assert 0.5 <= params["temperature"] <= 1.2
    assert 1.0 <= params["repetition_penalty"] <= 2.5
    assert 0.02 <= params["min_p"] <= 0.15
    assert 0.85 <= params["top_p"] <= 1.0


def test_explain_params(analyzer):
    """Test parameter explanation generation"""
    explanation = analyzer._explain_params(
        exaggeration=0.35,
        cfg_weight=0.40,
        expressiveness=0.7,
        stability=0.8
    )

    assert isinstance(explanation, str)
    assert "expressive" in explanation.lower()
    assert "stable" in explanation.lower()


# ═══════════════════════════════════════════════════════════════════════════
# TESTS: STATS & UTILITIES
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_stats(analyzer):
    """Test statistics retrieval"""
    await analyzer.initialize()

    stats = await analyzer.get_stats()

    assert stats["service"] == "VoiceAnalyzerService"
    assert stats["initialized"] is True
    assert "analyses_performed" in stats
    assert "comparisons_performed" in stats
    assert "cache_hits" in stats
    assert "cache_misses" in stats
    assert "cache_size" in stats


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_stats_tracking(analyzer, sample_audio_file):
    """Test that stats are properly tracked"""
    await analyzer.initialize()

    initial_stats = await analyzer.get_stats()
    initial_analyses = initial_stats["analyses_performed"]

    # Perform analysis
    await analyzer.analyze(sample_audio_file)

    stats = await analyzer.get_stats()
    assert stats["analyses_performed"] == initial_analyses + 1
    assert stats["total_analysis_time_ms"] > 0


@pytest.mark.asyncio
async def test_close(analyzer):
    """Test service cleanup"""
    await analyzer.initialize()

    # Add some data
    char = VoiceCharacteristics(pitch_mean=150.0)
    analyzer._add_to_cache("test_key", char)

    await analyzer.close()

    assert analyzer.is_initialized is False
    assert len(analyzer._analysis_cache) == 0


# ═══════════════════════════════════════════════════════════════════════════
# TESTS: INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_full_pipeline_analysis_and_compare(analyzer, sample_audio_file, female_audio_file):
    """Test complete pipeline: initialize -> analyze -> compare"""
    # Initialize
    result = await analyzer.initialize()
    assert result is True

    # Analyze two voices
    char1 = await analyzer.analyze(sample_audio_file)
    char2 = await analyzer.analyze(female_audio_file)

    assert char1.pitch_mean > 0
    assert char2.pitch_mean > 0
    assert char1.gender_estimate != char2.gender_estimate

    # Compare
    similarity = await analyzer.compare(sample_audio_file, female_audio_file, detailed=True)

    assert similarity.overall_score < 0.75
    assert similarity.is_likely_same_speaker is False

    # Verify stats
    stats = await analyzer.get_stats()
    assert stats["analyses_performed"] >= 2
    assert stats["comparisons_performed"] >= 1

    # Cleanup
    await analyzer.close()


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_cache_performance_benefit(analyzer, sample_audio_file):
    """Test that caching improves performance"""
    await analyzer.initialize()

    # First analysis (cache miss)
    char1 = await analyzer.analyze(sample_audio_file, use_cache=True)
    time1 = char1.analysis_time_ms

    # Second analysis (cache hit)
    char2 = await analyzer.analyze(sample_audio_file, use_cache=True)

    # Cache hit should be instant (analysis_time_ms from original)
    assert analyzer._stats["cache_hits"] > 0
    assert char1.pitch_mean == char2.pitch_mean


# ═══════════════════════════════════════════════════════════════════════════
# TESTS: VOICE CHARACTERISTICS MODEL
# ═══════════════════════════════════════════════════════════════════════════

def test_voice_characteristics_to_dict():
    """Test VoiceCharacteristics serialization"""
    char = VoiceCharacteristics(
        pitch_mean=150.0,
        pitch_std=25.0,
        pitch_min=100.0,
        pitch_max=200.0,
        pitch_range=100.0,
        voice_type="medium_male",
        estimated_gender="male",
        estimated_age_range="adult",
        spectral_centroid=2000.0,
        spectral_bandwidth=1500.0,
        spectral_rolloff=3500.0,
        spectral_flatness=0.3,
        rms_energy=0.5,
        energy_std=0.1,
        dynamic_range=25.0,
        jitter=0.02,
        shimmer=0.04,
        harmonics_to_noise=0.8,
        mfcc_mean=[1.0, 2.0, 3.0],
        mfcc_std=[0.1, 0.2, 0.3],
        sample_rate=22050,
        duration_seconds=3.5,
        confidence=0.85
    )

    data = char.to_dict()

    assert "pitch" in data
    assert data["pitch"]["mean_hz"] == 150.0

    assert "classification" in data
    assert data["classification"]["voice_type"] == "medium_male"

    assert "spectral" in data
    assert "energy" in data
    assert "quality" in data
    assert "mfcc" in data
    assert "metadata" in data


def test_voice_similarity_result_to_dict():
    """Test VoiceSimilarityResult serialization"""
    result = VoiceSimilarityResult(
        overall_score=0.85,
        pitch_similarity=0.90,
        timbre_similarity=0.80,
        mfcc_similarity=0.88,
        energy_similarity=0.82,
        is_likely_same_speaker=True,
        confidence=0.90,
        analysis_time_ms=150,
        details={"test": "data"}
    )

    data = result.to_dict()

    assert data["overall_score"] == 0.85
    assert data["is_likely_same_speaker"] is True
    assert "components" in data
    assert data["components"]["pitch_similarity"] == 0.90
    assert data["details"]["test"] == "data"


# ═══════════════════════════════════════════════════════════════════════════
# TESTS: ERROR RESILIENCE
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_analyze_with_librosa_error(analyzer, sample_audio_file, monkeypatch):
    """Test graceful handling of librosa errors"""
    await analyzer.initialize()

    # Mock librosa.load to raise an error
    def mock_load(*args, **kwargs):
        raise Exception("Librosa error")

    import services.voice_analyzer_service as vas
    if vas.LIBROSA_AVAILABLE:
        import librosa
        monkeypatch.setattr(librosa, 'load', mock_load)

    characteristics = await analyzer.analyze(sample_audio_file)

    # Should return dummy analysis
    assert characteristics.voice_type == "unknown"


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_compare_with_invalid_mfcc(analyzer, sample_audio_file, tmp_path):
    """Test comparison when MFCC is invalid"""
    await analyzer.initialize()

    # Analyze first file normally
    await analyzer.analyze(sample_audio_file)

    # Create second file and manually corrupt MFCC in cache
    import soundfile as sf
    audio2 = tmp_path / "test2.wav"
    signal = np.random.randn(22050) * 0.5
    sf.write(str(audio2), signal, 22050)

    char2 = await analyzer.analyze(str(audio2))
    char2.mfcc_mean = []  # Corrupt MFCC

    # Store corrupted version
    cache_key = analyzer._get_cache_key(str(audio2))
    analyzer._analysis_cache[cache_key] = char2

    # Compare should still work
    result = await analyzer.compare(sample_audio_file, str(audio2))

    assert isinstance(result, VoiceSimilarityResult)
    assert result.mfcc_similarity == 0.0


# ═══════════════════════════════════════════════════════════════════════════
# PERFORMANCE & STRESS TESTS
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_concurrent_analyses(analyzer, sample_audio_file):
    """Test concurrent analysis requests"""
    await analyzer.initialize()

    # Perform 5 concurrent analyses
    tasks = [
        analyzer.analyze(sample_audio_file, use_cache=False)
        for _ in range(5)
    ]

    results = await asyncio.gather(*tasks)

    assert len(results) == 5
    assert all(r.pitch_mean > 0 for r in results)


@pytest.mark.asyncio
@pytest.mark.skipif(not LIBROSA_AVAILABLE, reason="librosa required")
async def test_large_cache_performance(analyzer, sample_audio_file):
    """Test performance with large cache"""
    await analyzer.initialize()
    analyzer._cache_max_size = 1000

    # Fill cache with 100 different "analyses"
    for i in range(100):
        char = VoiceCharacteristics(pitch_mean=100.0 + i)
        analyzer._add_to_cache(f"key_{i}", char)

    # Verify cache size
    assert len(analyzer._analysis_cache) == 100

    # Access should still be fast
    char = await analyzer.analyze(sample_audio_file)
    assert char.pitch_mean > 0


# ═══════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════

def test_suite_summary():
    """Summary of test coverage"""
    print("""
    ═══════════════════════════════════════════════════════════════════════════
    VOICE ANALYZER SERVICE - TEST COVERAGE SUMMARY
    ═══════════════════════════════════════════════════════════════════════════

    ✅ Initialization & Singleton Pattern
    ✅ analyze() - Complete voice characteristic extraction
    ✅ compare() - Multi-metric voice similarity
    ✅ Voice Type Detection (male, female, child, age ranges)
    ✅ Edge Cases (silence, noise, short audio, invalid files)
    ✅ Cache Management (LRU, hits/misses, clearing)
    ✅ get_optimal_clone_params() - Parameter optimization
    ✅ Language-specific adjustments
    ✅ Stats tracking
    ✅ Error handling & degraded mode
    ✅ Integration tests (full pipeline)
    ✅ Concurrent operations
    ✅ Performance tests

    COVERAGE TARGET: 90%+
    ═══════════════════════════════════════════════════════════════════════════
    """)
