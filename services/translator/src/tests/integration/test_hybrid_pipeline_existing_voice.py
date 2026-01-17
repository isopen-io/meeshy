"""
Test Pipeline Hybride avec échantillon vocal existant
=====================================================

Teste le pipeline VITS + OpenVoice avec un fichier voice_sample.wav existant.
"""
import asyncio
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

OUTPUT_DIR = Path(__file__).parent.parent.parent / "outputs" / "voice_clone_test"


# Paramètre d'intensité du clonage vocal
VOICE_CLONE_TAU = 0.8  # 0.1-1.0 : plus élevé = plus proche de votre voix


async def test_hybrid_pipeline():
    """Test du pipeline hybride VITS + Voice Converter"""
    print("\n" + "=" * 60)
    print("TEST PIPELINE HYBRIDE (VITS + VOICE CLONING)")
    print("=" * 60)

    from services.tts.backends.vits_backend import VITSBackend

    # Vérifier que le fichier voice_sample.wav existe
    voice_sample_path = OUTPUT_DIR / "voice_sample.wav"
    if not voice_sample_path.exists():
        print(f"❌ Fichier voice_sample.wav non trouvé: {voice_sample_path}")
        print("   Exécutez d'abord test_voice_clone_pipeline.py pour enregistrer votre voix")
        return None

    # Textes en Lingala à synthétiser
    texts_ln = [
        "Mbote! Ngai nazali Meeshy.",  # Bonjour! Je suis Meeshy.
        "Nasepeli mingi kokutana na yo.",  # Je suis très content de te rencontrer.
    ]

    print(f"\n📝 Textes Lingala à synthétiser:")
    for i, txt in enumerate(texts_ln, 1):
        print(f"   {i}. {txt}")

    print(f"\n🎤 Voix source: {voice_sample_path}")
    print(f"🎚️  Intensité clonage (tau): {VOICE_CLONE_TAU}")

    # Initialiser le backend VITS
    print("\n🔄 Initialisation du backend VITS...")
    backend = VITSBackend(device="cpu")

    if not backend.is_available:
        print("❌ VITS Backend non disponible (ESPnet2 requis)")
        return None

    print(f"   ✅ Backend disponible")
    print(f"   🎭 Clonage vocal: {'Oui (OpenVoice)' if backend.supports_voice_cloning else 'Non'}")

    await backend.initialize()
    print("   ✅ Backend initialisé")

    results = []

    for i, text in enumerate(texts_ln, 1):
        output_path = str(OUTPUT_DIR / f"cloned_lingala_{i}.wav")

        print(f"\n{'─' * 50}")
        print(f"🔊 [{i}/{len(texts_ln)}] Synthèse + Clonage:")
        print(f"   Texte: \"{text}\"")
        start_time = time.time()

        try:
            result = await backend.synthesize(
                text=text,
                language="ln",
                speaker_audio_path=str(voice_sample_path),
                output_path=output_path,
                voice_clone_tau=VOICE_CLONE_TAU
            )

            elapsed = time.time() - start_time
            file_size = os.path.getsize(output_path) / 1024

            print(f"   ✅ Généré: {Path(result).name}")
            print(f"   📊 Taille: {file_size:.1f} KB | ⏱️ Temps: {elapsed:.2f}s")

            results.append(output_path)

        except Exception as e:
            print(f"   ❌ Erreur: {e}")
            import traceback
            traceback.print_exc()

    await backend.close()

    # Résumé
    print("\n" + "=" * 60)
    print("📊 RÉSUMÉ")
    print("=" * 60)

    print(f"\n📁 Fichiers générés dans: {OUTPUT_DIR}")
    print("\n📝 Fichiers audio:")
    for f in sorted(OUTPUT_DIR.glob("*.wav")):
        size = f.stat().st_size / 1024
        print(f"   • {f.name} ({size:.1f} KB)")

    if results:
        print("\n✅ TEST RÉUSSI!")
        print("\n🎧 Comparez les fichiers générés:")
        print(f"   - voice_sample.wav (votre voix originale)")
        for r in results:
            print(f"   - {Path(r).name} (Lingala avec votre voix)")
    else:
        print("\n⚠️ Aucun fichier généré")

    return results


if __name__ == "__main__":
    results = asyncio.run(test_hybrid_pipeline())
    sys.exit(0 if results else 1)
