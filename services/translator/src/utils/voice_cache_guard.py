"""
Garde des identifiants qui nomment le cache vocal (#18695).

L'identifiant d'utilisateur nomme un dossier (`voice_cache_dir / user_id`), des
fichiers (`{user_id}_combined_audio.wav`, `voice_{user_id}_….m4a`) et une clé
Redis (`voice:profile:{user_id}`). Il arrive par des canaux NON FIABLES : le PULL
ZMQ non authentifié (`senderId`, `existingVoiceProfile.userId`), l'en-tête
`Authorization` de la Voice API, les champs de formulaire de l'API audio.

Une seule forme est admise, `[A-Za-z0-9_-]{1,64}` : elle couvre l'ObjectId de la
passerelle, `user_<8 car. base64url>`, `anonymous_<hex>`, `temp_speaker_<id>`, et
exclut par construction `.`, `..`, `/`, `\\`, `:`, `*`, l'octet nul, les espaces
et tout caractère hors ASCII. Le dossier rendu est de plus vérifié, liens
symboliques résolus, comme ENFANT DIRECT de la racine du cache.

Le refus ne porte qu'une RAISON fixe, jamais l'identifiant : ni les journaux ni
les réponses d'erreur n'en reçoivent une miette.
"""

import re
from pathlib import Path

VOICE_CACHE_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{1,64}")
VOICE_CACHE_ID_REJECTED_MESSAGE = "Voice cache id rejected"
INVALID_USER_ID_DETAIL = "Invalid user identifier"


class VoiceCacheIdRejected(ValueError):
    """Identifiant refusé. `reason` est un libellé fixe, sans donnée de requête."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(f"{VOICE_CACHE_ID_REJECTED_MESSAGE}: {reason}")


def guard_voice_cache_id(raw: object) -> str:
    """Rend l'identifiant tel quel s'il a la forme admise, sinon lève."""
    if not isinstance(raw, str):
        raise VoiceCacheIdRejected("not_a_string")
    if VOICE_CACHE_ID_PATTERN.fullmatch(raw) is None:
        raise VoiceCacheIdRejected("invalid_form")
    return raw


def voice_cache_user_dir(voice_cache_dir: Path, raw: object) -> Path:
    """Rend `voice_cache_dir / id`, enfant direct de la racine une fois résolu, sinon lève."""
    candidate = Path(voice_cache_dir) / guard_voice_cache_id(raw)
    if candidate.resolve().parent != Path(voice_cache_dir).resolve():
        raise VoiceCacheIdRejected("outside_cache")
    return candidate
