#!/usr/bin/env python3
"""
Full Voice Cloning Test - Python Version
=========================================
This script tests the complete voice cloning pipeline:
1. Load a reference voice (to clone)
2. Generate base speech using TTS
3. Convert the voice to match the reference

Usage:
    python test_voice_cloning_full.py --reference voice.wav --text "Hello world" --output cloned.wav
"""

import torch
import numpy as np
import os
import sys
import argparse
import soundfile as sf
import librosa

OPENVOICE_PATH = os.path.expanduser("~/OpenVoice")
sys.path.insert(0, OPENVOICE_PATH)

from openvoice.api import ToneColorConverter
from openvoice import se_extractor


def load_audio(path: str, sr: int = 22050) -> np.ndarray:
    """Load and resample audio to target sample rate."""
    audio, orig_sr = librosa.load(path, sr=sr)
    return audio


def compute_spectrogram(audio: np.ndarray, n_fft: int = 1024, hop_length: int = 256) -> np.ndarray:
    """
    Compute STFT magnitude spectrogram matching OpenVoice/librosa format.
    - center=True (default)
    - Returns magnitude (not log)
    """
    stft = librosa.stft(audio, n_fft=n_fft, hop_length=hop_length, win_length=n_fft, center=True, pad_mode='reflect')
    spec = np.abs(stft)
    return spec


def extract_speaker_embedding(audio_path: str, converter: ToneColorConverter) -> torch.Tensor:
    """Extract speaker embedding from reference audio."""
    try:
        # Try using OpenVoice's se_extractor
        se = se_extractor.get_se(audio_path, converter, vad=False)
        return se
    except Exception as e:
        print(f"Warning: se_extractor failed ({e}), using model directly")
        # Fallback: compute embedding manually
        audio = load_audio(audio_path)
        spec = compute_spectrogram(audio)

        # Use the converter's internal embedding extraction
        spec_tensor = torch.FloatTensor(spec).unsqueeze(0)
        with torch.no_grad():
            # This is a simplified extraction - OpenVoice uses a more complex method
            se = converter.extract_se(spec_tensor)
        return se


def clone_voice(
    reference_audio_path: str,
    source_audio_path: str,
    output_path: str,
    tau: float = 0.3
) -> dict:
    """
    Clone voice from reference audio to source audio.

    Args:
        reference_audio_path: Path to the voice to clone (target voice)
        source_audio_path: Path to the speech to convert (source content)
        output_path: Path to save the cloned audio
        tau: Temperature parameter (0.0 = more similar, 1.0 = more variation)

    Returns:
        Dictionary with stats and paths
    """
    print("=" * 60)
    print("Voice Cloning Pipeline")
    print("=" * 60)

    # Load converter
    ckpt_dir = os.path.join(OPENVOICE_PATH, "checkpoints_v2/converter")
    config_path = os.path.join(ckpt_dir, "config.json")

    print(f"\n1. Loading ToneColorConverter...")
    converter = ToneColorConverter(config_path, device="cpu")
    converter.load_ckpt(os.path.join(ckpt_dir, "checkpoint.pth"))
    print(f"   ✓ Converter loaded")

    # Extract source speaker embedding
    print(f"\n2. Extracting source embedding from: {source_audio_path}")
    try:
        source_se = se_extractor.get_se(source_audio_path, converter, vad=False)
        print(f"   ✓ Source embedding shape: {source_se.shape}")
    except Exception as e:
        print(f"   Warning: {e}")
        print(f"   Using random source embedding")
        source_se = torch.randn(1, 256, 1)

    # Extract target speaker embedding (voice to clone)
    print(f"\n3. Extracting target embedding from: {reference_audio_path}")
    try:
        target_se = se_extractor.get_se(reference_audio_path, converter, vad=False)
        print(f"   ✓ Target embedding shape: {target_se.shape}")
    except Exception as e:
        print(f"   Warning: {e}")
        print(f"   Using random target embedding")
        target_se = torch.randn(1, 256, 1)

    # Show embedding stats
    print(f"\n   Embedding Stats:")
    print(f"   Source: min={source_se.min():.3f}, max={source_se.max():.3f}, norm={torch.norm(source_se):.3f}")
    print(f"   Target: min={target_se.min():.3f}, max={target_se.max():.3f}, norm={torch.norm(target_se):.3f}")

    # Run voice conversion
    print(f"\n4. Running voice conversion (tau={tau})...")
    converter.convert(
        audio_src_path=source_audio_path,
        src_se=source_se,
        tgt_se=target_se,
        output_path=output_path,
        tau=tau
    )
    print(f"   ✓ Conversion complete!")

    # Analyze output
    print(f"\n5. Analyzing output...")
    output_audio, sr = sf.read(output_path)

    stats = {
        "output_path": output_path,
        "duration": len(output_audio) / sr,
        "sample_rate": sr,
        "min": float(output_audio.min()),
        "max": float(output_audio.max()),
        "rms": float(np.sqrt(np.mean(output_audio**2))),
        "zero_crossings": int(np.sum(np.abs(np.diff(np.sign(output_audio))) > 0))
    }

    print(f"   Duration: {stats['duration']:.2f}s")
    print(f"   Sample rate: {stats['sample_rate']}Hz")
    print(f"   Range: [{stats['min']:.4f}, {stats['max']:.4f}]")
    print(f"   RMS: {stats['rms']:.4f}")
    print(f"   Zero crossings: {stats['zero_crossings']} ({stats['zero_crossings']/stats['duration']:.1f}/s)")

    print(f"\n   ✓ Saved to: {output_path}")

    return stats


