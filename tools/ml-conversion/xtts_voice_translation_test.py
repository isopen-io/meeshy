#!/usr/bin/env python3
"""
XTTS-v2 Voice Translation Test
==============================
Complete voice cloning + translation pipeline for iOS Meeshy app.

Features:
- Record any voice (male, female, child, high/low pitch)
- Transcribe speech with Whisper
- Translate to multiple languages
- Clone voice speaking translation with XTTS-v2
- Compare original vs cloned in each language

Supported Languages:
    en, fr, es, de, it, pt, pl, tr, ru, nl, cs, ar, zh, ja, ko, hu

Usage:
    # Record and translate to French
    python xtts_voice_translation_test.py --record 10 --targets fr

    # Record and translate to multiple languages
    python xtts_voice_translation_test.py --record 10 --targets fr,es,de

    # Use existing audio file
    python xtts_voice_translation_test.py --input voice.wav --targets fr,es

    # Full test with all major languages
    python xtts_voice_translation_test.py --record 10 --targets fr,es,de,it,pt,zh,ja
"""

import os
import sys
import time
import json
import argparse
import subprocess
import numpy as np
import warnings
warnings.filterwarnings('ignore')

import soundfile as sf
import sounddevice as sd
import librosa

# Accept XTTS license
os.environ["COQUI_TOS_AGREED"] = "1"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "xtts_translation_test")

# Supported languages for XTTS-v2
SUPPORTED_LANGUAGES = {
    'en': 'English',
    'fr': 'French',
    'es': 'Spanish',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'pl': 'Polish',
    'tr': 'Turkish',
    'ru': 'Russian',
    'nl': 'Dutch',
    'cs': 'Czech',
    'ar': 'Arabic',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'hu': 'Hungarian'
}


class VoiceAnalyzer:
    """Analyze voice characteristics."""

    @staticmethod
    def analyze(audio_path):
        """Get voice characteristics."""
        audio, sr = librosa.load(audio_path, sr=22050)

        # Pitch analysis
        f0, voiced, _ = librosa.pyin(audio, fmin=50, fmax=500, sr=sr)
        f0_valid = f0[~np.isnan(f0)]

        pitch_mean = float(np.mean(f0_valid)) if len(f0_valid) > 0 else 0
        pitch_std = float(np.std(f0_valid)) if len(f0_valid) > 0 else 0

        # Classify voice type
        if pitch_mean > 200:
            voice_type = "High (child/female)"
        elif pitch_mean > 150:
            voice_type = "Medium (female/tenor)"
        elif pitch_mean > 100:
            voice_type = "Medium-Low (male)"
        else:
            voice_type = "Low (bass)"

        # Spectral centroid (brightness)
        centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
        brightness = float(np.mean(centroid))

        # Duration
        duration = len(audio) / sr

        return {
            'pitch_hz': pitch_mean,
            'pitch_std': pitch_std,
            'voice_type': voice_type,
            'brightness': brightness,
            'duration': duration
        }

    @staticmethod
    def compare(original_path, cloned_path):
        """Compare original and cloned voice."""
        orig = VoiceAnalyzer.analyze(original_path)
        clone = VoiceAnalyzer.analyze(cloned_path)

        # Pitch similarity
        if orig['pitch_hz'] > 0 and clone['pitch_hz'] > 0:
            pitch_diff = abs(orig['pitch_hz'] - clone['pitch_hz'])
            pitch_sim = max(0, 1 - pitch_diff / orig['pitch_hz'])
        else:
            pitch_sim = 0

        # Brightness similarity
        bright_diff = abs(orig['brightness'] - clone['brightness'])
        bright_sim = max(0, 1 - bright_diff / max(orig['brightness'], 1))

        return {
            'pitch_similarity': pitch_sim,
            'brightness_similarity': bright_sim,
            'overall': (pitch_sim + bright_sim) / 2,
            'original': orig,
            'cloned': clone
        }


class XTTSVoiceCloner:
    """XTTS-v2 voice cloning engine."""

    def __init__(self):
        self.tts = None
        self.loaded = False

    def load(self):
        """Load XTTS-v2 model."""
        if self.loaded:
            return

        print("\n  Loading XTTS-v2 model...")
        from TTS.api import TTS
        self.tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=False)
        self.loaded = True
        print("  Model loaded!")

    def clone(self, reference_path, text, output_path, language='en'):
        """Clone voice speaking text in target language."""
        self.load()

        self.tts.tts_to_file(
            text=text,
            speaker_wav=reference_path,
            language=language,
            file_path=output_path
        )

        return output_path


def record_voice(duration=10, sample_rate=22050):
    """Record voice from microphone."""
    print(f"\n  Recording {duration} seconds...")
    print("  Speak clearly in your natural voice!\n")

    for i in range(3, 0, -1):
        print(f"    {i}...")
        time.sleep(1)

    print("    >>> RECORDING <<<")

    audio = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype='float32')
    sd.wait()

    print("    Done!\n")

    audio = audio.flatten()
    audio = audio / (np.abs(audio).max() + 1e-6) * 0.95

    return audio


