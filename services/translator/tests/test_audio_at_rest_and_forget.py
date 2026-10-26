"""
#13102 — ce que le translator tire d'une pièce ou d'un texte ne survit ni au
régime au repos, ni à l'effacement.

1. Une tâche audio d'une conversation `server` / `hybrid` (`atRest: true`) ne
   lit ni n'écrit rien dans Redis : transcription, traductions, pistes TTS,
   table `attachmentId → empreinte`. Son texte ne figure dans aucun journal.
2. Une demande d'oubli efface, pour une pièce, sa transcription et ses pistes
   (par empreinte et par identifiant) et, pour un message, les traductions
   rangées pour lui, segments compris ; elle ne porte que des identifiants et
   s'acquitte par `cache_forget_done`. Idempotente.
"""

import asyncio
import fnmatch
import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.redis_service import AudioCacheService, TranslationCacheService
from services.task_privacy import at_rest_scope, current_message_id, in_at_rest_task, message_scope, request_is_at_rest, shown, task_scope
from services.cache_forget import forget_cached_content, parse_forget_request
from utils.text_segmentation import TextSegmenter

ATTACHMENT = "aaaaaaaaaaaaaaaaaaaaaaa1"
MESSAGE = "bbbbbbbbbbbbbbbbbbbbbbb1"
OTHER_MESSAGE = "bbbbbbbbbbbbbbbbbbbbbbb2"
OTHER = "aaaaaaaaaaaaaaaaaaaaaaa2"
SECRET = "Le code du coffre est 4471, porte B. Rendez-vous demain à la gare du Nord."
STRUCTURED = "Le code du coffre est 4471, porte B.\n\nRendez-vous demain à la gare du Nord, quai 3, avec la valise.\n\n- clé sous le paillasson"


class FakeRedis:
    def __init__(self):
        self.store = {}

    async def get(self, key):
        return self.store.get(key)

    async def setex(self, key, ttl, value):
        self.store[key] = value
        return True

    async def delete(self, key):
        self.store.pop(key, None)
        return True

    async def exists(self, key):
        return key in self.store

    async def keys(self, pattern):
        return [k for k in self.store if fnmatch.fnmatchcase(k, pattern)]

    def get_stats(self):
        return {}


def _caches(tmp_path):
    redis = FakeRedis()
    audio = AudioCacheService(redis)
    text = TranslationCacheService(redis)
    audio_file = tmp_path / "voice.m4a"
    audio_file.write_bytes(b"\x00\x00\x00 ftypM4A voix secrete")
    return redis, audio, text, str(audio_file)


async def _fill(audio, text, audio_path, attachment_id=ATTACHMENT):
    audio_hash = await audio.get_or_compute_audio_hash(attachment_id, audio_path)
    await audio.set_transcription_by_hash(audio_hash, {"text": SECRET})
    await audio.set_translated_audio_by_hash(audio_hash, "en", {"translated_text": "The safe code"})
    await audio.set_translated_audio_by_hash(audio_hash, "es", {"translated_text": "El código"})
    await audio.set_transcription(attachment_id, {"text": SECRET})
    await audio.set_translated_audio(attachment_id, "en", {"translated_text": "The safe code"})
    await text.set_translation(SECRET, "fr", "en", "EN", "premium")
    return audio_hash


@pytest.mark.unit
def test_only_the_true_boolean_declares_a_request_at_rest():
    assert request_is_at_rest({"atRest": True}) is True
    assert request_is_at_rest({"atRest": "true"}) is False
    assert request_is_at_rest({}) is False


@pytest.mark.unit
async def test_an_at_rest_task_stores_nothing_and_reads_nothing(tmp_path):
    redis, audio, text, audio_path = _caches(tmp_path)
    with at_rest_scope(True):
        await _fill(audio, text, audio_path)
    assert redis.store == {}

    await _fill(audio, text, audio_path, OTHER)
    assert redis.store
    other_hash = await audio.get_or_compute_audio_hash(OTHER, audio_path)
    with at_rest_scope(True):
        assert await audio.get_transcription_by_hash(other_hash) is None
        assert await audio.get_translated_audio_by_hash(other_hash, "en") is None
        assert await audio.get_transcription(OTHER) is None
        assert await text.get_translation(SECRET, "fr", "en", "premium") is None
    assert await audio.get_transcription_by_hash(other_hash) == {"text": SECRET}


@pytest.mark.unit
async def test_the_regime_follows_each_concurrent_task_without_contaminating_another():
    seen = {}

    async def task(name, flag):
        with at_rest_scope(flag):
            await asyncio.sleep(0)
            inner = await asyncio.gather(asyncio.sleep(0, result=in_at_rest_task()))
            seen[name] = (in_at_rest_task(), inner[0])

    await asyncio.gather(task("au-repos", True), task("ordinaire", False))
    assert seen == {"au-repos": (True, True), "ordinaire": (False, False)}
    assert in_at_rest_task() is False


@pytest.mark.unit
def test_a_log_of_an_at_rest_task_says_the_length_never_the_text():
    assert shown(SECRET, 20) == SECRET[:20]
    with at_rest_scope(True):
        assert SECRET[:10] not in shown(SECRET, 20)
        assert str(len(SECRET)) in shown(SECRET, 20)


@pytest.mark.unit
async def test_forgetting_a_piece_erases_its_transcription_tracks_and_mapping(tmp_path):
    redis, audio, text, audio_path = _caches(tmp_path)
    await _fill(audio, text, audio_path)
    await _fill(audio, text, audio_path, OTHER)
    other_keys = {k for k in redis.store if OTHER in k}

    request = parse_forget_request({"requestId": "r1", "attachmentIds": [ATTACHMENT]})
    deleted = await forget_cached_content(audio, text, request)

    assert deleted > 0
    assert not [k for k in redis.store if k.startswith("audio:") and ATTACHMENT in k]
    assert other_keys <= set(redis.store)
    assert await forget_cached_content(audio, text, request) == 0


