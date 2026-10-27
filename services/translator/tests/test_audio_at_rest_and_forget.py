"""
#13102 — ce que le translator tire d'une pièce ou d'un texte ne survit ni au
régime au repos, ni à l'effacement.

1. Le cache ne sert qu'une tâche au régime ORDINAIRE déclaré : une tâche au
   repos (`atRest: true`) ou non déclarée (thread sans contexte, porte qui
   l'oublie) ne lit ni n'écrit rien dans Redis, et ses journaux taisent le texte.
2. Tout contenu rangé l'est avec son index d'effacement, dans la même
   transaction et au moins aussi longtemps : l'ensemble des empreintes d'un
   message, la correspondance pièce → empreinte et l'ensemble des langues d'une
   empreinte ou d'une pièce. Jamais dans le cache mémoire de repli.
3. Une demande d'oubli ne porte que des identifiants, lit ses index (jamais
   KEYS ni SCAN), n'acquitte que ce que Redis a confirmé. Idempotente.

Les témoins exercent un vrai `RedisService` posé sur un client Redis en
mémoire (`durable_redis_double.py`).
"""

import asyncio
import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from durable_redis_double import DictRedis, durable_service
from services.redis_service import AudioCacheService, TranslationCacheService
from services.task_privacy import (
    at_rest_scope,
    current_message_id,
    in_at_rest_task,
    message_scope,
    request_is_at_rest,
    shown,
    task_scope,
    under_declared_regime,
)
from services.cache_forget import forget_cached_content, parse_forget_request
from utils.text_segmentation import TextSegmenter

ATTACHMENT = "aaaaaaaaaaaaaaaaaaaaaaa1"
OTHER = "aaaaaaaaaaaaaaaaaaaaaaa2"
MESSAGE = "bbbbbbbbbbbbbbbbbbbbbbb1"
OTHER_MESSAGE = "bbbbbbbbbbbbbbbbbbbbbbb2"
SECRET = "Le code du coffre est 4471, porte B. Rendez-vous demain à la gare du Nord."
STRUCTURED = "Le code du coffre est 4471, porte B.\n\nRendez-vous demain à la gare du Nord, quai 3, avec la valise.\n\n- clé sous le paillasson"


def _caches(tmp_path, client=None, available=True):
    service = durable_service(client or DictRedis(), available=available)
    audio_file = tmp_path / "voice.m4a"
    audio_file.write_bytes(b"\x00\x00\x00 ftypM4A voix secrete")
    return service, AudioCacheService(service), TranslationCacheService(service), str(audio_file)


async def _fill_declared(audio, text, audio_path, attachment_id, message_id=MESSAGE):
    audio_hash = await audio.get_or_compute_audio_hash(attachment_id, audio_path)
    await audio.set_transcription_by_hash(audio_hash, {"text": SECRET}, attachment_id=attachment_id)
    await audio.set_translated_audio_by_hash(audio_hash, "en", {"translated_text": "The safe code"}, attachment_id=attachment_id)
    await audio.set_translated_audio_by_hash(audio_hash, "es", {"translated_text": "El código"}, attachment_id=attachment_id)
    await audio.set_transcription(attachment_id, {"text": SECRET})
    await audio.set_translated_audio(attachment_id, "en", {"translated_text": "The safe code"})
    await text.set_translation(SECRET, "fr", "en", "EN", "premium", message_id=message_id)
    return audio_hash


async def _fill(audio, text, audio_path, attachment_id=ATTACHMENT, message_id=MESSAGE):
    with at_rest_scope(False):
        return await _fill_declared(audio, text, audio_path, attachment_id, message_id)


# ── 1. le régime ──────────────────────────────────────────────────────────


@pytest.mark.unit
def test_only_the_true_boolean_declares_a_request_at_rest():
    assert request_is_at_rest({"atRest": True}) is True
    assert request_is_at_rest({"atRest": "true"}) is False
    assert request_is_at_rest({}) is False


