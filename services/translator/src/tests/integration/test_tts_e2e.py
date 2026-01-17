"""
Test d'intégration E2E - TTS Français et Lingala
================================================

Ce test vérifie la génération audio de bout en bout:
- Français → Chatterbox ou MMS
- Lingala → VITS (DigitalUmuganda/lingala_vits_tts)

Usage:
    cd services/translator/src
    python -m tests.integration.test_tts_e2e
"""

import asyncio
import os
import sys
import time
from pathlib import Path

# Ajouter le chemin src au PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Configuration des chemins
OUTPUT_DIR = Path(__file__).parent.parent.parent / "outputs" / "test_audio"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


async def test_french_tts():
    """Test TTS en français"""
    print("\n" + "="*60)
    print("🇫🇷 TEST TTS FRANÇAIS")
    print("="*60)

    from services.tts.backends.mms_backend import MMSBackend

    # Texte de test en français
    text_fr = "Bonjour! Je suis un assistant vocal. Comment puis-je vous aider aujourd'hui?"

    print(f"\n📝 Texte: {text_fr}")
    print(f"🌍 Langue: Français (fr)")

    # Utiliser MMS pour le français (plus léger que Chatterbox pour les tests)
    backend = MMSBackend(device="cpu")

    if not backend.is_available:
        print("❌ MMS Backend non disponible (transformers non installé)")
        return None

    print("\n⏳ Initialisation du backend MMS...")
    start_init = time.time()
    await backend.initialize()
    print(f"✅ Backend initialisé en {time.time() - start_init:.2f}s")

    # Générer l'audio
    output_path = str(OUTPUT_DIR / "test_french.wav")

    print(f"\n🔊 Génération audio vers: {output_path}")
    start_synth = time.time()

    try:
        result = await backend.synthesize(
            text=text_fr,
            language="fr",
            output_path=output_path
        )

        synth_time = time.time() - start_synth
        file_size = os.path.getsize(output_path) / 1024  # KB

        print(f"\n✅ Audio généré avec succès!")
        print(f"   📁 Fichier: {result}")
        print(f"   📊 Taille: {file_size:.1f} KB")
        print(f"   ⏱️  Temps: {synth_time:.2f}s")

        await backend.close()
        return output_path

    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        await backend.close()
        return None


async def test_lingala_tts():
    """Test TTS en lingala avec VITS"""
    print("\n" + "="*60)
    print("🇨🇩 TEST TTS LINGALA (VITS)")
    print("="*60)

    from services.tts.backends.vits_backend import VITSBackend

    # Textes de test en lingala
    texts_ln = [
        "Mbote! Ndeko, ozali malamu?",  # Bonjour! Frère/Sœur, tu vas bien?
        "Nasepeli mingi kokutana na yo.",  # Je suis très content de te rencontrer.
        "Nkombo na ngai ezali Meeshy.",  # Mon nom est Meeshy.
    ]

    print(f"\n📝 Textes à synthétiser:")
    for i, txt in enumerate(texts_ln, 1):
        print(f"   {i}. {txt}")
    print(f"\n🌍 Langue: Lingala (ln)")
    print(f"🤖 Modèle: DigitalUmuganda/lingala_vits_tts")

    # Utiliser VITS pour le lingala
    backend = VITSBackend(device="cpu")

    if not backend.is_available:
        print("❌ VITS Backend non disponible (transformers non installé)")
        return None

    if not backend.supports_language("ln"):
        print("❌ Lingala non supporté par ce backend VITS")
        return None

    print("\n⏳ Initialisation du backend VITS...")
    start_init = time.time()
    await backend.initialize()
    print(f"✅ Backend initialisé en {time.time() - start_init:.2f}s")

    results = []

    for i, text_ln in enumerate(texts_ln, 1):
        output_path = str(OUTPUT_DIR / f"test_lingala_{i}.wav")

        print(f"\n🔊 [{i}/{len(texts_ln)}] Génération: \"{text_ln[:30]}...\"")
        start_synth = time.time()

        try:
            result = await backend.synthesize(
                text=text_ln,
                language="ln",
                output_path=output_path
            )

            synth_time = time.time() - start_synth
            file_size = os.path.getsize(output_path) / 1024  # KB

            print(f"   ✅ Généré: {Path(result).name}")
            print(f"   📊 Taille: {file_size:.1f} KB | ⏱️ Temps: {synth_time:.2f}s")

            results.append(output_path)

        except Exception as e:
            print(f"   ❌ Erreur: {e}")
            import traceback
            traceback.print_exc()

    await backend.close()
    return results


