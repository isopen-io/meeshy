"""
Test Pipeline Hybride - Clonage Vocal VITS + Voice Converter
============================================================

Ce test:
1. Enregistre votre voix en français (10 secondes)
2. Synthétise du texte en Lingala avec VITS
3. Applique le clonage vocal pour matcher votre voix

Usage:
    cd services/translator/src
    python -m tests.integration.test_voice_clone_pipeline
"""

import asyncio
import os
import sys
import time
import wave
import struct
import math
from pathlib import Path

# Ajouter le chemin src au PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent.parent / "outputs" / "voice_clone_test"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SAMPLE_RATE = 16000
CHANNELS = 1
RECORD_SECONDS = 30  # Augmenté pour meilleure qualité d'embedding
COUNTDOWN_SECONDS = 3

# Paramètres de clonage vocal
VOICE_CLONE_TAU = 0.5  # 0.1-1.0 : intensité de conversion (0.5 = équilibré)


def generate_beep(frequency=880, duration=0.3, sample_rate=SAMPLE_RATE):
    """Génère un bip audio"""
    import numpy as np

    t = np.linspace(0, duration, int(sample_rate * duration), False)
    # Générer une onde sinusoïdale
    beep = np.sin(2 * np.pi * frequency * t)
    # Appliquer un fade in/out pour éviter les clics
    fade_samples = int(sample_rate * 0.02)
    beep[:fade_samples] *= np.linspace(0, 1, fade_samples)
    beep[-fade_samples:] *= np.linspace(1, 0, fade_samples)
    # Normaliser
    beep = (beep * 0.5 * 32767).astype(np.int16)
    return beep


def play_audio(audio_data, sample_rate=SAMPLE_RATE):
    """Joue de l'audio via sounddevice"""
    import sounddevice as sd
    sd.play(audio_data, sample_rate)
    sd.wait()


def record_audio(duration, sample_rate=SAMPLE_RATE, channels=CHANNELS):
    """Enregistre de l'audio via sounddevice"""
    import sounddevice as sd
    import numpy as np

    print(f"\n🎤 Enregistrement en cours ({duration}s)...")

    # Enregistrer
    audio = sd.rec(
        int(duration * sample_rate),
        samplerate=sample_rate,
        channels=channels,
        dtype=np.int16
    )

    # Afficher un compteur
    for i in range(duration):
        remaining = duration - i
        print(f"   ⏱️  {remaining}s restantes...", end="\r")
        time.sleep(1)

    sd.wait()
    print(f"\n✅ Enregistrement terminé!")

    return audio.flatten()


def save_wav(filename, audio_data, sample_rate=SAMPLE_RATE):
    """Sauvegarde l'audio en WAV"""
    import numpy as np

    with wave.open(str(filename), 'w') as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data.tobytes())

    return filename


async def record_voice_sample():
    """Enregistre un échantillon vocal avec countdown et bip"""
    print("\n" + "=" * 60)
    print("🎙️  ENREGISTREMENT DE VOTRE VOIX")
    print("=" * 60)
    print(f"\n📝 Vous allez enregistrer {RECORD_SECONDS} secondes de votre voix en français.")
    print("   Pour une meilleure qualité de clonage, lisez ce texte varié:")
    print("\n   ╔══════════════════════════════════════════════════════════════╗")
    print("   ║  \"Bonjour, je suis en train de tester le système de          ║")
    print("   ║   clonage vocal. Ma voix sera utilisée pour générer de       ║")
    print("   ║   l'audio en lingala avec mon timbre vocal.                  ║")
    print("   ║                                                              ║")
    print("   ║   J'essaie de parler naturellement, avec différentes        ║")
    print("   ║   intonations. Parfois je pose des questions? Parfois       ║")
    print("   ║   je suis surpris! Et parfois je parle calmement.           ║")
    print("   ║                                                              ║")
    print("   ║   Les chiffres: un, deux, trois, quatre, cinq, six, sept.   ║")
    print("   ║   Les voyelles: a, e, i, o, u. C'est important pour la      ║")
    print("   ║   qualité du clonage vocal.\"                                ║")
    print("   ╚══════════════════════════════════════════════════════════════╝")

    # Countdown avec bips
    print(f"\n⏳ L'enregistrement commence dans {COUNTDOWN_SECONDS} secondes...")

    beep = generate_beep(frequency=660, duration=0.15)
    beep_start = generate_beep(frequency=880, duration=0.4)

    for i in range(COUNTDOWN_SECONDS, 0, -1):
        print(f"   {i}...")
        play_audio(beep)
        time.sleep(0.85)

    # Bip de départ (plus long et aigu)
    print("   🔴 GO!")
    play_audio(beep_start)

    # Enregistrer
    audio_data = record_audio(RECORD_SECONDS)

    # Bip de fin
    play_audio(generate_beep(frequency=440, duration=0.3))

    # Sauvegarder
    output_path = OUTPUT_DIR / "voice_sample.wav"
    save_wav(output_path, audio_data)

    file_size = os.path.getsize(output_path) / 1024
    print(f"\n📁 Échantillon sauvegardé: {output_path}")
    print(f"   📊 Taille: {file_size:.1f} KB")

    return str(output_path)


