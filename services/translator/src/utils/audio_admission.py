"""
L'admission des requêtes `audio_process` (#11268) : le vocal d'un MESSAGE passe
avant le média d'un POST.

Chaque requête `audio_process` lançait jusqu'ici sa tâche sans attendre : dix
médias de post arrivés d'un coup partageaient le processeur avec le vocal qu'un
lecteur attend dans une conversation. Les requêtes entrent désormais par une
admission à concurrence BORNÉE (`AUDIO_PROCESS_CONCURRENCY`, 2 par défaut) ;
quand une place se libère, la plus haute priorité part d'abord, puis l'ordre
d'arrivée départage. Une tâche qui échoue rend sa place.

Le gateway marque un média de post par `postId` / `postMediaId`
(`AudioProcessRequest`, `services/gateway/src/services/zmq-translation/types.ts`).
"""

from __future__ import annotations

import asyncio
import heapq
import itertools
from typing import Awaitable, Callable, Mapping, TypeVar

MESSAGE_VOICE = 0
POST_MEDIA = 1

DEFAULT_CONCURRENCY = 2

T = TypeVar("T")


def audio_request_priority(request: Mapping[str, object]) -> int:
    return POST_MEDIA if request.get("postId") or request.get("postMediaId") else MESSAGE_VOICE


def audio_process_concurrency(env: Mapping[str, str]) -> int:
    raw = env.get("AUDIO_PROCESS_CONCURRENCY", "")
    return int(raw) if raw.isdigit() and int(raw) > 0 else DEFAULT_CONCURRENCY


class AudioAdmission:
    def __init__(self, concurrency: int = DEFAULT_CONCURRENCY) -> None:
        self._free = max(1, concurrency)
        self._waiting: list[tuple[int, int, asyncio.Future[None]]] = []
        self._arrival = itertools.count()

    async def run(self, priority: int, start: Callable[[], Awaitable[T]]) -> T:
        await self._acquire(priority)
        try:
            return await start()
        finally:
            self._release()

    async def _acquire(self, priority: int) -> None:
        if self._free > 0 and not self._waiting:
            self._free -= 1
            return
        turn: asyncio.Future[None] = asyncio.get_running_loop().create_future()
        heapq.heappush(self._waiting, (priority, next(self._arrival), turn))
        try:
            await turn
        except asyncio.CancelledError:
            if turn.done() and not turn.cancelled():
                self._release()
            raise

    def _release(self) -> None:
        while self._waiting:
            _, _, turn = heapq.heappop(self._waiting)
            if not turn.done():
                turn.set_result(None)
                return
        self._free += 1
