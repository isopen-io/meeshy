"""Un sous-titre d'appel en direct ne se lit ni ne s'écrit dans le cache de traduction (#16648).

La passerelle traduit chaque segment de sous-titre sous `messageId =
"call-caption:<callId>:<startMs>"` (#16625 ; `"call-<callId>-<startMs>"` avant).
Un sous-titre n'est jamais retraduit à l'identique : le ranger 30 jours dans
Redis ne sert personne et y pose la parole d'un appel. Un message de
conversation (ObjectId) continue, lui, à lire et écrire le cache.
"""

import json

import pytest

from services.redis_service import TranslationCacheService
from services.task_privacy import at_rest_scope, task_scope
from services.zmq_models import TranslationTask
from services.zmq_pool.translation_processor import process_single_translation

CAPTION_IDS = ["call-caption:abc:123", "call-abc-123"]
MESSAGE_ID = "65f1a2b3c4d5e6f7a8b9c0d1"


class _RecordingCache:
    def __init__(self):
        self.reads = []
        self.writes = []

    async def get_translation(self, **kwargs):
        self.reads.append(kwargs)
        return None

    async def set_translation(self, **kwargs):
        self.writes.append(kwargs)
        return True


class _RecordingMl:
    def __init__(self):
        self.calls = []

    async def translate_with_structure(self, **kwargs):
        self.calls.append(kwargs)
        return {"translated_text": "Hello", "confidence": 0.9}


def _task(message_id):
    return TranslationTask(
        task_id="t-1",
        message_id=message_id,
        text="Bonjour",
        source_language="fr",
        target_languages=["en"],
        conversation_id="conv",
    )


async def _publish(*_args):
    return None


async def _run(message_id):
    cache, ml = _RecordingCache(), _RecordingMl()
    results = await process_single_translation(_task(message_id), "w", ml, cache, _publish)
    return cache, ml, results


@pytest.mark.asyncio
@pytest.mark.parametrize("caption_id", CAPTION_IDS)
async def test_a_live_caption_is_translated_without_touching_the_cache(caption_id):
    cache, ml, results = await _run(caption_id)

    assert [r["translatedText"] for r in results] == ["Hello"]
    assert cache.reads == []
    assert cache.writes == []
    assert ml.calls[0].get("use_cache") is False


@pytest.mark.asyncio
async def test_a_conversation_message_still_reads_and_writes_the_cache():
    cache, ml, _ = await _run(MESSAGE_ID)

    assert len(cache.reads) == 1
    assert [w["message_id"] for w in cache.writes] == [MESSAGE_ID]
    assert "use_cache" not in ml.calls[0]


class _FakeRedis:
    def __init__(self):
        self.store = {}
        self.gets = 0

    async def get(self, key):
        self.gets += 1
        return self.store.get(key)

    async def write_atomic(self, operations):
        for op in operations:
            if op[0] == "setex":
                self.store[op[1]] = op[3]
        return True


def _service():
    redis = _FakeRedis()
    return TranslationCacheService(redis), redis


def _seed(service, redis):
    key = service.key_pattern.format(hash=service._compute_hash("Bonjour", "fr", "en", "premium"))
    redis.store[key] = json.dumps({"translated_text": "Hello"})


@pytest.mark.asyncio
@pytest.mark.parametrize("caption_id", CAPTION_IDS)
async def test_the_cache_service_refuses_a_caption_named_explicitly(caption_id):
    service, redis = _service()
    with at_rest_scope(False):
        written = await service.set_translation("Bonjour", "fr", "en", "Hello", message_id=caption_id)

    assert written is False
    assert redis.store == {}


@pytest.mark.asyncio
@pytest.mark.parametrize("caption_id", CAPTION_IDS)
async def test_inside_a_caption_task_the_cache_is_neither_read_nor_written(caption_id):
    service, redis = _service()
    _seed(service, redis)
    seeded = dict(redis.store)
    with task_scope(False, caption_id):
        hit = await service.get_translation("Bonjour", "fr", "en")
        written = await service.set_translation("Salut", "fr", "en", "Hi", message_id=caption_id)

    assert hit is None
    assert redis.gets == 0
    assert written is False
    assert redis.store == seeded


@pytest.mark.asyncio
async def test_inside_a_message_task_the_cache_is_read_and_written_as_before():
    service, redis = _service()
    _seed(service, redis)
    with task_scope(False, MESSAGE_ID):
        hit = await service.get_translation("Bonjour", "fr", "en")
        written = await service.set_translation("Salut", "fr", "en", "Hi")

    assert hit == {"translated_text": "Hello"}
    assert written is True
    assert len(redis.store) == 2
