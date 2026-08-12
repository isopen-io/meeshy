"""
Test 31: Synthesizer output format contract

Regression tests for the TTS output-format contract in services/tts/synthesizer.py.

The backends write their raw audio with `torchaudio.save()`, which only supports
a subset of containers (wav/mp3/ogg — NOT opus). Encoding to the delivery format
is the job of `_convert_format()` (pydub/ffmpeg, libopus).

The synthesizer must therefore always hand the backend a path the backend can
actually write (WAV), then transcode to the requested format. Passing the final
`.opus` path straight to the backend raises
`ValueError: Unsupported format: opus` and kills the whole language branch —
the audio-message pipeline then delivers neither translated text nor audio.

The import pulls the TTS backends (torch et al.); it is skipped gracefully when
those optional deps are absent so the suite still collects, and runs fully in CI
where the translator ML stack is installed.
"""

import os
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

try:
    from services.tts.synthesizer import Synthesizer
    _IMPORT_OK = True
except Exception:  # pragma: no cover - optional heavy ML deps absent
    _IMPORT_OK = False

pytestmark = pytest.mark.skipif(
    not _IMPORT_OK,
    reason="Synthesizer import requires the TTS backend stack (torch/chatterbox)",
)

# Containers torchaudio.save() can actually write (verified on torchaudio 2.6.0).
TORCHAUDIO_WRITABLE = {"wav", "mp3", "ogg", "flac"}


class RecordingBackend:
    """Backend double mirroring torchaudio.save()'s real format support."""

    def __init__(self):
        self.received_paths = []

    async def synthesize(self, text, language, output_path, **kwargs):
        self.received_paths.append(output_path)
        ext = output_path.rsplit(".", 1)[-1].lower()
        if ext not in TORCHAUDIO_WRITABLE:
            raise ValueError(f"Unsupported format: {ext}")
        with open(output_path, "wb") as f:
            f.write(b"RIFF----WAVEfmt ")
        return output_path


@pytest.fixture
def synth(tmp_path, monkeypatch):
    """Synthesizer wired to a temp dir, with the ffmpeg-backed helpers stubbed
    so the test exercises path/format routing without requiring ffmpeg."""
    s = Synthesizer(output_dir=tmp_path, default_format="opus")

    async def fake_convert(input_path, target_format):
        converted = input_path.rsplit(".", 1)[0] + f".{target_format}"
        os.replace(input_path, converted)
        return converted

    async def fake_duration(audio_path):
        return 1000

    async def fake_speed(audio_path, speed_factor=1.0):
        return audio_path

    monkeypatch.setattr(s, "_convert_format", fake_convert)
    monkeypatch.setattr(s, "_get_duration_ms", fake_duration)
    monkeypatch.setattr(s, "_adjust_speed", fake_speed)
    return s


def _model_stubs():
    model = SimpleNamespace(value="chatterbox")
    model_info = SimpleNamespace(quality_score=90.0)
    return model, model_info


async def _synthesize(synth, backend, output_format, text="Bonjour tout le monde, ceci est un test."):
    model, model_info = _model_stubs()
    return await synth.synthesize_with_voice(
        text=text,
        target_language="en",
        backend=backend,
        model=model,
        model_info=model_info,
        output_format=output_format,
        message_id="msg123",
    )


@pytest.mark.asyncio
async def test_opus_output_hands_backend_a_writable_path(synth):
    """The backend must never be asked to write a container torchaudio can't
    encode — opus delivery is produced by the ffmpeg transcode step."""
    backend = RecordingBackend()

    await _synthesize(synth, backend, output_format="opus")

    assert backend.received_paths, "backend was never called"
    for path in backend.received_paths:
        ext = path.rsplit(".", 1)[-1].lower()
        assert ext in TORCHAUDIO_WRITABLE, f"backend got an unwritable container: {ext}"


@pytest.mark.asyncio
async def test_opus_output_is_delivered_as_opus(synth):
    """Handing the backend a WAV path must not change what the caller receives."""
    backend = RecordingBackend()

    result = await _synthesize(synth, backend, output_format="opus")

    assert result.format == "opus"
    assert result.audio_path.endswith(".opus")
    assert result.audio_url.endswith(".opus")
    assert os.path.exists(result.audio_path)


@pytest.mark.asyncio
async def test_wav_output_still_skips_transcoding(synth):
    """WAV delivery keeps the backend's file as-is (no needless round-trip)."""
    backend = RecordingBackend()

    result = await _synthesize(synth, backend, output_format="wav")

    assert result.format == "wav"
    assert result.audio_path.endswith(".wav")
    assert os.path.exists(result.audio_path)


@pytest.mark.asyncio
async def test_long_text_segmented_path_also_delivers_opus(synth):
    """The segmented branch already forced WAV; it must keep delivering opus."""
    backend = RecordingBackend()
    long_text = ". ".join(f"Phrase numero {i} avec assez de mots pour compter" for i in range(120)) + "."

    async def fake_concat(paths, output_path):
        with open(output_path, "wb") as f:
            f.write(b"RIFF----WAVEfmt ")
        return output_path

    synth._concatenate_audios = fake_concat

    result = await _synthesize(synth, backend, output_format="opus", text=long_text)

    assert len(backend.received_paths) > 1, "expected the segmented branch"
    assert result.format == "opus"
    assert result.audio_path.endswith(".opus")