async def test_hybrid_pipeline(voice_sample_path: str):
    """Test du pipeline hybride VITS + Voice Converter"""
    print("\n" + "=" * 60)
    print("🔄 TEST PIPELINE HYBRIDE (VITS + VOICE CLONING)")
    print("=" * 60)

    from services.tts.backends.vits_backend import VITSBackend

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
    backend = VITSBackend(device="cpu")

    if not backend.is_available:
        print("❌ VITS Backend non disponible")
        return None

    await backend.initialize()

    results = []

    for i, text in enumerate(texts_ln, 1):
        output_path = str(OUTPUT_DIR / f"cloned_lingala_{i}.wav")

        print(f"\n🔊 [{i}/{len(texts_ln)}] Synthèse + Clonage: \"{text[:40]}...\"")
        start_time = time.time()

        try:
            result = await backend.synthesize(
                text=text,
                language="ln",
                speaker_audio_path=voice_sample_path,
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
    return results


async def main():
    """Test complet du pipeline de clonage vocal"""
    print("\n" + "#" * 60)
    print("#  TEST PIPELINE CLONAGE VOCAL - VITS + VOICE CONVERTER")
    print("#" * 60)
    print(f"\n📂 Dossier de sortie: {OUTPUT_DIR}")

    # Vérifier les dépendances
    try:
        import sounddevice as sd
        import numpy as np
        print("✅ sounddevice disponible")
    except ImportError:
        print("❌ sounddevice non disponible - pip install sounddevice")
        return False

    total_start = time.time()

    # Étape 1: Enregistrer la voix
    print("\n" + "-" * 60)
    print("ÉTAPE 1: Enregistrement de votre voix")
    print("-" * 60)

    voice_sample_path = await record_voice_sample()

    # Étape 2: Pipeline hybride
    print("\n" + "-" * 60)
    print("ÉTAPE 2: Synthèse Lingala avec clonage vocal")
    print("-" * 60)

    results = await test_hybrid_pipeline(voice_sample_path)

    # Résumé
    total_time = time.time() - total_start

    print("\n" + "=" * 60)
    print("📊 RÉSUMÉ")
    print("=" * 60)
    print(f"\n⏱️  Temps total: {total_time:.2f}s")
    print(f"\n📁 Fichiers générés dans: {OUTPUT_DIR}")

    print("\n📝 Fichiers audio:")
    for f in sorted(OUTPUT_DIR.glob("*.wav")):
        size = f.stat().st_size / 1024
        print(f"   • {f.name} ({size:.1f} KB)")

    if results:
        print("\n✅ TEST RÉUSSI!")
        print("\n🎧 Écoutez les fichiers générés pour comparer:")
        print(f"   - voice_sample.wav (votre voix originale)")
        for r in results:
            print(f"   - {Path(r).name} (Lingala avec votre voix)")
    else:
        print("\n⚠️ Test partiellement réussi")

    return bool(results)


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
