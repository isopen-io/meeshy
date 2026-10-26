"""#13102 — troisième audit adversarial, témoin (rouge avant son correctif) : la synthèse TTS SANS clone d'une tâche au repos range dans Redis (tts:audio:<sha du texte traduit>)."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.task_privacy import at_rest_scope
from services.tts import tts_service as module
from services.tts.synthesizer import UnifiedTTSResult
from services.tts.models import TTSModel, TTS_MODEL_INFO
import services.redis_service as redis_module


class RecordingRedis:
    writes = []

    def __init__(self, *a, **k):
        pass

    async def get(self, key):
        return None

    async def setex(self, key, ttl, value):
        RecordingRedis.writes.append((key, value))
        return True


@pytest.mark.unit
async def test_an_at_rest_task_never_writes_its_tts_result_to_redis(monkeypatch):
    RecordingRedis.writes = []
    monkeypatch.setattr(redis_module, "RedisService", RecordingRedis)
    service = module.UnifiedTTSService.__new__(module.UnifiedTTSService)
    model = list(TTSModel)[0]
    service.model_manager = SimpleNamespace(active_model=model)
    service.requested_model = model
    service.default_format = "mp3"
    result = UnifiedTTSResult(
        audio_path="/workspace/generated/audios/translated/x.mp3", audio_url="/outputs/audio/translated/x.mp3",
        duration_ms=900, format="mp3", language="en", voice_cloned=False, voice_quality=0.8,
        processing_time_ms=10, text_length=30, model_used=model, model_info=TTS_MODEL_INFO[model],
    )
    service.synthesize_with_voice = AsyncMock(return_value=result)
    with at_rest_scope(True):
        await service.synthesize(text="The safe code is 4471, door B.", language="en", output_format="mp3")
    assert RecordingRedis.writes == [], RecordingRedis.writes


def _result_with_tracks(paths):
    return SimpleNamespace(translations={f"l{i}": SimpleNamespace(audio_path=p) for i, p in enumerate(paths)})


def test_an_at_rest_task_leaves_no_translated_track_on_the_translator_disk(tmp_path):
    from services.zmq_audio_handler import AudioHandler

    tracks = [tmp_path / "a_en.mp3", tmp_path / "a_es.mp3"]
    for track in tracks:
        track.write_bytes(b"PISTE")
    with at_rest_scope(True):
        assert AudioHandler._forget_translated_audio_files(_result_with_tracks([str(t) for t in tracks] + [str(tmp_path / "absent.mp3")])) == 2
    assert [t.exists() for t in tracks] == [False, False]


def test_an_ordinary_task_keeps_its_translated_tracks(tmp_path):
    from services.zmq_audio_handler import AudioHandler

    track = tmp_path / "a_en.mp3"
    track.write_bytes(b"PISTE")
    with at_rest_scope(False):
        assert AudioHandler._forget_translated_audio_files(_result_with_tracks([str(track)])) == 0
    assert track.exists()
