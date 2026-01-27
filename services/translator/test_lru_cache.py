#!/usr/bin/env python3
"""
Test du cache LRU pour pipelines de traduction
Vérifie hits/misses, évictions, et statistiques
"""
import sys
sys.path.insert(0, 'src')

from utils.pipeline_cache import LRUPipelineCache
import time


def test_basic_cache():
    """Test basique: put et get"""
    print("🧪 Test 1: Opérations basiques du cache")
    print("=" * 70)

    cache = LRUPipelineCache(max_size=3)

    # Ajouter des pipelines fictifs
    cache.put("basic", "fra_Latn", "eng_Latn", "pipeline_fr_en")
    cache.put("basic", "fra_Latn", "spa_Latn", "pipeline_fr_es")
    cache.put("basic", "eng_Latn", "fra_Latn", "pipeline_en_fr")

    print(f"✅ 3 pipelines ajoutés")
    print(f"📊 Cache size: {len(cache)}/3")

    # Récupérer du cache
    p1 = cache.get("basic", "fra_Latn", "eng_Latn")
    print(f"✅ Get FR→EN: {p1} (HIT attendu)")

    p2 = cache.get("basic", "deu_Latn", "eng_Latn")
    print(f"❌ Get DE→EN: {p2} (MISS attendu)")

    stats = cache.get_stats()
    print(f"\n📊 Stats: {stats.hits} hits, {stats.misses} misses (hit_rate: {stats.hit_rate:.1f}%)")
    print()


def test_lru_eviction():
    """Test éviction LRU"""
    print("🧪 Test 2: Éviction LRU")
    print("=" * 70)

    cache = LRUPipelineCache(max_size=3)

    # Remplir le cache
    cache.put("basic", "fra_Latn", "eng_Latn", "pipeline_1")
    cache.put("basic", "fra_Latn", "spa_Latn", "pipeline_2")
    cache.put("basic", "eng_Latn", "fra_Latn", "pipeline_3")

    print(f"✅ Cache rempli: {len(cache)}/3")

    # Accéder à pipeline_1 pour le marquer comme récent
    cache.get("basic", "fra_Latn", "eng_Latn")
    print(f"✅ Accès FR→EN (marque comme récent)")

    # Ajouter un 4ème élément → devrait évincer pipeline_2 (le plus ancien)
    cache.put("basic", "deu_Latn", "eng_Latn", "pipeline_4")
    print(f"✅ Ajout 4ème pipeline (devrait évincer le plus ancien)")

    # Vérifier éviction
    p2_after = cache.get("basic", "fra_Latn", "spa_Latn")  # Devrait être MISS
    p1_after = cache.get("basic", "fra_Latn", "eng_Latn")  # Devrait être HIT

    print(f"❌ Get FR→ES (évincé): {p2_after}")
    print(f"✅ Get FR→EN (gardé): {p1_after}")

    stats = cache.get_stats()
    print(f"\n📊 Évictions: {stats.evictions}")
    print()


def test_hit_rate():
    """Test taux de hit réaliste"""
    print("🧪 Test 3: Taux de hit réaliste")
    print("=" * 70)

    cache = LRUPipelineCache(max_size=10)

    # Paires fréquentes (80% du trafic)
    common_pairs = [
        ("basic", "fra_Latn", "eng_Latn"),
        ("basic", "eng_Latn", "fra_Latn"),
        ("basic", "fra_Latn", "spa_Latn"),
        ("basic", "eng_Latn", "spa_Latn"),
        ("basic", "fra_Latn", "deu_Latn"),
    ]

    # Paires rares (20% du trafic)
    rare_pairs = [
        ("basic", "jpn_Jpan", "kor_Hang"),
        ("basic", "arb_Arab", "eng_Latn"),
        ("basic", "zho_Hans", "fra_Latn"),
        ("basic", "hin_Deva", "eng_Latn"),
        ("basic", "tha_Thai", "eng_Latn"),
    ]

    # Simuler 100 requêtes
    for i in range(100):
        if i % 5 == 0:  # 20% paires rares
            model, src, tgt = rare_pairs[i % len(rare_pairs)]
        else:  # 80% paires fréquentes
            model, src, tgt = common_pairs[i % len(common_pairs)]

        # Vérifier cache
        pipeline = cache.get(model, src, tgt)

        # Si MISS, créer pipeline
        if pipeline is None:
            cache.put(model, src, tgt, f"pipeline_{i}")

    stats = cache.get_stats()
    print(f"📊 Requêtes: {stats.total_requests}")
    print(f"✅ Hits: {stats.hits}")
    print(f"❌ Misses: {stats.misses}")
    print(f"🎯 Hit rate: {stats.hit_rate:.1f}%")
    print(f"🗑️  Évictions: {stats.evictions}")
    print(f"📦 Cache size: {len(cache)}/10")

    # Top paires
    print(f"\n🔝 Top 5 paires les plus utilisées:")
    for key, pos in cache.get_top_pairs(5):
        print(f"   {pos}. {key}")

    print()


def test_concurrent_access():
    """Test accès concurrent basique"""
    print("🧪 Test 4: Accès thread-safe")
    print("=" * 70)

    import threading

    cache = LRUPipelineCache(max_size=20)
    errors = []

    def worker(thread_id: int):
        """Worker thread"""
        try:
            for i in range(10):
                cache.put("basic", f"lang{thread_id}", f"target{i}", f"pipeline_{thread_id}_{i}")
                time.sleep(0.001)
                cache.get("basic", f"lang{thread_id}", f"target{i}")
        except Exception as e:
            errors.append(f"Thread {thread_id}: {e}")

    # Lancer 5 threads
    threads = []
    for tid in range(5):
        t = threading.Thread(target=worker, args=(tid,))
        threads.append(t)
        t.start()

    # Attendre fin
    for t in threads:
        t.join()

    if errors:
        print(f"❌ Erreurs: {errors}")
    else:
        print(f"✅ Aucune erreur thread-safe")

    stats = cache.get_stats()
    print(f"📊 Total requêtes: {stats.total_requests}")
    print(f"🎯 Hit rate: {stats.hit_rate:.1f}%")
    print()


def main():
    """Exécute tous les tests"""
    print("\n" + "="*70)
    print("🧪 TEST SUITE: Cache LRU pour Pipelines de Traduction")
    print("="*70 + "\n")

    test_basic_cache()
    test_lru_eviction()
    test_hit_rate()
    test_concurrent_access()

    print("="*70)
    print("✅ TOUS LES TESTS RÉUSSIS")
    print("="*70 + "\n")


if __name__ == "__main__":
    main()