@pytest.mark.unit
async def test_forgetting_a_message_erases_its_translations_segments_included_by_id_only(tmp_path):
    redis, audio, text, audio_path = _caches(tmp_path)
    segments, _ = TextSegmenter(max_segment_length=100).segment_text(STRUCTURED)
    pieces = [STRUCTURED] + [seg["text"] for seg in segments if seg.get("type", "line") == "line" and seg.get("text", "").strip()]
    assert len(pieces) > 2
    with message_scope(MESSAGE):
        for piece in pieces:
            for model in ("basic", "premium"):
                await text.set_translation(piece, "fr", "en", f"EN:{piece}", model)
    with message_scope(OTHER_MESSAGE):
        await text.set_translation("Bonjour", "fr", "en", "Hello", "basic")

    request = parse_forget_request({"requestId": "r2", "messageIds": [MESSAGE]})
    deleted = await forget_cached_content(audio, text, request)

    assert deleted == 2 * len(pieces)
    assert [json.loads(v)["translated_text"] for k, v in redis.store.items() if k.startswith("translation:text:")] == ["Hello"]
    assert not [k for k in redis.store if MESSAGE in k]
    assert await forget_cached_content(audio, text, request) == 0


@pytest.mark.unit
async def test_an_at_rest_message_leaves_no_index_either(tmp_path):
    redis, audio, text, audio_path = _caches(tmp_path)
    with task_scope(True, MESSAGE):
        await text.set_translation(SECRET, "fr", "en", "EN", "premium")
    assert redis.store == {}


@pytest.mark.unit
def test_a_forget_request_is_read_as_data():
    request = parse_forget_request({
        "requestId": "r3",
        "attachmentIds": [ATTACHMENT, "../../etc", 42, "zzzzzzzzzzzzzzzzzzzzzzzz", ATTACHMENT],
        "messageIds": [MESSAGE, "*", None],
        "texts": [{"text": SECRET}],
    })
    assert request == {"requestId": "r3", "attachmentIds": [ATTACHMENT], "messageIds": [MESSAGE]}
    assert parse_forget_request({"requestId": "x" * 65})["requestId"] is None
    with message_scope("not-an-id"):
        assert current_message_id() is None


@pytest.mark.unit
async def test_the_handler_acknowledges_a_forget_with_its_request_id(monkeypatch, caplog):
    from services import zmq_translation_handler as module
    from services import redis_service

    redis = FakeRedis()
    monkeypatch.setattr(redis_service, "get_audio_cache_service", lambda *a, **k: AudioCacheService(redis))
    monkeypatch.setattr(redis_service, "get_translation_cache_service", lambda *a, **k: TranslationCacheService(redis))
    socket = SimpleNamespace(send=AsyncMock())
    handler = module.TranslationHandler(pool_manager=SimpleNamespace(), pub_socket=socket)

    caplog.set_level(logging.INFO)
    await handler._handle_cache_forget({"type": "cache_forget", "requestId": "req-42", "attachmentIds": [ATTACHMENT], "messageIds": [MESSAGE]})

    sent = json.loads(socket.send.call_args.args[0].decode("utf-8"))
    assert sent == {"type": "cache_forget_done", "requestId": "req-42", "deleted": 0}
    assert SECRET[:15] not in caplog.text


@pytest.mark.unit
async def test_an_audio_request_runs_under_the_regime_it_declares():
    from services.task_privacy import under_declared_regime

    seen = []

    class Handler:
        @under_declared_regime
        async def handle(self, request_data):
            seen.append((request_data.get("atRest"), in_at_rest_task(), current_message_id()))

    await Handler().handle({"atRest": True, "messageId": MESSAGE})
    await Handler().handle({})
    assert seen == [(True, True, MESSAGE), (None, False, None)]
    assert in_at_rest_task() is False


@pytest.mark.unit
def test_both_audio_entry_points_run_under_the_declared_regime():
    from services import zmq_audio_handler, zmq_transcription_handler

    for method in (zmq_audio_handler.AudioHandler._handle_audio_process_request,
                   zmq_transcription_handler.TranscriptionHandler._handle_transcription_only_request):
        assert method.__wrapped__ is not method
        assert method.__qualname__.endswith(("_handle_audio_process_request", "_handle_transcription_only_request"))


@pytest.mark.unit
async def test_the_core_router_routes_a_forget_request_to_its_handler():
    from unittest.mock import MagicMock
    from services.zmq_server_core import ZMQTranslationServer

    core = ZMQTranslationServer.__new__(ZMQTranslationServer)
    core.active_tasks = set()
    core.translation_handler = MagicMock()
    core.translation_handler._handle_cache_forget = AsyncMock()
    core.audio_handler = MagicMock()
    core.transcription_handler = MagicMock()
    core.voice_handler = None
    core._create_tracked_task = MagicMock()
    core._inject_binary_frames = MagicMock()

    await core._handle_translation_request_multipart([json.dumps({"type": "cache_forget", "requestId": "r", "attachmentIds": [ATTACHMENT]}).encode("utf-8")])

    _, label = core._create_tracked_task.call_args[0]
    assert label == "cache_forget"
    core.translation_handler._handle_cache_forget.assert_called_once()
    assert core.translation_handler._handle_cache_forget.call_args[0][0]["attachmentIds"] == [ATTACHMENT]
