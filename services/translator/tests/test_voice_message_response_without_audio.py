"""
#19648 — une traduction vocale sans audio (TTS en échec, #16340) se sert avec
une `audio_url` nulle sur la route HTTP du pipeline complet, au lieu de faire
tomber la réponse en 500 sur la validation du modèle.
"""

import pytest

try:
    from api.audio_api import VoiceMessageResponse
    _IMPORT_OK = True
except Exception:  # pragma: no cover - FastAPI absent
    _IMPORT_OK = False

pytestmark = pytest.mark.skipif(not _IMPORT_OK, reason="audio_api import requires FastAPI")


def _response(audio_url):
    return VoiceMessageResponse(
        original_text="Bonjour", original_language="fr",
        translated_text="Hello", target_language="en",
        audio_url=audio_url, processing_time_ms=12,
    )


@pytest.mark.unit
def test_a_text_only_voice_message_is_served_with_a_null_audio_url():
    assert _response(None).model_dump()["audio_url"] is None


@pytest.mark.unit
def test_a_synthesised_voice_message_keeps_its_audio_url():
    assert _response("/outputs/audio/translated/a.mp3").model_dump()["audio_url"] == "/outputs/audio/translated/a.mp3"
