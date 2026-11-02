"""
#13102 — troisième revue : les entrées rangées AVANT l'espace v3 ne sont ni
servies, ni orphelines. Les clés par identifiant de pièce passent en v3, et
une purge unique, idempotente, par SCAN, efface tout contenu pré-v3.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

from durable_redis_double import DictRedis, durable_service
from services.legacy_cache_purge import PRE_V3_PATTERNS, purge_pre_v3_cache
from services.redis_service import AudioCacheService
from services.task_privacy import at_rest_scope

PIECE = "aaaaaaaaaaaaaaaaaaaaaaa1"
MESSAGE = "bbbbbbbbbbbbbbbbbbbbbbb1"
HASH = "0123456789abcdef0123456789abcdef"


def _audio_cache(client):
    return AudioCacheService(durable_service(client))


@pytest.mark.asyncio
async def test_a_piece_keyed_entry_written_before_v3_is_never_served():
    client = DictRedis()
    client.data[f"audio:transcription:{PIECE}"] = json.dumps({"text": "ANCIENNE TRANSCRIPTION"})
    client.data[f"audio:translation:{PIECE}:en"] = json.dumps({"text": "OLD TRANSLATION"})
    cache = _audio_cache(client)
    with at_rest_scope(False):
        assert await cache.get_transcription(PIECE) is None
        assert await cache.get_translated_audio(PIECE, "en") is None


@pytest.mark.asyncio
async def test_piece_keyed_entries_are_written_and_forgotten_in_the_v3_space():
    client = DictRedis()
    cache = _audio_cache(client)
    with at_rest_scope(False):
        await cache.set_transcription(PIECE, {"text": "transcription"})
        await cache.set_translated_audio(PIECE, "en", {"text": "translation"})
    assert {f"audio:v3:transcription:{PIECE}", f"audio:v3:translation:{PIECE}:en"} <= set(client.data)
    assert not [k for k in client.data if k.startswith(("audio:transcription:", "audio:translation:"))]
    await cache.forget_attachment(PIECE)
    assert client.store == {}


def _seeded():
    client = DictRedis()
    legacy = [
        f"translation:text:{HASH}",
        f"translation:text:v2:{HASH}",
        f"translation:keys:message:{MESSAGE}:{HASH}",
        f"audio:hash:mapping:{PIECE}",
        f"audio:transcription:hash:{HASH}",
        f"audio:translation:hash:{HASH}:en",
        f"audio:transcription:{PIECE}",
        f"audio:translation:{PIECE}:en",
    ]
    kept = [
        f"translation:text:v3:{HASH}",
        f"audio:v3:transcription:hash:{HASH}",
        f"audio:v3:transcription:{PIECE}",
        f"audio:v3:hash:mapping:{PIECE}",
        "voice:profile:cccccccccccccccccccccc01",
    ]
    for key in legacy + kept:
        client.data[key] = "contenu"
    client.sets[f"translation:v3:message:{MESSAGE}"] = {HASH}
    kept.append(f"translation:v3:message:{MESSAGE}")
    return client, legacy, kept


@pytest.mark.asyncio
async def test_the_purge_is_dry_by_default_and_counts_every_pre_v3_entry():
    client, legacy, kept = _seeded()
    report = await purge_pre_v3_cache(client)
    assert report == {"apply": False, "matched": len(legacy), "deleted": 0}
    assert set(client.store) == set(legacy) | set(kept)
    assert client.keys_called is False


@pytest.mark.asyncio
async def test_the_purge_erases_every_pre_v3_entry_keeps_v3_and_is_idempotent():
    client, legacy, kept = _seeded()
    first = await purge_pre_v3_cache(client, apply=True)
    assert first == {"apply": True, "matched": len(legacy), "deleted": len(legacy)}
    assert set(client.store) == set(kept)
    second = await purge_pre_v3_cache(client, apply=True)
    assert second == {"apply": True, "matched": 0, "deleted": 0}


def test_every_pre_v3_key_shape_ever_written_is_covered_by_a_pattern():
    assert set(PRE_V3_PATTERNS) == {
        "translation:text:*",
        "translation:keys:*",
        "audio:hash:mapping:*",
        "audio:transcription:*",
        "audio:translation:*",
    }


def test_the_purge_runs_as_a_standalone_script_without_the_translator_package():
    script = Path(__file__).resolve().parents[1] / "src" / "services" / "legacy_cache_purge.py"
    result = subprocess.run([sys.executable, "-I", str(script), "--help"], capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr
    assert "--apply" in result.stdout
