"""
Test WAV Conversion at Pipeline Entry
======================================

Validates that:
1. convert_to_wav_if_needed is called exactly ONCE at pipeline entry
2. All downstream stages receive the converted WAV path (not the original m4a/mp3)
3. WAV files pass through without conversion
4. Conversion failure falls back to original path gracefully
5. No redundant conversion in diarization (_apply_diarization)
6. Unit behavior of convert_to_wav_if_needed itself
"""

import sys
import os
import pytest
import tempfile
import shutil
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch
from dataclasses import dataclass, field
from typing import Optional, List, Any, Dict

# Add src to path so services.* and utils.* resolve correctly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


# ═══════════════════════════════════════════════════════════════
# Minimal mock dataclasses matching pipeline expectations
# Must mirror TranscriptionStageResult from transcription_stage.py
# ═══════════════════════════════════════════════════════════════

@dataclass
class FakeTranscriptionSegment:
    text: str
    start_ms: int
    end_ms: int
    confidence: float = 0.95
    speaker_id: Optional[str] = None
    voice_similarity_score: Optional[float] = None
    language: Optional[str] = None


@dataclass
class FakeTranscriptionStageResult:
    """Mirrors TranscriptionStageResult fields accessed by the pipeline."""
    text: str
    language: str
    confidence: float
    duration_ms: int
    source: str
    segments: Optional[list] = None
    audio_hash: str = ""
    speaker_count: Optional[int] = None
    primary_speaker_id: Optional[str] = None
    sender_voice_identified: Optional[bool] = None
    sender_speaker_id: Optional[str] = None
    speaker_analysis: Optional[Dict[str, Any]] = None
    diarization_speakers: Optional[List[Any]] = None


# ═══════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════

@pytest.fixture
def temp_dir():
    d = tempfile.mkdtemp(prefix="meeshy_wav_test_")
    yield Path(d)
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def m4a_audio_path(temp_dir):
    """Simulate an m4a file (just needs to exist for path checks)."""
    p = temp_dir / "voice_message.m4a"
    p.write_bytes(b"\x00" * 100)
    return str(p)


@pytest.fixture
def wav_audio_path(temp_dir):
    """Simulate a WAV file."""
    p = temp_dir / "voice_message.wav"
    p.write_bytes(b"RIFF" + b"\x00" * 40)
    return str(p)


@pytest.fixture
def converted_wav_path(temp_dir):
    """The path that convert_to_wav_if_needed would return for m4a."""
    p = temp_dir / "voice_message.converted.wav"
    p.write_bytes(b"RIFF" + b"\x00" * 40)
    return str(p)


@pytest.fixture(autouse=True)
def reset_pipeline_singleton():
    """Reset AudioMessagePipeline singleton between tests."""
    yield
    try:
        from services.audio_pipeline.audio_message_pipeline import AudioMessagePipeline
        AudioMessagePipeline._instance = None
    except ImportError:
        pass


def _make_fake_transcription():
    """Create a minimal fake TranscriptionStageResult with all required fields."""
    return FakeTranscriptionStageResult(
        text="Bonjour, comment ca va?",
        language="fr",
        confidence=0.95,
        segments=[
            FakeTranscriptionSegment("Bonjour,", 0, 800),
            FakeTranscriptionSegment("comment ca va?", 800, 2500),
        ],
        duration_ms=2500,
        source="whisper",
        audio_hash="abc123",
        speaker_count=1,
    )


def _make_mock_pipeline():
    """Create a properly mocked AudioMessagePipeline instance.

    Resets the singleton, creates a fresh instance, and wires up all async mocks
    so that process_audio_message() can run without import errors from heavy deps.
    """
    from services.audio_pipeline.audio_message_pipeline import AudioMessagePipeline

    # Reset singleton to get a fresh instance
    AudioMessagePipeline._instance = None
    pipeline = AudioMessagePipeline.__new__(AudioMessagePipeline)
    pipeline.is_initialized = True

    # Transcription stage
    pipeline.transcription_stage = MagicMock()
    pipeline.transcription_stage.process = AsyncMock(
        return_value=_make_fake_transcription()
    )

    # Translation stage — create_voice_model is awaited and must return a tuple
    pipeline.translation_stage = MagicMock()
    pipeline.translation_stage.create_voice_model = AsyncMock(
        return_value=(None, "user1")  # (voice_model, user_id)
    )
    pipeline.translation_stage.process_languages = AsyncMock(return_value={})
    pipeline.translation_stage.voice_clone_service = None

    # Fallback for target languages (not used when target_languages kwarg is provided)
    pipeline._get_target_languages = AsyncMock(return_value=["en"])

    return pipeline


# ═══════════════════════════════════════════════════════════════
# TEST 1: convert_to_wav_if_needed is called exactly once
# ═══════════════════════════════════════════════════════════════