def transcribe(audio_path, language=None, force_language=None):
    """Transcribe audio with Whisper."""
    import whisper

    print("  Transcribing with Whisper...")
    model = whisper.load_model('base')

    opts = {}
    if force_language:
        opts['language'] = force_language
    elif language:
        opts['language'] = language

    result = model.transcribe(audio_path, **opts)

    detected_lang = force_language or result.get('language', 'en')
    text = result['text'].strip()

    print(f"    Detected language: {detected_lang}")
    print(f"    Text: \"{text}\"")

    return {
        'text': text,
        'language': detected_lang
    }


def translate(text, source_lang, target_lang):
    """Translate text to target language."""
    if source_lang == target_lang:
        return text

    try:
        from deep_translator import GoogleTranslator
        translated = GoogleTranslator(source=source_lang, target=target_lang).translate(text)
        return translated
    except Exception as e:
        print(f"    Translation error: {e}")
        return text


def play_audio(path, label=""):
    """Play audio file."""
    if label:
        print(f"  Playing: {label}")
    subprocess.run(['afplay', path], check=True)


def run_translation_test(reference_path, target_languages, output_dir,
                         source_lang=None, provided_text=None):
    """Run full voice translation test."""

    os.makedirs(output_dir, exist_ok=True)

    # Initialize cloner
    cloner = XTTSVoiceCloner()

    # Analyze original voice
    print("\n" + "="*60)
    print("  ANALYZING YOUR VOICE")
    print("="*60)

    voice_info = VoiceAnalyzer.analyze(reference_path)
    print(f"""
    Pitch: {voice_info['pitch_hz']:.1f} Hz (+/- {voice_info['pitch_std']:.1f})
    Type: {voice_info['voice_type']}
    Brightness: {voice_info['brightness']:.1f} Hz
    Duration: {voice_info['duration']:.2f}s
    """)

    # Get text - either provided or transcribed
    if provided_text:
        print("="*60)
        print("  USING PROVIDED TEXT")
        print("="*60)
        original_text = provided_text
        source_lang = source_lang or 'en'
        print(f"    Text: \"{original_text}\"")
        print(f"    Language: {source_lang}")
    else:
        # Transcribe original
        print("="*60)
        print("  TRANSCRIBING YOUR SPEECH")
        print("="*60)

        transcription = transcribe(reference_path, force_language=source_lang)
        original_text = transcription['text']
        source_lang = source_lang or transcription['language']

    if not original_text:
        print("  ERROR: No speech detected!")
        return None

    # Results storage
    results = {
        'reference': {
            'path': reference_path,
            'text': original_text,
            'language': source_lang,
            'voice': voice_info
        },
        'translations': {}
    }

    # Process each target language
    for target_lang in target_languages:
        if target_lang not in SUPPORTED_LANGUAGES:
            print(f"\n  WARNING: {target_lang} not supported, skipping")
            continue

        lang_name = SUPPORTED_LANGUAGES[target_lang]

        print("\n" + "="*60)
        print(f"  TRANSLATING TO {lang_name.upper()} ({target_lang})")
        print("="*60)

        # Translate
        translated_text = translate(original_text, source_lang, target_lang)
        print(f"\n    Original ({source_lang}): \"{original_text}\"")
        print(f"    Translated ({target_lang}): \"{translated_text}\"")

        # Clone voice speaking translation
        print(f"\n  Cloning your voice in {lang_name}...")

        output_path = os.path.join(output_dir, f"cloned_{target_lang}.wav")

        start_time = time.time()
        cloner.clone(reference_path, translated_text, output_path, target_lang)
        clone_time = time.time() - start_time

        print(f"    Done in {clone_time:.2f}s")

        # Analyze cloned voice
        comparison = VoiceAnalyzer.compare(reference_path, output_path)

        print(f"""
    Voice Similarity:
      Pitch: {comparison['pitch_similarity']*100:.1f}%
      Timbre: {comparison['brightness_similarity']*100:.1f}%
      Overall: {comparison['overall']*100:.1f}%
        """)

        # Verify transcription of cloned audio
        print("  Verifying cloned audio...")
        cloned_transcription = transcribe(output_path, target_lang)

        results['translations'][target_lang] = {
            'language_name': lang_name,
            'translated_text': translated_text,
            'cloned_path': output_path,
            'clone_time': clone_time,
            'similarity': comparison,
            'verification': cloned_transcription['text']
        }

    return results


