#!/usr/bin/env python3
"""
Test OpenVoice V2 Python model directly to verify it produces speech.
This helps isolate whether the issue is in CoreML conversion or the model itself.
"""

import torch
import numpy as np
import os
import sys
import json
import soundfile as sf

OPENVOICE_PATH = os.path.expanduser("~/OpenVoice")
sys.path.insert(0, OPENVOICE_PATH)

from openvoice.api import ToneColorConverter
from openvoice import se_extractor

def main():
    print("=" * 60)
    print("Testing OpenVoice V2 Python Model")
    print("=" * 60)

    # Paths
    ckpt_converter = os.path.join(OPENVOICE_PATH, "checkpoints_v2/converter")

    # Check if checkpoints exist
    if not os.path.exists(ckpt_converter):
        print(f"❌ Converter checkpoint not found: {ckpt_converter}")
        print("Please download from: https://huggingface.co/myshell-ai/OpenVoiceV2")
        return

    print(f"\n✅ Found converter checkpoint: {ckpt_converter}")

    # Initialize converter
    print("\n📦 Loading ToneColorConverter...")
    device = "cpu"  # Use CPU for testing
    converter = ToneColorConverter(os.path.join(ckpt_converter, "config.json"), device=device)
    converter.load_ckpt(os.path.join(ckpt_converter, "checkpoint.pth"))
    print("✅ Converter loaded")

    # Check model config
    print(f"\n📊 Model config:")
    print(f"   - zero_g: {converter.hps.model.zero_g}")
    print(f"   - hidden_channels: {converter.hps.model.hidden_channels}")
    print(f"   - inter_channels: {converter.hps.model.inter_channels}")
    print(f"   - sampling_rate: {converter.hps.data.sampling_rate}")
    print(f"   - hop_length: {converter.hps.data.hop_length}")

    # Create a simple test: use a reference audio file if available
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Try real speech first, fallback to synthetic
    real_speech_path = os.path.join(script_dir, "real_speech.wav")
    test_audio_path = os.path.join(script_dir, "test_input.wav")

    if os.path.exists(real_speech_path):
        test_audio_path = real_speech_path
        print(f"\n🎤 Using real speech: {test_audio_path}")
    elif not os.path.exists(test_audio_path):
        print(f"\n🔊 Generating synthetic test audio...")
        sr = 22050
        duration = 2.0
        t = np.linspace(0, duration, int(sr * duration))
        # Generate a simple speech-like signal (not actual speech, but for testing)
        freq = 200  # Fundamental frequency
        audio = 0.3 * np.sin(2 * np.pi * freq * t)
        audio += 0.1 * np.sin(2 * np.pi * freq * 2 * t)  # Harmonic
        audio += 0.05 * np.sin(2 * np.pi * freq * 3 * t)  # Harmonic
        # Add some noise
        audio += 0.02 * np.random.randn(len(audio))
        sf.write(test_audio_path, audio.astype(np.float32), sr)
        print(f"   Saved to: {test_audio_path}")

    # Extract speaker embedding
    print(f"\n🎤 Extracting speaker embedding...")
    try:
        source_se = se_extractor.get_se(test_audio_path, converter, vad=False)
        print(f"   Source embedding shape: {source_se.shape}")
        print(f"   Source embedding stats: min={source_se.min():.3f}, max={source_se.max():.3f}, norm={torch.norm(source_se):.3f}")
    except Exception as e:
        print(f"   ⚠️ se_extractor.get_se failed: {e}")
        print("   Using random embedding for testing...")
        source_se = torch.randn(1, 256, 1)

    # Create a target embedding (slightly different)
    target_se = source_se + 0.1 * torch.randn_like(source_se)
    target_se = target_se / torch.norm(target_se) * torch.norm(source_se)  # Normalize

    print(f"   Target embedding stats: min={target_se.min():.3f}, max={target_se.max():.3f}, norm={torch.norm(target_se):.3f}")

    # Test voice conversion
    print(f"\n🔄 Running voice conversion...")
    output_path = os.path.join(script_dir, "test_output.wav")

    try:
        converter.convert(
            audio_src_path=test_audio_path,
            src_se=source_se,
            tgt_se=target_se,
            output_path=output_path,
            tau=0.3,  # Default tau
        )
        print(f"   ✅ Conversion complete!")
        print(f"   Output saved to: {output_path}")

        # Analyze output
        output_audio, sr = sf.read(output_path)
        print(f"\n📊 Output analysis:")
        print(f"   - Duration: {len(output_audio)/sr:.2f}s")
        print(f"   - Sample rate: {sr}Hz")
        print(f"   - Min: {output_audio.min():.4f}")
        print(f"   - Max: {output_audio.max():.4f}")
        print(f"   - RMS: {np.sqrt(np.mean(output_audio**2)):.4f}")

        # Zero crossings
        zero_crossings = np.sum(np.abs(np.diff(np.sign(output_audio))) > 0)
        zc_rate = zero_crossings / (len(output_audio) / sr)
        print(f"   - Zero crossings: {zero_crossings} ({zc_rate:.1f}/s)")

    except Exception as e:
        print(f"   ❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 60)
    print("Test complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Listen to test_output.wav - does it sound like transformed audio?")
    print("2. If yes, the Python model works and the issue is in CoreML conversion")
    print("3. If no, there may be an issue with the model weights or configuration")


if __name__ == "__main__":
    main()
