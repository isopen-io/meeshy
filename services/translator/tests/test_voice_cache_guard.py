"""
#18695 — le cache de modèles vocaux ne crée de dossier que SOUS `voice_cache_dir`.

L'identifiant d'utilisateur qui nomme un dossier du cache (`voice_cache_dir /
user_id`), un fichier (`{user_id}_combined_audio.wav`, `voice_{user_id}_….m4a`)
ou une clé Redis (`voice:profile:{user_id}`) arrive par des canaux non fiables :
le PULL ZMQ (`senderId`, `existingVoiceProfile.userId`), l'en-tête
`Authorization` de la Voice API (`"user_" + authorization[-8:]`), les champs de
formulaire de l'API audio. Un identifiant absolu ou porteur de `../` écrivait,
et `DELETE /voice/profile` EFFAÇAIT, hors du cache.

Le garde unique (`utils.voice_cache_guard`) n'admet qu'une forme d'identifiant
— `[A-Za-z0-9_-]{1,64}` : ObjectId, `user_<8 car. base64url>`,
`anonymous_<hex>`, `temp_speaker_<id>` — et rend le dossier du cache après avoir
vérifié que sa résolution reste un enfant direct de la racine. Le refus ne porte
qu'une raison fixe, jamais l'identifiant.
"""

import base64
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, create_autospec, patch

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from services.redis_service import AudioCacheService, RedisService
from services.voice_clone.voice_clone_audio import VoiceCloneAudioProcessor
from services.voice_clone.voice_clone_cache import VoiceCloneCacheManager
from services.voice_clone.voice_clone_model_creation import VoiceCloneModelCreator
from services.voice_clone.voice_clone_model_improvement import VoiceCloneModelImprover
from services.voice_clone.voice_metadata import VoiceModel
from services.voice_clone_service import VoiceCloneService


LEGIT_IDS = [
    "507f1f77bcf86cd799439011",
    "user_aB3-_xYz",
    "anonymous_1a2b3c4d",
    "temp_speaker_SPEAKER_00",
    "a" * 64,
]

HOSTILE_IDS = [
    None,
    123,
    b"user_abc",
    "",
    ".",
    "..",
    "../escape",
    "../../escape",
    "/etc",
    "user_/../../x",
    "a/b",
    "a\\b",
    "voice:profile:*",
    "a\x00b",
    "a b",
    "user_abc\n",
    "é",
    "a" * 65,
]


def _guard():
    from utils import voice_cache_guard

    return voice_cache_guard


def _rejected():
    return _guard().VoiceCacheIdRejected


@pytest.fixture
def layout(tmp_path):
    cache = tmp_path / "cache" / "voices"
    cache.mkdir(parents=True)
    return cache


OWN_DIRS = ("inputs", "uploads", "out", "elsewhere", "x")


def _escapes(cache: Path) -> list:
    sandbox = cache.parent.parent
    allowed = [cache.parent] + [sandbox / name for name in OWN_DIRS]
    return sorted(
        str(p.relative_to(sandbox))
        for p in sandbox.rglob("*")
        if not p.is_relative_to(cache)
        and p not in allowed
        and not any(p.is_relative_to(own) for own in allowed[1:])
    )


def _creator(cache: Path, cached=None) -> VoiceCloneModelCreator:
    cache_manager = create_autospec(VoiceCloneCacheManager, instance=True)
    cache_manager.load_cached_model.return_value = cached
    cache_manager.load_embedding.side_effect = lambda model: model
    audio_processor = create_autospec(VoiceCloneAudioProcessor, instance=True)
    audio_processor.get_user_audio_history.return_value = []
    audio_processor.calculate_total_duration.return_value = 30_000
    audio_processor.extract_voice_embedding.side_effect = RuntimeError("stop")
    return VoiceCloneModelCreator(
        audio_processor=audio_processor,
        cache_manager=cache_manager,
        voice_cache_dir=cache,
        max_age_days=7,
    )


def _audio(cache: Path) -> str:
    inputs = cache.parent.parent / "inputs"
    inputs.mkdir(exist_ok=True)
    audio = inputs / "in.wav"
    audio.write_bytes(b"RIFF0000WAVE")
    return str(audio)


# ═══════════════════════════════════════════════════════════════════════════
# LE GARDE
# ═══════════════════════════════════════════════════════════════════════════


class TestGuardForm:
    @pytest.mark.parametrize("raw", LEGIT_IDS)
    def test_legit_ids_pass_unchanged(self, raw):
        assert _guard().guard_voice_cache_id(raw) == raw

    @pytest.mark.parametrize("raw", HOSTILE_IDS)
    def test_hostile_ids_are_refused(self, raw):
        with pytest.raises(_rejected()):
            _guard().guard_voice_cache_id(raw)

    def test_refusal_is_a_value_error_with_a_fixed_reason(self):
        with pytest.raises(ValueError) as caught:
            _guard().guard_voice_cache_id("../../escape")
        assert caught.value.reason == "invalid_form"
        assert "escape" not in str(caught.value)
        assert ".." not in str(caught.value)


