"""
#18667 — un profil vocal reçu par ZMQ ne s'écrit que sous le répertoire
temporaire du traducteur, quel que soit son user_id ou son audio_format.

Le socket ZMQ n'est pas authentifié (#18629) : user_id et audio_format sont
des données de requête. Ces témoins passent par le vrai VoiceProfileHandler,
seul le service de clonage est doublé.
"""

import base64
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.voice_profile_handler import (  # noqa: E402
    MIN_PROFILE_AUDIO_DURATION_MS,
    VoiceProfileHandler,
)

OBJECT_ID = "65a1f0c2b3d4e5f6a7b8c9d0"
AUDIO_BYTES = b"RIFF\x24\x00\x00\x00WAVEfmt fake-audio"
AUDIO_B64 = base64.b64encode(AUDIO_BYTES).decode()


class RecordingCloneService:
    def __init__(self, duration_ms: int):
        self.duration_ms = duration_ms
        self.seen: List[Dict[str, Any]] = []

    async def _get_audio_duration_ms(self, audio_path: str) -> int:
        path = Path(audio_path)
        self.seen.append({
            'path': path,
            'existed': path.exists(),
            'content': path.read_bytes() if path.exists() else None,
        })
        return self.duration_ms


def make_handler(tmp_path: Path, monkeypatch, duration_ms: int = 1000):
    monkeypatch.setattr(tempfile, 'tempdir', str(tmp_path / 'tmp'))
    (tmp_path / 'tmp').mkdir(exist_ok=True)
    service = RecordingCloneService(duration_ms)
    handler = VoiceProfileHandler(voice_clone_service=service)
    verified: List[Dict[str, Any]] = []

    async def record_verify(audio_path, existing_fingerprint):
        path = Path(audio_path)
        verified.append({'path': path, 'existed': path.exists()})
        return {'is_match': True, 'similarity': 0.9}

    monkeypatch.setattr(handler, '_verify_fingerprint_match', record_verify)
    return handler, service, verified


def analyze_request(user_id: str, audio_format: str = 'wav') -> Dict[str, Any]:
    return {
        'type': 'voice_profile_analyze',
        'request_id': 'req-1',
        'user_id': user_id,
        'audio_data': AUDIO_B64,
        'audio_format': audio_format,
    }


def verify_request(user_id: str, audio_format: str = 'wav') -> Dict[str, Any]:
    return {
        'type': 'voice_profile_verify',
        'request_id': 'req-2',
        'user_id': user_id,
        'audio_data': AUDIO_B64,
        'audio_format': audio_format,
        'existing_fingerprint': {'fingerprint_id': 'vfp_x'},
    }


def files_outside(root: Path, temp_dir: Path) -> List[Path]:
    return [
        p for p in root.rglob('*')
        if p.is_file() and temp_dir not in p.parents
    ]


def hostile_user_ids(tmp_path: Path) -> List[str]:
    outside = tmp_path / 'models'
    outside.mkdir(exist_ok=True)
    return [str(outside / 'evil'), '../../escaped', f'..{os.sep}escaped']


async def run_site(handler, site: str, user_id: str, audio_format: str = 'wav'):
    request = (analyze_request if site == 'analyze' else verify_request)(user_id, audio_format)
    return await handler.handle_request(request)


def written_paths(site: str, service, verified) -> List[Path]:
    seen = service.seen if site == 'analyze' else verified
    return [entry['path'] for entry in seen]


def assert_user_id_refused(result, site, service, verified, tmp_path, temp_dir):
    assert result['success'] is False
    assert result['error'] == 'Invalid user_id'
    assert result['user_id'] == ''
    assert written_paths(site, service, verified) == []
    assert files_outside(tmp_path, temp_dir) == []
    assert [p for p in temp_dir.rglob('*') if p.is_file()] == []


@pytest.mark.asyncio
@pytest.mark.parametrize('site', ['analyze', 'verify'])
async def test_hostile_user_id_is_refused_before_any_write(tmp_path, monkeypatch, site):
    for user_id in hostile_user_ids(tmp_path):
        handler, service, verified = make_handler(tmp_path, monkeypatch)
        temp_dir = handler.temp_dir.resolve()

        result = await run_site(handler, site, user_id)

        assert_user_id_refused(result, site, service, verified, tmp_path, temp_dir)


@pytest.mark.asyncio
@pytest.mark.parametrize('site', ['analyze', 'verify'])
@pytest.mark.parametrize('user_id', [
    OBJECT_ID[:23],
    OBJECT_ID + 'a',
    'z' * 24,
    OBJECT_ID[:23] + '/',
    OBJECT_ID + '\n',
    12345,
    ['65a1f0c2b3d4e5f6a7b8c9d0'],
    {'$ne': None},
])
async def test_user_id_that_is_not_an_object_id_is_refused(tmp_path, monkeypatch, site, user_id):
    handler, service, verified = make_handler(tmp_path, monkeypatch)
    temp_dir = handler.temp_dir.resolve()

    result = await run_site(handler, site, user_id)

    assert_user_id_refused(result, site, service, verified, tmp_path, temp_dir)


