"""
Test 36: progressive translation_ready publish must read audio from disk

`_publish_translation_ready` publishes each language's audio as soon as it is
ready (progressive delivery, distinct from the final `audio_process_completed`).
The real `TranslatedAudioVersion` produced by the pipeline never carries raw
`audio_bytes` in memory and the synthesizer stopped populating
`audio_data_base64` (D2 refactor) — audio is ALWAYS delivered via `audio_path`
on disk for this event. If that fallback ever throws, the progressive event is
silently downgraded to text-only (no audio) and the client never gets its
early per-language audio update.

Prod incident 2026-08-06: this was concretely broken (NameError: name 'os' is
not defined) after a merge (2026-06-08) reintroduced the inline
`translation.audio_path and os.path.exists(...)` file-read branch while a
sibling commit had already removed `import os` as part of migrating to the
shared `read_audio_bytes()` helper.

The import pulls the ML stack; it is skipped gracefully when those optional
deps are absent so the suite still collects.
"""

import os
import sys
import types

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

try:
    from services.zmq_audio_handler import AudioHandler
    _IMPORT_OK = True
except Exception:  # pragma: no cover - optional heavy ML deps absent
    _IMPORT_OK = False

pytestmark = pytest.mark.skipif(
    not _IMPORT_OK,
    reason="Handler import requires the translator ML stack",
)


def _translation_on_disk(audio_path):
    """Mirrors the real TranslatedAudioVersion shape: no `audio_bytes`
    attribute at all, `audio_data_base64` always None post-D2, audio only
    reachable via `audio_path` on disk."""
    return types.SimpleNamespace(
        language="en",
        translated_text="hello",
        audio_path=audio_path,
        audio_url="/audio/x.mp3",
        duration_ms=1000,
        voice_cloned=False,
        voice_quality=0.9,
        audio_mime_type="audio/mpeg",
        audio_data_base64=None,
    )


@pytest.fixture
def handler():
    h = AudioHandler.__new__(AudioHandler)
    h.pub_socket = types.SimpleNamespace(
        send_multipart=None,
        send_json=None,
    )
    return h


@pytest.mark.asyncio
async def test_publishes_audio_bytes_read_from_disk(handler, tmp_path):
    audio_file = tmp_path / "translated.mp3"
    audio_file.write_bytes(b"fake-mp3-bytes")

    multipart_calls = []

    async def fake_send_multipart(frames):
        multipart_calls.append(frames)

    handler.pub_socket.send_multipart = fake_send_multipart

    translation_data = {
        'message_id': 'msg1',
        'attachment_id': 'att1',
        'translation': _translation_on_disk(str(audio_file)),
        'is_single_language': True,
        'is_last_language': True,
    }

    await handler._publish_translation_ready('task1', translation_data)

    assert len(multipart_calls) == 1, (
        "audio_path pointait vers un fichier existant : la publication doit "
        "envoyer l'audio en multipart binaire, pas retomber sur du JSON seul"
    )
    frames = multipart_calls[0]
    assert frames[1] == b"fake-mp3-bytes"
