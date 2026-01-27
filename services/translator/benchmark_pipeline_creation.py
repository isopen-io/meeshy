#!/usr/bin/env python3
"""
Benchmark: Coût de création pipeline à la demande
Compare Transformers 4.x vs hypothétique 5.0.0
"""
import time
from typing import Dict, List
from transformers import pipeline, AutoModelForSeq2SeqLM, AutoTokenizer

# Test avec NLLB distilled (plus rapide pour test)
MODEL_NAME = "facebook/nllb-200-distilled-600M"

def benchmark_shared_model_approach():
    """
    Approche: Charger modèle 1× puis créer N pipelines
    """
    print("\n" + "="*60)
    print("BENCHMARK: Shared Model Approach (Transformers 5.0.0 style)")
    print("="*60)

    # Étape 1: Charger modèle (coût unique)
    print("\n[1/3] Chargement du modèle...")
    start = time.time()
    model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model_load_time = time.time() - start
    print(f"   ⏱️  Temps: {model_load_time:.2f}s (coût unique)")

    # Étape 2: Créer 10 pipelines différents (paires différentes)
    print("\n[2/3] Création de 10 pipelines (paires différentes)...")

    language_pairs = [
        ("fra_Latn", "eng_Latn"),
        ("eng_Latn", "spa_Latn"),
        ("eng_Latn", "deu_Latn"),
        ("fra_Latn", "deu_Latn"),
        ("eng_Latn", "ita_Latn"),
        ("spa_Latn", "fra_Latn"),
        ("deu_Latn", "eng_Latn"),
        ("ita_Latn", "eng_Latn"),
        ("eng_Latn", "por_Latn"),
        ("fra_Latn", "spa_Latn"),
    ]

    creation_times = []

    for src_lang, tgt_lang in language_pairs:
        start = time.time()

        # Simuler création pipeline Transformers 5.0.0
        # (Dans 5.0.0, on passe src_lang/tgt_lang à la création)
        pipe = pipeline(
            "translation",
            model=model,
            tokenizer=tokenizer,
            src_lang=src_lang,
            tgt_lang=tgt_lang,
            device=-1  # CPU pour benchmark reproductible
        )

        creation_time = time.time() - start
        creation_times.append(creation_time)

        print(f"   Pipeline {src_lang} → {tgt_lang}: {creation_time*1000:.0f}ms")

    avg_creation = sum(creation_times) / len(creation_times)
    print(f"\n   📊 Moyenne création: {avg_creation*1000:.0f}ms")
    print(f"   📊 Min: {min(creation_times)*1000:.0f}ms")
    print(f"   📊 Max: {max(creation_times)*1000:.0f}ms")

    # Étape 3: Warm-up (première inférence)
    print("\n[3/3] Warm-up (première inférence par pipeline)...")

    warmup_times = []
    test_text = "Hello, how are you?"

    # On garde le dernier pipeline pour warm-up
    for src_lang, tgt_lang in language_pairs[:3]:  # Tester 3 paires
        pipe = pipeline(
            "translation",
            model=model,
            tokenizer=tokenizer,
            src_lang=src_lang,
            tgt_lang=tgt_lang,
            device=-1
        )

        start = time.time()
        result = pipe(test_text)
        warmup_time = time.time() - start
        warmup_times.append(warmup_time)

        print(f"   {src_lang} → {tgt_lang}: {warmup_time*1000:.0f}ms")

    avg_warmup = sum(warmup_times) / len(warmup_times)
    print(f"\n   📊 Moyenne warm-up: {avg_warmup*1000:.0f}ms")

    # Résumé
    print("\n" + "="*60)
    print("RÉSUMÉ")
    print("="*60)
    print(f"Coût modèle (1×):        {model_load_time:.2f}s")
    print(f"Coût création pipeline:  {avg_creation*1000:.0f}ms")
    print(f"Coût warm-up:            {avg_warmup*1000:.0f}ms")
    print(f"TOTAL (paire rare):      {(avg_creation + avg_warmup)*1000:.0f}ms")
    print(f"TOTAL (paire cachée):    0ms (réutilisation)")
    print("="*60)

    return {
        "model_load": model_load_time,
        "avg_creation": avg_creation,
        "avg_warmup": avg_warmup,
        "total_rare": avg_creation + avg_warmup
    }