class TestGuardDirectory:
    def test_returns_the_direct_child_of_the_cache(self, layout):
        assert _guard().voice_cache_user_dir(layout, "user_aB3-_xYz") == layout / "user_aB3-_xYz"

    @pytest.mark.parametrize("raw", ["../escape", "/etc", "user_/../../x"])
    def test_refuses_hostile_ids_before_touching_the_disk(self, layout, raw):
        with pytest.raises(_rejected()):
            _guard().voice_cache_user_dir(layout, raw)
        assert _escapes(layout) == []

    def test_refuses_a_user_dir_that_is_a_symlink_leaving_the_cache(self, layout, tmp_path):
        elsewhere = tmp_path / "elsewhere"
        elsewhere.mkdir()
        (layout / "user_linked").symlink_to(elsewhere, target_is_directory=True)
        with pytest.raises(_rejected()) as caught:
            _guard().voice_cache_user_dir(layout, "user_linked")
        assert caught.value.reason == "outside_cache"


# ═══════════════════════════════════════════════════════════════════════════
# LES FLUX DU CACHE
# ═══════════════════════════════════════════════════════════════════════════


class TestModelCreatorFlows:
    async def test_get_or_create_refuses_before_any_write(self, layout):
        creator = _creator(layout)
        with patch.object(
            VoiceCloneModelCreator,
            "_validate_audio_quality_for_cloning",
            AsyncMock(return_value={"can_clone": True, "warnings": []}),
        ), patch(
            "services.voice_clone.voice_clone_model_creation.get_voice_analyzer",
            side_effect=RuntimeError("stop"),
        ):
            with pytest.raises(_rejected()):
                await creator.get_or_create_voice_model(
                    user_id="../../escape",
                    current_audio_path=_audio(layout),
                    current_audio_duration_ms=30_000,
                )
        assert _escapes(layout) == []
        creator._cache_manager.load_cached_model.assert_not_called()

    async def test_create_voice_model_refuses_before_any_write(self, layout):
        creator = _creator(layout)
        with patch.object(
            VoiceCloneModelCreator,
            "_validate_audio_quality_for_cloning",
            AsyncMock(return_value={"can_clone": True, "warnings": []}),
        ), patch(
            "services.voice_clone.voice_clone_model_creation.get_voice_analyzer",
            side_effect=RuntimeError("stop"),
        ):
            with pytest.raises(_rejected()):
                await creator._create_voice_model("../../escape", [_audio(layout)], 30_000)
        assert _escapes(layout) == []

    async def test_improving_a_model_with_a_hostile_owner_writes_nothing(self, layout):
        model = VoiceModel(
            user_id="../../escape",
            embedding_path="",
            audio_count=1,
            total_duration_ms=30_000,
            quality_score=0.8,
            embedding=np.ones(4, dtype=np.float32),
        )
        creator = _creator(layout)
        with patch(
            "services.voice_clone.voice_clone_model_creation.get_voice_analyzer",
            return_value=MagicMock(),
        ):
            with pytest.raises(_rejected()):
                await creator._improve_model(model, _audio(layout))
        assert _escapes(layout) == []

    async def test_gateway_profile_with_a_hostile_user_id_writes_nothing(self, layout):
        creator = _creator(layout)
        profile = {
            "userId": "../../escape",
            "profileId": "vfp_12345678",
            "embedding": base64.b64encode(np.ones(4, dtype=np.float32).tobytes()).decode(),
        }
        model = await creator.create_voice_model_from_gateway_profile(profile, "507f1f77bcf86cd799439011")
        assert model is None
        assert _escapes(layout) == []

    async def test_gateway_profile_with_a_hostile_profile_id_writes_nothing(self, layout):
        creator = _creator(layout)
        profile = {
            "userId": "507f1f77bcf86cd799439011",
            "profileId": "../../../escape",
            "embedding": base64.b64encode(np.ones(4, dtype=np.float32).tobytes()).decode(),
        }
        model = await creator.create_voice_model_from_gateway_profile(profile, "507f1f77bcf86cd799439011")
        assert model is None
        assert _escapes(layout) == []

    async def test_gateway_profile_with_a_legit_id_still_lands_in_the_cache(self, layout):
        creator = _creator(layout)
        profile = {
            "userId": "507f1f77bcf86cd799439011",
            "profileId": "vfp_12345678",
            "embedding": base64.b64encode(np.ones(4, dtype=np.float32).tobytes()).decode(),
        }
        model = await creator.create_voice_model_from_gateway_profile(profile, "507f1f77bcf86cd799439011")
        assert model is not None
        assert Path(model.embedding_path).parent == layout / "507f1f77bcf86cd799439011"


