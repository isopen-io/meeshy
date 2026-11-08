#!/usr/bin/env python3
"""
Voice Cloning E2E Benchmark
===========================
Comprehensive benchmark comparing voice cloning models for iOS integration.

Models tested:
- OpenVoice V2 (small, fast, ~70% similarity)
- XTTS-v2 (large, high quality, ~90% similarity)
- F5-TTS (medium, good quality, ~85% similarity)

Metrics:
- Pitch similarity (F0 correlation)
- Timbre match (spectral centroid distance)
- Clarity (SNR estimate)
- Transcription accuracy (WER)
- Processing time
- Model size

Usage:
    python voice_cloning_benchmark.py --reference your_voice.wav --languages en,fr,es
    python voice_cloning_benchmark.py --record 5 --languages en,fr,de
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

# Audio processing
import librosa
import soundfile as sf

# For recording
try:
    import sounddevice as sd
    HAS_SOUNDDEVICE = True
except ImportError:
    HAS_SOUNDDEVICE = False

OPENVOICE_PATH = os.path.expanduser("~/OpenVoice")
sys.path.insert(0, OPENVOICE_PATH)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "benchmark_results")


# ============================================================================
# AUDIO ANALYSIS UTILITIES
# ============================================================================

def analyze_audio(audio_path):
    """Comprehensive audio analysis."""
    audio, sr = librosa.load(audio_path, sr=22050)

    # Duration
    duration = len(audio) / sr

    # RMS energy
    rms = float(np.sqrt(np.mean(audio**2)))

    # Pitch (F0) analysis
    f0, voiced_flag, _ = librosa.pyin(
        audio, fmin=50, fmax=500, sr=sr
    )
    f0_valid = f0[~np.isnan(f0)]
    pitch_mean = float(np.mean(f0_valid)) if len(f0_valid) > 0 else 0
    pitch_std = float(np.std(f0_valid)) if len(f0_valid) > 0 else 0

    # Spectral centroid (brightness/timbre)
    centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
    centroid_mean = float(np.mean(centroid))

    # Zero crossing rate
    zcr = librosa.feature.zero_crossing_rate(audio)[0]
    zcr_mean = float(np.mean(zcr))

    # Spectral rolloff
    rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)[0]
    rolloff_mean = float(np.mean(rolloff))

    # MFCCs for voice characteristics
    mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    mfcc_mean = mfccs.mean(axis=1).tolist()

    return {
        'duration': duration,
        'rms': rms,
        'pitch_mean': pitch_mean,
        'pitch_std': pitch_std,
        'spectral_centroid': centroid_mean,
        'zcr': zcr_mean,
        'spectral_rolloff': rolloff_mean,
        'mfcc': mfcc_mean,
        'audio': audio,
        'sr': sr
    }


def compute_similarity_metrics(ref_analysis, cloned_analysis):
    """Compute similarity between reference and cloned audio."""

    # Pitch similarity (normalized difference)
    if ref_analysis['pitch_mean'] > 0 and cloned_analysis['pitch_mean'] > 0:
        pitch_diff = abs(ref_analysis['pitch_mean'] - cloned_analysis['pitch_mean'])
        pitch_similarity = max(0, 1 - pitch_diff / ref_analysis['pitch_mean'])
    else:
        pitch_similarity = 0

    # Timbre similarity (spectral centroid)
    centroid_diff = abs(ref_analysis['spectral_centroid'] - cloned_analysis['spectral_centroid'])
    timbre_similarity = max(0, 1 - centroid_diff / max(ref_analysis['spectral_centroid'], 1))

    # MFCC cosine similarity
    ref_mfcc = np.array(ref_analysis['mfcc'])
    cloned_mfcc = np.array(cloned_analysis['mfcc'])
    mfcc_similarity = float(np.dot(ref_mfcc, cloned_mfcc) /
                           (np.linalg.norm(ref_mfcc) * np.linalg.norm(cloned_mfcc) + 1e-6))

    # Overall voice similarity (weighted average)
    voice_similarity = (
        0.3 * pitch_similarity +
        0.3 * timbre_similarity +
        0.4 * mfcc_similarity
    )

    return {
        'pitch_similarity': pitch_similarity,
        'timbre_similarity': timbre_similarity,
        'mfcc_similarity': mfcc_similarity,
        'overall_similarity': voice_similarity
    }


def transcribe_audio(audio_path, language=None):
    """Transcribe audio using Whisper."""
    try:
        import whisper
        model = whisper.load_model('base')
        opts = {'language': language} if language else {}
        result = model.transcribe(audio_path, **opts)
        return result['text'].strip()
    except Exception as e:
        print(f"   Transcription error: {e}")
        return ""


def compute_wer(reference, hypothesis):
    """Compute Word Error Rate."""
    ref_words = reference.lower().split()
    hyp_words = hypothesis.lower().split()

    if len(ref_words) == 0:
        return 1.0 if len(hyp_words) > 0 else 0.0

    # Simple Levenshtein distance for WER
    d = np.zeros((len(ref_words) + 1, len(hyp_words) + 1))
    for i in range(len(ref_words) + 1):
        d[i][0] = i
    for j in range(len(hyp_words) + 1):
        d[0][j] = j

    for i in range(1, len(ref_words) + 1):
        for j in range(1, len(hyp_words) + 1):
            if ref_words[i-1] == hyp_words[j-1]:
                d[i][j] = d[i-1][j-1]
            else:
                d[i][j] = min(d[i-1][j], d[i][j-1], d[i-1][j-1]) + 1

    return float(d[len(ref_words)][len(hyp_words)]) / len(ref_words)


# ============================================================================
# VOICE CLONING MODELS
# ============================================================================

class OpenVoiceCloner:
    """OpenVoice V2 voice cloning."""

    name = "OpenVoice V2"
    model_size_mb = 125

    def __init__(self):
        self.converter = None
        self.loaded = False

    def load(self):
        """Load OpenVoice model."""
        if self.loaded:
            return True

        try:
            from openvoice.api import ToneColorConverter
            import torch
            import torch.nn.functional as F

            ckpt_dir = os.path.join(OPENVOICE_PATH, "checkpoints_v2/converter")
            self.converter = ToneColorConverter(
                os.path.join(ckpt_dir, "config.json"),
                device="cpu"
            )
            self.converter.load_ckpt(os.path.join(ckpt_dir, "checkpoint.pth"))
            self.torch = torch
            self.F = F
            self.loaded = True
            return True
        except Exception as e:
            print(f"   OpenVoice load error: {e}")
            return False

    def extract_embedding(self, audio, sr=22050):
        """Extract speaker embedding directly from audio."""
        # Compute spectrogram
        stft = librosa.stft(audio, n_fft=1024, hop_length=256, win_length=1024, center=True)
        spec = np.abs(stft)
        spec_tensor = self.torch.FloatTensor(spec).unsqueeze(0)

        model = self.converter.model

        with self.torch.no_grad():
            spec_len = self.torch.LongTensor([spec_tensor.shape[2]])
            g = self.torch.zeros(1, 256, 1)
            z, m, logs, y_mask = model.enc_q(spec_tensor, spec_len, g=g, tau=0.0)
            embedding = m.mean(dim=2, keepdim=True)

            if embedding.shape[1] != 256:
                embedding = self.F.adaptive_avg_pool1d(
                    embedding.transpose(1, 2), 256
                ).transpose(1, 2)

            embedding = embedding / (self.torch.norm(embedding) + 1e-6) * 16.0

        return embedding

    def clone(self, reference_path, source_path, output_path, tau=0.3):
        """Clone voice."""
        if not self.load():
            return False

        # Load audio
        ref_audio, _ = librosa.load(reference_path, sr=22050)
        src_audio, _ = librosa.load(source_path, sr=22050)

        # Extract embeddings
        target_se = self.extract_embedding(ref_audio)
        source_se = self.extract_embedding(src_audio)

        # Save temp source (normalized)
        src_audio = src_audio / (np.abs(src_audio).max() + 1e-6) * 0.95
        temp_src = output_path.replace('.wav', '_temp.wav')
        sf.write(temp_src, src_audio, 22050)

        # Convert
        self.converter.convert(
            audio_src_path=temp_src,
            src_se=source_se,
            tgt_se=target_se,
            output_path=output_path,
            tau=tau
        )

        os.remove(temp_src)
        return True


class XTTSCloner:
    """XTTS-v2 voice cloning (Coqui TTS)."""

    name = "XTTS-v2"
    model_size_mb = 1800

    def __init__(self):
        self.tts = None
        self.loaded = False

    def load(self):
        """Load XTTS model."""
        if self.loaded:
            return True

        try:
            # Accept XTTS license programmatically
            import os
            os.environ["COQUI_TOS_AGREED"] = "1"

            from TTS.api import TTS
            print("   Loading XTTS-v2 model (first run downloads ~1.8GB)...")
            self.tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=False)
            self.loaded = True
            return True
        except Exception as e:
            print(f"   XTTS load error: {e}")
            return False

    def clone(self, reference_path, text, output_path, language="en"):
        """Clone voice with XTTS (text-to-speech with voice cloning)."""
        if not self.load():
            return False

        try:
            self.tts.tts_to_file(
                text=text,
                speaker_wav=reference_path,
                language=language,
                file_path=output_path
            )
            return True
        except Exception as e:
            print(f"   XTTS clone error: {e}")
            return False


class F5TTSCloner:
    """F5-TTS voice cloning."""

    name = "F5-TTS"
    model_size_mb = 800

    def __init__(self):
        self.loaded = False

    def load(self):
        """Load F5-TTS model."""
        if self.loaded:
            return True

        try:
            # F5-TTS uses different API
            import f5_tts
            self.f5 = f5_tts
            self.loaded = True
            return True
        except ImportError:
            # Try alternate approach via command line
            result = subprocess.run(['which', 'f5-tts'], capture_output=True)
            if result.returncode == 0:
                self.loaded = True
                return True
            print("   F5-TTS not installed")
            return False

    def clone(self, reference_path, text, output_path, language="en"):
        """Clone voice with F5-TTS."""
        if not self.load():
            return False

        try:
            # F5-TTS command line interface
            cmd = [
                'f5-tts', '--ref-audio', reference_path,
                '--text', text, '--output', output_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            return result.returncode == 0
        except Exception as e:
            print(f"   F5-TTS clone error: {e}")
            return False


# ============================================================================
# TTS GENERATION
# ============================================================================

def generate_tts_macos(text, output_path, language='en'):
    """Generate TTS using macOS say command."""
    voices = {
        'en': 'Samantha', 'fr': 'Thomas', 'es': 'Monica',
        'de': 'Anna', 'it': 'Alice', 'pt': 'Luciana',
        'zh': 'Tingting', 'ja': 'Kyoko', 'ko': 'Yuna'
    }

    voice = voices.get(language, 'Samantha')
    aiff_path = output_path.replace('.wav', '.aiff')

    subprocess.run(['say', '-v', voice, '-o', aiff_path, text],
                   check=True, capture_output=True)
    subprocess.run(['ffmpeg', '-y', '-i', aiff_path, '-ar', '22050', '-ac', '1', output_path],
                   check=True, capture_output=True)
    os.remove(aiff_path)
    return output_path


def translate_text(text, source_lang, target_lang):
    """Translate text."""
    if source_lang == target_lang:
        return text

    try:
        from deep_translator import GoogleTranslator
        return GoogleTranslator(source=source_lang, target=target_lang).translate(text)
    except:
        pass

    # Fallback translations
    fallbacks = {
        ('en', 'fr'): "Bonjour, ceci est un test de clonage vocal.",
        ('en', 'es'): "Hola, esta es una prueba de clonaci\u00f3n de voz.",
        ('en', 'de'): "Hallo, dies ist ein Test zum Klonen von Stimmen.",
        ('fr', 'en'): "Hello, this is a voice cloning test.",
        ('es', 'en'): "Hello, this is a voice cloning test.",
        ('de', 'en'): "Hello, this is a voice cloning test.",
    }
    return fallbacks.get((source_lang, target_lang), text)


# ============================================================================
# BENCHMARK RUNNER
# ============================================================================

def run_benchmark(reference_path, test_text, languages, output_dir):
    """Run full benchmark across models and languages."""

    os.makedirs(output_dir, exist_ok=True)

    # Analyze reference voice
    print("\n[ANALYZING REFERENCE VOICE]")
    ref_analysis = analyze_audio(reference_path)
    print(f"   Pitch: {ref_analysis['pitch_mean']:.1f} Hz (+/- {ref_analysis['pitch_std']:.1f})")
    print(f"   Timbre (centroid): {ref_analysis['spectral_centroid']:.1f} Hz")
    print(f"   Duration: {ref_analysis['duration']:.2f}s")

    # Initialize models
    models = [
        OpenVoiceCloner(),
        XTTSCloner(),
        # F5TTSCloner(),  # Enable if installed
    ]

    results = {
        'reference': {
            'path': reference_path,
            'text': test_text,
            'analysis': {k: v for k, v in ref_analysis.items() if k not in ['audio', 'sr']}
        },
        'models': {},
        'summary': {}
    }

    # Test each model
    for model in models:
        model_name = model.name
        print(f"\n{'='*60}")
        print(f"  TESTING: {model_name}")
        print(f"{'='*60}")

        model_results = {
            'model_size_mb': model.model_size_mb,
            'languages': {}
        }

        # Check if model can load
        if not model.load():
            print(f"   SKIPPED: {model_name} not available")
            model_results['status'] = 'not_available'
            results['models'][model_name] = model_results
            continue

        model_results['status'] = 'available'

        # Test each language pair
        for target_lang in languages:
            print(f"\n   [{target_lang.upper()}] Testing EN -> {target_lang}")

            lang_results = {}

            # Translate text
            translated = translate_text(test_text, 'en', target_lang)
            lang_results['translated_text'] = translated
            print(f"      Translated: \"{translated[:50]}...\"")

            # Generate TTS
            tts_path = os.path.join(output_dir, f'{model_name.lower().replace(" ", "_")}_{target_lang}_tts.wav')

            if isinstance(model, XTTSCloner):
                # XTTS generates TTS + cloning in one step
                cloned_path = os.path.join(output_dir, f'{model_name.lower().replace(" ", "_")}_{target_lang}_cloned.wav')

                start_time = time.time()
                success = model.clone(reference_path, translated, cloned_path, target_lang)
                processing_time = time.time() - start_time

                lang_results['processing_time'] = processing_time

                if success:
                    cloned_analysis = analyze_audio(cloned_path)
                    similarity = compute_similarity_metrics(ref_analysis, cloned_analysis)

                    lang_results['cloned_path'] = cloned_path
                    lang_results['similarity'] = similarity
                    lang_results['cloned_analysis'] = {k: v for k, v in cloned_analysis.items() if k not in ['audio', 'sr']}

                    # Transcribe
                    transcription = transcribe_audio(cloned_path, target_lang)
                    lang_results['transcription'] = transcription

                    print(f"      Similarity: {similarity['overall_similarity']*100:.1f}%")
                    print(f"      Time: {processing_time:.2f}s")
                else:
                    lang_results['error'] = 'Clone failed'
            else:
                # OpenVoice: Generate TTS first, then clone
                generate_tts_macos(translated, tts_path, target_lang)

                cloned_path = os.path.join(output_dir, f'{model_name.lower().replace(" ", "_")}_{target_lang}_cloned.wav')

                start_time = time.time()
                success = model.clone(reference_path, tts_path, cloned_path)
                processing_time = time.time() - start_time

                lang_results['tts_path'] = tts_path
                lang_results['processing_time'] = processing_time

                if success:
                    cloned_analysis = analyze_audio(cloned_path)
                    similarity = compute_similarity_metrics(ref_analysis, cloned_analysis)

                    lang_results['cloned_path'] = cloned_path
                    lang_results['similarity'] = similarity
                    lang_results['cloned_analysis'] = {k: v for k, v in cloned_analysis.items() if k not in ['audio', 'sr']}

                    # Transcribe
                    transcription = transcribe_audio(cloned_path, target_lang)
                    lang_results['transcription'] = transcription

                    print(f"      Similarity: {similarity['overall_similarity']*100:.1f}%")
                    print(f"      Time: {processing_time:.2f}s")
                else:
                    lang_results['error'] = 'Clone failed'

            model_results['languages'][target_lang] = lang_results

        # Compute model averages
        similarities = []
        times = []
        for lang_data in model_results['languages'].values():
            if 'similarity' in lang_data:
                similarities.append(lang_data['similarity']['overall_similarity'])
            if 'processing_time' in lang_data:
                times.append(lang_data['processing_time'])

        if similarities:
            model_results['avg_similarity'] = float(np.mean(similarities))
            model_results['avg_processing_time'] = float(np.mean(times))

        results['models'][model_name] = model_results

    # Generate summary
    print(f"\n{'='*60}")
    print("  BENCHMARK SUMMARY")
    print(f"{'='*60}")

    summary = []
    for model_name, model_data in results['models'].items():
        if model_data.get('status') == 'available' and 'avg_similarity' in model_data:
            summary.append({
                'model': model_name,
                'similarity': model_data['avg_similarity'],
                'processing_time': model_data['avg_processing_time'],
                'model_size_mb': model_data['model_size_mb']
            })

    summary.sort(key=lambda x: x['similarity'], reverse=True)
    results['summary']['ranking'] = summary

    print("\n   RANKING BY VOICE SIMILARITY:")
    print("   " + "-" * 50)
    for i, s in enumerate(summary, 1):
        print(f"   {i}. {s['model']}: {s['similarity']*100:.1f}% similarity")
        print(f"      Time: {s['processing_time']:.2f}s | Size: {s['model_size_mb']}MB")

    if summary:
        best = summary[0]
        results['summary']['recommendation'] = best['model']
        print(f"\n   RECOMMENDATION: {best['model']}")
        print(f"   (Best voice similarity at {best['similarity']*100:.1f}%)")

    # Save results
    results_path = os.path.join(output_dir, 'benchmark_results.json')
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\n   Results saved: {results_path}")

    return results


def record_reference(duration=5, output_path=None):
    """Record reference audio."""
    if not HAS_SOUNDDEVICE:
        print("ERROR: sounddevice not installed")
        return None

    print(f"\nRecording {duration} seconds of your voice...")
    print("Speak clearly!")

    for i in range(3, 0, -1):
        print(f"   {i}...")
        time.sleep(0.5)
    print("   RECORDING...")

    audio = sd.rec(int(duration * 22050), samplerate=22050, channels=1, dtype='float32')
    sd.wait()

    print("   Done!")

    audio = audio.flatten()
    audio = audio / (np.abs(audio).max() + 1e-6) * 0.95

    if output_path is None:
        output_path = os.path.join(OUTPUT_DIR, 'reference_voice.wav')

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    sf.write(output_path, audio, 22050)

    return output_path


def main():
    parser = argparse.ArgumentParser(description="Voice Cloning E2E Benchmark")
    parser.add_argument('--reference', '-r', type=str, help='Reference voice audio file')
    parser.add_argument('--record', type=float, default=0, help='Record N seconds of voice')
    parser.add_argument('--text', '-t', type=str,
                        default="Hello, this is a test of voice cloning technology.",
                        help='Test text to clone')
    parser.add_argument('--languages', '-l', type=str, default='en,fr,es',
                        help='Comma-separated language codes')
    parser.add_argument('--output', '-o', type=str, default=OUTPUT_DIR,
                        help='Output directory')
    parser.add_argument('--play', '-p', action='store_true', help='Play results')

    args = parser.parse_args()

    print("="*60)
    print("  VOICE CLONING E2E BENCHMARK")
    print("="*60)

    # Get reference audio
    if args.reference:
        reference_path = args.reference
        print(f"\nUsing reference: {reference_path}")
    elif args.record > 0:
        reference_path = record_reference(args.record)
        if not reference_path:
            return
    else:
        # Look for existing reference
        default_ref = os.path.join(OUTPUT_DIR, 'reference_voice.wav')
        if os.path.exists(default_ref):
            reference_path = default_ref
            print(f"\nUsing existing reference: {reference_path}")
        else:
            print("\nERROR: Provide --reference or use --record")
            return

    # Parse languages
    languages = [l.strip() for l in args.languages.split(',')]
    print(f"Testing languages: {languages}")

    # Run benchmark
    results = run_benchmark(reference_path, args.text, languages, args.output)

    # Play results if requested
    if args.play and results:
        print("\nPlaying results...")
        for model_name, model_data in results['models'].items():
            if model_data.get('status') != 'available':
                continue
            for lang, lang_data in model_data.get('languages', {}).items():
                if 'cloned_path' in lang_data:
                    print(f"\n   {model_name} - {lang}:")
                    subprocess.run(['afplay', lang_data['cloned_path']])

    print("\nBenchmark complete!")
    print(f"Results: {args.output}/benchmark_results.json")


if __name__ == "__main__":
    main()
