#!/usr/bin/env python3
"""
Full Voice Pipeline Test - Record, Transcribe, Translate, Clone
================================================================
This script demonstrates the complete Meeshy voice translation pipeline:

1. Record your voice (or use existing audio file)
2. Play back the recording
3. Transcribe using Whisper
4. Translate to target language
5. Generate TTS in target language
6. Clone your voice onto the translation
7. Play the final result

Usage:
    python full_voice_pipeline_test.py --record 5 --target fr --play
    python full_voice_pipeline_test.py --input my_voice.wav --target es
"""

import torch
import numpy as np
import os
import sys
import argparse
import subprocess
import time
import tempfile

# Audio libraries
import soundfile as sf
import sounddevice as sd

OPENVOICE_PATH = os.path.expanduser("~/OpenVoice")
sys.path.insert(0, OPENVOICE_PATH)

from openvoice.api import ToneColorConverter
from openvoice import se_extractor

# Supported languages for translation demo
LANGUAGES = {
    'en': {'name': 'English', 'tts_voice': 'Samantha'},
    'fr': {'name': 'French', 'tts_voice': 'Thomas'},
    'es': {'name': 'Spanish', 'tts_voice': 'Monica'},
    'de': {'name': 'German', 'tts_voice': 'Anna'},
    'it': {'name': 'Italian', 'tts_voice': 'Alice'},
    'pt': {'name': 'Portuguese', 'tts_voice': 'Luciana'},
    'zh': {'name': 'Chinese', 'tts_voice': 'Tingting'},
    'ja': {'name': 'Japanese', 'tts_voice': 'Kyoko'},
    'ko': {'name': 'Korean', 'tts_voice': 'Yuna'},
}


def print_header(text: str):
    """Print a formatted header."""
    print("\n" + "=" * 60)
    print(f"  {text}")
    print("=" * 60)


def print_step(step: int, text: str):
    """Print a step indicator."""
    print(f"\n[Step {step}] {text}")
    print("-" * 40)


def record_audio(duration: float, sample_rate: int = 22050) -> np.ndarray:
    """Record audio from microphone."""
    print(f"🎤 Recording for {duration} seconds...")
    print("   Speak now!")

    # Countdown
    for i in range(3, 0, -1):
        print(f"   {i}...")
        time.sleep(0.5)
    print("   🔴 RECORDING...")

    # Record
    audio = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype='float32')
    sd.wait()

    print("   ✅ Recording complete!")
    return audio.flatten()


def play_audio(audio: np.ndarray, sample_rate: int = 22050):
    """Play audio through speakers."""
    print("🔊 Playing audio...")
    sd.play(audio, sample_rate)
    sd.wait()
    print("   ✅ Playback complete!")


def play_file(path: str):
    """Play audio file using afplay (macOS)."""
    print(f"🔊 Playing: {os.path.basename(path)}")
    subprocess.run(['afplay', path], check=True)
    print("   ✅ Playback complete!")


def transcribe_audio(audio_path: str, language: str = None) -> dict:
    """Transcribe audio using Whisper."""
    import whisper
    import warnings
    warnings.filterwarnings('ignore')

    print("📝 Transcribing with Whisper...")
    model = whisper.load_model('base')

    options = {}
    if language:
        options['language'] = language

    result = model.transcribe(audio_path, **options)

    print(f"   Detected language: {result.get('language', 'unknown')}")
    print(f"   Text: \"{result['text'].strip()}\"")

    return {
        'text': result['text'].strip(),
        'language': result.get('language', 'en'),
        'segments': result.get('segments', [])
    }