@pytest.mark.unit
async def test_an_at_rest_task_stores_nothing_and_reads_nothing(tmp_path):
    service, audio, text, audio_path = _caches(tmp_path)
    with at_rest_scope(True):
        await _fill_declared(audio, text, audio_path, ATTACHMENT)
    assert service.redis.store == {}

    other_hash = await _fill(audio, text, audio_path, OTHER, OTHER_MESSAGE)
    assert service.redis.store
    with at_rest_scope(True):
        assert await audio.get_transcription_by_hash(other_hash) is None
        assert await audio.get_translated_audio_by_hash(other_hash, "en") is None
        assert await audio.get_transcription(OTHER) is None
        assert await text.get_translation(SECRET, "fr", "en", "premium") is None
    with at_rest_scope(False):
        assert await audio.get_transcription_by_hash(other_hash) == {"text": SECRET}


@pytest.mark.unit
async def test_an_undeclared_regime_is_fail_closed(tmp_path):
    service, audio, text, audio_path = _caches(tmp_path)
    await _fill_declared(audio, text, audio_path, ATTACHMENT)
    assert service.redis.store == {}
    assert in_at_rest_task() is True
    assert SECRET[:10] not in shown(SECRET, 20)


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


@pytest.mark.unit
def test_a_log_of_an_at_rest_task_says_the_length_never_the_text():
    with at_rest_scope(False):
        assert shown(SECRET, 20) == SECRET[:20]
    with at_rest_scope(True):
        assert SECRET[:10] not in shown(SECRET, 20)
        assert str(len(SECRET)) in shown(SECRET, 20)


@pytest.mark.unit
async def test_an_audio_request_runs_under_the_regime_it_declares():
    seen = []

    class Handler:
        @under_declared_regime
        async def handle(self, request_data):
            seen.append((request_data.get("atRest"), in_at_rest_task(), current_message_id()))

    await Handler().handle({"atRest": True, "messageId": MESSAGE})
    await Handler().handle({})
    assert seen == [(True, True, MESSAGE), (None, False, None)]


@pytest.mark.unit
def test_both_audio_entry_points_run_under_the_declared_regime():
    from services import zmq_audio_handler, zmq_transcription_handler

    for method in (zmq_audio_handler.AudioHandler._handle_audio_process_request,
                   zmq_transcription_handler.TranscriptionHandler._handle_transcription_only_request):
        assert method.__wrapped__ is not method


def _stage(service):
    from services.audio_pipeline.translation_stage import TranslationStage

    stage = TranslationStage.__new__(TranslationStage)
    stage.translation_cache = TranslationCacheService(service)
    stage.audio_cache = AudioCacheService(service)
    stage._initialized = True

    async def translate(text, source_language, target_language, model_type, message_id=None):
        return f"{target_language}:{text}"

    stage._translate_text = translate
    return stage


@pytest.mark.unit
@pytest.mark.parametrize("at_rest, expected_writes", [(True, 0), (False, 2)])
async def test_the_language_thread_pool_inherits_the_task_regime(at_rest, expected_writes):
    service = durable_service()
    stage = _stage(service)
    with task_scope(at_rest, MESSAGE):
        await stage._process_languages_parallel(
            languages=["en", "es"], source_text=SECRET, source_language="fr", audio_hash="h" * 32,
            voice_model=None, message_id=MESSAGE, attachment_id=ATTACHMENT, model_type="premium",
            cloning_params=None, max_workers=2,
        )
    translations = [k for k in service.redis.data if k.startswith("translation:text:")]
    assert len(translations) == expected_writes
    assert len(service.redis.sets.get(f"translation:v3:message:{MESSAGE}", set())) == expected_writes


@pytest.mark.unit
async def test_a_bare_thread_without_the_task_context_writes_nothing():
    import threading

    service = durable_service()
    text = TranslationCacheService(service)

    def write():
        asyncio.run(text.set_translation(SECRET, "fr", "en", "EN", "premium", message_id=MESSAGE))

    with task_scope(False, MESSAGE):
        thread = threading.Thread(target=write)
        thread.start()
        thread.join()
    assert service.redis.store == {}


# ── 2. aucun contenu sans son index ───────────────────────────────────────