async def test_unified_service():
    """Test du service unifié avec auto-sélection de backend"""
    print("\n" + "="*60)
    print("🔄 TEST SERVICE UNIFIÉ (AUTO-SÉLECTION)")
    print("="*60)

    try:
        from services.tts_service import TTSService as UnifiedTTSService, TTSModel

        service = UnifiedTTSService(device="cpu")

        print("\n⏳ Initialisation du service unifié...")
        await service.initialize()

        # Test 1: Français (devrait utiliser Chatterbox ou MMS)
        print("\n--- Test Français ---")
        text_fr = "Le service unifié sélectionne automatiquement le meilleur modèle."

        result_fr = await service.synthesize(
            text=text_fr,
            language="fr",
            output_format="wav"
        )

        print(f"✅ Français généré avec {result_fr.model_used.value}")
        print(f"   📁 {result_fr.audio_path}")

        # Test 2: Lingala (devrait utiliser VITS)
        print("\n--- Test Lingala ---")
        text_ln = "Mbote! Lingala ezali monoko ya kitoko."

        result_ln = await service.synthesize(
            text=text_ln,
            language="ln",
            output_format="wav"
        )

        print(f"✅ Lingala généré avec {result_ln.model_used.value}")
        print(f"   📁 {result_ln.audio_path}")

        await service.close()
        return True

    except Exception as e:
        print(f"\n❌ Erreur service unifié: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Exécute tous les tests"""
    print("\n" + "#"*60)
    print("#  TEST D'INTÉGRATION TTS - FRANÇAIS & LINGALA")
    print("#"*60)
    print(f"\n📂 Dossier de sortie: {OUTPUT_DIR}")

    total_start = time.time()
    results = {}

    # Test 1: Français avec MMS
    print("\n\n" + "-"*60)
    print("TEST 1: TTS Français (MMS Backend)")
    print("-"*60)
    results["french_mms"] = await test_french_tts()

    # Test 2: Lingala avec VITS
    print("\n\n" + "-"*60)
    print("TEST 2: TTS Lingala (VITS Backend)")
    print("-"*60)
    results["lingala_vits"] = await test_lingala_tts()

    # Test 3: Service Unifié (optionnel, plus lourd)
    # print("\n\n" + "-"*60)
    # print("TEST 3: Service Unifié")
    # print("-"*60)
    # results["unified"] = await test_unified_service()

    # Résumé
    total_time = time.time() - total_start

    print("\n\n" + "="*60)
    print("📊 RÉSUMÉ DES TESTS")
    print("="*60)

    print(f"\n⏱️  Temps total: {total_time:.2f}s")
    print(f"\n📁 Fichiers générés dans: {OUTPUT_DIR}")

    # Lister les fichiers générés
    print("\n📝 Fichiers audio générés:")
    for f in sorted(OUTPUT_DIR.glob("*.wav")):
        size = f.stat().st_size / 1024
        print(f"   • {f.name} ({size:.1f} KB)")

    # Statut
    success = all(v is not None for v in results.values())

    if success:
        print("\n✅ TOUS LES TESTS RÉUSSIS!")
    else:
        print("\n⚠️  Certains tests ont échoué")
        for name, result in results.items():
            status = "✅" if result else "❌"
            print(f"   {status} {name}")

    return success


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
