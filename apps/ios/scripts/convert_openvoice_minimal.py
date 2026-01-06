#!/usr/bin/env python3
"""
Minimal OpenVoice V2 to CoreML conversion with FIXED shapes.
No external dependencies beyond torch and coremltools.

This fixes the "Data-dependent shapes were disabled" error on iOS.
"""

import torch
import torch.nn as nn
import coremltools as ct
import numpy as np
import os
import sys
import json

# Configuration
FIXED_FRAMES = 512  # Fixed sequence length (~5.9 seconds at 22050Hz/256 hop)
SPEC_CHANNELS = 513  # FFT bins (1024/2 + 1)
EMBEDDING_DIM = 256
SAMPLE_RATE = 22050
HOP_LENGTH = 256

# Add OpenVoice to path for imports
OPENVOICE_PATH = os.path.expanduser("~/OpenVoice")
sys.path.insert(0, OPENVOICE_PATH)


class HParams:
    """Simple hyperparameters container."""
    def __init__(self, data_dict):
        for key, value in data_dict.items():
            if isinstance(value, dict):
                setattr(self, key, HParams(value))
            else:
                setattr(self, key, value)


def load_config(config_path):
    """Load config from JSON file."""
    with open(config_path, "r") as f:
        data = json.load(f)
    return HParams(data)


class VoiceConversionWrapper(nn.Module):
    """
    Wrapper for OpenVoice V2 voice conversion with FIXED input shapes.
    Wraps: enc_q -> flow(forward) -> flow(reverse) -> dec
    """

    def __init__(self, model, zero_g=False):
        super().__init__()
        self.enc_q = model.enc_q
        self.flow = model.flow
        self.dec = model.dec
        self.zero_g = zero_g

    def forward(self, spectrogram, spec_lengths, source_embedding, target_embedding):
        """
        Args:
            spectrogram: [1, 513, 512] - mel spectrogram (FIXED size)
            spec_lengths: [1] - sequence length
            source_embedding: [1, 256, 1] - source speaker embedding
            target_embedding: [1, 256, 1] - target speaker embedding

        Returns:
            waveform: [1, 1, samples] - output audio
        """
        g_src = source_embedding
        g_tgt = target_embedding

        # Use fixed tau=1.0 for tracing
        tau = 1.0

        # Posterior encoder
        z, m_q, logs_q, y_mask = self.enc_q(
            spectrogram,
            spec_lengths,
            g=torch.zeros_like(g_src) if self.zero_g else g_src,
            tau=tau
        )

        # Flow (forward with source speaker)
        z_p = self.flow(z, y_mask, g=g_src)

        # Flow (reverse with target speaker)
        z_hat = self.flow(z_p, y_mask, g=g_tgt, reverse=True)

        # Decoder (HiFi-GAN)
        o_hat = self.dec(
            z_hat * y_mask,
            g=torch.zeros_like(g_tgt) if self.zero_g else g_tgt
        )

        return o_hat


def load_model():
    """Load OpenVoice V2 SynthesizerTrn model."""

    # Import OpenVoice model class
    from openvoice.models import SynthesizerTrn

    ckpt_dir = os.path.join(OPENVOICE_PATH, "checkpoints_v2/converter")
    config_path = os.path.join(ckpt_dir, "config.json")
    model_path = os.path.join(ckpt_dir, "checkpoint.pth")

    if not os.path.exists(config_path):
        print(f"ERROR: Config not found at {config_path}")
        print("Please download checkpoints_v2 from Hugging Face")
        sys.exit(1)

    if not os.path.exists(model_path):
        print(f"ERROR: Model not found at {model_path}")
        print("Please download checkpoints_v2 from Hugging Face")
        sys.exit(1)

    print(f"Loading config from: {config_path}")
    hps = load_config(config_path)

    print(f"Creating SynthesizerTrn model...")

    # Get model params from config
    # segment_size defaults to 32 if train config not present
    segment_size = 32
    if hasattr(hps, 'train') and hasattr(hps.train, 'segment_size'):
        segment_size = hps.train.segment_size // hps.data.hop_length

    model_params = {
        'spec_channels': hps.data.filter_length // 2 + 1,
        'segment_size': segment_size,
        'inter_channels': hps.model.inter_channels,
        'hidden_channels': hps.model.hidden_channels,
        'filter_channels': hps.model.filter_channels,
        'n_heads': hps.model.n_heads,
        'n_layers': hps.model.n_layers,
        'kernel_size': hps.model.kernel_size,
        'p_dropout': hps.model.p_dropout,
        'resblock': hps.model.resblock,
        'resblock_kernel_sizes': hps.model.resblock_kernel_sizes,
        'resblock_dilation_sizes': hps.model.resblock_dilation_sizes,
        'upsample_rates': hps.model.upsample_rates,
        'upsample_initial_channel': hps.model.upsample_initial_channel,
        'upsample_kernel_sizes': hps.model.upsample_kernel_sizes,
        'gin_channels': hps.model.gin_channels,
    }

    # Check for version-specific params
    if hasattr(hps.model, 'use_sdp'):
        model_params['use_sdp'] = hps.model.use_sdp
    if hasattr(hps.model, 'zero_g'):
        model_params['zero_g'] = hps.model.zero_g

    model = SynthesizerTrn(
        n_vocab=0,  # No text encoder for voice conversion
        n_speakers=hps.data.n_speakers,
        **model_params
    )

    print(f"Loading weights from: {model_path}")
    checkpoint = torch.load(model_path, map_location='cpu')
    missing, unexpected = model.load_state_dict(checkpoint['model'], strict=False)
    print(f"  Missing keys: {len(missing)}")
    print(f"  Unexpected keys: {len(unexpected)}")

    model.eval()

    zero_g = getattr(hps.model, 'zero_g', False)
    print(f"  zero_g: {zero_g}")

    return model, hps, zero_g