class TestImproverFlow:
    async def test_improver_with_a_hostile_owner_writes_nothing(self, layout):
        model = VoiceModel(
            user_id="../../escape",
            embedding_path="",
            audio_count=1,
            total_duration_ms=30_000,
            quality_score=0.8,
            embedding=np.ones(4, dtype=np.float32),
        )
        audio_processor = create_autospec(VoiceCloneAudioProcessor, instance=True)
        audio_processor.extract_voice_embedding.side_effect = RuntimeError("stop")
        improver = VoiceCloneModelImprover(
            audio_processor=audio_processor,
            cache_manager=create_autospec(VoiceCloneCacheManager, instance=True),
            voice_cache_dir=layout,
        )
        with patch("services.voice_clone.voice_analyzer.get_voice_analyzer", return_value=MagicMock()):
            with pytest.raises(_rejected()):
                await improver.improve_model(model, _audio(layout))
        assert _escapes(layout) == []


class TestConcatenationFlow:
    async def test_hostile_id_never_names_the_combined_file(self, layout):
        processor = VoiceCloneAudioProcessor()
        segment = MagicMock()
        with patch("services.voice_clone.voice_clone_audio.AUDIO_PROCESSING_AVAILABLE", True), patch(
            "services.voice_clone.voice_clone_audio.AudioSegment", create=True
        ) as audio_segment:
            audio_segment.from_file.return_value = segment
            result = await processor.concatenate_audios(["a.wav", "b.wav"], layout, "../../escape")
        assert result == "a.wav"
        audio_segment.empty.return_value.__iadd__.return_value.export.assert_not_called()


class TestRedisVoiceProfileKey:
    def _cache(self):
        redis = create_autospec(RedisService, instance=True)
        return AudioCacheService(redis), redis

    async def test_legit_id_keeps_the_existing_key(self):
        cache, redis = self._cache()
        redis.setex.return_value = True
        await cache.set_voice_profile("507f1f77bcf86cd799439011", {"userId": "507f1f77bcf86cd799439011"})
        assert redis.setex.call_args.args[0] == "voice:profile:507f1f77bcf86cd799439011"

    @pytest.mark.parametrize("raw", ["*", "a:b", "../x", ""])
    async def test_hostile_id_never_reaches_redis(self, raw):
        cache, redis = self._cache()
        for call in (
            lambda: cache.get_voice_profile(raw),
            lambda: cache.set_voice_profile(raw, {}),
            lambda: cache.delete_voice_profile(raw),
        ):
            with pytest.raises(_rejected()):
                await call()
        redis.get.assert_not_called()
        redis.setex.assert_not_called()
        redis.delete.assert_not_called()

    async def test_cache_manager_refuses_a_hostile_id(self, layout):
        audio_cache = create_autospec(AudioCacheService, instance=True)
        manager = VoiceCloneCacheManager(audio_cache=audio_cache, voice_cache_dir=layout)
        with pytest.raises(_rejected()):
            await manager.load_cached_model("voice:profile:*")
        audio_cache.get_voice_profile.assert_not_called()


# ═══════════════════════════════════════════════════════════════════════════
# LES APPELANTS : PIPELINE AUDIO (le refus saute le clonage, jamais la traduction)
# ═══════════════════════════════════════════════════════════════════════════


class TestTranslationStageFlow:
    async def test_hostile_sender_skips_cloning_without_writing(self, layout):
        from services.audio_pipeline.translation_stage import TranslationStage

        creator = _creator(layout)
        service = create_autospec(VoiceCloneService, instance=True)
        service.get_or_create_voice_model.side_effect = creator.get_or_create_voice_model
        stage = TranslationStage(
            translation_service=MagicMock(),
            tts_service=MagicMock(),
            voice_clone_service=service,
            audio_cache=MagicMock(),
            translation_cache=MagicMock(),
        )
        with patch.object(
            VoiceCloneModelCreator,
            "_validate_audio_quality_for_cloning",
            AsyncMock(return_value={"can_clone": True, "warnings": []}),
        ), patch(
            "services.voice_clone.voice_clone_model_creation.get_voice_analyzer",
            side_effect=RuntimeError("stop"),
        ):
            voice_model, _ = await stage.create_voice_model(
                sender_id="../../escape",
                audio_path=_audio(layout),
                audio_duration_ms=30_000,
                generate_voice_clone=True,
            )
        assert voice_model is None
        assert _escapes(layout) == []


