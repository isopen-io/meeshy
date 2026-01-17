"""
Test Chatterbox - Clonage Vocal Multilingue Natif (30 secondes)
===============================================================

Enregistre 30 secondes de votre voix puis utilise Chatterbox
pour cloner votre voix dans plusieurs langues avec des textes longs.

Chatterbox supporte 23 langues avec clonage vocal natif :
ar, da, de, el, en, es, fi, fr, he, hi, it, ja, ko, ms, nl, no, pl, pt, ru, sv, sw, tr, zh
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
OUTPUT_DIR = Path(__file__).parent.parent.parent / "outputs" / "chatterbox_clone"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SAMPLE_RATE = 24000  # Chatterbox utilise 24kHz
CHANNELS = 1
RECORD_SECONDS = 30  # 30 secondes pour meilleur embedding
COUNTDOWN_SECONDS = 3

# Textes multilingues longs (~30 secondes de lecture chacun)
TEXTS = {
    "en": ("English",
           "Hello and welcome! I am your voice clone, created using cutting-edge artificial intelligence technology. "
           "This remarkable system can capture the unique characteristics of your voice, including your tone, rhythm, "
           "and speaking patterns. It then reproduces these qualities in multiple languages, allowing you to communicate "
           "naturally with people around the world. The possibilities are truly endless and this technology represents "
           "a major breakthrough in speech synthesis."),
    "fr": ("Français",
           "Bonjour et bienvenue! Je suis le clone de votre voix, créé grâce à une technologie d'intelligence artificielle "
           "de pointe. Ce système remarquable peut capturer les caractéristiques uniques de votre voix, y compris votre "
           "ton, votre rythme et vos habitudes de parole. Il reproduit ensuite ces qualités dans plusieurs langues, vous "
           "permettant de communiquer naturellement avec des personnes du monde entier. Les possibilités sont vraiment "
           "infinies et cette technologie représente une avancée majeure dans la synthèse vocale."),
    "es": ("Español",
           "¡Hola y bienvenido! Soy el clon de tu voz, creado utilizando tecnología de inteligencia artificial de "
           "vanguardia. Este extraordinario sistema puede capturar las características únicas de tu voz, incluyendo "
           "tu tono, ritmo y patrones de habla. Luego reproduce estas cualidades en múltiples idiomas, permitiéndote "
           "comunicarte de forma natural con personas de todo el mundo. Las posibilidades son verdaderamente infinitas "
           "y esta tecnología representa un gran avance en la síntesis del habla."),
    "de": ("Deutsch",
           "Hallo und herzlich willkommen! Ich bin der Klon deiner Stimme, erstellt mit modernster künstlicher Intelligenz. "
           "Dieses bemerkenswerte System kann die einzigartigen Eigenschaften deiner Stimme erfassen, einschließlich "
           "deines Tons, Rhythmus und deiner Sprechmuster. Es reproduziert diese Qualitäten dann in mehreren Sprachen "
           "und ermöglicht es dir, auf natürliche Weise mit Menschen auf der ganzen Welt zu kommunizieren. Die "
           "Möglichkeiten sind wirklich grenzenlos und diese Technologie stellt einen großen Durchbruch dar."),
    "it": ("Italiano",
           "Ciao e benvenuto! Sono il clone della tua voce, creato utilizzando una tecnologia di intelligenza artificiale "
           "all'avanguardia. Questo straordinario sistema può catturare le caratteristiche uniche della tua voce, inclusi "
           "il tono, il ritmo e i tuoi schemi di parlato. Poi riproduce queste qualità in più lingue, permettendoti di "
           "comunicare in modo naturale con persone di tutto il mondo. Le possibilità sono davvero infinite e questa "
           "tecnologia rappresenta una svolta importante nella sintesi vocale."),
    "pt": ("Português",
           "Olá e bem-vindo! Eu sou o clone da sua voz, criado usando tecnologia de inteligência artificial de ponta. "
           "Este sistema notável pode capturar as características únicas da sua voz, incluindo seu tom, ritmo e padrões "
           "de fala. Ele então reproduz essas qualidades em vários idiomas, permitindo que você se comunique naturalmente "
           "com pessoas ao redor do mundo. As possibilidades são realmente infinitas e esta tecnologia representa um "
           "grande avanço na síntese de voz."),
    "zh": ("中文",
           "你好，欢迎！我是你声音的克隆，使用尖端人工智能技术创建。这个卓越的系统可以捕捉你声音的独特特征，"
           "包括你的音调、节奏和说话模式。然后它在多种语言中再现这些特质，让你能够与世界各地的人自然地交流。"
           "可能性真的是无穷无尽的，这项技术代表了语音合成领域的重大突破。人工智能正在改变我们沟通的方式。"),
    "ja": ("日本語",
           "こんにちは、ようこそ！私はあなたの声のクローンです。最先端の人工知能技術を使用して作成されました。"
           "この驚くべきシステムは、あなたの声のユニークな特徴を捉えることができます。トーン、リズム、話し方の"
           "パターンを含みます。そして、これらの特性を複数の言語で再現し、世界中の人々と自然にコミュニケーション"
           "することを可能にします。可能性は本当に無限であり、この技術は音声合成における大きなブレークスルーです。"),
}


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
    print("🎙️  ENREGISTREMENT 30 SECONDES POUR CHATTERBOX")
    print("=" * 70)
    print(f"\n📝 Enregistrez {RECORD_SECONDS} secondes de votre voix.")
    print("   Parlez naturellement en français. Exemple de texte à lire:")
    print("\n   ╔════════════════════════════════════════════════════════════════════╗")
    print("   ║  \"Bonjour et bienvenue! Je teste aujourd'hui le clonage vocal     ║")
    print("   ║   avec Chatterbox, une technologie d'intelligence artificielle    ║")
    print("   ║   de pointe. Ce système remarquable peut capturer les             ║")
    print("   ║   caractéristiques uniques de ma voix, y compris mon ton,         ║")
    print("   ║   mon rythme et mes habitudes de parole. Il reproduit ensuite     ║")
    print("   ║   ces qualités dans plusieurs langues, me permettant de           ║")
    print("   ║   communiquer naturellement avec des personnes du monde entier.   ║")
    print("   ║   Les possibilités sont vraiment infinies!\"                       ║")
    print("   ╚════════════════════════════════════════════════════════════════════╝")

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

    output_path = OUTPUT_DIR / "voice_sample_chatterbox.wav"
    save_wav(output_path, audio_data)

    file_size = os.path.getsize(output_path) / 1024
    print(f"\n📁 Échantillon sauvegardé: {output_path}")
    print(f"   📊 Taille: {file_size:.1f} KB")

    return str(output_path)


async def clone_with_chatterbox(voice_sample_path: str):
    """Clone la voix avec Chatterbox dans plusieurs langues"""
    print("\n" + "=" * 60)
    print("🎭 CLONAGE VOCAL AVEC CHATTERBOX")
    print("=" * 60)

    from services.tts.backends.chatterbox_backend import ChatterboxBackend

    print(f"\n🎤 Voix source: {voice_sample_path}")
    print(f"🌍 Langues: {', '.join([v[0] for v in TEXTS.values()])}")

    # Initialiser Chatterbox
    print("\n🔄 Initialisation Chatterbox...")
    backend = ChatterboxBackend(device="cpu")

    if not backend.is_available:
        print("❌ Chatterbox non disponible")
        return None

    results = []
    total_start = time.time()

    for lang_code, (lang_name, text) in TEXTS.items():
        print(f"\n{'─' * 50}")
        print(f"🌐 [{lang_name}] {lang_code.upper()}")
        print(f"   \"{text[:50]}...\"")

        output_path = str(OUTPUT_DIR / f"cloned_{lang_code}.wav")
        start_time = time.time()

        try:
            await backend.synthesize(
                text=text,
                language=lang_code,
                speaker_audio_path=voice_sample_path,
                output_path=output_path,
                exaggeration=0.5,
                cfg_weight=0.5
            )

            elapsed = time.time() - start_time
            file_size = os.path.getsize(output_path) / 1024

            print(f"   ✅ Généré: cloned_{lang_code}.wav")
            print(f"   📊 Taille: {file_size:.1f} KB | ⏱️ Temps: {elapsed:.2f}s")

            results.append({
                "lang": lang_code,
                "name": lang_name,
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
    print("\n" + "=" * 60)
    print("📊 RÉSUMÉ")
    print("=" * 60)
    print(f"\n⏱️  Temps total: {total_time:.2f}s")
    print(f"✅ Langues réussies: {len(results)}/{len(TEXTS)}")

    print(f"\n📁 Fichiers dans: {OUTPUT_DIR}")
    print("\n📝 Fichiers générés:")
    print(f"   🎤 voice_sample_chatterbox.wav (votre voix)")
    for r in results:
        print(f"   🌐 cloned_{r['lang']}.wav ({r['name']}) - {r['size']:.1f} KB")

    return results


async def main():
    """Test principal"""
    print("\n" + "#" * 60)
    print("#  CHATTERBOX VOICE CLONING - 23 LANGUES")
    print("#" * 60)

    # Vérifier sounddevice
    try:
        import sounddevice as sd
        print("✅ sounddevice disponible")
    except ImportError:
        print("❌ sounddevice requis - pip install sounddevice")
        return False

    # Étape 1: Enregistrer
    voice_sample = await record_voice_sample()

    # Étape 2: Cloner
    results = await clone_with_chatterbox(voice_sample)

    if results:
        print("\n" + "=" * 60)
        print("🎧 ÉCOUTEZ LES RÉSULTATS!")
        print("=" * 60)
        print(f"\n   Dossier: {OUTPUT_DIR}")
        print("\n   Votre voix parle maintenant 8 langues! 🌍")

    return bool(results)


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
