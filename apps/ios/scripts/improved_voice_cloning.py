#!/usr/bin/env python3
"""
Improved Voice Cloning with Proper Speaker Embedding Extraction
===============================================================
Fixes the CTranslate2/CUDA issue by computing embeddings directly from audio.
"""

import torch
import torch.nn.functional as F
import numpy as np
import os
import sys
import argparse
import subprocess
import librosa
import soundfile as sf
import sounddevice as sd
import time

OPENVOICE_PATH = os.path.expanduser("~/OpenVoice")
sys.path.insert(0, OPENVOICE_PATH)

from openvoice.api import ToneColorConverter


def print_step(step, text):
    print("\n[Step {}] {}".format(step, text))
    print("-" * 50)


def record_audio(duration, sample_rate=22050):
    """Record audio from microphone."""
    print("Recording for {} seconds...".format(duration))
    print("   Speak clearly!")

    for i in range(3, 0, -1):
        print("   {}...".format(i))
        time.sleep(0.5)
    print("   RECORDING...")

    audio = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype='float32')
    sd.wait()

    print("   Done!")
    return audio.flatten()


def preprocess_audio(audio, sr=22050):
    """Preprocess audio for better embedding extraction."""
    from scipy import signal

    # Normalize
    audio = audio / (np.abs(audio).max() + 1e-6)

    # Remove silence at start/end
    non_silent = np.where(np.abs(audio) > 0.01)[0]
    if len(non_silent) > 0:
        audio = audio[non_silent[0]:non_silent[-1]+1]

    # High-pass filter to remove low-frequency noise
    b, a = signal.butter(4, 80 / (sr / 2), btype='high')
    audio = signal.filtfilt(b, a, audio)

    # Normalize again
    audio = audio / (np.abs(audio).max() + 1e-6) * 0.95

    return audio


def extract_speaker_embedding_direct(audio, converter, sr=22050):
    """
    Extract speaker embedding directly using the converter's internal encoder.
    This bypasses the CTranslate2/Whisper VAD requirement.
    """
    # Compute spectrogram (matching OpenVoice format)
    stft = librosa.stft(audio, n_fft=1024, hop_length=256, win_length=1024, center=True)
    spec = np.abs(stft)

    # Convert to tensor [1, channels, frames]
    spec_tensor = torch.FloatTensor(spec).unsqueeze(0)

    # Use the model's posterior encoder to get embedding
    model = converter.model

    with torch.no_grad():
        # Get the length tensor
        spec_len = torch.LongTensor([spec_tensor.shape[2]])

        # Create zero conditioning (as per OpenVoice's zero_g=True)
        g = torch.zeros(1, 256, 1)

        # Run through posterior encoder
        z, m, logs, y_mask = model.enc_q(spec_tensor, spec_len, g=g, tau=0.0)

        # The speaker embedding is derived from the mean of the latent
        embedding = m.mean(dim=2, keepdim=True)  # [1, channels, 1]

        # Project to 256 dimensions if needed
        if embedding.shape[1] != 256:
            embedding = F.adaptive_avg_pool1d(embedding.transpose(1, 2), 256).transpose(1, 2)

        # Normalize to typical range
        embedding = embedding / (torch.norm(embedding) + 1e-6) * 16.0

    return embedding


def extract_speaker_embedding_averaged(audio, converter, sr=22050, segment_length=2.0, overlap=0.5):
    """
    Extract speaker embedding by averaging over multiple segments.
    This gives a more robust embedding for longer recordings.
    """
    segment_samples = int(segment_length * sr)
    hop_samples = int(segment_samples * (1 - overlap))

    embeddings = []

    for start in range(0, len(audio) - segment_samples + 1, hop_samples):
        segment = audio[start:start + segment_samples]
        emb = extract_speaker_embedding_direct(segment, converter, sr)
        embeddings.append(emb)

    if not embeddings:
        return extract_speaker_embedding_direct(audio, converter, sr)

    # Average embeddings
    stacked = torch.stack(embeddings, dim=0)
    averaged = stacked.mean(dim=0)

    # Normalize
    averaged = averaged / (torch.norm(averaged) + 1e-6) * 16.0

    print("   Averaged {} segments for robust embedding".format(len(embeddings)))

    return averaged