@pytest.mark.unit
async def test_a_translation_and_its_index_are_written_together_or_not_at_all():
    ok = durable_service()
    with task_scope(False, MESSAGE):
        assert await TranslationCacheService(ok).set_translation(SECRET, "fr", "en", "EN", "premium") is True
    assert len([k for k in ok.redis.data if k.startswith("translation:text:v3:")]) == 1
    assert len(ok.redis.sets[f"translation:v3:message:{MESSAGE}"]) == 1

    broken = durable_service(DictRedis(fail_transaction=True))
    with task_scope(False, MESSAGE):
        assert await TranslationCacheService(broken).set_translation(SECRET, "fr", "en", "EN", "premium") is False
    assert broken.redis.store == {}
    assert len(broken.memory_cache) == 0


@pytest.mark.unit
async def test_a_translation_without_a_named_message_is_never_cached():
    service = durable_service()
    with at_rest_scope(False):
        assert await TranslationCacheService(service).set_translation(SECRET, "fr", "en", "EN", "premium") is False
    assert service.redis.store == {}
    with task_scope(False, MESSAGE):
        assert await TranslationCacheService(service).set_translation(SECRET, "fr", "en", "EN", "premium", ttl=600) is True
    content = [k for k in service.redis.data if k.startswith("translation:text:")][0]
    assert service.redis.ttls[f"translation:v3:message:{MESSAGE}"] == service.redis.ttls[content] == 600


@pytest.mark.unit
async def test_nothing_is_cached_by_audio_hash_without_its_piece_or_under_a_synthetic_hash(tmp_path):
    service, audio, _text, _path = _caches(tmp_path)
    real = "a" * 32
    with at_rest_scope(False):
        assert await audio.set_transcription_by_hash(real, {"text": SECRET}) is False
        assert await audio.set_transcription_by_hash("fallback_" + ATTACHMENT, {"text": SECRET}, attachment_id=ATTACHMENT) is False
        assert await audio.set_transcription_by_hash("synthetic:" + real, {"text": SECRET}, attachment_id=ATTACHMENT) is False
        assert audio.compute_audio_hash(str(tmp_path / "absent.m4a")).startswith("synthetic:")
    assert service.redis.store == {}


@pytest.mark.unit
async def test_a_hash_content_its_piece_mapping_and_its_language_index_land_together(tmp_path):
    service, audio, _text, _path = _caches(tmp_path)
    real = "b" * 32
    with at_rest_scope(False):
        assert await audio.set_translated_audio_by_hash(real, "en", {"translated_text": "EN"}, ttl=90 * 24 * 3600, attachment_id=ATTACHMENT) is True
    mapping = f"audio:v3:hash:mapping:{ATTACHMENT}"
    content = f"audio:v3:translation:hash:{real}:en"
    assert service.redis.data[mapping] == real
    assert service.redis.sets[f"audio:v3:hash:langs:{real}"] == {"en"}
    assert service.redis.ttls[mapping] >= service.redis.ttls[content]

    broken_service, broken, _t, _p = _caches(tmp_path, DictRedis(fail_transaction=True))
    with at_rest_scope(False):
        assert await broken.set_transcription_by_hash(real, {"text": SECRET}, attachment_id=ATTACHMENT) is False
    assert broken_service.redis.store == {}


@pytest.mark.unit
async def test_without_redis_nothing_goes_to_the_memory_fallback(tmp_path):
    service, audio, text, audio_path = _caches(tmp_path, available=False)
    await _fill(audio, text, audio_path)
    assert len(service.memory_cache) == 0
    assert service.redis.store == {}


# ── 3. l'oubli ────────────────────────────────────────────────────────────


@pytest.mark.unit
async def test_forgetting_a_piece_erases_its_transcription_tracks_and_indexes(tmp_path):
    service, audio, text, audio_path = _caches(tmp_path)
    audio_hash = await _fill(audio, text, audio_path)
    request = parse_forget_request({"requestId": "r1", "attachmentIds": [ATTACHMENT]})
    deleted = await forget_cached_content(audio, text, request)

    assert deleted == 5
    assert not [k for k in service.redis.store if k.startswith("audio:") and (ATTACHMENT in k or audio_hash in k)]
    assert await forget_cached_content(audio, text, request) == 0
    assert service.redis.keys_called is False