class TestWavConversionCalledOnce:
    """Verify that convert_to_wav_if_needed is called exactly once at pipeline entry."""

    @pytest.mark.asyncio
    async def test_m4a_triggers_single_conversion(self, m4a_audio_path, converted_wav_path):
        """An m4a file should be converted exactly once at pipeline entry."""
        with patch(
            "services.audio_pipeline.audio_message_pipeline.convert_to_wav_if_needed",
            return_value=converted_wav_path,
        ) as mock_convert:
            pipeline = _make_mock_pipeline()

            await pipeline.process_audio_message(
                audio_path=m4a_audio_path,
                audio_url="http://example.com/audio.m4a",
                sender_id="user1",
                conversation_id="conv1",
                message_id="msg1",
                attachment_id="att1",
                audio_duration_ms=5000,
                target_languages=["en"],
            )

            mock_convert.assert_called_once_with(m4a_audio_path)

    @pytest.mark.asyncio
    async def test_wav_still_calls_conversion_once(self, wav_audio_path):
        """Even for WAV files, convert_to_wav_if_needed is called (returns same path)."""
        with patch(
            "services.audio_pipeline.audio_message_pipeline.convert_to_wav_if_needed",
            return_value=wav_audio_path,
        ) as mock_convert:
            pipeline = _make_mock_pipeline()

            await pipeline.process_audio_message(
                audio_path=wav_audio_path,
                audio_url="http://example.com/audio.wav",
                sender_id="user1",
                conversation_id="conv1",
                message_id="msg1",
                attachment_id="att1",
                target_languages=["en"],
            )

            mock_convert.assert_called_once_with(wav_audio_path)


# ═══════════════════════════════════════════════════════════════
# TEST 2: Converted path propagated to all downstream stages
# ═══════════════════════════════════════════════════════════════

class TestConvertedPathPropagation:
    """Verify that all downstream stages receive the converted WAV path."""

    @pytest.mark.asyncio
    async def test_transcription_stage_receives_wav(self, m4a_audio_path, converted_wav_path):
        """Transcription stage should receive the converted WAV, not the original m4a."""
        with patch(
            "services.audio_pipeline.audio_message_pipeline.convert_to_wav_if_needed",
            return_value=converted_wav_path,
        ):
            pipeline = _make_mock_pipeline()

            await pipeline.process_audio_message(
                audio_path=m4a_audio_path,
                audio_url="http://example.com/audio.m4a",
                sender_id="user1",
                conversation_id="conv1",
                message_id="msg1",
                attachment_id="att1",
                target_languages=["en"],
            )

            pipeline.transcription_stage.process.assert_called_once()
            actual_path = pipeline.transcription_stage.process.call_args.kwargs["audio_path"]

            assert actual_path == converted_wav_path, (
                f"Transcription received '{actual_path}' instead of '{converted_wav_path}'"
            )
            assert actual_path != m4a_audio_path, (
                "Transcription received original m4a path instead of converted WAV"
            )

    @pytest.mark.asyncio
    async def test_translation_stage_receives_wav(self, m4a_audio_path, converted_wav_path):
        """Translation stage should receive the converted WAV as source_audio_path."""
        with patch(
            "services.audio_pipeline.audio_message_pipeline.convert_to_wav_if_needed",
            return_value=converted_wav_path,
        ):
            pipeline = _make_mock_pipeline()

            await pipeline.process_audio_message(
                audio_path=m4a_audio_path,
                audio_url="http://example.com/audio.m4a",
                sender_id="user1",
                conversation_id="conv1",
                message_id="msg1",
                attachment_id="att1",
                target_languages=["en"],
            )

            pipeline.translation_stage.process_languages.assert_called_once()
            call_kwargs = pipeline.translation_stage.process_languages.call_args.kwargs

            # Pipeline passes the audio path as `source_audio_path` kwarg
            actual_path = call_kwargs.get("source_audio_path")
            assert actual_path == converted_wav_path, (
                f"Translation received source_audio_path='{actual_path}' "
                f"instead of '{converted_wav_path}'"
            )

    @pytest.mark.asyncio
    async def test_callback_receives_wav(self, m4a_audio_path, converted_wav_path):
        """on_transcription_ready callback should receive the converted WAV path."""
        callback_data = {}

        async def capture_callback(data):
            callback_data.update(data)

        with patch(
            "services.audio_pipeline.audio_message_pipeline.convert_to_wav_if_needed",
            return_value=converted_wav_path,
        ):
            pipeline = _make_mock_pipeline()

            await pipeline.process_audio_message(
                audio_path=m4a_audio_path,
                audio_url="http://example.com/audio.m4a",
                sender_id="user1",
                conversation_id="conv1",
                message_id="msg1",
                attachment_id="att1",
                target_languages=["en"],
                on_transcription_ready=capture_callback,
            )

            assert "audio_path" in callback_data, "Callback should receive audio_path"
            assert callback_data["audio_path"] == converted_wav_path, (
                f"Callback received '{callback_data['audio_path']}' "
                f"instead of '{converted_wav_path}'"
            )


