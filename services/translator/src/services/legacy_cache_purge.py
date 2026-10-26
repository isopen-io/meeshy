"""
#13102 — LA PURGE DU CACHE PRÉ-v3. Les traductions, transcriptions et pistes
rangées avant l'espace v3 l'ont été sans index d'effacement : l'oubli par
identifiant (`cache_forget`) ne les voit pas, et elles ne sont plus jamais
servies. Ce n'est qu'un cache régénérable : la purge les efface d'un coup, par
SCAN (jamais KEYS), à blanc par défaut, idempotente.

Script autonome, sans dépendance au paquet du translator, joué une fois au
déploiement, depuis le conteneur, avec le Redis du translator :

    python -I /workspace/src/services/legacy_cache_purge.py            # à blanc
    python -I /workspace/src/services/legacy_cache_purge.py --apply    # efface

Il ne journalise que des COMPTES, jamais une clé ni une valeur.
"""
import argparse
import asyncio
import json
import os

PRE_V3_PATTERNS = (
    "translation:text:*",
    "translation:keys:*",
    "audio:hash:mapping:*",
    "audio:transcription:*",
    "audio:translation:*",
)

_KEPT_PREFIXES = ("translation:text:v3:",)

_BATCH = 500


def _as_text(key) -> str:
    return key.decode() if isinstance(key, (bytes, bytearray)) else str(key)


async def _pre_v3_keys(client):
    seen = set()
    for pattern in PRE_V3_PATTERNS:
        async for raw in client.scan_iter(match=pattern, count=_BATCH):
            key = _as_text(raw)
            if key.startswith(_KEPT_PREFIXES) or key in seen:
                continue
            seen.add(key)
    return sorted(seen)


async def purge_pre_v3_cache(client, apply: bool = False) -> dict:
    keys = await _pre_v3_keys(client)
    deleted = 0
    if apply:
        for start in range(0, len(keys), _BATCH):
            deleted += int(await client.delete(*keys[start:start + _BATCH]) or 0)
    return {"apply": apply, "matched": len(keys), "deleted": deleted}


async def _main(apply: bool) -> dict:
    import redis.asyncio as aioredis

    client = aioredis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True)
    try:
        return await purge_pre_v3_cache(client, apply=apply)
    finally:
        await client.aclose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Purge du cache pré-v3 du translator (#13102), à blanc par défaut.")
    parser.add_argument("--apply", action="store_true", help="efface réellement (sinon : compte seulement)")
    arguments = parser.parse_args()
    print(json.dumps(asyncio.run(_main(arguments.apply))))