@pytest.mark.unit
async def test_forgetting_a_message_erases_its_translations_segments_included_by_id_only(tmp_path):
    service, audio, text, _path = _caches(tmp_path)
    segments, _ = TextSegmenter(max_segment_length=100).segment_text(STRUCTURED)
    pieces = [STRUCTURED] + [seg["text"] for seg in segments if seg.get("type", "line") == "line" and seg.get("text", "").strip()]
    assert len(pieces) > 2
    with task_scope(False, MESSAGE):
        for piece in pieces:
            for model in ("basic", "premium"):
                await text.set_translation(piece, "fr", "en", f"EN:{piece}", model)
    with at_rest_scope(False):
        await text.set_translation("Bonjour", "fr", "en", "Hello", "basic", message_id=OTHER_MESSAGE)

    request = parse_forget_request({"requestId": "r2", "messageIds": [MESSAGE]})
    deleted = await forget_cached_content(audio, text, request)

    assert deleted == 2 * len(pieces)
    assert [json.loads(v)["translated_text"] for k, v in service.redis.data.items() if k.startswith("translation:text:")] == ["Hello"]
    assert not [k for k in service.redis.store if MESSAGE in k]
    assert await forget_cached_content(audio, text, request) == 0
    assert service.redis.keys_called is False


@pytest.mark.unit
async def test_an_at_rest_message_leaves_no_index_either(tmp_path):
    service, _audio, text, _path = _caches(tmp_path)
    with task_scope(True, MESSAGE):
        await text.set_translation(SECRET, "fr", "en", "EN", "premium")
    assert service.redis.store == {}


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
async def test_the_handler_acknowledges_a_confirmed_forget_with_its_request_id(monkeypatch, caplog, tmp_path):
    from services import zmq_translation_handler as module
    from services import redis_service

    service, audio, text, audio_path = _caches(tmp_path)
    await _fill(audio, text, audio_path)
    monkeypatch.setattr(redis_service, "get_audio_cache_service", lambda *a, **k: audio)
    monkeypatch.setattr(redis_service, "get_translation_cache_service", lambda *a, **k: text)
    socket = SimpleNamespace(send=AsyncMock())
    handler = module.TranslationHandler(pool_manager=SimpleNamespace(), pub_socket=socket)

    caplog.set_level(logging.INFO)
    await handler._handle_cache_forget({"type": "cache_forget", "requestId": "req-42", "attachmentIds": [ATTACHMENT], "messageIds": [MESSAGE]})

    sent = json.loads(socket.send.call_args.args[0].decode("utf-8"))
    assert sent == {"type": "cache_forget_done", "requestId": "req-42", "deleted": 6}
    assert SECRET[:15] not in caplog.text
    assert service.redis.store == {}


@pytest.mark.unit
async def test_an_unconfirmed_erasure_is_never_acknowledged(monkeypatch, tmp_path):
    from services import zmq_translation_handler as module
    from services import redis_service

    _service, audio, text, _path = _caches(tmp_path, available=False)
    monkeypatch.setattr(redis_service, "get_audio_cache_service", lambda *a, **k: audio)
    monkeypatch.setattr(redis_service, "get_translation_cache_service", lambda *a, **k: text)
    socket = SimpleNamespace(send=AsyncMock())
    handler = module.TranslationHandler(pool_manager=SimpleNamespace(), pub_socket=socket)

    await handler._handle_cache_forget({"type": "cache_forget", "requestId": "req-43", "attachmentIds": [ATTACHMENT], "messageIds": [MESSAGE]})

    socket.send.assert_not_called()


@pytest.mark.unit
async def test_a_write_while_redis_is_down_leaves_no_trace_after_forget(tmp_path):
    service, audio, text, audio_path = _caches(tmp_path, available=False)
    await _fill(audio, text, audio_path)
    assert len(service.memory_cache) == 0
    service.is_redis_available = True
    deleted = await forget_cached_content(audio, text, parse_forget_request({"requestId": "r", "attachmentIds": [ATTACHMENT], "messageIds": [MESSAGE]}))
    assert deleted == 0
    assert len(service.memory_cache) == 0
    assert service.redis.store == {}


@pytest.mark.unit
async def test_the_core_router_routes_a_forget_request_to_its_handler():
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
