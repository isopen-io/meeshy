#!/usr/bin/env python3
"""
Test réaliste: démonstration du problème avec lock.

Simule le scénario où TTS service a un _generation_lock qui sérialise les opérations.
"""

import time
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Tuple


class TTSServiceWithLock:
    """Simule un TTS service avec un lock (SÉQUENTIEL)"""

    def __init__(self):
        self._generation_lock = asyncio.Lock()

    async def synthesize(self, text: str, duration_ms: int = 1000) -> str:
        """Génère audio avec lock (SÉQUENTIEL même avec asyncio.gather)"""
        async with self._generation_lock:
            print(f"  🔒 Lock acquis pour {text}")
            await asyncio.sleep(duration_ms / 1000.0)
            print(f"  ✅ {text} complété ({duration_ms}ms)")
            return f"audio_{text}.mp3"


class TTSServiceWithoutLock:
    """Simule un TTS service SANS lock (PARALLÈLE)"""

    async def synthesize(self, text: str, duration_ms: int = 1000) -> str:
        """Génère audio SANS lock (peut s'exécuter en parallèle)"""
        print(f"  🚀 Démarrage {text}")
        await asyncio.sleep(duration_ms / 1000.0)
        print(f"  ✅ {text} complété ({duration_ms}ms)")
        return f"audio_{text}.mp3"


async def test_with_lock(languages: List[str], duration_ms: int = 1000):
    """Test avec lock (SÉQUENTIEL)"""
    print("\n" + "=" * 80)
    print("TEST 1: asyncio.gather + TTS avec LOCK (SÉQUENTIEL)")
    print("=" * 80)

    tts = TTSServiceWithLock()
    start = time.time()

    results = await asyncio.gather(*[
        tts.synthesize(lang, duration_ms)
        for lang in languages
    ])

    total_time = (time.time() - start) * 1000
    print(f"\n⏱️  Temps TOTAL: {total_time:.0f}ms")
    return total_time


async def test_without_lock(languages: List[str], duration_ms: int = 1000):
    """Test sans lock (PARALLÈLE avec asyncio.gather)"""
    print("\n" + "=" * 80)
    print("TEST 2: asyncio.gather + TTS SANS lock (PARALLÈLE)")
    print("=" * 80)

    tts = TTSServiceWithoutLock()
    start = time.time()

    results = await asyncio.gather(*[
        tts.synthesize(lang, duration_ms)
        for lang in languages
    ])

    total_time = (time.time() - start) * 1000
    print(f"\n⏱️  Temps TOTAL: {total_time:.0f}ms")
    return total_time


def test_threadpool_bypass_lock(languages: List[str], duration_ms: int = 1000):
    """Test ThreadPoolExecutor pour BYPASSER le lock"""
    print("\n" + "=" * 80)
    print("TEST 3: ThreadPoolExecutor (BYPASS le lock - chaque thread a sa propre instance)")
    print("=" * 80)

    def process_language_sync(lang: str) -> str:
        """Thread avec sa propre event loop ET sa propre instance TTS"""
        # Créer une nouvelle boucle d'événements pour ce thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            # Créer une instance TTS PAR THREAD (pas de lock partagé)
            tts = TTSServiceWithLock()  # Même avec lock, chaque thread a sa propre instance

            print(f"  🚀 Thread démarré pour {lang}")
            result = loop.run_until_complete(tts.synthesize(lang, duration_ms))
            return result
        finally:
            loop.close()

    start = time.time()

    with ThreadPoolExecutor(max_workers=len(languages)) as executor:
        futures = {executor.submit(process_language_sync, lang): lang
                   for lang in languages}

        for future in as_completed(futures):
            lang = futures[future]
            result = future.result()

    total_time = (time.time() - start) * 1000
    print(f"\n⏱️  Temps TOTAL: {total_time:.0f}ms")
    return total_time


def main():
    languages = ["fr", "es", "de"]
    duration_ms = 1000

    print("=" * 80)
    print("DÉMONSTRATION: IMPACT DU LOCK SUR LA PARALLÉLISATION")
    print("=" * 80)
    print(f"Langues: {languages}")
    print(f"Durée simulée: {duration_ms}ms par langue")

    # Test 1: asyncio.gather avec lock (SÉQUENTIEL)
    time_with_lock = asyncio.run(test_with_lock(languages, duration_ms))

    # Test 2: asyncio.gather sans lock (PARALLÈLE)
    time_without_lock = asyncio.run(test_without_lock(languages, duration_ms))

    # Test 3: ThreadPoolExecutor (bypass lock avec instances séparées)
    time_threadpool = test_threadpool_bypass_lock(languages, duration_ms)

    # Résumé
    print("\n" + "=" * 80)
    print("RÉSUMÉ")
    print("=" * 80)
    print(f"asyncio.gather + lock:        {time_with_lock:.0f}ms (SÉQUENTIEL - lock force)")
    print(f"asyncio.gather sans lock:     {time_without_lock:.0f}ms (PARALLÈLE)")
    print(f"ThreadPoolExecutor:           {time_threadpool:.0f}ms (PARALLÈLE)")
    print()
    print(f"Gain sans lock:               {time_with_lock / time_without_lock:.2f}x plus rapide")
    print(f"Gain ThreadPoolExecutor:      {time_with_lock / time_threadpool:.2f}x plus rapide")
    print()

    # Calcul théorique
    expected_sequential = duration_ms * len(languages)
    expected_parallel = duration_ms

    print(f"Temps attendu séquentiel:     {expected_sequential:.0f}ms")
    print(f"Temps attendu parallèle:      {expected_parallel:.0f}ms")
    print()

    print("CONCLUSION:")
    print("  - Le LOCK force l'exécution SÉQUENTIELLE même avec asyncio.gather")
    print("  - ThreadPoolExecutor bypass le problème avec instances TTS séparées par thread")
    print("  - Si TTS service est thread-safe: ThreadPoolExecutor = vraie parallélisation")


if __name__ == "__main__":
    main()