def print_summary(results, output_dir):
    """Print test summary."""

    print("\n" + "#"*60)
    print("#  VOICE TRANSLATION TEST SUMMARY")
    print("#"*60)

    ref = results['reference']

    print(f"""
  YOUR VOICE:
    Type: {ref['voice']['voice_type']}
    Pitch: {ref['voice']['pitch_hz']:.1f} Hz
    Original text ({ref['language']}): "{ref['text']}"
    """)

    print("  TRANSLATION RESULTS:")
    print("  " + "-"*56)

    for lang, data in results['translations'].items():
        sim = data['similarity']['overall'] * 100
        print(f"""
    [{lang.upper()}] {data['language_name']}:
      Text: "{data['translated_text'][:50]}..."
      Similarity: {sim:.1f}%
      Time: {data['clone_time']:.2f}s
      Verified: "{data['verification'][:50]}..."
        """)

    print("\n  OUTPUT FILES:")
    print(f"    Reference: {ref['path']}")
    for lang, data in results['translations'].items():
        print(f"    {lang.upper()}: {data['cloned_path']}")

    # Save results JSON
    results_path = os.path.join(output_dir, "results.json")

    # Convert for JSON serialization
    json_results = {
        'reference': {
            'path': ref['path'],
            'text': ref['text'],
            'language': ref['language'],
            'pitch_hz': ref['voice']['pitch_hz'],
            'voice_type': ref['voice']['voice_type']
        },
        'translations': {}
    }

    for lang, data in results['translations'].items():
        json_results['translations'][lang] = {
            'text': data['translated_text'],
            'path': data['cloned_path'],
            'similarity': data['similarity']['overall'],
            'verification': data['verification']
        }

    with open(results_path, 'w') as f:
        json.dump(json_results, f, indent=2, ensure_ascii=False)

    print(f"\n    Results JSON: {results_path}")


def playback_comparison(results):
    """Play back original and all translations."""

    print("\n" + "#"*60)
    print("#  PLAYBACK COMPARISON")
    print("#"*60)

    ref = results['reference']

    print("\n  [ORIGINAL] Your voice:")
    time.sleep(0.5)
    play_audio(ref['path'])

    for lang, data in results['translations'].items():
        time.sleep(1)
        print(f"\n  [{lang.upper()}] {data['language_name']} - {data['similarity']['overall']*100:.1f}% similarity:")
        print(f"      \"{data['translated_text'][:60]}...\"")
        time.sleep(0.5)
        play_audio(data['cloned_path'])

    print("\n  Playback complete!")


def main():
    parser = argparse.ArgumentParser(
        description="XTTS-v2 Voice Translation Test",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Record 10 seconds, translate to French
  python xtts_voice_translation_test.py --record 10 --targets fr

  # Record and translate to multiple languages
  python xtts_voice_translation_test.py --record 10 --targets fr,es,de,it

  # Use existing audio, translate to all major languages
  python xtts_voice_translation_test.py --input voice.wav --targets fr,es,de,it,pt,zh,ja

Supported languages: """ + ", ".join(SUPPORTED_LANGUAGES.keys())
    )

    parser.add_argument('--record', '-r', type=float, default=0,
                        help='Record N seconds of voice')
    parser.add_argument('--input', '-i', type=str,
                        help='Use existing audio file')
    parser.add_argument('--targets', '-t', type=str, default='fr',
                        help='Target languages (comma-separated, e.g., fr,es,de)')
    parser.add_argument('--source-lang', '-s', type=str, default=None,
                        help='Force source language (en, fr, es, etc.)')
    parser.add_argument('--text', type=str, default=None,
                        help='Provide text directly (skip transcription)')
    parser.add_argument('--play', '-p', action='store_true', default=True,
                        help='Play results after test')
    parser.add_argument('--no-play', dest='play', action='store_false',
                        help='Skip playback')

    args = parser.parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("\n" + "#"*60)
    print("#  XTTS-v2 VOICE TRANSLATION TEST")
    print("#  Clone any voice in any language!")
    print("#"*60)

    # Get reference audio
    if args.input:
        reference_path = args.input
        print(f"\n  Using input file: {reference_path}")
    elif args.record > 0:
        print("\n" + "="*60)
        print("  RECORDING YOUR VOICE")
        print("="*60)

        audio = record_voice(args.record)
        reference_path = os.path.join(OUTPUT_DIR, "original_voice.wav")
        sf.write(reference_path, audio, 22050)
        print(f"  Saved: {reference_path}")
    else:
        # Check for existing recording
        default_ref = os.path.join(OUTPUT_DIR, "original_voice.wav")
        if os.path.exists(default_ref):
            reference_path = default_ref
            print(f"\n  Using existing recording: {reference_path}")
        else:
            print("\n  ERROR: Provide --input or --record")
            print("  Example: python xtts_voice_translation_test.py --record 10 --targets fr,es")
            return

    # Parse target languages
    target_languages = [l.strip() for l in args.targets.split(',')]
    print(f"\n  Target languages: {', '.join(target_languages)}")

    # Run test
    results = run_translation_test(
        reference_path, target_languages, OUTPUT_DIR,
        source_lang=args.source_lang,
        provided_text=args.text
    )

    if results:
        # Print summary
        print_summary(results, OUTPUT_DIR)

        # Playback
        if args.play:
            playback_comparison(results)

    print("\n" + "="*60)
    print("  TEST COMPLETE!")
    print("="*60)
    print(f"\n  Output directory: {OUTPUT_DIR}")
    print("\n  To replay any file:")
    print(f"    afplay {OUTPUT_DIR}/original_voice.wav")
    for lang in target_languages:
        if lang in SUPPORTED_LANGUAGES:
            print(f"    afplay {OUTPUT_DIR}/cloned_{lang}.wav")


if __name__ == "__main__":
    main()
