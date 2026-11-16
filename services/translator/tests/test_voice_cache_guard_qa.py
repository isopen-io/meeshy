"""
#18695 — témoins de QA adversariale du garde du cache vocal.

Complète `test_voice_cache_guard.py` là où une mutation survivait :
- un `profileId` hostile venu de la passerelle n'atteint jamais `np.save`
  (le témoin d'origine passait aussi sans garde, parce que le dossier
  intermédiaire `{userId}_..` n'existait pas et que `np.save` échouait pour
  une autre raison) ;
- `DELETE /voice/profile` refuse un dossier d'utilisateur qui est un lien
  symbolique vers l'extérieur du cache, sans rien effacer ;
- les formes Unicode qui ressemblent à des lettres ou des chiffres ASCII sont
  refusées ;
- les identifiants réellement produits par la passerelle et par la
  diarisation passent.
"""

import base64
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, create_autospec, patch

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from services.voice_clone.voice_clone_audio import VoiceCloneAudioProcessor
from services.voice_clone.voice_clone_cache import VoiceCloneCacheManager
from services.voice_clone.voice_clone_model_creation import VoiceCloneModelCreator
from utils.voice_cache_guard import VoiceCacheIdRejected, guard_voice_cache_id, voice_cache_user_dir

OBJECT_ID = "507f1f77bcf86cd799439011"


@pytest.fixture
def cache(tmp_path):
    root = tmp_path / "cache" / "voices"
    root.mkdir(parents=True)
    return root


def _creator(cache: Path) -> VoiceCloneModelCreator:
    return VoiceCloneModelCreator(
        audio_processor=create_autospec(VoiceCloneAudioProcessor, instance=True),
        cache_manager=create_autospec(VoiceCloneCacheManager, instance=True),
        voice_cache_dir=cache,
        max_age_days=7,
    )


def _gateway_profile(**overrides):
    profile = {
        "userId": OBJECT_ID,
        "profileId": f"vfp_{OBJECT_ID}",
        "embedding": base64.b64encode(np.ones(4, dtype=np.float32).tobytes()).decode(),
    }
    profile.update(overrides)
    return profile


class TestGatewayProfileNeverReachesTheDisk:
    @pytest.mark.parametrize("profile_id", ["../../../escape", "a/b", "/abs", "x\x00y"])
    async def test_hostile_profile_id_never_reaches_np_save(self, cache, profile_id):
        with patch("services.voice_clone.voice_clone_model_creation.np.save") as save:
            model = await _creator(cache).create_voice_model_from_gateway_profile(
                _gateway_profile(profileId=profile_id), OBJECT_ID
            )
        assert model is None
        save.assert_not_called()

    @pytest.mark.parametrize("user_id", ["../../escape", "a/b", ".."])
    async def test_hostile_user_id_never_reaches_np_save_nor_mkdir(self, cache, user_id):
        with patch("services.voice_clone.voice_clone_model_creation.np.save") as save:
            model = await _creator(cache).create_voice_model_from_gateway_profile(
                _gateway_profile(userId=user_id), OBJECT_ID
            )
        assert model is None
        save.assert_not_called()
        assert sorted(p.name for p in cache.parent.parent.rglob("*")) == ["cache", "voices"]

    @pytest.mark.parametrize(
        "profile_id",
        [f"vfp_{OBJECT_ID}", f"vp_{OBJECT_ID[:12]}", "0123456789ab", None, ""],
    )
    async def test_profile_ids_the_gateway_writes_still_build_the_model(self, cache, profile_id):
        model = await _creator(cache).create_voice_model_from_gateway_profile(
            _gateway_profile(profileId=profile_id), OBJECT_ID
        )
        assert model is not None
        assert Path(model.embedding_path).parent == cache / OBJECT_ID
        assert Path(model.embedding_path).exists()


class TestDeleteProfileSymlink:
    def test_delete_refuses_a_symlinked_user_dir_and_keeps_its_target(self, cache, monkeypatch):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from api.voice_api import create_voice_api_router

        outside = cache.parent.parent / "outside"
        outside.mkdir()
        (outside / "keep.txt").write_text("keep")
        (cache / "user_aB3-_xYz").symlink_to(outside, target_is_directory=True)

        monkeypatch.setenv("UPLOAD_DIR", str(cache.parent.parent / "uploads"))
        monkeypatch.setenv("AUDIO_OUTPUT_DIR", str(cache.parent.parent / "out"))
        service = MagicMock()
        service.voice_cache_dir = cache
        app = FastAPI()
        app.include_router(create_voice_api_router(voice_clone_service=service))

        response = TestClient(app, raise_server_exceptions=False).delete(
            "/api/v1/voice/profile", headers={"Authorization": "Bearer jwt.aB3-_xYz"}
        )
        assert response.status_code == 400
        assert "aB3" not in response.text
        assert (outside / "keep.txt").read_text() == "keep"


class TestUnicodeLookalikes:
    @pytest.mark.parametrize(
        "raw",
        [
            "user_K",  # KELVIN SIGN, devient « k » sous IGNORECASE
            "１２３",  # chiffres pleine chasse
            "٣٤",  # chiffres arabes-indiens, admis par \d
            "user_ı",  # i sans point
            "user_a​b",  # espace de largeur nulle
            "․․",  # point de conduite simple ×2, ressemble à « .. »
            "user_abc\r",
            "user_abc\t",
        ],
    )
    def test_lookalikes_are_refused(self, raw):
        with pytest.raises(VoiceCacheIdRejected):
            guard_voice_cache_id(raw)

    @pytest.mark.parametrize("raw", [b"user_abc", bytearray(b"abc"), ["abc"], 1.5, True])
    def test_non_strings_are_refused_with_a_fixed_reason(self, raw):
        with pytest.raises(VoiceCacheIdRejected) as caught:
            guard_voice_cache_id(raw)
        assert caught.value.reason == "not_a_string"


class TestLegitimateProducers:
    @pytest.mark.parametrize(
        "raw",
        [
            OBJECT_ID,
            OBJECT_ID.upper(),
            "user_" + "eyJhbGci"[-8:],
            "user_-_-_-_-_",
            "anonymous_" + "0123abcd",
            "temp_speaker_SPEAKER_00",
            "temp_speaker_s0",
            "temp_speaker_" + "123e4567-e89b-12d3-a456-426614174000",
            "temp_speaker_unknown",
        ],
    )
    def test_ids_produced_by_the_stack_pass_and_name_a_direct_child(self, cache, raw):
        assert voice_cache_user_dir(cache, raw) == cache / raw

    def test_the_longest_admitted_speaker_id_fits_the_bound(self):
        assert guard_voice_cache_id("temp_speaker_" + "a" * 51) == "temp_speaker_" + "a" * 51
        with pytest.raises(VoiceCacheIdRejected):
            guard_voice_cache_id("temp_speaker_" + "a" * 52)
