"""
#17205 — le premier frame d'une requête multipart ZMQ est un objet JSON UTF-8,
ou il est refusé : une seule ligne `[TRANSLATOR]` qui ne nomme que le TYPE du
défaut, jamais le contenu du frame.
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def parse_request_frame(frame: bytes) -> Optional[dict]:
    try:
        decoded = json.loads(frame.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        logger.error(f"[TRANSLATOR] Frame de requête refusé : {type(error).__name__}")
        return None
    if not isinstance(decoded, dict):
        logger.error(f"[TRANSLATOR] Frame de requête refusé : {type(decoded).__name__}")
        return None
    return decoded