class TestMultiSpeakerFlow:
    async def test_refused_speaker_id_falls_back_instead_of_raising(self, layout):
        from services.audio_pipeline import multi_speaker_processor

        service = create_autospec(VoiceCloneService, instance=True)
        service.get_or_create_voice_model.side_effect = _rejected()("invalid_form")
        segments = [{"speaker_id": "../../x", "text": "bonjour", "start_ms": 0, "end_ms": 2000}]
        with patch.object(multi_speaker_processor, "cleanup_wav_cache"), patch.object(
            multi_speaker_processor, "_extract_speaker_audio", AsyncMock(return_value=_audio(layout))
        ):
            result = await multi_speaker_processor.process_multi_speaker_audio(
                translation_stage=MagicMock(),
                voice_clone_service=service,
                segments=segments,
                source_audio_path=_audio(layout),
                target_languages=["en"],
                source_language="fr",
                message_id="m1",
                attachment_id="a1",
                generate_voice_clone=True,
            )
        assert result == {}


# ═══════════════════════════════════════════════════════════════════════════
# LES APPELANTS : API HTTP (400, libellé fixe, jamais d'écho)
# ═══════════════════════════════════════════════════════════════════════════


def _voice_client(layout, monkeypatch, service):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from api.voice_api import create_voice_api_router

    uploads = layout.parent.parent / "uploads"
    monkeypatch.setenv("UPLOAD_DIR", str(uploads))
    monkeypatch.setenv("AUDIO_OUTPUT_DIR", str(layout.parent.parent / "out"))
    app = FastAPI()
    app.include_router(create_voice_api_router(voice_clone_service=service))
    return TestClient(app)


def _voice_service(layout):
    service = MagicMock()
    service.voice_cache_dir = layout
    service.get_or_create_voice_model = AsyncMock()
    return service


class TestVoiceApiFlows:
    def test_delete_profile_with_a_traversing_token_deletes_nothing(self, layout, monkeypatch):
        victim = layout.parent.parent / "x"
        victim.mkdir()
        (victim / "keep.txt").write_text("keep")
        client = _voice_client(layout, monkeypatch, _voice_service(layout))
        response = client.delete("/api/v1/voice/profile", headers={"Authorization": "Bearer abc/../../x"})
        assert response.status_code == 400
        assert ".." not in response.text
        assert (victim / "keep.txt").exists()

    def test_create_profile_with_a_traversing_token_is_refused(self, layout, monkeypatch):
        service = _voice_service(layout)
        client = _voice_client(layout, monkeypatch, service)
        response = client.post(
            "/api/v1/voice/profile",
            files={"audio": ("a.wav", b"RIFF0000WAVE", "audio/wav")},
            headers={"Authorization": "Bearer abc/../../x"},
        )
        assert response.status_code == 400
        assert ".." not in response.text
        service.get_or_create_voice_model.assert_not_called()

    def test_delete_profile_with_a_legit_token_still_deletes_its_dir(self, layout, monkeypatch):
        own = layout / "user_aB3-_xYz"
        own.mkdir()
        client = _voice_client(layout, monkeypatch, _voice_service(layout))
        response = client.delete("/api/v1/voice/profile", headers={"Authorization": "Bearer jwt.aB3-_xYz"})
        assert response.status_code == 200
        assert not own.exists()


def _audio_client(layout, monkeypatch, service, tts=None):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from api.audio_api import create_audio_router

    monkeypatch.setenv("UPLOAD_DIR", str(layout.parent.parent / "uploads"))
    monkeypatch.setenv("OUTPUT_DIR", str(layout.parent.parent / "out"))
    app = FastAPI()
    app.include_router(create_audio_router(voice_clone_service=service, tts_service=tts or MagicMock()))
    return TestClient(app)


class TestAudioApiFlows:
    def test_register_voice_with_a_hostile_user_id_is_refused(self, layout, monkeypatch):
        service = _voice_service(layout)
        client = _audio_client(layout, monkeypatch, service)
        response = client.post(
            "/v1/register-voice",
            files={"audio": ("a.wav", b"RIFF0000WAVE", "audio/wav")},
            data={"user_id": "../../escape"},
        )
        assert response.status_code == 400
        assert "escape" not in response.text
        service.get_or_create_voice_model.assert_not_called()
        assert _escapes(layout) == []
        assert not any("escape" in p.name for p in layout.parent.parent.rglob("*"))

    def test_tts_with_a_hostile_voice_id_is_refused(self, layout, monkeypatch):
        service = _voice_service(layout)
        client = _audio_client(layout, monkeypatch, service)
        response = client.post("/v1/tts", data={"text": "bonjour", "language": "fr", "voice_id": "../../escape"})
        assert response.status_code == 400
        assert "escape" not in response.text
        service.get_or_create_voice_model.assert_not_called()
