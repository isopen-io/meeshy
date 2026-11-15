"""
#13865 — l'étape « traduction + TTS » d'un vocal ne quitte jamais la boucle
de la tâche.

Le client `redis.asyncio`, ses verrous et ses connexions, comme le socket ZMQ
qui publie chaque piste traduite, appartiennent à la boucle qui les a créés.
Chaque langue tournait dans un thread avec SA boucle (uvloop) : le premier
`GET` du cache depuis cette boucle étrangère levait `RuntimeError`, laissait au
pool une connexion liée à une boucle fermée, et le processus mourait en
segfault (code 139) dans la milliseconde — staging et production, à chaque
vocal traduit tant que Redis répondait.

Le double ci-dessous parle comme `redis.asyncio` sur ce point précis : appelé
depuis une autre boucle que la sienne, il refuse.
"""

import asyncio
from types import SimpleNamespace

import pytest

from durable_redis_double import DictRedis, durable_service
from services.redis_service import AudioCacheService, TranslationCacheService
from services.task_privacy import task_scope

ATTACHMENT = "aaaaaaaaaaaaaaaaaaaaaaa1"
MESSAGE = "bbbbbbbbbbbbbbbbbbbbbbb1"
TEXT = "Bonjour, ceci est un message vocal de recette."


class LoopBoundRedis(DictRedis):
    def __init__(self, loop):
        super().__init__()
        self.loop = loop
        self.foreign_calls = []

    def _guard(self, operation):
        running = asyncio.get_running_loop()
        if running is not self.loop:
            self.foreign_calls.append(operation)
            raise RuntimeError(f"{operation} is bound to a different event loop")

    async def get(self, key):
        self._guard("get")
        return await super().get(key)

    async def setex(self, key, ttl, value):
        self._guard("setex")
        return await super().setex(key, ttl, value)

    async def set(self, key, value, ex=None):
        self._guard("set")
        return await super().set(key, value, ex=ex)

    async def exists(self, key):
        self._guard("exists")
        return await super().exists(key)

    async def smembers(self, key):
        self._guard("smembers")
        return await super().smembers(key)

    def pipeline(self, transaction=True):
        pipe = super().pipeline(transaction=transaction)
        execute = pipe.execute

        async def guarded_execute():
            self._guard("execute")
            return await execute()

        pipe.execute = guarded_execute
        return pipe


def _stage(service, translate, published):
    from services.audio_pipeline.translation_stage import TranslationStage

    async def synthesize(text, language, output_format, cloning_params=None):
        return SimpleNamespace(
            audio_path=None, audio_url=f"/tts/{language}.ogg", duration_ms=1200, format="ogg",
            voice_cloned=False, voice_quality=None, processing_time_ms=10,
            audio_data_base64=None, audio_mime_type="audio/ogg",
        )

    stage = TranslationStage.__new__(TranslationStage)
    stage.translation_cache = TranslationCacheService(service)
    stage.audio_cache = AudioCacheService(service)
    stage.tts_service = SimpleNamespace(synthesize=synthesize)
    stage._translate_text = translate
    stage.tts_output_format = "opus"
    stage._initialized = True
    return stage


async def _run(stage, published, languages=("es", "en")):
    async def on_translation_ready(data):
        published.append((data["language"], asyncio.get_running_loop()))

    with task_scope(False, MESSAGE):
        return await stage.process_languages(
            target_languages=list(languages), source_text=TEXT, source_language="fr",
            audio_hash="h" * 32, voice_model=None, message_id=MESSAGE, attachment_id=ATTACHMENT,
            model_type="medium", max_workers=2, on_translation_ready=on_translation_ready,
        )


async def _translate(text, source_language, target_language, model_type, message_id=None):
    return f"{target_language}:{text}"


@pytest.mark.unit
async def test_every_cache_call_of_a_voice_translation_runs_on_the_loop_that_owns_redis():
    redis = LoopBoundRedis(asyncio.get_running_loop())
    service = durable_service(redis)
    published = []

    results = await _run(_stage(service, _translate, published), published)

    assert redis.foreign_calls == []
    assert sorted(results) == ["en", "es"]
    assert len([k for k in redis.data if k.startswith("translation:text:")]) == 2


@pytest.mark.unit
async def test_each_translated_track_is_published_from_the_loop_that_owns_the_socket():
    loop = asyncio.get_running_loop()
    published = []

    await _run(_stage(durable_service(LoopBoundRedis(loop)), _translate, published), published)

    assert sorted(lang for lang, _ in published) == ["en", "es"]
    assert all(publisher_loop is loop for _, publisher_loop in published)


@pytest.mark.unit
async def test_the_languages_of_a_voice_message_still_progress_together():
    arrived = []
    both_started = asyncio.Event()

    async def translate(text, source_language, target_language, model_type, message_id=None):
        arrived.append(target_language)
        if len(arrived) == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=2)
        return f"{target_language}:{text}"

    published = []
    stage = _stage(durable_service(LoopBoundRedis(asyncio.get_running_loop())), translate, published)

    results = await _run(stage, published)

    assert sorted(arrived) == ["en", "es"]
    assert sorted(results) == ["en", "es"]


@pytest.mark.unit
async def test_a_language_that_fails_does_not_take_the_others_down():
    async def translate(text, source_language, target_language, model_type, message_id=None):
        if target_language == "es":
            raise ValueError("modèle indisponible")
        return f"{target_language}:{text}"

    published = []
    stage = _stage(durable_service(LoopBoundRedis(asyncio.get_running_loop())), translate, published)

    results = await _run(stage, published)

    assert list(results) == ["en"]
    assert [lang for lang, _ in published] == ["en"]