def generate_tts(text, output_path, language='en', voice=None):
    """Generate TTS audio."""
    print("Generating TTS...")

    voices = {
        'en': 'Samantha', 'fr': 'Thomas', 'es': 'Monica',
        'de': 'Anna', 'it': 'Alice', 'pt': 'Luciana'
    }

    if voice is None:
        voice = voices.get(language, 'Samantha')

    aiff_path = output_path.replace('.wav', '.aiff')
    subprocess.run(['say', '-v', voice, '-o', aiff_path, text], check=True, capture_output=True)
    subprocess.run(['ffmpeg', '-y', '-i', aiff_path, '-ar', '22050', '-ac', '1', output_path],
                   check=True, capture_output=True)
    os.remove(aiff_path)

    print("   Saved: {}".format(output_path))


def clone_voice_improved(reference_audio, source_audio_path, output_path, tau=0.3, use_averaged_embedding=True):
    """
    Improved voice cloning with proper embedding extraction.

    Args:
        reference_audio: Your voice audio samples (numpy array)
        source_audio_path: Path to TTS audio to convert
        output_path: Where to save the cloned audio
        tau: Temperature (0.0 = exact clone, 1.0 = more variation)
        use_averaged_embedding: Use averaged embedding for robustness
    """
    print("Voice Cloning (Improved)...")

    # Load converter
    ckpt_dir = os.path.join(OPENVOICE_PATH, "checkpoints_v2/converter")
    converter = ToneColorConverter(os.path.join(ckpt_dir, "config.json"), device="cpu")
    converter.load_ckpt(os.path.join(ckpt_dir, "checkpoint.pth"))

    # Preprocess reference audio
    print("   Preprocessing reference audio...")
    ref_audio = preprocess_audio(reference_audio)

    # Extract YOUR voice embedding (target)
    print("   Extracting YOUR voice embedding...")
    if use_averaged_embedding and len(ref_audio) > 44100:  # > 2 seconds
        target_se = extract_speaker_embedding_averaged(ref_audio, converter)
    else:
        target_se = extract_speaker_embedding_direct(ref_audio, converter)

    print("   Target embedding: shape={}, norm={:.2f}".format(target_se.shape, torch.norm(target_se)))

    # Load and process source audio (TTS)
    source_audio, sr = librosa.load(source_audio_path, sr=22050)
    source_audio = preprocess_audio(source_audio)

    # Extract source embedding
    print("   Extracting source (TTS) embedding...")
    source_se = extract_speaker_embedding_direct(source_audio, converter)
    print("   Source embedding: shape={}, norm={:.2f}".format(source_se.shape, torch.norm(source_se)))

    # Show embedding similarity
    cos_sim = F.cosine_similarity(
        target_se.flatten().unsqueeze(0),
        source_se.flatten().unsqueeze(0)
    ).item()
    print("   Embedding similarity (before conversion): {:.3f}".format(cos_sim))

    # Run voice conversion
    print("   Running conversion (tau={})...".format(tau))

    # Save preprocessed source temporarily
    temp_source = output_path.replace('.wav', '_temp_source.wav')
    sf.write(temp_source, source_audio, 22050)

    converter.convert(
        audio_src_path=temp_source,
        src_se=source_se,
        tgt_se=target_se,
        output_path=output_path,
        tau=tau
    )

    os.remove(temp_source)

    # Analyze output
    output_audio, _ = sf.read(output_path)

    stats = {
        'duration': len(output_audio) / 22050,
        'rms': float(np.sqrt(np.mean(output_audio**2))),
        'embedding_similarity': cos_sim,
        'tau': tau
    }

    print("   Cloned: {}".format(output_path))
    print("   Duration: {:.2f}s, RMS: {:.4f}".format(stats['duration'], stats['rms']))

    return stats


def transcribe(audio_path, language=None):
    """Transcribe audio with Whisper."""
    import whisper
    import warnings
    warnings.filterwarnings('ignore')

    model = whisper.load_model('base')
    opts = {'language': language} if language else {}
    result = model.transcribe(audio_path, **opts)
    return result['text'].strip()


