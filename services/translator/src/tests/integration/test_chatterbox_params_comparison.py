"""
Test Chatterbox - Comparaison de Paramètres
============================================

Génère plusieurs versions FR et EN avec différents paramètres
pour sélectionner la meilleure combinaison.

Paramètres testés:
- exaggeration: Contrôle l'expressivité vocale (0.0-1.0)
- cfg_weight: Contrôle la guidance du modèle (0.0-1.0)
"""

import asyncio
import os
import sys
import time
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent.parent / "outputs" / "chatterbox_params"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SAMPLE_RATE = 24000
CHANNELS = 1
RECORD_SECONDS = 30
COUNTDOWN_SECONDS = 3

# Textes à synthétiser
TEXTS = {
    "fr": "Bonjour et bienvenue! Je suis le clone de votre voix, créé avec l'intelligence artificielle. "
          "Cette technologie peut capturer les caractéristiques uniques de votre voix et les reproduire "
          "dans plusieurs langues différentes.",
    "en": "Hello and welcome! I am your voice clone, created using artificial intelligence technology. "
          "This system can capture the unique characteristics of your voice and reproduce them "
          "in multiple different languages."
}

# Combinaisons de paramètres à tester
PARAM_COMBINATIONS = [
    {"exaggeration": 0.3, "cfg_weight": 0.3, "name": "low_exp_low_cfg"},
    {"exaggeration": 0.3, "cfg_weight": 0.5, "name": "low_exp_mid_cfg"},
    {"exaggeration": 0.3, "cfg_weight": 0.7, "name": "low_exp_high_cfg"},
    {"exaggeration": 0.5, "cfg_weight": 0.3, "name": "mid_exp_low_cfg"},
    {"exaggeration": 0.5, "cfg_weight": 0.5, "name": "mid_exp_mid_cfg"},
    {"exaggeration": 0.5, "cfg_weight": 0.7, "name": "mid_exp_high_cfg"},
    {"exaggeration": 0.7, "cfg_weight": 0.3, "name": "high_exp_low_cfg"},
    {"exaggeration": 0.7, "cfg_weight": 0.5, "name": "high_exp_mid_cfg"},
    {"exaggeration": 0.7, "cfg_weight": 0.7, "name": "high_exp_high_cfg"},
]


def generate_beep(frequency=880, duration=0.2, sample_rate=SAMPLE_RATE):
    """Génère un bip audio"""
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    beep = np.sin(2 * np.pi * frequency * t)
    fade_samples = int(sample_rate * 0.02)
    beep[:fade_samples] *= np.linspace(0, 1, fade_samples)
    beep[-fade_samples:] *= np.linspace(1, 0, fade_samples)
    beep = (beep * 0.5 * 32767).astype(np.int16)
    return beep


def play_audio(audio_data, sample_rate=SAMPLE_RATE):
    """Joue de l'audio"""
    import sounddevice as sd
    sd.play(audio_data, sample_rate)
    sd.wait()


def record_audio(duration, sample_rate=SAMPLE_RATE):
    """Enregistre de l'audio"""
    import sounddevice as sd

    print(f"\n🎤 Enregistrement en cours ({duration}s)...")

    audio = sd.rec(
        int(duration * sample_rate),
        samplerate=sample_rate,
        channels=CHANNELS,
        dtype=np.int16
    )

    for i in range(duration):
        remaining = duration - i
        print(f"   ⏱️  {remaining}s restantes...", end="\r")
        time.sleep(1)

    sd.wait()
    print(f"\n✅ Enregistrement terminé!")
    return audio.flatten()


def save_wav(filename, audio_data, sample_rate=SAMPLE_RATE):
    """Sauvegarde en WAV"""
    with wave.open(str(filename), 'w') as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data.tobytes())
    return filename


async def record_voice_sample():
    """Enregistre un échantillon vocal avec countdown"""
    print("\n" + "=" * 70)
    print("🎙️  ENREGISTREMENT 30 SECONDES POUR TEST PARAMÈTRES")
    print("=" * 70)
    print(f"\n📝 Enregistrez {RECORD_SECONDS} secondes de votre voix.")
    print("   Parlez naturellement en français.")

    print(f"\n⏳ L'enregistrement commence dans {COUNTDOWN_SECONDS} secondes...")

    beep = generate_beep(frequency=660, duration=0.15)
    beep_start = generate_beep(frequency=880, duration=0.4)

    for i in range(COUNTDOWN_SECONDS, 0, -1):
        print(f"   {i}...")
        play_audio(beep)
        time.sleep(0.85)

    print("   🔴 GO!")
    play_audio(beep_start)

    audio_data = record_audio(RECORD_SECONDS)

    play_audio(generate_beep(frequency=440, duration=0.3))

    output_path = OUTPUT_DIR / "voice_sample_params.wav"
    save_wav(output_path, audio_data)

    file_size = os.path.getsize(output_path) / 1024
    print(f"\n📁 Échantillon sauvegardé: {output_path}")
    print(f"   📊 Taille: {file_size:.1f} KB")

    return str(output_path)


