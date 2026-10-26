"""
#13102 — l'OUBLI : quand la passerelle efface une pièce ou le contenu d'un
message (vue unique brûlée, éphémère échu, message ou compte supprimé), le
translator efface ce qu'il en avait tiré et rangé dans Redis :

- pour une pièce : sa transcription et ses pistes traduites, par empreinte
  audio et par identifiant (forme héritée), et la table `attachmentId →
  empreinte` ;
- pour un message : les traductions rangées pour lui, texte entier et
  segments, par l'index que `TranslationCacheService` pose à l'écriture.

La demande ne porte que des IDENTIFIANTS : aucun texte effacé ne voyage, ni
ne se range dans la file de rejeu de la passerelle. Idempotente : une pièce ou
un message déjà oubliés, ou jamais vus, ne font rien. La passerelle la rejoue
jusqu'à recevoir `cache_forget_done` (même `requestId`).
"""

import re
from typing import Any, Dict

OBJECT_ID = re.compile(r"^[0-9a-f]{24}$")


def _ids(values: Any) -> list:
    return list(dict.fromkeys(v for v in values if isinstance(v, str) and OBJECT_ID.match(v))) if isinstance(values, list) else []


def parse_forget_request(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """Ce qu'une demande d'oubli porte, lu comme une donnée : rien ne se croit sur parole."""
    request_id = request_data.get("requestId")
    return {
        "requestId": request_id if isinstance(request_id, str) and 0 < len(request_id) <= 64 else None,
        "attachmentIds": _ids(request_data.get("attachmentIds")),
        "messageIds": _ids(request_data.get("messageIds")),
    }


async def forget_cached_content(audio_cache, translation_cache, request: Dict[str, Any]) -> int:
    deleted = 0
    for attachment_id in request["attachmentIds"]:
        deleted += await audio_cache.forget_attachment(attachment_id)
    for message_id in request["messageIds"]:
        deleted += await translation_cache.forget_message(message_id)
    return deleted
