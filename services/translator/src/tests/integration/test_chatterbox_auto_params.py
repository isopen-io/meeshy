"""
Test Chatterbox - Auto-Optimisation des Paramètres
===================================================

Teste l'intégration de VoiceAnalyzerService avec ChatterboxBackend
pour calculer automatiquement les paramètres optimaux (exaggeration, cfg_weight).
"""

import asyncio
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent.parent / "outputs" / "chatterbox_auto"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Textes
TEXTS = {
    "fr": "Bonjour et bienvenue! Je suis le clone de votre voix avec des paramètres optimisés automatiquement.",
    "en": "Hello and welcome! I am your voice clone with automatically optimized parameters."
}


async def test_auto_params():
    """Test principal de l'auto-optimisation"""
    print("\n" + "=" * 70)
    print("🧪 TEST AUTO-OPTIMISATION PARAMÈTRES CHATTERBOX")
    print("=" * 70)

    # Chercher un échantillon vocal existant
    voice_samples = [
        Path(__file__).parent.parent.parent / "outputs" / "chatterbox_params" / "voice_sample_params.wav",
        Path(__file__).parent.parent.parent / "outputs" / "chatterbox_clone" / "voice_sample_chatterbox.wav",
        Path(__file__).parent.parent.parent / "outputs" / "voice_clone_test" / "voice_sample.wav",
    ]

    voice_sample = None
    for sample in voice_samples:
        if sample.exists():
            voice_sample = str(sample)
            break

    if not voice_sample:
        print("❌ Aucun échantillon vocal trouvé.")
        print("   Exécutez d'abord test_chatterbox_voice_clone.py ou test_chatterbox_params_comparison.py")
        return None

    print(f"\n🎤 Voix source: {voice_sample}")
    file_size = os.path.getsize(voice_sample) / 1024
    print(f"   📊 Taille: {file_size:.1f} KB")

    # Étape 1: Analyser la voix
    print("\n" + "-" * 70)
    print("📊 ÉTAPE 1: ANALYSE VOCALE")
    print("-" * 70)

    from services.voice_analyzer_service import VoiceAnalyzerService

    analyzer = VoiceAnalyzerService()
    await analyzer.initialize()

    characteristics = await analyzer.analyze(voice_sample)

    print(f"\n   🎵 Pitch moyen: {characteristics.pitch_mean:.1f} Hz")
    print(f"   📈 Pitch std: {characteristics.pitch_std:.1f} Hz")
    print(f"   🎭 Type de voix: {characteristics.voice_type}")
    print(f"   👤 Genre estimé: {characteristics.gender_estimate}")
    print(f"   📊 Dynamic range: {characteristics.dynamic_range:.1f} dB")
    print(f"   🔊 Jitter: {characteristics.jitter:.4f}")
    print(f"   📉 Shimmer: {characteristics.shimmer:.4f}")

    # Étape 2: Calculer les paramètres optimaux pour chaque langue
    print("\n" + "-" * 70)
    print("⚙️  ÉTAPE 2: CALCUL PARAMÈTRES OPTIMAUX")
    print("-" * 70)

    for lang_code in TEXTS.keys():
        optimal = analyzer.get_optimal_clone_params(characteristics, lang_code)
        print(f"\n   🌐 [{lang_code.upper()}]:")
        print(f"      • exaggeration: {optimal['exaggeration']:.2f}")
        print(f"      • cfg_weight: {optimal['cfg_weight']:.2f}")
        print(f"      • confidence: {optimal['confidence']:.2f}")
        print(f"      • expressivité: {optimal['analysis']['expressiveness_score']:.3f}")
        print(f"      • stabilité: {optimal['analysis']['stability_score']:.3f}")
        print(f"      💡 {optimal['explanation']}")

    # Étape 3: Générer avec auto-optimisation
    print("\n" + "-" * 70)
    print("🎭 ÉTAPE 3: GÉNÉRATION AVEC AUTO-OPTIMISATION")
    print("-" * 70)

    from services.tts.backends.chatterbox_backend import ChatterboxBackend

    backend = ChatterboxBackend(device="cpu")

    if not backend.is_available:
        print("❌ Chatterbox non disponible")
        return None

    results = []
    total_start = time.time()

    for lang_code, text in TEXTS.items():
        print(f"\n   🌐 [{lang_code.upper()}] Génération avec auto-params...")

        output_path = str(OUTPUT_DIR / f"auto_{lang_code}.wav")
        start_time = time.time()

        try:
            # Génération SANS spécifier exaggeration/cfg_weight
            # = auto-optimisation activée
            await backend.synthesize(
                text=text,
                language=lang_code,
                speaker_audio_path=voice_sample,
                output_path=output_path,
                # exaggeration et cfg_weight non spécifiés = auto
                voice_characteristics=characteristics  # Réutiliser l'analyse
            )

            elapsed = time.time() - start_time
            file_size = os.path.getsize(output_path) / 1024

            print(f"   ✅ auto_{lang_code}.wav - {file_size:.1f} KB - {elapsed:.1f}s")

            results.append({
                "lang": lang_code,
                "file": output_path,
                "size": file_size,
                "time": elapsed
            })

        except Exception as e:
            print(f"   ❌ Erreur: {e}")
            import traceback
            traceback.print_exc()

    await backend.close()

    # Étape 4: Comparer avec paramètres manuels (0.5/0.5)
    print("\n" + "-" * 70)
    print("📊 ÉTAPE 4: COMPARAISON AUTO vs MANUEL (0.5/0.5)")
    print("-" * 70)

    backend2 = ChatterboxBackend(device="cpu")

    for lang_code, text in TEXTS.items():
        print(f"\n   🌐 [{lang_code.upper()}] Génération avec params manuels (0.5/0.5)...")

        output_path = str(OUTPUT_DIR / f"manual_{lang_code}.wav")
        start_time = time.time()

        try:
            await backend2.synthesize(
                text=text,
                language=lang_code,
                speaker_audio_path=voice_sample,
                output_path=output_path,
                exaggeration=0.5,  # Manuel
                cfg_weight=0.5,    # Manuel
                auto_optimize_params=False
            )

            elapsed = time.time() - start_time
            file_size = os.path.getsize(output_path) / 1024

            print(f"   ✅ manual_{lang_code}.wav - {file_size:.1f} KB - {elapsed:.1f}s")

        except Exception as e:
            print(f"   ❌ Erreur: {e}")

    await backend2.close()

    total_time = time.time() - total_start

    # Résumé
    print("\n" + "=" * 70)
    print("📊 RÉSUMÉ")
    print("=" * 70)

    print(f"\n⏱️  Temps total: {total_time:.2f}s")
    print(f"✅ Fichiers générés: {len(results)}")

    print(f"\n📁 Dossier: {OUTPUT_DIR}")

    print("\n📝 FICHIERS À COMPARER:")
    print("-" * 70)
    for lang_code in TEXTS.keys():
        auto_path = OUTPUT_DIR / f"auto_{lang_code}.wav"
        manual_path = OUTPUT_DIR / f"manual_{lang_code}.wav"
        if auto_path.exists() and manual_path.exists():
            auto_size = os.path.getsize(auto_path) / 1024
            manual_size = os.path.getsize(manual_path) / 1024
            print(f"   {lang_code.upper()}: auto ({auto_size:.1f}KB) vs manual ({manual_size:.1f}KB)")

    print("\n" + "=" * 70)
    print("🎧 ÉCOUTEZ ET COMPAREZ!")
    print("=" * 70)
    print("""
    Comparez les fichiers:
    • auto_fr.wav   vs  manual_fr.wav
    • auto_en.wav   vs  manual_en.wav

    L'auto-optimisation devrait produire:
    - Une voix plus naturelle adaptée à vos caractéristiques vocales
    - Une expressivité ajustée à votre style de parole
    """)

    return results


if __name__ == "__main__":
    results = asyncio.run(test_auto_params())
    sys.exit(0 if results else 1)
