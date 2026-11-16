"""
Garde des `audioUrl` reçues par ZMQ (#18666).

Le socket PULL du traducteur n'est pas authentifié : une URL portée par une
requête est une donnée NON FIABLE. Sans garde, `session.get(audio_url)` ouvrait
une SSRF vers les métadonnées du nuage, la boucle locale et le réseau interne.

Une URL n'est téléchargée que si :
- son schéma est `https` ;
- elle ne porte pas d'identifiants (`user@host`) ;
- son port est absent ou 443 (aucun autre port n'est admis : un CDN sert sur
  443, et un port explicite est la forme ordinaire d'une sonde interne) ;
- son hôte figure, en comparaison EXACTE et en minuscules, dans
  `TRANSLATOR_AUDIO_URL_ALLOWED_HOSTS` (noms séparés par des virgules). VIDE PAR
  DÉFAUT : toute URL est alors refusée, fail-closed — la passerelle n'en envoie
  aucune aujourd'hui ;
- un hôte IP littéral est de plus global ;
- TOUTES les adresses que l'hôte résout sont globales.

La résolution et sa vérification vivent dans `VerifiedAudioHostResolver`, posé
sur le connecteur aiohttp : la connexion part vers l'adresse même qui a été
vérifiée (pas de seconde résolution, donc pas de DNS rebinding), et le nom
d'origine reste celui du SNI et de l'en-tête Host. Les redirections ne sont
jamais suivies (à la charge de l'appelant : `allow_redirects=False`).

Le refus ne porte qu'une RAISON fixe, jamais l'URL ni l'hôte : ni les journaux
ni les charges d'erreur n'en reçoivent une miette.
"""

import asyncio
import ipaddress
import os
import socket
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, FrozenSet, List, Optional, Sequence, Tuple
from urllib.parse import urlsplit

ALLOWED_HOSTS_ENV = "TRANSLATOR_AUDIO_URL_ALLOWED_HOSTS"
AUDIO_URL_REJECTED_MESSAGE = "Audio URL rejected"
ALLOWED_PORTS = (None, 443)

AddrInfo = Tuple[int, int, int, str, Tuple[Any, ...]]
GetAddrInfo = Callable[..., Awaitable[Sequence[AddrInfo]]]


class AudioUrlRejected(Exception):
    """URL audio refusée. `reason` est un libellé fixe, sans donnée de requête."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(f"{AUDIO_URL_REJECTED_MESSAGE}: {reason}")


@dataclass(frozen=True)
class AdmittedAudioUrl:
    url: str
    host: str


def allowed_audio_url_hosts() -> FrozenSet[str]:
    raw = os.getenv(ALLOWED_HOSTS_ENV) or ""
    return frozenset(entry.strip().lower() for entry in raw.split(",") if entry.strip())


def is_public_address(raw: str) -> bool:
    try:
        address = ipaddress.ip_address(raw)
    except ValueError:
        return False
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        address = address.ipv4_mapped
    return address.is_global and not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


def _ip_literal(host: str) -> Optional[str]:
    try:
        return str(ipaddress.ip_address(host))
    except ValueError:
        return None


def _is_malformed(raw: object) -> bool:
    return not isinstance(raw, str) or not raw or any(c.isspace() or ord(c) < 0x20 or ord(c) == 0x7F for c in raw)


def admit_audio_url(raw: object, allowed_hosts: Optional[FrozenSet[str]] = None) -> AdmittedAudioUrl:
    """Rend l'URL et son hôte normalisé si la forme est admise, sinon lève."""
    if _is_malformed(raw):
        raise AudioUrlRejected("malformed")
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError:
        raise AudioUrlRejected("malformed") from None
    if parts.scheme.lower() != "https":
        raise AudioUrlRejected("scheme")
    if parts.username is not None or parts.password is not None:
        raise AudioUrlRejected("userinfo")
    host = (parts.hostname or "").lower()
    if not host:
        raise AudioUrlRejected("malformed")
    if port not in ALLOWED_PORTS:
        raise AudioUrlRejected("port")
    literal = _ip_literal(host)
    if literal is not None and not is_public_address(literal):
        raise AudioUrlRejected("private_address")
    allowed = allowed_hosts if allowed_hosts is not None else allowed_audio_url_hosts()
    if host not in allowed:
        raise AudioUrlRejected("host_not_allowed")
    return AdmittedAudioUrl(url=raw, host=host)


async def _system_getaddrinfo(host: str, port: int, family: int = 0) -> Sequence[AddrInfo]:
    loop = asyncio.get_running_loop()
    return await loop.getaddrinfo(host, port, family=family, type=socket.SOCK_STREAM)


class VerifiedAudioHostResolver:
    """Résout un hôte autorisé et ne rend que des adresses globales, sinon lève.

    Contrat de `aiohttp.abc.AbstractResolver` (`resolve` rend des `ResolveResult`),
    tenu sans importer aiohttp : le garde reste chargeable là où aiohttp manque.
    """

    def __init__(
        self,
        getaddrinfo: Optional[GetAddrInfo] = None,
        allowed_hosts: Optional[FrozenSet[str]] = None,
    ):
        self._getaddrinfo = getaddrinfo or _system_getaddrinfo
        self._allowed_hosts = allowed_hosts

    def _allowed(self) -> FrozenSet[str]:
        return self._allowed_hosts if self._allowed_hosts is not None else allowed_audio_url_hosts()

    async def resolve(self, host: str, port: int = 0, family: int = socket.AF_UNSPEC) -> List[Dict[str, Any]]:
        if host.lower() not in self._allowed():
            raise AudioUrlRejected("host_not_allowed")
        try:
            infos = await self._getaddrinfo(host, port, family)
        except (OSError, UnicodeError):
            raise AudioUrlRejected("resolution_failed") from None
        if not infos:
            raise AudioUrlRejected("resolution_failed")
        if not all(is_public_address(str(info[4][0])) for info in infos):
            raise AudioUrlRejected("private_address")
        return [
            {
                "hostname": host,
                "host": str(info[4][0]),
                "port": port,
                "family": info[0],
                "proto": info[2],
                "flags": socket.AI_NUMERICHOST | socket.AI_NUMERICSERV,
            }
            for info in infos
        ]

    async def close(self) -> None:
        return None
