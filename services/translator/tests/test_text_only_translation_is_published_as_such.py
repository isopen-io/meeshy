"""
#16340 — une traduction texte seule (TTS en échec) se publie COMME TELLE.

La passerelle annonce l'adresse attendue d'une piste même quand le binaire
manque (il « suit par un autre chemin »). Pour une traduction dont la voix
n'existe pas, cette adresse serait morte : le client la jouerait et tomberait
sur un 404. Le translator le dit donc explicitement, `textOnly: true`, sur les
deux chemins de publication (progressif et résultat final).
"""

import json

import pytest

try:
    from services.zmq_audio_handler import AudioHandler
    from services.audio_pipeline.audio_message_pipeline import AudioMessageResult, OriginalAudio
    from services.audio_pipeline.translation_stage import TranslatedAudioVersion
    _IMPORT_OK = True
except Exception:  # pragma: no cover - optional heavy ML deps absent
    _IMPORT_OK = False

pytestmark = pytest.mark.skipif(not _IMPORT_OK, reason="Handler import requires the translator ML stack")


class CapturingSocket:
    def __init__(self):
        self.frames = []

    async def send_multipart(self, frames):
        self.frames.append(frames)

    async def send_json(self, payload):
        self.frames.append([json.dumps(payload).encode("utf-8")])

    async def send(self, payload):
        self.frames.append([payload])

    def metadata(self):
        return [json.loads(frames[0].decode("utf-8")) for frames in self.frames]


def _handler():
    handler = AudioHandler.__new__(AudioHandler)
    handler.pub_socket = CapturingSocket()
    return handler


def _text_only(language="en"):
    return TranslatedAudioVersion.text_only_version(language, "Hello, this is a voice message.")


@pytest.mark.unit
async def test_the_progressive_event_of_a_text_only_translation_says_so():
    handler = _handler()

    await handler._publish_translation_ready("task-1", {
        "message_id": "m1", "attachment_id": "a1", "language": "en",
        "translation": _text_only(), "is_single_language": True,
    })

    [metadata] = handler.pub_socket.metadata()
    assert metadata["translatedAudio"]["textOnly"] is True
    assert metadata["translatedAudio"]["translatedText"] == "Hello, this is a voice message."


@pytest.mark.unit
async def test_the_final_result_carries_the_text_only_flag_per_language():
    handler = _handler()
    result = AudioMessageResult(
        message_id="m1",
        attachment_id="a1",
        original=OriginalAudio(
            audio_path="/tmp/a.wav", audio_url="", transcription="Bonjour", language="fr",
            duration_ms=2000, confidence=0.9, source="whisper", segments=[],
        ),
        translations={"en": _text_only("en")},
        voice_model_user_id="u1",
        voice_model_quality=0.7,
        processing_time_ms=10,
        requested_languages=["en"],
    )

    await handler._publish_audio_result("task-2", result, 10)

    [metadata] = handler.pub_socket.metadata()
    [english] = metadata["translatedAudios"]
    assert english["textOnly"] is True


@pytest.mark.unit
async def test_a_synthesised_translation_is_not_flagged_text_only():
    handler = _handler()
    voiced = TranslatedAudioVersion(
        language="es", translated_text="Hola", audio_path="", audio_url="/tts/es.ogg",
        duration_ms=900, format="ogg", voice_cloned=False, voice_quality=0.0, processing_time_ms=1,
        audio_data_base64="AAAA", audio_mime_type="audio/ogg",
    )

    await handler._publish_translation_ready("task-3", {
        "message_id": "m1", "attachment_id": "a1", "language": "es",
        "translation": voiced, "is_single_language": True,
    })

    [metadata] = handler.pub_socket.metadata()
    assert metadata["translatedAudio"]["textOnly"] is False
