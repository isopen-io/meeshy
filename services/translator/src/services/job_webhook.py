"""
Webhook de fin de job de traduction vocale (#18772).

La `webhookUrl` vient de la route publique de la passerelle (puis du PULL ZMQ,
non authentifié) ou de l'API REST du traducteur : une donnée NON FIABLE, comme
l'audioUrl. Elle passe donc par le garde de `utils/audio_url_guard.py` sous
`WEBHOOK_URL_POLICY` (liste `TRANSLATOR_WEBHOOK_ALLOWED_HOSTS`, vide par défaut).

- À la soumission, une URL refusée est OUBLIÉE (`admitted_webhook_url` rend
  `None`) : la traduction continue, son résultat reste disponible par polling.
- À l'envoi, l'URL est re-vérifiée, la connexion part vers l'adresse vérifiée
  par `VerifiedAudioHostResolver`, aucune redirection n'est suivie (un 3xx est
  un échec) et le proxy de l'environnement est ignoré.
- Le journal ne reçoit qu'une raison fixe, un statut HTTP ou le TYPE d'une
  exception : jamais l'URL, ni l'hôte, ni `str(e)`.
"""

import asyncio
import logging
from typing import Any, Callable, Dict, Optional

from utils.audio_url_guard import (
    WEBHOOK_URL_POLICY,
    GetAddrInfo,
    VerifiedAudioHostResolver,
    WebhookUrlRejected,
    admit_webhook_url,
)

logger = logging.getLogger(__name__)

WEBHOOK_TIMEOUT_SECONDS = 30


def admitted_webhook_url(raw: Optional[str]) -> Optional[str]:
    """Rend l'URL si le garde l'admet, sinon `None` (raison seule au journal)."""
    if not raw:
        return None
    try:
        return admit_webhook_url(raw).url
    except WebhookUrlRejected as rejected:
        logger.warning(f"[PIPELINE] webhook refusé: {rejected.reason}")
        return None


def open_webhook_session(getaddrinfo: Optional[GetAddrInfo] = None):
    """Session dont chaque connexion part vers une adresse vérifiée, hors proxy."""
    import aiohttp

    connector = aiohttp.TCPConnector(
        resolver=VerifiedAudioHostResolver(getaddrinfo=getaddrinfo, policy=WEBHOOK_URL_POLICY),
        use_dns_cache=False,
    )
    return aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=WEBHOOK_TIMEOUT_SECONDS),
        connector=connector,
        trust_env=False,
    )


async def send_job_webhook(
    raw_url: Optional[str],
    payload: Dict[str, Any],
    open_session: Optional[Callable[[], Any]] = None,
) -> bool:
    """POST la charge vers une URL admise. Rend True si le tiers répond 2xx."""
    try:
        admitted = admit_webhook_url(raw_url)
    except WebhookUrlRejected as rejected:
        logger.warning(f"[PIPELINE] webhook refusé: {rejected.reason}")
        return False

    opener = open_session or open_webhook_session
    try:
        async with opener() as session:
            async with session.post(admitted.url, json=payload, allow_redirects=False) as response:
                return _delivered(response.status)
    except WebhookUrlRejected as rejected:
        logger.warning(f"[PIPELINE] webhook refusé: {rejected.reason}")
    except asyncio.TimeoutError:
        logger.warning("[PIPELINE] webhook non délivré: timeout")
    except Exception as error:
        logger.warning(f"[PIPELINE] webhook non délivré: {type(error).__name__}")
    return False


def _delivered(status: int) -> bool:
    if 200 <= status < 300:
        logger.info(f"[PIPELINE] webhook délivré (HTTP {status})")
        return True
    logger.warning(f"[PIPELINE] webhook non délivré: HTTP {status}")
    return False
