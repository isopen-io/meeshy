"""Régression #5610 : le verrou de sérialisation Chatterbox ne gèle plus l'event loop.

Incident production (2026-08-31 → mesuré le 2026-09-07) : `meeshy-translator`
est resté bloqué sept jours, CPU à 0.01%, y compris `/live` (qui ne fait
aucune I/O) devenu injoignable. `ChatterboxBackend.synthesize()` sérialisait
ses appels avec `with self._synthesis_lock:` où `_synthesis_lock` est un
`threading.Lock()` — un verrou OS SYNCHRONE, pas un `asyncio.Lock()`.

Tous les workers du translator tournent en coroutines sur le MÊME thread
d'event loop (`asyncio.create_task`, pas des process/threads séparés). Le
watchdog TTS (`with_synth_watchdog`, 180s) devait border un `generate()`
bloqué et lui faire libérer le verrou pour les autres — mais si un DEUXIÈME
job atteint `with self._synthesis_lock:` pendant que le premier est bloqué,
son `acquire()` gèle SYNCHRONEMENT tout le thread d'event loop, watchdog
compris (son minuteur `asyncio.wait_for` a besoin de ce même thread pour
jamais expirer). Résultat : le verrou ne se libère jamais, et rien d'autre
sur ce thread ne peut plus s'exécuter — pas même un endpoint qui ne fait
aucune I/O.

Le correctif fait passer l'acquisition du verrou par
`loop.run_in_executor(None, lock.acquire)` : le blocage a lieu sur un thread
de l'executor, pas sur le thread d'event loop, qui reste donc réactif
pendant l'attente — watchdog inclus. Ce test isole exactement ce mécanisme
(sans dépendre de `chatterbox`/`torch`, indisponibles dans cet environnement
d'exécution) : il ne peut PAS tomber avec `with lock:` à la place de
`await loop.run_in_executor(None, lock.acquire)`.
"""

import asyncio
import threading
import time

import pytest


@pytest.mark.unit
async def test_executor_acquire_keeps_event_loop_responsive_while_waiting():
    lock = threading.Lock()
    lock.acquire()  # simule une première synthèse qui détient déjà le verrou

    heartbeats: list[float] = []

    async def heartbeat() -> None:
        for _ in range(5):
            await asyncio.sleep(0.02)
            heartbeats.append(time.monotonic())

    async def acquire_like_fixed_code() -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lock.acquire)
        lock.release()

    heartbeat_task = asyncio.create_task(heartbeat())
    acquire_task = asyncio.create_task(acquire_like_fixed_code())

    # Le verrou reste tenu pendant cette fenêtre : si l'acquisition gelait
    # l'event loop (régression), aucun battement ne serait enregistré ici.
    await asyncio.sleep(0.15)
    assert len(heartbeats) >= 3, (
        "l'event loop s'est figé pendant l'attente du verrou — "
        "régression du deadlock #5610"
    )

    lock.release()  # la première synthèse "bloquée" se libère (ex: watchdog)
    await asyncio.wait_for(acquire_task, timeout=1.0)
    await heartbeat_task

    assert not lock.locked()


@pytest.mark.unit
async def test_synchronous_with_lock_would_freeze_the_event_loop() -> None:
    """Preuve négative : le motif fautif (`with lock:`) bloque bien le thread
    d'event loop — sans quoi le test positif ci-dessus ne prouverait rien."""
    lock = threading.Lock()
    lock.acquire()

    heartbeats: list[float] = []

    async def heartbeat() -> None:
        for _ in range(5):
            await asyncio.sleep(0.02)
            heartbeats.append(time.monotonic())

    def release_soon() -> None:
        time.sleep(0.1)
        lock.release()

    threading.Thread(target=release_soon, daemon=True).start()

    heartbeat_task = asyncio.create_task(heartbeat())

    # Reproduit le motif fautif : `.acquire()` synchrone sur le thread appelant,
    # qui est ICI le thread d'event loop du test — il gèle tant que le verrou
    # n'est pas libéré par le thread `release_soon` ci-dessus.
    with lock:
        pass

    # Vérifié AVANT d'attendre heartbeat_task : le blocage synchrone ci-dessus
    # a empêché l'event loop de faire tourner ne serait-ce qu'une itération,
    # donc aucun battement n'a pu être enregistré pendant cette fenêtre.
    assert len(heartbeats) == 0, (
        "le motif `with lock:` n'a pas gelé l'event loop comme attendu — "
        "ce test ne protège plus rien"
    )

    await heartbeat_task
    assert len(heartbeats) == 5
