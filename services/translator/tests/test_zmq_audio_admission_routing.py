"""
#11268 — une requête `audio_process` n'est plus lancée sans attendre : elle
entre par l'admission à priorités, au rang de son genre (le vocal d'un message
avant le média d'un post), et c'est l'admission qui lance le traitement.
"""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest


def _frames(**payload) -> list:
    return [json.dumps({"type": "audio_process", **payload}).encode("utf-8")]


class _RecordingAdmission:
    def __init__(self):
        self.calls = []

    async def run(self, priority, start):
        self.calls.append(priority)
        return await start()


@pytest.fixture
def core():
    from src.services.zmq_server_core import ZMQTranslationServer

    instance = ZMQTranslationServer.__new__(ZMQTranslationServer)
    instance.active_tasks = set()
    instance.translation_handler = MagicMock()
    instance.audio_handler = MagicMock()
    instance.audio_handler._handle_audio_process_request = AsyncMock(return_value="traité")
    instance.transcription_handler = MagicMock()
    instance.voice_handler = None
    instance._create_tracked_task = MagicMock()
    instance._inject_binary_frames = MagicMock()
    instance.audio_admission = _RecordingAdmission()
    return instance


async def _run_tracked(core):
    coroutine, label = core._create_tracked_task.call_args[0]
    assert label == "audio_process"
    return await coroutine


@pytest.mark.asyncio
async def test_a_message_vocal_enters_at_the_message_rank(core):
    from src.utils.audio_admission import MESSAGE_VOICE

    await core._handle_translation_request_multipart(_frames(messageId="m1", attachmentId="a1"))

    assert await _run_tracked(core) == "traité"
    assert core.audio_admission.calls == [MESSAGE_VOICE]
    core.audio_handler._handle_audio_process_request.assert_awaited_once()


@pytest.mark.asyncio
async def test_a_post_media_enters_at_the_post_rank(core):
    from src.utils.audio_admission import POST_MEDIA

    await core._handle_translation_request_multipart(_frames(messageId="m2", attachmentId="a2", postId="p1", postMediaId="pm1"))

    await _run_tracked(core)
    assert core.audio_admission.calls == [POST_MEDIA]