def translate_text(text, source, target):
    """Translate text."""
    try:
        from deep_translator import GoogleTranslator
        return GoogleTranslator(source=source, target=target).translate(text)
    except Exception:
        return text


def main():
    parser = argparse.ArgumentParser(description="Improved Voice Cloning Pipeline")
    parser.add_argument('--record', '-r', type=float, default=0, help='Record N seconds')
    parser.add_argument('--input', '-i', type=str, help='Input audio file')
    parser.add_argument('--text', '-t', type=str, help='Text to speak (skip transcription)')
    parser.add_argument('--target-lang', '-l', type=str, default='fr', help='Target language')
    parser.add_argument('--tau', type=float, default=0.2, help='Clone strength (0.0-1.0, lower=stronger)')
    parser.add_argument('--play', '-p', action='store_true', help='Play results')
    parser.add_argument('--compare', '-c', action='store_true', help='Compare different tau values')

    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, 'improved_output')
    os.makedirs(output_dir, exist_ok=True)

    print("=" * 60)
    print("  IMPROVED VOICE CLONING")
    print("=" * 60)

    # Step 1: Get reference audio (your voice)
    print_step(1, "GET YOUR VOICE")

    if args.input:
        ref_audio, sr = librosa.load(args.input, sr=22050)
        print("   Loaded: {} ({:.2f}s)".format(args.input, len(ref_audio)/sr))
    elif args.record > 0:
        ref_audio = record_audio(args.record)
    else:
        print("   ERROR: Provide --input or --record")
        return

    # Save reference
    ref_path = os.path.join(output_dir, '1_your_voice.wav')
    sf.write(ref_path, ref_audio, 22050)

    if args.play:
        print("   Playing your voice...")
        subprocess.run(['afplay', ref_path])

    # Step 2: Get text to translate
    print_step(2, "GET TEXT")

    if args.text:
        original_text = args.text
        source_lang = 'en'
    else:
        print("   Transcribing your speech...")
        original_text = transcribe(ref_path)
        source_lang = 'en'

    print("   Original: \"{}\"".format(original_text))

    # Step 3: Translate
    print_step(3, "TRANSLATE TO {}".format(args.target_lang.upper()))

    translated_text = translate_text(original_text, source_lang, args.target_lang)
    print("   Translated: \"{}\"".format(translated_text))

    # Step 4: Generate TTS
    print_step(4, "GENERATE TTS")

    tts_path = os.path.join(output_dir, '2_tts_{}.wav'.format(args.target_lang))
    generate_tts(translated_text, tts_path, args.target_lang)

    if args.play:
        print("   Playing TTS (before cloning)...")
        subprocess.run(['afplay', tts_path])

    # Step 5: Clone voice
    print_step(5, "CLONE YOUR VOICE")

    if args.compare:
        # Compare different tau values
        print("   Comparing tau values...")
        tau_values = [0.0, 0.1, 0.2, 0.3, 0.5]

        for tau in tau_values:
            out_path = os.path.join(output_dir, '3_cloned_tau{:.1f}.wav'.format(tau))
            stats = clone_voice_improved(ref_audio, tts_path, out_path, tau=tau)

            if args.play:
                print("\n   Playing tau={}...".format(tau))
                subprocess.run(['afplay', out_path])

        out_path = os.path.join(output_dir, '3_cloned_tau0.2.wav')
    else:
        out_path = os.path.join(output_dir, '3_cloned_{}.wav'.format(args.target_lang))
        stats = clone_voice_improved(ref_audio, tts_path, out_path, tau=args.tau)

        if args.play:
            print("\n   Playing cloned result...")
            subprocess.run(['afplay', out_path])

    # Step 6: Verify
    print_step(6, "VERIFY OUTPUT")

    if os.path.exists(out_path):
        transcription = transcribe(out_path, args.target_lang)
        print("   Final transcription: \"{}\"".format(transcription))

    print("\n" + "=" * 60)
    print("  COMPLETE!")
    print("=" * 60)
    print("\nOutput: {}".format(output_dir))
    print("Play: afplay {}".format(out_path))


if __name__ == "__main__":
    main()