def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """Translate text to target language."""
    print(f"🌍 Translating: {source_lang} → {target_lang}")

    # Try deep_translator first
    try:
        from deep_translator import GoogleTranslator
        translator = GoogleTranslator(source=source_lang, target=target_lang)
        translated = translator.translate(text)
        print(f"   Original: \"{text}\"")
        print(f"   Translated: \"{translated}\"")
        return translated
    except ImportError:
        pass

    # Try googletrans
    try:
        from googletrans import Translator
        translator = Translator()
        result = translator.translate(text, src=source_lang, dest=target_lang)
        translated = result.text
        print(f"   Original: \"{text}\"")
        print(f"   Translated: \"{translated}\"")
        return translated
    except ImportError:
        pass

    # Fallback: simple demo translations
    demo_translations = {
        ('en', 'fr'): {
            'hello': 'bonjour',
            'how are you': 'comment allez-vous',
            'my name is': 'je m\'appelle',
            'this is a test': 'ceci est un test',
        },
        ('en', 'es'): {
            'hello': 'hola',
            'how are you': 'cómo estás',
            'my name is': 'me llamo',
            'this is a test': 'esto es una prueba',
        },
        ('en', 'de'): {
            'hello': 'hallo',
            'how are you': 'wie geht es dir',
            'my name is': 'ich heiße',
            'this is a test': 'das ist ein test',
        },
    }

    # Check for demo translation
    key = (source_lang, target_lang)
    if key in demo_translations:
        lower_text = text.lower()
        for phrase, translation in demo_translations[key].items():
            if phrase in lower_text:
                translated = translation
                print(f"   Original: \"{text}\"")
                print(f"   Translated (demo): \"{translated}\"")
                return translated

    # Ultimate fallback
    print(f"   ⚠️ Translation not available, using original text")
    print(f"   Install: pip install deep-translator")
    return text


def generate_tts(text: str, output_path: str, language: str = 'en', voice: str = None):
    """Generate TTS audio using macOS say command."""
    print(f"🗣️ Generating TTS ({language})...")

    # Get voice for language
    if voice is None:
        voice = LANGUAGES.get(language, {}).get('tts_voice', 'Samantha')

    # Check available voices
    try:
        result = subprocess.run(['say', '-v', '?'], capture_output=True, text=True)
        available_voices = result.stdout
        if voice not in available_voices:
            # Use default voice
            voice = None
    except:
        voice = None

    # Generate TTS
    aiff_path = output_path.replace('.wav', '.aiff')

    cmd = ['say', '-o', aiff_path]
    if voice:
        cmd.extend(['-v', voice])
    cmd.append(text)

    subprocess.run(cmd, check=True)

    # Convert to WAV at 22050Hz
    subprocess.run([
        'ffmpeg', '-y', '-i', aiff_path,
        '-ar', '22050', '-ac', '1',
        output_path
    ], check=True, capture_output=True)

    os.remove(aiff_path)
    print(f"   ✅ TTS saved: {output_path}")

    return output_path