# ═══════════════════════════════════════════════════════════════
# TEST 3: Conversion failure gracefully falls back
# ═══════════════════════════════════════════════════════════════

class TestConversionFailureFallback:
    """Verify that conversion failure falls back to original path."""

    @pytest.mark.asyncio
    async def test_conversion_error_uses_original_path(self, m4a_audio_path):
        """If convert_to_wav_if_needed raises, pipeline should use original path."""
        with patch(
            "services.audio_pipeline.audio_message_pipeline.convert_to_wav_if_needed",
            side_effect=RuntimeError("ffmpeg not found"),
        ):
            pipeline = _make_mock_pipeline()

            # Should NOT raise — graceful fallback
            await pipeline.process_audio_message(
                audio_path=m4a_audio_path,
                audio_url="http://example.com/audio.m4a",
                sender_id="user1",
                conversation_id="conv1",
                message_id="msg1",
                attachment_id="att1",
                target_languages=["en"],
            )

            # Transcription should have been called with the ORIGINAL path (fallback)
            pipeline.transcription_stage.process.assert_called_once()
            actual_path = pipeline.transcription_stage.process.call_args.kwargs["audio_path"]
            assert actual_path == m4a_audio_path, (
                f"Expected fallback to '{m4a_audio_path}', got '{actual_path}'"
            )


# ═══════════════════════════════════════════════════════════════
# TEST 4: No redundant conversion in diarization
# ═══════════════════════════════════════════════════════════════

class TestNoDuplicateConversionInDiarization:
    """Verify that _apply_diarization does NOT call convert_to_wav_if_needed."""

    def test_diarization_does_not_convert(self):
        """_apply_diarization source should NOT contain convert_to_wav_if_needed."""
        from services.transcription_service import TranscriptionService
        import inspect

        source = inspect.getsource(TranscriptionService._apply_diarization)

        assert "convert_to_wav_if_needed" not in source, (
            "_apply_diarization should NOT call convert_to_wav_if_needed anymore. "
            "WAV conversion is now done once at pipeline entry."
        )


# ═══════════════════════════════════════════════════════════════
# TEST 5: convert_to_wav_if_needed unit behavior
# ═══════════════════════════════════════════════════════════════

class TestConvertToWavIfNeeded:
    """Unit tests for the converter utility itself."""

    def test_wav_returns_same_path(self, wav_audio_path):
        """WAV files should be returned as-is without conversion."""
        from utils.audio_format_converter import convert_to_wav_if_needed

        result = convert_to_wav_if_needed(wav_audio_path)
        assert result == wav_audio_path, "WAV file should not be converted"

    def test_m4a_triggers_conversion(self, temp_dir):
        """M4A files should trigger pydub/ffmpeg conversion."""
        m4a_path = temp_dir / "test_conv.m4a"
        m4a_path.write_bytes(b"\x00" * 100)

        from utils.audio_format_converter import convert_to_wav_if_needed, _conversion_cache

        # Clear any stale cache entry
        _conversion_cache.pop(str(m4a_path), None)

        # Mock the pydub module injected via sys.modules
        # (converter does `from pydub import AudioSegment as PydubAudioSegment` inside the function)
        mock_pydub = MagicMock()
        mock_audio = MagicMock()
        mock_audio.channels = 1
        mock_audio.set_sample_width.return_value = mock_audio
        mock_audio.set_channels.return_value = mock_audio
        mock_pydub.AudioSegment.from_file.return_value = mock_audio

        with patch.dict(sys.modules, {'pydub': mock_pydub}):
            result = convert_to_wav_if_needed(str(m4a_path), cache=False)

            mock_pydub.AudioSegment.from_file.assert_called_once_with(str(m4a_path))
            mock_audio.export.assert_called_once()
            assert result != str(m4a_path), "M4A should be converted to a different path"
            assert result.endswith('.converted.wav')

    def test_cache_avoids_reconversion(self, temp_dir):
        """Second call with same path should use cache and skip conversion."""
        m4a_path = temp_dir / "cached_test.m4a"
        m4a_path.write_bytes(b"\x00" * 100)
        cached_wav = temp_dir / "cached_test.converted.wav"
        cached_wav.write_bytes(b"RIFF" + b"\x00" * 40)

        from utils.audio_format_converter import convert_to_wav_if_needed, _conversion_cache

        # Prime the cache — converter returns early if path is in cache + file exists
        _conversion_cache[str(m4a_path)] = str(cached_wav)

        try:
            result = convert_to_wav_if_needed(str(m4a_path), cache=True)
            assert result == str(cached_wav), "Should return cached path"
        finally:
            _conversion_cache.pop(str(m4a_path), None)
