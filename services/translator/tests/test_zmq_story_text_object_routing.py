"""
Routage ZMQ des traductions de textObjects de story.

Le gateway envoie un message `story_text_object_translation` par texte posé
sur le canvas d'une story. Le handler qui sait le traiter vit dans
`ZMQTranslationHandler`, mais c est ZMQTranslationServer qui aiguille les messages
entrants : tant que ce type n'y figurait pas, chaque requête tombait dans le
`else` final et n'y laissait qu'un « Type de requête inconnu ».

Le pipeline était donc mort en production sans que rien ne le signale côté
gateway, qui journalisait consciencieusement ses envois. Constaté le
2026-07-27 sur les logs de prod : trois envois par demande de traduction,
trois « Type de requête inconnu » en face, et des `textObjects` sans une
seule traduction pendant que la légende en accumulait six.
"""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest


def _frames(request_type: str, **extra) -> list:
    payload = {"type": request_type, **extra}
    return [json.dumps(payload).encode("utf-8")]


@pytest.fixture
def core():
    """`ZMQTranslationServer` réduit à ce que le routage touche."""
    from src.services.zmq_server_core import ZMQTranslationServer

    instance = ZMQTranslationServer.__new__(ZMQTranslationServer)
    instance.active_tasks = set()
    instance.translation_handler = MagicMock()
    instance.translation_handler._handle_story_text_object_translation = AsyncMock()
    instance.translation_handler._handle_translation_request_multipart = AsyncMock()
    instance.audio_handler = MagicMock()
    instance.transcription_handler = MagicMock()
    instance.voice_handler = None
    instance._create_tracked_task = MagicMock()
    instance._inject_binary_frames = MagicMock()
    return instance


@pytest.mark.asyncio
async def test_story_text_object_translation_is_routed_to_its_handler(core):
    await core._handle_translation_request_multipart(
        _frames(
            "story_text_object_translation",
            postId="post-1",
            textObjectIndex=0,
            text="Bonjour",
            sourceLanguage="fr",
            targetLanguages=["en"],
        )
    )

    assert core._create_tracked_task.called, (
        "le type story_text_object_translation doit être aiguillé, "
        "sinon il retombe dans le « Type de requête inconnu » et le pipeline "
        "de traduction des textes de story est silencieusement mort"
    )
    _, label = core._create_tracked_task.call_args[0]
    assert label == "story_text_object_translation"


@pytest.mark.asyncio
async def test_story_text_object_handler_receives_the_request_payload(core):
    await core._handle_translation_request_multipart(
        _frames(
            "story_text_object_translation",
            postId="post-42",
            textObjectIndex=2,
            text="Salut",
            sourceLanguage="fr",
            targetLanguages=["es", "de"],
        )
    )

    core.translation_handler._handle_story_text_object_translation.assert_called_once()
    payload = core.translation_handler._handle_story_text_object_translation.call_args[0][0]
    assert payload["postId"] == "post-42"
    assert payload["textObjectIndex"] == 2
    assert payload["targetLanguages"] == ["es", "de"]


@pytest.mark.asyncio
async def test_an_unknown_type_still_falls_through_without_routing(core):
    await core._handle_translation_request_multipart(_frames("type_qui_nexiste_pas"))

    assert not core._create_tracked_task.called
