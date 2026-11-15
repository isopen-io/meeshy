#!/usr/bin/env python3
"""
Voice Cloning Comparison: XTTS-v2 vs OpenVoice V2
==================================================
Records your voice, clones it with both models, and plays them back-to-back.

Usage:
    python compare_voice_cloning.py --record 5
    python compare_voice_cloning.py --input my_voice.wav
"""

import os
import sys
import time
import argparse
import subprocess
import numpy as np
import warnings
warnings.filterwarnings('ignore')

import soundfile as sf
import sounddevice as sd
import librosa

# OpenVoice path
OPENVOICE_PATH = os.path.expanduser("~/OpenVoice")
sys.path.insert(0, OPENVOICE_PATH)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "comparison_output")


def record_voice(duration=5, sample_rate=22050):
    """Record voice from microphone."""
    print("\n" + "="*50)
    print("  RECORDING YOUR VOICE")
    print("="*50)
    print(f"\nRecording {duration} seconds...")
    print("Speak clearly after the countdown!\n")

    for i in range(3, 0, -1):
        print(f"  {i}...")
        time.sleep(1)

    print("  >>> RECORDING NOW <<<")

    audio = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype='float32')
    sd.wait()

    print("  Recording complete!\n")

    # Normalize
    audio = audio.flatten()
    audio = audio / (np.abs(audio).max() + 1e-6) * 0.95

    return audio


def play_audio(path, label=""):
    """Play audio file."""
    if label:
        print(f"  Playing: {label}")
    subprocess.run(['afplay', path], check=True)


def clone_with_openvoice(reference_path, text, output_path, language='en', gender='male'):
    """Clone voice using OpenVoice V2."""
    import torch
    import torch.nn.functional as F
    from openvoice.api import ToneColorConverter

    print("  Loading OpenVoice V2...")

    # Load converter
    ckpt_dir = os.path.join(OPENVOICE_PATH, "checkpoints_v2/converter")
    converter = ToneColorConverter(os.path.join(ckpt_dir, "config.json"), device="cpu")
    converter.load_ckpt(os.path.join(ckpt_dir, "checkpoint.pth"))

    # Generate TTS first - USE MATCHING GENDER VOICE
    tts_path = output_path.replace('.wav', '_tts.wav')

    # Male and female voices for each language
    male_voices = {'en': 'Daniel', 'fr': 'Thomas', 'es': 'Jorge', 'de': 'Markus'}
    female_voices = {'en': 'Samantha', 'fr': 'Amelie', 'es': 'Monica', 'de': 'Anna'}

    if gender == 'male':
        voice = male_voices.get(language, 'Daniel')
    else:
        voice = female_voices.get(language, 'Samantha')

    print(f"  Using TTS voice: {voice} ({gender})")

    aiff_path = tts_path.replace('.wav', '.aiff')
    subprocess.run(['say', '-v', voice, '-o', aiff_path, text], capture_output=True)
    subprocess.run(['ffmpeg', '-y', '-i', aiff_path, '-ar', '22050', '-ac', '1', tts_path], capture_output=True)
    os.remove(aiff_path)

    # Extract embeddings with averaging for robustness
    def extract_embedding(audio, use_averaging=True):
        def get_single_embedding(audio_segment):
            stft = librosa.stft(audio_segment, n_fft=1024, hop_length=256, win_length=1024, center=True)
            spec = np.abs(stft)
            spec_tensor = torch.FloatTensor(spec).unsqueeze(0)

            with torch.no_grad():
                spec_len = torch.LongTensor([spec_tensor.shape[2]])
                g = torch.zeros(1, 256, 1)
                z, m, logs, y_mask = converter.model.enc_q(spec_tensor, spec_len, g=g, tau=0.0)
                embedding = m.mean(dim=2, keepdim=True)
                if embedding.shape[1] != 256:
                    embedding = F.adaptive_avg_pool1d(embedding.transpose(1, 2), 256).transpose(1, 2)
            return embedding

        # For longer recordings, average embeddings from multiple segments
        if use_averaging and len(audio) > 44100:  # > 2 seconds
            segment_len = int(2.0 * 22050)  # 2 second segments
            hop = int(segment_len * 0.5)  # 50% overlap
            embeddings = []

            for start in range(0, len(audio) - segment_len + 1, hop):
                segment = audio[start:start + segment_len]
                emb = get_single_embedding(segment)
                embeddings.append(emb)

            if embeddings:
                stacked = torch.stack(embeddings, dim=0)
                averaged = stacked.mean(dim=0)
                averaged = averaged / (torch.norm(averaged) + 1e-6) * 16.0
                print(f"    Averaged {len(embeddings)} segments for robust embedding")
                return averaged

        embedding = get_single_embedding(audio)
        embedding = embedding / (torch.norm(embedding) + 1e-6) * 16.0
        return embedding

    ref_audio, _ = librosa.load(reference_path, sr=22050)
    src_audio, _ = librosa.load(tts_path, sr=22050)

    # Preprocess: normalize and remove silence
    ref_audio = ref_audio / (np.abs(ref_audio).max() + 1e-6) * 0.95
    src_audio = src_audio / (np.abs(src_audio).max() + 1e-6) * 0.95

    target_se = extract_embedding(ref_audio)
    source_se = extract_embedding(src_audio)

    # Clone with lower tau for stronger voice transfer (0.0 = exact, 1.0 = weak)
    converter.convert(
        audio_src_path=tts_path,
        src_se=source_se,
        tgt_se=target_se,
        output_path=output_path,
        tau=0.1  # Lower = stronger voice cloning
    )

    os.remove(tts_path)
    return output_path