def generate_tts_audio(text: str, output_path: str, voice: str = "en-US") -> str:
    """Generate TTS audio using macOS say command or pyttsx3."""
    print(f"\n   Generating TTS for: '{text[:50]}...'")

    # Try macOS say command first
    import subprocess
    try:
        aiff_path = output_path.replace(".wav", ".aiff")
        subprocess.run(["say", "-o", aiff_path, text], check=True, capture_output=True)

        # Convert to WAV at 22050Hz
        subprocess.run([
            "ffmpeg", "-y", "-i", aiff_path,
            "-ar", "22050", "-ac", "1",
            output_path
        ], check=True, capture_output=True)

        os.remove(aiff_path)
        print(f"   ✓ TTS generated: {output_path}")
        return output_path
    except Exception as e:
        print(f"   macOS say failed: {e}")

    # Fallback to pyttsx3
    try:
        import pyttsx3
        engine = pyttsx3.init()
        engine.save_to_file(text, output_path)
        engine.runAndWait()
        print(f"   ✓ TTS generated (pyttsx3): {output_path}")
        return output_path
    except Exception as e:
        print(f"   pyttsx3 failed: {e}")
        raise RuntimeError("Could not generate TTS audio")


def run_whisper_transcription(audio_path: str) -> str:
    """Transcribe audio using Whisper."""
    try:
        import whisper
        import warnings
        warnings.filterwarnings('ignore')

        model = whisper.load_model('base')
        result = model.transcribe(audio_path)
        return result['text'].strip()
    except Exception as e:
        return f"[Transcription failed: {e}]"


def main():
    parser = argparse.ArgumentParser(description="Full Voice Cloning Test")
    parser.add_argument("--reference", "-r", type=str, help="Reference audio (voice to clone)")
    parser.add_argument("--source", "-s", type=str, help="Source audio (content to convert)")
    parser.add_argument("--text", "-t", type=str, default="Hello, this is a test of voice cloning technology.", help="Text to synthesize if no source audio")
    parser.add_argument("--output", "-o", type=str, default="cloned_output.wav", help="Output path")
    parser.add_argument("--tau", type=float, default=0.3, help="Temperature (0.0-1.0)")
    parser.add_argument("--transcribe", action="store_true", help="Transcribe output with Whisper")

    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Handle reference audio
    if args.reference:
        reference_path = args.reference
    else:
        # Create default reference using TTS with different voice
        reference_path = os.path.join(script_dir, "reference_voice.wav")
        if not os.path.exists(reference_path):
            print("\nNo reference audio provided. Generating sample reference...")
            generate_tts_audio("This is my voice that will be cloned.", reference_path)

    # Handle source audio
    if args.source:
        source_path = args.source
    else:
        # Generate TTS for the text
        source_path = os.path.join(script_dir, "source_tts.wav")
        print(f"\nGenerating TTS for text: '{args.text}'")
        generate_tts_audio(args.text, source_path)

    # Run voice cloning
    output_path = args.output
    if not os.path.isabs(output_path):
        output_path = os.path.join(script_dir, output_path)

    stats = clone_voice(
        reference_audio_path=reference_path,
        source_audio_path=source_path,
        output_path=output_path,
        tau=args.tau
    )

    # Optional transcription
    if args.transcribe:
        print(f"\n6. Transcribing output...")
        transcription = run_whisper_transcription(output_path)
        print(f"   Transcription: '{transcription}'")
        stats["transcription"] = transcription

    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)
    print(f"\nOutput saved to: {output_path}")
    print(f"To play: afplay {output_path}")

    return stats


if __name__ == "__main__":
    main()
