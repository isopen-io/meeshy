#!/usr/bin/env python3
"""
Convert OpenVoice V2 VoiceConverterPipeline to CoreML with FIXED shapes.

This fixes the "Data-dependent shapes were disabled" error on iOS by using
fixed-size inputs instead of dynamic shapes.

Fixed shape: [1, 513, 512] for spectrogram (512 frames = ~5.9 seconds at 22050Hz/256 hop)
"""

import torch
import torch.nn as nn
import coremltools as ct
import numpy as np
import os
import sys

# Add OpenVoice to path
OPENVOICE_PATH = os.path.expanduser("~/OpenVoice")
sys.path.insert(0, OPENVOICE_PATH)

from openvoice.api import ToneColorConverter
from openvoice import se_extractor

# Configuration
FIXED_FRAMES = 512  # Fixed sequence length (~5.9 seconds)
SPEC_CHANNELS = 513  # FFT bins (1024/2 + 1)
EMBEDDING_DIM = 256
SAMPLE_RATE = 22050
HOP_LENGTH = 256

class VoiceConverterPipelineFixed(nn.Module):
    """
    Wrapper for OpenVoice V2 voice conversion with FIXED input shapes.

    This wraps the enc_q → flow → dec pipeline and uses fixed-size inputs
    to avoid CoreML dynamic shape issues.
    """

    def __init__(self, tone_color_converter):
        super().__init__()
        self.model = tone_color_converter.model

    def forward(self, spectrogram, spec_lengths, source_embedding, target_embedding):
        """
        Args:
            spectrogram: [1, 513, 512] - mel spectrogram (FIXED size)
            spec_lengths: [1] - actual length (for masking, but we use fixed)
            source_embedding: [1, 256] - source speaker embedding
            target_embedding: [1, 256] - target speaker embedding

        Returns:
            waveform: [1, 1, samples] - output audio
        """
        # Transpose to model's expected format: [B, C, T] -> already correct
        # spectrogram is [1, 513, 512]

        # Get speaker embedding difference for flow
        g_src = source_embedding.unsqueeze(-1)  # [1, 256, 1]
        g_tgt = target_embedding.unsqueeze(-1)  # [1, 256, 1]

        # Run posterior encoder (enc_q)
        # This extracts latent representation from spectrogram
        z, m_q, logs_q, y_mask = self.model.enc_q(spectrogram, spec_lengths, g=g_src)

        # Run flow to convert speaker characteristics
        # Flow transforms latent space from source to target speaker
        z_p = self.model.flow(z, y_mask, g=g_tgt)

        # Run HiFi-GAN decoder to generate waveform
        o = self.model.dec(z_p * y_mask, g=g_tgt)

        return o


def load_openvoice_model():
    """Load OpenVoice V2 ToneColorConverter with pretrained weights."""

    ckpt_path = os.path.join(OPENVOICE_PATH, "checkpoints_v2/converter")
    config_path = os.path.join(ckpt_path, "config.json")
    model_path = os.path.join(ckpt_path, "checkpoint.pth")

    if not os.path.exists(model_path):
        print(f"ERROR: Model not found at {model_path}")
        print("Please run: git clone https://github.com/myshell-ai/OpenVoice.git ~/OpenVoice")
        print("And download checkpoints_v2 from Hugging Face")
        sys.exit(1)

    print(f"Loading OpenVoice V2 from: {ckpt_path}")

    device = "cpu"  # Use CPU for conversion
    tone_color_converter = ToneColorConverter(config_path, device=device)
    tone_color_converter.load_ckpt(model_path)

    return tone_color_converter