def convert_to_coreml(wrapper_model, output_path):
    """Convert PyTorch wrapper to CoreML with FIXED shapes."""

    print(f"\nConverting to CoreML with FIXED shapes...")
    print(f"  Spectrogram: [1, {SPEC_CHANNELS}, {FIXED_FRAMES}]")
    print(f"  Embedding: [1, {EMBEDDING_DIM}, 1]")

    wrapper_model.train(False)

    # Create example inputs with FIXED shapes
    # Note: embeddings have shape [1, 256, 1] as used in OpenVoice
    example_spectrogram = torch.randn(1, SPEC_CHANNELS, FIXED_FRAMES)
    example_spec_lengths = torch.tensor([FIXED_FRAMES], dtype=torch.long)
    example_source_emb = torch.randn(1, EMBEDDING_DIM, 1)
    example_target_emb = torch.randn(1, EMBEDDING_DIM, 1)

    # Test the wrapper
    print("\nTesting wrapper forward pass...")
    with torch.no_grad():
        test_output = wrapper_model(
            example_spectrogram,
            example_spec_lengths,
            example_source_emb,
            example_target_emb
        )
        print(f"  Output shape: {test_output.shape}")
        expected_samples = FIXED_FRAMES * HOP_LENGTH
        print(f"  Expected samples: ~{expected_samples}")

    # Trace the model
    print("\nTracing model with torch.jit.trace...")
    with torch.no_grad():
        traced_model = torch.jit.trace(
            wrapper_model,
            (example_spectrogram, example_spec_lengths.float(), example_source_emb, example_target_emb)
        )

    # Convert to CoreML with FIXED shapes
    print("\nConverting to CoreML mlprogram...")
    mlmodel = ct.convert(
        traced_model,
        inputs=[
            ct.TensorType(
                name="spectrogram",
                shape=(1, SPEC_CHANNELS, FIXED_FRAMES),
                dtype=np.float32
            ),
            ct.TensorType(
                name="spec_lengths",
                shape=(1,),
                dtype=np.float32
            ),
            ct.TensorType(
                name="source_embedding",
                shape=(1, EMBEDDING_DIM, 1),
                dtype=np.float32
            ),
            ct.TensorType(
                name="target_embedding",
                shape=(1, EMBEDDING_DIM, 1),
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
    mlmodel.short_description = f"Voice converter with fixed {FIXED_FRAMES} frame input"
    mlmodel.version = "2.0-fixed512"

    # User-defined metadata
    mlmodel.user_defined_metadata["fixed_frames"] = str(FIXED_FRAMES)
    mlmodel.user_defined_metadata["spec_channels"] = str(SPEC_CHANNELS)
    mlmodel.user_defined_metadata["embedding_dim"] = str(EMBEDDING_DIM)
    mlmodel.user_defined_metadata["sample_rate"] = str(SAMPLE_RATE)
    mlmodel.user_defined_metadata["hop_length"] = str(HOP_LENGTH)
    max_duration = FIXED_FRAMES * HOP_LENGTH / SAMPLE_RATE
    mlmodel.user_defined_metadata["max_duration_seconds"] = f"{max_duration:.2f}"
    mlmodel.user_defined_metadata["embedding_shape"] = "[1, 256, 1]"

    # Save
    print(f"\nSaving to: {output_path}")
    mlmodel.save(output_path)

    # Verify shapes
    print("\nVerifying model input shapes...")
    spec = mlmodel.get_spec()
    for inp in spec.description.input:
        shape = list(inp.type.multiArrayType.shape)
        print(f"  {inp.name}: {shape}")

    print(f"\nModel saved: {output_path}")
    print(f"Max duration: {max_duration:.2f}s")

    return mlmodel


def main():
    print("=" * 60)
    print("OpenVoice V2 to CoreML (FIXED SHAPES)")
    print("=" * 60)

    # Output path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "Meeshy/Resources/MLModels/VoiceConverterPipeline.mlpackage")

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Backup existing model if present
    if os.path.exists(output_path):
        import shutil
        backup_path = output_path.replace(".mlpackage", "_backup.mlpackage")
        print(f"Backing up to: {backup_path}")
        if os.path.exists(backup_path):
            shutil.rmtree(backup_path)
        shutil.move(output_path, backup_path)

    # Load model
    model, hps, zero_g = load_model()

    # Create wrapper
    print("\nCreating fixed-shape wrapper...")
    wrapper = VoiceConversionWrapper(model, zero_g=zero_g)

    # Convert to CoreML
    convert_to_coreml(wrapper, output_path)

    print("\n" + "=" * 60)
    print("DONE! Next steps:")
    print("1. Run: ruby scripts/add_mlmodels_to_xcode.rb")
    print("2. Build and run on device")
    print("3. Test voice cloning - should show >0% STT similarity")
    print("=" * 60)


if __name__ == "__main__":
    main()