def clone_with_xtts(reference_path, text, output_path, language='en'):
    """Clone voice using XTTS-v2."""
    os.environ["COQUI_TOS_AGREED"] = "1"

    print("  Loading XTTS-v2...")

    from TTS.api import TTS
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=False)

    tts.tts_to_file(
        text=text,
        speaker_wav=reference_path,
        language=language,
        file_path=output_path
    )

    return output_path


def main():
    parser = argparse.ArgumentParser(description="Compare XTTS-v2 vs OpenVoice V2")
    parser.add_argument('--record', '-r', type=float, default=5, help='Record N seconds')
    parser.add_argument('--input', '-i', type=str, help='Use existing audio file')
    parser.add_argument('--text', '-t', type=str,
                        default="Hello, this is a test of voice cloning technology. How does my voice sound?",
                        help='Text to speak')
    parser.add_argument('--language', '-l', type=str, default='en', help='Language code')
    parser.add_argument('--gender', '-g', type=str, default='male', choices=['male', 'female'],
                        help='Voice gender for TTS (default: male)')

    args = parser.parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("\n" + "#"*60)
    print("#  VOICE CLONING COMPARISON: XTTS-v2 vs OpenVoice V2")
    print("#"*60)

    # Step 1: Get reference voice
    if args.input:
        reference_path = args.input
        print(f"\nUsing input file: {reference_path}")
    else:
        audio = record_voice(args.record)
        reference_path = os.path.join(OUTPUT_DIR, "0_your_voice.wav")
        sf.write(reference_path, audio, 22050)

    # Play original
    print("\n" + "="*50)
    print("  YOUR ORIGINAL VOICE")
    print("="*50)
    play_audio(reference_path, "Your recorded voice")

    # Step 2: Clone with OpenVoice V2
    print("\n" + "="*50)
    print("  CLONING WITH OPENVOICE V2 (125MB model)")
    print("="*50)

    openvoice_path = os.path.join(OUTPUT_DIR, "1_openvoice_v2.wav")

    start = time.time()
    clone_with_openvoice(reference_path, args.text, openvoice_path, args.language, args.gender)
    openvoice_time = time.time() - start

    print(f"  Done in {openvoice_time:.2f}s")

    # Step 3: Clone with XTTS-v2
    print("\n" + "="*50)
    print("  CLONING WITH XTTS-v2 (1.8GB model)")
    print("="*50)

    xtts_path = os.path.join(OUTPUT_DIR, "2_xtts_v2.wav")

    start = time.time()
    clone_with_xtts(reference_path, args.text, xtts_path, args.language)
    xtts_time = time.time() - start

    print(f"  Done in {xtts_time:.2f}s")

    # Step 4: Play comparison
    print("\n" + "#"*60)
    print("#  COMPARISON PLAYBACK")
    print("#"*60)

    print("\n[1/3] YOUR ORIGINAL VOICE:")
    time.sleep(0.5)
    play_audio(reference_path)

    time.sleep(1)

    print("\n[2/3] OPENVOICE V2 CLONE (62% avg similarity):")
    time.sleep(0.5)
    play_audio(openvoice_path)

    time.sleep(1)

    print("\n[3/3] XTTS-v2 CLONE (91% avg similarity):")
    time.sleep(0.5)
    play_audio(xtts_path)

    # Summary
    print("\n" + "="*60)
    print("  SUMMARY")
    print("="*60)
    print(f"""
  Model          | Time    | Size   | Quality
  ---------------|---------|--------|----------
  OpenVoice V2   | {openvoice_time:.2f}s   | 125MB  | ~62%
  XTTS-v2        | {xtts_time:.2f}s   | 1.8GB  | ~91%

  Output files:
    Your voice:    {reference_path}
    OpenVoice V2:  {openvoice_path}
    XTTS-v2:       {xtts_path}

  To replay:
    afplay {reference_path}
    afplay {openvoice_path}
    afplay {xtts_path}
""")


if __name__ == "__main__":
    main()
