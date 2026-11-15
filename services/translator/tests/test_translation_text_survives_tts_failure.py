"""
#16340 — la traduction d'un vocal se LIT même quand sa voix n'a pas pu naître.

Une langue passe par deux étapes : NLLB traduit la transcription, puis la TTS
synthétise la piste. Quand la TTS échouait (TorchCodec absent en staging,
watchdog de 180 s en production), l'exception emportait la langue ENTIÈRE :
le texte traduit, déjà calculé, était jeté avec la piste, et le lecteur ne
trouvait rien à lire — ni dans la bulle, ni en plein écran.

Désormais une TTS en échec laisse une traduction TEXTE SEULE : `text_only`,
sans piste. La passerelle l'inscrit sans adresse, et chaque client en lit le
texte en gardant la voix originale.
"""

from types import SimpleNamespace

import pytest

from durable_redis_double import DictRedis, durable_service
from services.redis_service import AudioCacheService, TranslationCacheService
from services.task_privacy import task_scope

ATTACHMENT = "aaaaaaaaaaaaaaaaaaaaaaa2"
MESSAGE = "bbbbbbbbbbbbbbbbbbbbbbb2"
TEXT = "Bonjour, ceci est un message vocal envoyé depuis Android."


def _stage(redis, synthesize):
    from services.audio_pipeline.translation_stage import TranslationStage

    async def translate(text, source_language, target_language, model_type, message_id=None):
        return f"{target_language}:{text}"

    service = durable_service(redis)
    stage = TranslationStage.__new__(TranslationStage)
    stage.translation_cache = TranslationCacheService(service)
    stage.audio_cache = AudioCacheService(service)
    stage.tts_service = SimpleNamespace(synthesize=synthesize)
    stage._translate_text = translate
    stage.tts_output_format = "opus"
    stage._initialized = True
    return stage


async def _broken_tts(text, language, output_format, cloning_params=None):
    raise RuntimeError("Échec de la synthèse TTS: TorchCodec is required for save_with_torchcodec.")


async def _run(stage, published, languages=("en", "es")):
    async def on_translation_ready(data):
        published.append(data)

    with task_scope(False, MESSAGE):
        return await stage.process_languages(
            target_languages=list(languages), source_text=TEXT, source_language="fr",
            audio_hash="h" * 32, voice_model=None, message_id=MESSAGE, attachment_id=ATTACHMENT,
            model_type="medium", max_workers=2, on_translation_ready=on_translation_ready,
        )


@pytest.mark.unit
async def test_a_failed_synthesis_keeps_the_translated_text_without_a_track():
    results = await _run(_stage(DictRedis(), _broken_tts), [])

    assert sorted(results) == ["en", "es"]
    english = results["en"]
    assert english.translated_text == f"en:{TEXT}"
    assert english.text_only is True
    assert not english.audio_path
    assert not english.audio_url
    assert english.duration_ms == 0


@pytest.mark.unit
async def test_the_text_only_translation_is_published_as_soon_as_it_is_ready():
    published = []

    await _run(_stage(DictRedis(), _broken_tts), published)

    assert sorted(data["language"] for data in published) == ["en", "es"]
    assert all(data["translation"].text_only for data in published)


@pytest.mark.unit
async def test_a_text_only_translation_is_never_cached_as_a_track():
    redis = DictRedis()

    await _run(_stage(redis, _broken_tts), [])

    assert [key for key in redis.data if key.startswith("audio:")] == []


@pytest.mark.unit
async def test_a_successful_synthesis_is_not_text_only():
    async def tts(text, language, output_format, cloning_params=None):
        return SimpleNamespace(
            audio_path=None, audio_url=f"/tts/{language}.ogg", duration_ms=1200, format="ogg",
            voice_cloned=False, voice_quality=None, processing_time_ms=10,
            audio_data_base64=None, audio_mime_type="audio/ogg",
        )

    results = await _run(_stage(DictRedis(), tts), [], languages=("en",))

    assert results["en"].text_only is False
    assert results["en"].duration_ms == 1200


@pytest.mark.unit
async def test_a_failed_text_translation_still_drops_the_language():
    stage = _stage(DictRedis(), _broken_tts)

    async def translate(text, source_language, target_language, model_type, message_id=None):
        raise ValueError("modèle indisponible")

    stage._translate_text = translate
    published = []
    results = await _run(stage, published)

    assert dict(results) == {}
    assert published == []