def benchmark_current_approach():
    """
    Approche actuelle: 1 pipeline universel (Transformers 4.x)
    """
    print("\n" + "="*60)
    print("BENCHMARK: Current Universal Pipeline (Transformers 4.x)")
    print("="*60)

    # Charger modèle + créer pipeline universel
    print("\n[1/2] Chargement modèle + pipeline universel...")
    start = time.time()
    pipe = pipeline(
        "translation",
        model=MODEL_NAME,
        device=-1
    )
    init_time = time.time() - start
    print(f"   ⏱️  Temps: {init_time:.2f}s (coût unique)")

    # Tester 10 paires différentes
    print("\n[2/2] Traduction 10 paires (pipeline réutilisé)...")

    language_pairs = [
        ("fra_Latn", "eng_Latn"),
        ("eng_Latn", "spa_Latn"),
        ("eng_Latn", "deu_Latn"),
        ("fra_Latn", "deu_Latn"),
        ("eng_Latn", "ita_Latn"),
        ("spa_Latn", "fra_Latn"),
        ("deu_Latn", "eng_Latn"),
        ("ita_Latn", "eng_Latn"),
        ("eng_Latn", "por_Latn"),
        ("fra_Latn", "spa_Latn"),
    ]

    translation_times = []
    test_text = "Hello, how are you?"

    for src_lang, tgt_lang in language_pairs:
        start = time.time()
        result = pipe(test_text, src_lang=src_lang, tgt_lang=tgt_lang)
        trans_time = time.time() - start
        translation_times.append(trans_time)

        print(f"   {src_lang} → {tgt_lang}: {trans_time*1000:.0f}ms")

    avg_trans = sum(translation_times) / len(translation_times)
    print(f"\n   📊 Moyenne traduction: {avg_trans*1000:.0f}ms")

    print("\n" + "="*60)
    print("RÉSUMÉ")
    print("="*60)
    print(f"Coût init (1×):          {init_time:.2f}s")
    print(f"Coût traduction:         {avg_trans*1000:.0f}ms")
    print("="*60)

    return {
        "init": init_time,
        "avg_translation": avg_trans
    }


def compare_approaches():
    """
    Compare les deux approches
    """
    print("\n\n" + "🔥"*30)
    print("COMPARAISON FINALE")
    print("🔥"*30)

    results_new = benchmark_shared_model_approach()
    results_current = benchmark_current_approach()

    print("\n" + "="*70)
    print("VERDICT")
    print("="*70)

    print("\n📊 Approche actuelle (Transformers 4.x - Pipeline universel):")
    print(f"   - Init:                 {results_current['init']:.2f}s (1×)")
    print(f"   - Traduction (toutes):  {results_current['avg_translation']*1000:.0f}ms")
    print(f"   - Avantage:             Même latence pour toutes paires")
    print(f"   - Inconvénient:         Pas d'optimisation par paire")

    print("\n📊 Approche proposée (Transformers 5.0.0 - Cache intelligent):")
    print(f"   - Init:                 {results_new['model_load']:.2f}s (1×)")
    print(f"   - Paire cachée:         ~{results_current['avg_translation']*1000:.0f}ms (réutilise pipeline)")
    print(f"   - Paire rare (1ère×):   {results_new['total_rare']*1000:.0f}ms (création + warm-up)")
    print(f"   - Paire rare (2ème×):   ~{results_current['avg_translation']*1000:.0f}ms (si en cache)")

    # Calcul du seuil de rentabilité
    overhead = results_new['total_rare'] - results_current['avg_translation']
    print(f"\n⚖️  Overhead paire rare: +{overhead*1000:.0f}ms")

    if overhead < 0.5:  # Moins de 500ms
        print("   ✅ ACCEPTABLE: Overhead négligeable pour paires rares")
    elif overhead < 1.0:  # Moins de 1s
        print("   ⚠️  MODÉRÉ: Cache LRU fortement recommandé")
    else:
        print("   ❌ ÉLEVÉ: Cache obligatoire ou approche alternative")

    # Scénario réel Meeshy
    print("\n🎯 Scénario Meeshy (estimation):")
    print("   - Top 20 paires = 80% trafic → 0ms overhead (cache chaud)")
    print("   - Paires rares = 20% trafic → +{:.0f}ms (1ère fois)".format(overhead*1000))
    print(f"   - Impact moyen: +{(0.2 * overhead)*1000:.0f}ms sur ensemble du trafic")

    if (0.2 * overhead) < 0.1:  # Impact < 100ms
        print("   ✅ RECOMMANDATION: Approche cache viable")
    else:
        print("   ⚠️  RECOMMANDATION: Mesurer métriques production avant migration")

    print("="*70)


if __name__ == "__main__":
    compare_approaches()
