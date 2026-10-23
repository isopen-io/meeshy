"""
#11268 — la diarization complète ne tourne que si une sonde bon marché entend
PLUSIEURS voix. La sonde ne calcule que quelques empreintes de voix (ECAPA),
sur des fenêtres réparties dans l'audio, au lieu d'une par seconde ; deux
empreintes trop éloignées suffisent à dire « plusieurs locuteurs ».
"""

import asyncio

import pytest

from services.audio_pipeline.speaker_probe import (
    DIARIZATION_MODES,
    ProbeDecision,
    diarization_mode,
    looks_multi_speaker,
    probe_windows,
    should_diarize,
)


def test_probe_windows_are_spread_across_the_audio_and_stay_inside_it():
    windows = probe_windows(30_000, window_ms=2_000, count=4)

    assert len(windows) == 4
    assert windows[0][0] >= 0
    assert windows[-1][1] <= 30_000
    assert all(end - start == 2_000 for start, end in windows)
    assert [start for start, _ in windows] == sorted(start for start, _ in windows)
    assert windows[-1][0] - windows[0][0] >= 20_000


def test_too_short_an_audio_is_not_probed():
    assert probe_windows(5_000, window_ms=2_000, count=4) == []


def test_one_voice_is_one_speaker():
    same = [[1.0, 0.0, 0.1], [0.98, 0.05, 0.1], [0.97, 0.0, 0.15], [1.0, 0.02, 0.12]]
    assert looks_multi_speaker(same, threshold=0.6) is False


def test_two_distant_voices_are_several_speakers():
    two = [[1.0, 0.0, 0.0], [0.99, 0.05, 0.0], [0.0, 1.0, 0.1], [0.05, 0.98, 0.1]]
    assert looks_multi_speaker(two, threshold=0.6) is True


def test_fewer_than_two_embeddings_say_one_speaker():
    assert looks_multi_speaker([[1.0, 0.0]], threshold=0.6) is False
    assert looks_multi_speaker([], threshold=0.6) is False


def test_the_mode_defaults_to_auto_and_reads_always():
    assert DIARIZATION_MODES == ("auto", "always")
    assert diarization_mode({}) == "auto"
    assert diarization_mode({"DIARIZATION_MODE": "always"}) == "always"
    assert diarization_mode({"DIARIZATION_MODE": "nimporte"}) == "auto"


def _probe(answer, calls):
    async def probe(path):
        calls.append(path)
        return answer

    return probe


def test_auto_runs_the_full_diarization_only_when_the_probe_hears_several_voices():
    calls = []
    assert asyncio.run(should_diarize("a.wav", mode="auto", probe=_probe(True, calls))) == ProbeDecision.DIARIZE
    assert asyncio.run(should_diarize("b.wav", mode="auto", probe=_probe(False, calls))) == ProbeDecision.SKIP
    assert calls == ["a.wav", "b.wav"]


def test_always_skips_the_probe():
    calls = []
    assert asyncio.run(should_diarize("a.wav", mode="always", probe=_probe(False, calls))) == ProbeDecision.DIARIZE
    assert calls == []


def test_a_probe_that_fails_falls_back_to_the_full_diarization():
    async def broken(path):
        raise RuntimeError("encodeur indisponible")

    assert asyncio.run(should_diarize("a.wav", mode="auto", probe=broken)) == ProbeDecision.DIARIZE


class _Info:
    language = "fr"
    language_probability = 0.97
    duration = 30.0


class _Word:
    def __init__(self, word, start, end):
        self.word, self.start, self.end, self.probability = word, start, end, 0.9


class _Segment:
    def __init__(self):
        self.text = "Bonjour à tous"
        self.start, self.end = 0.0, 1.5
        self.words = [_Word("Bonjour", 0.0, 0.6), _Word("à", 0.7, 0.8), _Word("tous", 0.9, 1.5)]


def _transcribe_with(monkeypatch, several_voices: bool):
    from unittest.mock import AsyncMock

    from services import transcription_service as module

    service = module.TranscriptionService.__new__(module.TranscriptionService)
    service._model_id = "stt_whisper_test"
    monkeypatch.setattr(module, "get_stt_model", lambda _model_id: object())
    monkeypatch.setattr(module, "probe_multi_speaker", AsyncMock(return_value=several_voices))
    monkeypatch.setenv("ENABLE_DIARIZATION", "true")
    monkeypatch.delenv("DIARIZATION_MODE", raising=False)
    monkeypatch.setattr(service, "_run_whisper", AsyncMock(return_value=([_Segment()], _Info())), raising=False)
    diarize = AsyncMock(return_value=None)
    apply = AsyncMock(side_effect=lambda path, result, **kwargs: result)
    monkeypatch.setattr(service, "_run_diarization", diarize, raising=False)
    monkeypatch.setattr(service, "_apply_diarization", apply, raising=False)
    result = asyncio.run(service.transcribe("vocal.wav"))
    return result, diarize, apply


def test_a_one_voice_vocal_is_transcribed_without_any_diarization(monkeypatch):
    result, diarize, apply = _transcribe_with(monkeypatch, several_voices=False)

    assert result.text == "Bonjour à tous"
    diarize.assert_not_called()
    apply.assert_not_called()


def test_a_several_voices_vocal_is_diarized(monkeypatch):
    _, diarize, _ = _transcribe_with(monkeypatch, several_voices=True)

    diarize.assert_awaited_once_with("vocal.wav")
