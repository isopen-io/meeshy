"""
#13102 — le régime de la tâche en cours : un contenu chiffré AU REPOS
(conversations `server` / `hybrid`) ne se pose sur aucun disque du translator.

La passerelle déclare le régime sur la requête (`atRest: true`, comme le
texte depuis #12822). Le handler l'installe pour la DURÉE de la tâche
(`at_rest_scope`) ; les services de cache (`AudioCacheService`,
`TranslationCacheService`) le lisent eux-mêmes et ne lisent ni n'écrivent
rien pendant une tâche au repos — transcription, traductions, pistes TTS,
table de correspondance `attachmentId → empreinte`. Un seul point de garde,
que chaque étage du pipeline traverse sans avoir à le transporter.

`contextvars` suit la tâche asyncio et les sous-tâches qu'elle crée
(`asyncio.gather`, `create_task` copient le contexte) : deux tâches
concurrentes de régimes différents ne se contaminent pas.
"""

import functools
from contextlib import contextmanager
from contextvars import ContextVar
import re
from typing import Iterator, Optional

_AT_REST: ContextVar[bool] = ContextVar("meeshy_task_at_rest", default=False)
_MESSAGE: ContextVar[Optional[str]] = ContextVar("meeshy_task_message_id", default=None)
_OBJECT_ID = re.compile(r"^[0-9a-f]{24}$")


def request_is_at_rest(request_data: dict) -> bool:
    """Seul le booléen `true` compte : une chaîne « true » ne déclare rien."""
    return isinstance(request_data, dict) and request_data.get("atRest") is True


def in_at_rest_task() -> bool:
    return _AT_REST.get()


@contextmanager
def at_rest_scope(at_rest: bool) -> Iterator[None]:
    token = _AT_REST.set(bool(at_rest))
    try:
        yield
    finally:
        _AT_REST.reset(token)


def current_message_id() -> Optional[str]:
    return _MESSAGE.get()


@contextmanager
def message_scope(message_id) -> Iterator[None]:
    """
    #13102 — le message dont la tâche traduit le contenu : chaque traduction
    rangée pour lui est INDEXÉE sous son identifiant, pour que la passerelle
    puisse la faire oublier par l'identifiant seul, sans renvoyer le texte.
    """
    token = _MESSAGE.set(message_id if isinstance(message_id, str) and _OBJECT_ID.match(message_id) else None)
    try:
        yield
    finally:
        _MESSAGE.reset(token)


@contextmanager
def task_scope(at_rest: bool, message_id) -> Iterator[None]:
    with at_rest_scope(at_rest), message_scope(message_id):
        yield


def shown(text, limit=None) -> str:
    """
    Ce qu'un journal peut dire d'un texte : le texte (tronqué à `limit`) pour
    une tâche ordinaire, sa seule longueur pour une tâche au repos. Les
    journaux du translator sont un stockage comme un autre.
    """
    value = "" if text is None else str(text)
    if in_at_rest_task():
        return f"<{len(value)} caractères tus>"
    return value if limit is None else value[:limit]


def under_declared_regime(handler):
    """
    Décore un handler `async (self, request_data)` : la requête s'exécute sous
    le régime que la passerelle déclare (`atRest`) et pour le message qu'elle
    nomme (`messageId`), du premier au dernier `await`.
    """
    @functools.wraps(handler)
    async def wrapper(self, request_data, *args, **kwargs):
        message_id = request_data.get("messageId") if isinstance(request_data, dict) else None
        with task_scope(request_is_at_rest(request_data), message_id):
            return await handler(self, request_data, *args, **kwargs)
    return wrapper

