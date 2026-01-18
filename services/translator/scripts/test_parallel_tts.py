#!/usr/bin/env python3
"""
Script de test pour vérifier la parallélisation GPU (ThreadPoolExecutor).

Usage:
    python scripts/test_parallel_tts.py --languages fr,es,de --workers 3

Compare:
- asyncio.gather (FAUX parallélisme - séquentiel)
- ThreadPoolExecutor (VRAIE parallélisation - threads)
"""

import os
import sys
import time
import asyncio
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Tuple

# Ajouter le chemin src au PYTHONPATH
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


def simulate_tts_sync(lang: str, duration_ms: int = 2000) -> Tuple[str, float]:
    """Simule une opération TTS synchrone (GPU-like) - VRAIE opération bloquante"""
    start = time.time()
    # Utiliser time.sleep (opération bloquante) pour simuler GPU
    time.sleep(duration_ms / 1000.0)
    elapsed = (time.time() - start) * 1000
    return (lang, elapsed)


async def simulate_tts_async(lang: str, duration_ms: int = 2000) -> Tuple[str, float]:
    """
    Simule une opération TTS asynchrone avec opération GPU SYNCHRONE.
    C'est le pattern du vrai code: async wrapper autour d'opération GPU synchrone.
    """
    start = time.time()
    # Utiliser run_in_executor pour simuler une opération GPU synchrone dans async
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, time.sleep, duration_ms / 1000.0)
    elapsed = (time.time() - start) * 1000
    return (lang, elapsed)


def test_asyncio_gather(languages: List[str], duration_ms: int = 2000) -> float:
    """Test avec asyncio.gather (FAUX parallélisme)"""
    print("\n" + "=" * 80)
    print("TEST 1: asyncio.gather (FAUX parallélisme)")
    print("=" * 80)

    async def run():
        start = time.time()
        tasks = [simulate_tts_async(lang, duration_ms) for lang in languages]
        results = await asyncio.gather(*tasks)
        total_time = (time.time() - start) * 1000

        print(f"\nRésultats asyncio.gather:")
        for lang, elapsed in results:
            print(f"  - {lang}: {elapsed:.0f}ms")
        print(f"\n⏱️  Temps TOTAL: {total_time:.0f}ms")

        return total_time

    return asyncio.run(run())


def test_threadpool(languages: List[str], max_workers: int, duration_ms: int = 2000) -> float:
    """Test avec ThreadPoolExecutor (VRAIE parallélisation)"""
    print("\n" + "=" * 80)
    print(f"TEST 2: ThreadPoolExecutor (VRAIE parallélisation - {max_workers} workers)")
    print("=" * 80)

    start = time.time()
    results = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(simulate_tts_sync, lang, duration_ms): lang
                   for lang in languages}

        for future in as_completed(futures):
            lang = futures[future]
            result = future.result()
            results.append(result)
            print(f"  ✅ Complété: {lang} ({result[1]:.0f}ms)")

    total_time = (time.time() - start) * 1000

    print(f"\nRésultats ThreadPoolExecutor:")
    for lang, elapsed in results:
        print(f"  - {lang}: {elapsed:.0f}ms")
    print(f"\n⏱️  Temps TOTAL: {total_time:.0f}ms")

    return total_time


def test_threadpool_with_async(languages: List[str], max_workers: int, duration_ms: int = 2000) -> float:
    """Test avec ThreadPoolExecutor + event loop par thread (pattern du pipeline)"""
    print("\n" + "=" * 80)
    print(f"TEST 3: ThreadPoolExecutor + event loop (pattern pipeline - {max_workers} workers)")
    print("=" * 80)

    def process_language_sync(task_args: Tuple) -> Tuple[str, float]:
        """Pattern du pipeline: thread synchrone avec event loop async"""
        lang, duration = task_args

        # Créer une nouvelle boucle d'événements pour ce thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            # Exécuter le traitement asynchrone dans cette boucle
            result = loop.run_until_complete(simulate_tts_async(lang, duration))
            return result
        finally:
            loop.close()

    start = time.time()
    results = []
    tasks = [(lang, duration_ms) for lang in languages]

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_language_sync, task): task[0]
                   for task in tasks}

        for future in as_completed(futures):
            lang = futures[future]
            result = future.result()
            results.append(result)
            print(f"  ✅ Complété: {lang} ({result[1]:.0f}ms)")

    total_time = (time.time() - start) * 1000

    print(f"\nRésultats ThreadPoolExecutor + event loop:")
    for lang, elapsed in results:
        print(f"  - {lang}: {elapsed:.0f}ms")
    print(f"\n⏱️  Temps TOTAL: {total_time:.0f}ms")

    return total_time


def main():
    parser = argparse.ArgumentParser(description="Test parallélisation GPU")
    parser.add_argument(
        "--languages",
        type=str,
        default="fr,es,de",
        help="Langues à traiter (séparées par virgule)"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=None,
        help="Nombre de workers (défaut: nombre de langues)"
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=2000,
        help="Durée simulée de chaque TTS en ms (défaut: 2000)"
    )

    args = parser.parse_args()

    languages = args.languages.split(',')
    max_workers = args.workers or len(languages)

    print("\n" + "=" * 80)
    print("BENCHMARK: PARALLÉLISATION GPU")
    print("=" * 80)
    print(f"Langues: {languages}")
    print(f"Workers: {max_workers}")
    print(f"Durée simulée par langue: {args.duration}ms")

    # Test 1: asyncio.gather (FAUX parallélisme)
    gather_time = test_asyncio_gather(languages, args.duration)

    # Test 2: ThreadPoolExecutor pur (VRAIE parallélisation)
    threadpool_time = test_threadpool(languages, max_workers, args.duration)

    # Test 3: ThreadPoolExecutor + event loop (pattern pipeline)
    threadpool_async_time = test_threadpool_with_async(languages, max_workers, args.duration)

    # Résumé
    print("\n" + "=" * 80)
    print("RÉSUMÉ")
    print("=" * 80)
    print(f"asyncio.gather:              {gather_time:.0f}ms (SÉQUENTIEL)")
    print(f"ThreadPoolExecutor:          {threadpool_time:.0f}ms (PARALLÈLE)")
    print(f"ThreadPoolExecutor + async:  {threadpool_async_time:.0f}ms (PARALLÈLE)")
    print()
    print(f"Gain ThreadPoolExecutor:      {gather_time / threadpool_time:.2f}x plus rapide")
    print(f"Gain ThreadPoolExecutor+async: {gather_time / threadpool_async_time:.2f}x plus rapide")
    print()

    # Calcul théorique
    expected_sequential = args.duration * len(languages)
    expected_parallel = args.duration  # Temps de la plus longue tâche

    print(f"Temps attendu séquentiel:  {expected_sequential:.0f}ms")
    print(f"Temps attendu parallèle:   {expected_parallel:.0f}ms")
    print(f"Gain théorique:            {expected_sequential / expected_parallel:.2f}x")
    print()

    # Validation
    if threadpool_time < gather_time * 0.6:  # Au moins 40% plus rapide
        print("✅ ThreadPoolExecutor est significativement plus rapide (SUCCÈS)")
    else:
        print("❌ ThreadPoolExecutor n'est pas assez rapide (ÉCHEC)")


if __name__ == "__main__":
    main()