async def test_params_with_chatterbox(voice_sample_path: str):
    """Teste différentes combinaisons de paramètres"""
    print("\n" + "=" * 70)
    print("🎭 TEST PARAMÈTRES CHATTERBOX - FR & EN")
    print("=" * 70)

    from services.tts.backends.chatterbox_backend import ChatterboxBackend

    print(f"\n🎤 Voix source: {voice_sample_path}")
    print(f"🔧 Combinaisons: {len(PARAM_COMBINATIONS)}")
    print(f"🌍 Langues: FR, EN")
    print(f"📊 Total fichiers: {len(PARAM_COMBINATIONS) * 2}")

    # Initialiser Chatterbox
    print("\n🔄 Initialisation Chatterbox...")
    backend = ChatterboxBackend(device="cpu")

    if not backend.is_available:
        print("❌ Chatterbox non disponible")
        return None

    results = []
    total_start = time.time()

    for params in PARAM_COMBINATIONS:
        exp = params["exaggeration"]
        cfg = params["cfg_weight"]
        name = params["name"]

        print(f"\n{'═' * 70}")
        print(f"🔧 PARAMS: exaggeration={exp}, cfg_weight={cfg}")
        print(f"   Nom: {name}")
        print(f"{'═' * 70}")

        for lang_code, text in TEXTS.items():
            output_path = str(OUTPUT_DIR / f"{lang_code}_{name}.wav")
            start_time = time.time()

            print(f"\n   🌐 [{lang_code.upper()}] Génération...")

            try:
                await backend.synthesize(
                    text=text,
                    language=lang_code,
                    speaker_audio_path=voice_sample_path,
                    output_path=output_path,
                    exaggeration=exp,
                    cfg_weight=cfg
                )

                elapsed = time.time() - start_time
                file_size = os.path.getsize(output_path) / 1024

                print(f"   ✅ {lang_code}_{name}.wav - {file_size:.1f} KB - {elapsed:.1f}s")

                results.append({
                    "lang": lang_code,
                    "params": name,
                    "exaggeration": exp,
                    "cfg_weight": cfg,
                    "file": output_path,
                    "size": file_size,
                    "time": elapsed
                })

            except Exception as e:
                print(f"   ❌ Erreur: {e}")
                import traceback
                traceback.print_exc()

    await backend.close()

    total_time = time.time() - total_start

    # Résumé
    print("\n" + "=" * 70)
    print("📊 RÉSUMÉ - COMPARAISON PARAMÈTRES")
    print("=" * 70)

    print(f"\n⏱️  Temps total: {total_time:.2f}s")
    print(f"✅ Fichiers générés: {len(results)}/{len(PARAM_COMBINATIONS) * 2}")

    print(f"\n📁 Dossier: {OUTPUT_DIR}")

    print("\n📝 FICHIERS GÉNÉRÉS:")
    print("-" * 70)
    print(f"{'Fichier':<40} {'Exp':>5} {'CFG':>5} {'Taille':>10}")
    print("-" * 70)

    for r in sorted(results, key=lambda x: (x["lang"], x["exaggeration"], x["cfg_weight"])):
        filename = f"{r['lang']}_{r['params']}.wav"
        print(f"{filename:<40} {r['exaggeration']:>5.1f} {r['cfg_weight']:>5.1f} {r['size']:>8.1f} KB")

    print("\n" + "=" * 70)
    print("🎧 GUIDE D'ÉCOUTE")
    print("=" * 70)
    print("""
    📌 Paramètres expliqués:

    • exaggeration (exp): Contrôle l'expressivité
      - 0.3: Plus neutre, proche de la voix originale
      - 0.5: Équilibré
      - 0.7: Plus expressif, accentue les émotions

    • cfg_weight: Contrôle la guidance du modèle
      - 0.3: Plus créatif mais moins stable
      - 0.5: Équilibré
      - 0.7: Plus fidèle au texte

    📋 Recommandations:
    - Pour une voix naturelle: mid_exp_mid_cfg (0.5/0.5)
    - Pour une voix expressive: high_exp_mid_cfg (0.7/0.5)
    - Pour une voix fidèle: mid_exp_high_cfg (0.5/0.7)
    """)

    return results


async def main():
    """Test principal"""
    print("\n" + "#" * 70)
    print("#  CHATTERBOX - COMPARAISON PARAMÈTRES FR/EN")
    print("#" * 70)

    # Vérifier sounddevice
    try:
        import sounddevice as sd
        print("✅ sounddevice disponible")
    except ImportError:
        print("❌ sounddevice requis - pip install sounddevice")
        return False

    # Étape 1: Enregistrer
    voice_sample = await record_voice_sample()

    # Étape 2: Tester les paramètres
    results = await test_params_with_chatterbox(voice_sample)

    if results:
        print("\n🎧 Écoutez les fichiers et choisissez vos paramètres préférés!")

    return bool(results)


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