def convert_to_coreml(model, output_path):
    """Convert PyTorch model to CoreML with FIXED shapes."""

    print(f"\nConverting to CoreML with FIXED shapes...")
    print(f"  Spectrogram: [1, {SPEC_CHANNELS}, {FIXED_FRAMES}]")
    print(f"  Embedding: [1, {EMBEDDING_DIM}]")

    model.eval()

    # Create example inputs with FIXED shapes
    example_spectrogram = torch.randn(1, SPEC_CHANNELS, FIXED_FRAMES)
    example_spec_lengths = torch.tensor([FIXED_FRAMES], dtype=torch.float32)
    example_source_emb = torch.randn(1, EMBEDDING_DIM)
    example_target_emb = torch.randn(1, EMBEDDING_DIM)

    # Trace the model
    print("Tracing model...")
    with torch.no_grad():
        traced_model = torch.jit.trace(
            model,
            (example_spectrogram, example_spec_lengths, example_source_emb, example_target_emb)
        )

    # Convert to CoreML with FIXED shapes (no dynamic dimensions!)
    print("Converting to CoreML...")
    mlmodel = ct.convert(
        traced_model,
        inputs=[
            ct.TensorType(
                name="spectrogram",
                shape=(1, SPEC_CHANNELS, FIXED_FRAMES),  # FIXED!
                dtype=np.float32
            ),
            ct.TensorType(
                name="spec_lengths",
                shape=(1,),
                dtype=np.float32
            ),
            ct.TensorType(
                name="source_embedding",
                shape=(1, EMBEDDING_DIM),
                dtype=np.float32
            ),
            ct.TensorType(
                name="target_embedding",
                shape=(1, EMBEDDING_DIM),
                dtype=np.float32
            ),
        ],
        outputs=[
            ct.TensorType(name="waveform", dtype=np.float32)
        ],
        minimum_deployment_target=ct.target.iOS16,
        convert_to="mlprogram",
        compute_precision=ct.precision.FLOAT16,
    )

    # Add metadata
    mlmodel.author = "OpenVoice V2 (Fixed Shapes)"
    mlmodel.short_description = f"Voice converter pipeline with fixed {FIXED_FRAMES} frame input (~5.9s max)"
    mlmodel.version = "2.0-fixed512"

    # Add user-defined metadata
    mlmodel.user_defined_metadata["fixed_frames"] = str(FIXED_FRAMES)
    mlmodel.user_defined_metadata["spec_channels"] = str(SPEC_CHANNELS)
    mlmodel.user_defined_metadata["embedding_dim"] = str(EMBEDDING_DIM)
    mlmodel.user_defined_metadata["sample_rate"] = str(SAMPLE_RATE)
    mlmodel.user_defined_metadata["hop_length"] = str(HOP_LENGTH)
    mlmodel.user_defined_metadata["max_duration_seconds"] = str(FIXED_FRAMES * HOP_LENGTH / SAMPLE_RATE)

    # Save
    print(f"Saving to: {output_path}")
    mlmodel.save(output_path)

    # Verify the model has fixed shapes
    print("\nVerifying model shapes...")
    spec = mlmodel.get_spec()
    for inp in spec.description.input:
        shape_str = str(inp.type.multiArrayType.shape)
        print(f"  Input '{inp.name}': {shape_str}")

    print(f"\n✅ Model saved successfully: {output_path}")
    print(f"   Max audio duration: {FIXED_FRAMES * HOP_LENGTH / SAMPLE_RATE:.2f} seconds")

    return mlmodel


def main():
    print("=" * 60)
    print("OpenVoice V2 → CoreML Converter (FIXED SHAPES)")
    print("=" * 60)

    # Output path
    output_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(output_dir, "Meeshy/Resources/MLModels/VoiceConverterPipeline.mlpackage")

    # Backup existing model if present
    if os.path.exists(output_path):
        backup_path = output_path.replace(".mlpackage", "_backup.mlpackage")
        print(f"Backing up existing model to: {backup_path}")
        import shutil
        if os.path.exists(backup_path):
            shutil.rmtree(backup_path)
        shutil.move(output_path, backup_path)

    # Load OpenVoice V2
    tone_color_converter = load_openvoice_model()

    # Create wrapper with fixed shapes
    print("\nCreating fixed-shape wrapper...")
    wrapper = VoiceConverterPipelineFixed(tone_color_converter)

    # Test the wrapper
    print("Testing wrapper with example inputs...")
    with torch.no_grad():
        test_spec = torch.randn(1, SPEC_CHANNELS, FIXED_FRAMES)
        test_lengths = torch.tensor([FIXED_FRAMES], dtype=torch.float32)
        test_src_emb = torch.randn(1, EMBEDDING_DIM)
        test_tgt_emb = torch.randn(1, EMBEDDING_DIM)

        output = wrapper(test_spec, test_lengths, test_src_emb, test_tgt_emb)
        print(f"  Output shape: {output.shape}")
        expected_samples = FIXED_FRAMES * HOP_LENGTH
        print(f"  Expected samples: ~{expected_samples}")

    # Convert to CoreML
    convert_to_coreml(wrapper, output_path)

    print("\n" + "=" * 60)
    print("DONE! Next steps:")
    print("1. Rebuild Xcode project")
    print("2. Run voice cloning test on device")
    print("3. STT verification should show >0% similarity")
    print("=" * 60)


if __name__ == "__main__":
    main()