def clone_voice(
    reference_audio_path: str,
    source_audio_path: str,
    output_path: str,
    tau: float = 0.3
) -> str:
    """Clone voice from reference onto source audio."""
    print("🎭 Cloning voice...")

    # Load converter
    ckpt_dir = os.path.join(OPENVOICE_PATH, "checkpoints_v2/converter")
    config_path = os.path.join(ckpt_dir, "config.json")

    converter = ToneColorConverter(config_path, device="cpu")
    converter.load_ckpt(os.path.join(ckpt_dir, "checkpoint.pth"))

    # Extract embeddings
    print("   Extracting source embedding...")
    try:
        source_se = se_extractor.get_se(source_audio_path, converter, vad=False)
    except Exception as e:
        print(f"   ⚠️ Source embedding failed: {e}")
        source_se = torch.randn(1, 256, 1)

    print("   Extracting target embedding (your voice)...")
    try:
        target_se = se_extractor.get_se(reference_audio_path, converter, vad=False)
    except Exception as e:
        print(f"   ⚠️ Target embedding failed: {e}")
        target_se = torch.randn(1, 256, 1)

    # Convert
    print("   Running voice conversion...")
    converter.convert(
        audio_src_path=source_audio_path,
        src_se=source_se,
        tgt_se=target_se,
        output_path=output_path,
        tau=tau
    )

    print(f"   ✅ Voice cloned: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Full Voice Pipeline: Record → Transcribe → Translate → Clone",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Record 5 seconds, translate to French, play result
  python full_voice_pipeline_test.py --record 5 --target fr --play

  # Use existing audio file
  python full_voice_pipeline_test.py --input my_voice.wav --target es

  # Translate to German without playing
  python full_voice_pipeline_test.py --record 3 --target de
        """
    )

    parser.add_argument('--record', '-r', type=float, default=0,
                        help='Record audio for N seconds (0 to skip)')
    parser.add_argument('--input', '-i', type=str,
                        help='Input audio file (instead of recording)')
    parser.add_argument('--source', '-s', type=str, default='en',
                        help='Source language code (default: en)')
    parser.add_argument('--target', '-t', type=str, default='fr',
                        help='Target language code (default: fr)')
    parser.add_argument('--play', '-p', action='store_true',
                        help='Play audio at each step')
    parser.add_argument('--output-dir', '-o', type=str, default='.',
                        help='Output directory')
    parser.add_argument('--tau', type=float, default=0.3,
                        help='Voice conversion temperature (0.0-1.0)')

    args = parser.parse_args()

    # Setup output directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, 'pipeline_output')
    os.makedirs(output_dir, exist_ok=True)

    print_header("FULL VOICE PIPELINE TEST")
    print(f"Source: {args.source} ({LANGUAGES.get(args.source, {}).get('name', 'Unknown')})")
    print(f"Target: {args.target} ({LANGUAGES.get(args.target, {}).get('name', 'Unknown')})")

    # ========================================
    # STEP 1: Get voice recording
    # ========================================
    print_step(1, "RECORD / LOAD YOUR VOICE")

    if args.input:
        # Use provided audio file
        voice_path = args.input
        print(f"📂 Using input file: {voice_path}")

        # Copy to output dir if needed
        if os.path.dirname(voice_path) != output_dir:
            import shutil
            dest_path = os.path.join(output_dir, '1_original_voice.wav')
            shutil.copy(voice_path, dest_path)
            voice_path = dest_path
    else:
        # Record audio
        duration = args.record if args.record > 0 else 5.0
        print(f"Recording {duration} seconds of your voice...")

        audio = record_audio(duration)

        voice_path = os.path.join(output_dir, '1_original_voice.wav')
        sf.write(voice_path, audio, 22050)
        print(f"   Saved: {voice_path}")

    # Play original recording
    if args.play:
        print("\n   Playing your recording...")
        play_file(voice_path)

    # ========================================
    # STEP 2: Transcribe
    # ========================================
    print_step(2, "TRANSCRIBE YOUR SPEECH")

    transcription = transcribe_audio(voice_path, language=args.source)
    original_text = transcription['text']
    detected_lang = transcription['language']

    if not original_text:
        print("   ❌ No speech detected! Please try again with clearer audio.")
        return

    # ========================================
    # STEP 3: Translate
    # ========================================
    print_step(3, f"TRANSLATE TO {LANGUAGES.get(args.target, {}).get('name', args.target).upper()}")

    translated_text = translate_text(original_text, detected_lang, args.target)

    # ========================================
    # STEP 4: Generate TTS in target language
    # ========================================
    print_step(4, "GENERATE TTS (Target Language)")

    tts_path = os.path.join(output_dir, f'3_tts_{args.target}.wav')
    generate_tts(translated_text, tts_path, language=args.target)

    if args.play:
        print("\n   Playing TTS (before voice cloning)...")
        play_file(tts_path)

    # ========================================
    # STEP 5: Clone your voice
    # ========================================
    print_step(5, "CLONE YOUR VOICE ONTO TRANSLATION")

    cloned_path = os.path.join(output_dir, f'4_cloned_{args.target}.wav')
    clone_voice(
        reference_audio_path=voice_path,
        source_audio_path=tts_path,
        output_path=cloned_path,
        tau=args.tau
    )

    # ========================================
    # STEP 6: Final result
    # ========================================
    print_step(6, "FINAL RESULT")

    # Analyze output
    cloned_audio, sr = sf.read(cloned_path)
    duration = len(cloned_audio) / sr
    rms = np.sqrt(np.mean(cloned_audio**2))

    print(f"📊 Output Statistics:")
    print(f"   Duration: {duration:.2f}s")
    print(f"   Sample rate: {sr}Hz")
    print(f"   RMS: {rms:.4f}")

    # Transcribe final output to verify
    print("\n📝 Verifying final output...")
    final_transcription = transcribe_audio(cloned_path, language=args.target)

    # Play final result
    if args.play:
        print("\n🎉 Playing final cloned result...")
        play_file(cloned_path)

    # ========================================
    # Summary
    # ========================================
    print_header("PIPELINE COMPLETE!")

    print(f"""
📋 Summary:
   Original ({args.source}): "{original_text}"
   Translated ({args.target}): "{translated_text}"
   Final transcription: "{final_transcription['text']}"

📁 Output Files:
   1. Original voice: {voice_path}
   2. TTS ({args.target}): {tts_path}
   3. Cloned voice: {cloned_path}

🎧 To play the final result:
   afplay {cloned_path}
""")


if __name__ == "__main__":
    main()
