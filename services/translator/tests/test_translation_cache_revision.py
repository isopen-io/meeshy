"""Une traduction écrite par l'ancien découpage n'est plus jamais resservie (#9723).

Avant #9723, un message court partait d'un seul tenant au modèle, qui omettait des
phrases ; le résultat était mis en cache 30 jours sous une clé ne dépendant que du
texte. Sans changer de clé, le même message renvoyé après le correctif ressortait
du cache, amputé.
"""

import hashlib
import json

import pytest

from services.redis_service import TranslationCacheService


class _FakeRedis:
    def __init__(self):
        self.store = {}

    async def get(self, key):
        return self.store.get(key)

    async def setex(self, key, ttl, value):
        self.store[key] = value
        return True


def _key_written_before_9723(text, source, target, model):
    digest = hashlib.sha256(f"{text}|{source}|{target}|{model}".encode()).hexdigest()[:32]
    return f"translation:text:{digest}"


@pytest.mark.asyncio
async def test_a_translation_cached_by_the_whole_message_pipeline_is_not_served():
    redis = _FakeRedis()
    text = "Salut ! On part en vacances à la mer en juillet. Tu veux venir avec nous ?"
    redis.store[_key_written_before_9723(text, "fr", "en", "medium")] = json.dumps(
        {"translated_text": "Partly on vacation to the sea in July."}
    )
    cache = TranslationCacheService(redis)

    assert await cache.get_translation(text, "fr", "en", "medium") is None


@pytest.mark.asyncio
async def test_a_translation_cached_by_the_sentence_pipeline_is_served():
    cache = TranslationCacheService(_FakeRedis())
    await cache.set_translation("Merci !", "fr", "en", "Thank you!", "medium")

    cached = await cache.get_translation("Merci !", "fr", "en", "medium")

    assert cached["translated_text"] == "Thank you!"