@pytest.mark.asyncio
@pytest.mark.parametrize('site', ['analyze', 'verify'])
async def test_user_id_refusal_writes_nothing_to_logs(tmp_path, monkeypatch, caplog, site):
    handler, _, _ = make_handler(tmp_path, monkeypatch)
    caplog.set_level('DEBUG')

    await run_site(handler, site, '../../escaped')

    assert caplog.records == []


@pytest.mark.asyncio
@pytest.mark.parametrize('site', ['analyze', 'verify'])
async def test_uppercase_object_id_is_accepted(tmp_path, monkeypatch, site):
    handler, service, verified = make_handler(tmp_path, monkeypatch)

    result = await run_site(handler, site, OBJECT_ID.upper())

    assert result['user_id'] == OBJECT_ID.upper()
    assert len(written_paths(site, service, verified)) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize('site', ['analyze', 'verify'])
async def test_temp_file_name_does_not_carry_user_id(tmp_path, monkeypatch, site):
    handler, service, verified = make_handler(tmp_path, monkeypatch)

    await run_site(handler, site, OBJECT_ID)

    paths = written_paths(site, service, verified)
    assert len(paths) == 1
    assert OBJECT_ID not in paths[0].name


@pytest.mark.asyncio
@pytest.mark.parametrize('site', ['analyze', 'verify'])
@pytest.mark.parametrize('audio_format', [
    'exe', 'wav/../../../escaped', '../escaped', 'a/b', 'wav\x00', '', 'concat', 'txt',
])
async def test_audio_format_outside_closed_list_is_refused(tmp_path, monkeypatch, site, audio_format):
    handler, service, verified = make_handler(tmp_path, monkeypatch)

    result = await run_site(handler, site, OBJECT_ID, audio_format)

    assert result['success'] is False
    assert result['error'] == 'Unsupported audio format'
    assert written_paths(site, service, verified) == []
    assert [p for p in tmp_path.rglob('*') if p.is_file()] == []


@pytest.mark.asyncio
@pytest.mark.parametrize('site', ['analyze', 'verify'])
@pytest.mark.parametrize('audio_format', [
    'wav', 'mp3', 'ogg', 'webm', 'm4a', 'flac',
    'WAV', 'Mp3',
    'wave', 'x-wav', 'mpeg', 'mp4', 'x-m4a', 'aac', 'opus', 'oga', 'caf', '3gp',
])
async def test_gateway_formats_still_work_and_temp_file_is_removed(tmp_path, monkeypatch, site, audio_format):
    handler, service, verified = make_handler(tmp_path, monkeypatch)

    result = await run_site(handler, site, OBJECT_ID, audio_format)

    seen = service.seen if site == 'analyze' else verified
    assert len(seen) == 1
    assert seen[0]['existed'] is True
    assert seen[0]['path'].suffix == f'.{audio_format.lower()}'
    assert seen[0]['path'].resolve().parent == handler.temp_dir.resolve()
    assert not seen[0]['path'].exists()
    if site == 'analyze':
        assert seen[0]['content'] == AUDIO_BYTES
        assert result['success'] is False
        assert f'Minimum {MIN_PROFILE_AUDIO_DURATION_MS/1000:.0f}s' in result['error']
    else:
        assert result['success'] is True
        assert result['is_match'] is True


@pytest.mark.asyncio
@pytest.mark.parametrize('site', ['analyze', 'verify'])
async def test_missing_audio_format_defaults_to_wav(tmp_path, monkeypatch, site):
    handler, service, verified = make_handler(tmp_path, monkeypatch)
    request = (analyze_request if site == 'analyze' else verify_request)(OBJECT_ID)
    del request['audio_format']

    await handler.handle_request(request)

    paths = written_paths(site, service, verified)
    assert len(paths) == 1
    assert paths[0].suffix == '.wav'


@pytest.mark.asyncio
@pytest.mark.parametrize('site', ['analyze', 'verify'])
async def test_resolved_path_guard_refuses_escape_even_if_list_is_widened(tmp_path, monkeypatch, site):
    import services.voice_profile_handler as module
    monkeypatch.setattr(
        module, 'ACCEPTED_AUDIO_FORMATS',
        module.ACCEPTED_AUDIO_FORMATS | {'wav/../../escaped'},
    )
    handler, service, verified = make_handler(tmp_path, monkeypatch)

    result = await run_site(handler, site, OBJECT_ID, 'wav/../../escaped')

    assert result['success'] is False
    assert result['error'] == 'Unsupported audio format'
    assert written_paths(site, service, verified) == []
    assert [p for p in tmp_path.rglob('*') if p.is_file()] == []
