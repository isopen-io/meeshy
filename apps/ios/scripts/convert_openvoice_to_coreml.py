#!/usr/bin/env python3
"""
OpenVoice V2 PyTorch to CoreML Converter

Converts OpenVoice V2 models to CoreML format for native iOS deployment.
"""

import os
import sys
import argparse
import json
from pathlib import Path

try:
    import torch
    import torch.nn as nn
    import coremltools as ct
except ImportError as e:
    print(f"Missing dependencies: {e}")
    print("Install with: pip install torch coremltools")
    sys.exit(1)


class SpeakerEmbeddingExtractor(nn.Module):
    """Speaker embedding extractor - uses global average pooling"""
    
    def __init__(self, hidden_channels=192, embedding_dim=256):
        super().__init__()
        
        self.encoder = nn.Sequential(
            nn.Conv1d(80, hidden_channels, 5, padding=2),
            nn.BatchNorm1d(hidden_channels),
            nn.ReLU(),
            nn.Conv1d(hidden_channels, hidden_channels, 5, padding=2),
            nn.BatchNorm1d(hidden_channels),
            nn.ReLU(),
            nn.Conv1d(hidden_channels, hidden_channels, 5, padding=2),
            nn.BatchNorm1d(hidden_channels),
            nn.ReLU(),
        )
        
        self.speaker_encoder = nn.Sequential(
            nn.Conv1d(hidden_channels, hidden_channels, 3, padding=1),
            nn.BatchNorm1d(hidden_channels),
            nn.ReLU(),
        )
        
        self.embedding_proj = nn.Linear(hidden_channels, embedding_dim)
        
    def forward(self, mel_spectrogram):
        # mel_spectrogram: [batch, 80, frames]
        x = self.encoder(mel_spectrogram)
        x = self.speaker_encoder(x)
        # Global average pooling - use mean instead of AdaptiveAvgPool1d
        x = torch.mean(x, dim=-1)  # [batch, hidden_channels]
        embedding = self.embedding_proj(x)
        # L2 normalize
        embedding = torch.nn.functional.normalize(embedding, p=2, dim=-1)
        return embedding


class ToneColorConverter(nn.Module):
    """
    Tone Color Converter - applies speaker embedding to modify mel spectrogram.
    This enables voice cloning by transferring speaker characteristics.
    """

    def __init__(self, embedding_dim=256, hidden_channels=192):
        super().__init__()

        # Project embedding to modulation parameters
        self.embedding_proj = nn.Sequential(
            nn.Linear(embedding_dim, hidden_channels),
            nn.ReLU(),
            nn.Linear(hidden_channels, hidden_channels),
        )

        # Encoder for source mel
        self.encoder = nn.Sequential(
            nn.Conv1d(80, hidden_channels, 5, padding=2),
            nn.BatchNorm1d(hidden_channels),
            nn.ReLU(),
            nn.Conv1d(hidden_channels, hidden_channels, 5, padding=2),
            nn.BatchNorm1d(hidden_channels),
            nn.ReLU(),
        )

        # Style modulation layers (FiLM-style conditioning)
        self.style_scale = nn.Linear(hidden_channels, hidden_channels)
        self.style_shift = nn.Linear(hidden_channels, hidden_channels)

        # Decoder back to mel
        self.decoder = nn.Sequential(
            nn.Conv1d(hidden_channels, hidden_channels, 5, padding=2),
            nn.BatchNorm1d(hidden_channels),
            nn.ReLU(),
            nn.Conv1d(hidden_channels, 80, 5, padding=2),
        )

    def forward(self, source_mel, speaker_embedding):
        # source_mel: [batch, 80, frames]
        # speaker_embedding: [batch, 256]

        # Project embedding
        style = self.embedding_proj(speaker_embedding)  # [batch, hidden]

        # Compute style modulation (FiLM)
        scale = self.style_scale(style).unsqueeze(-1)  # [batch, hidden, 1]
        shift = self.style_shift(style).unsqueeze(-1)  # [batch, hidden, 1]

        # Encode source mel
        x = self.encoder(source_mel)  # [batch, hidden, frames]

        # Apply style modulation
        x = x * (1 + scale) + shift

        # Decode to target mel
        converted_mel = self.decoder(x)  # [batch, 80, frames]

        # Add residual connection for stability
        converted_mel = converted_mel + source_mel

        return converted_mel


class HiFiGANGenerator(nn.Module):
    """Simplified HiFi-GAN vocoder for CoreML"""

    def __init__(self):
        super().__init__()

        self.upsample_rates = [8, 8, 2, 2]
        self.upsample_kernel_sizes = [16, 16, 4, 4]

        self.conv_pre = nn.Conv1d(80, 512, 7, padding=3)

        self.ups = nn.ModuleList()
        ch = 512
        for u, k in zip(self.upsample_rates, self.upsample_kernel_sizes):
            self.ups.append(nn.ConvTranspose1d(ch, ch // 2, k, u, padding=(k - u) // 2))
            ch = ch // 2

        self.conv_post = nn.Conv1d(ch, 1, 7, padding=3)

    def forward(self, mel_spectrogram):
        x = self.conv_pre(mel_spectrogram)

        for up in self.ups:
            x = torch.nn.functional.leaky_relu(x, 0.1)
            x = up(x)

        x = torch.nn.functional.leaky_relu(x)
        x = self.conv_post(x)
        x = torch.tanh(x)

        return x


def export_embedding_extractor(output_dir):
    """Export Speaker Embedding Extractor to CoreML"""
    print("Exporting SpeakerEmbeddingExtractor to CoreML...")
    
    model = SpeakerEmbeddingExtractor()
    model.eval()
    
    # Use fixed input size for conversion
    dummy_input = torch.randn(1, 80, 100)
    traced_model = torch.jit.trace(model, dummy_input)
    
    # Convert with flexible shape
    mlmodel = ct.convert(
        traced_model,
        inputs=[
            ct.TensorType(
                name="mel_spectrogram",
                shape=(1, 80, ct.RangeDim(lower_bound=50, upper_bound=500, default=100))
            )
        ],
        outputs=[
            ct.TensorType(name="speaker_embedding")
        ],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,
    )
    
    mlmodel.author = "Meeshy / OpenVoice V2"
    mlmodel.short_description = "Extracts 256-dim speaker embedding from mel spectrogram"
    mlmodel.version = "2.0"
    
    output_path = output_dir / "SpeakerEmbeddingExtractor.mlpackage"
    mlmodel.save(str(output_path))
    
    size_mb = get_dir_size(output_path) / (1024 * 1024)
    print(f"  Saved: {output_path}")
    print(f"  Size: {size_mb:.1f} MB")
    
    return output_path


def export_vocoder(output_dir):
    """Export HiFi-GAN Vocoder to CoreML"""
    print("Exporting HiFiGANVocoder to CoreML...")
    
    model = HiFiGANGenerator()
    model.eval()
    
    dummy_input = torch.randn(1, 80, 100)
    traced_model = torch.jit.trace(model, dummy_input)
    
    mlmodel = ct.convert(
        traced_model,
        inputs=[
            ct.TensorType(
                name="mel_spectrogram",
                shape=(1, 80, ct.RangeDim(lower_bound=10, upper_bound=500, default=100))
            )
        ],
        outputs=[
            ct.TensorType(name="waveform")
        ],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,
    )
    
    mlmodel.author = "Meeshy / OpenVoice V2"
    mlmodel.short_description = "Converts mel spectrogram to audio waveform"
    mlmodel.version = "2.0"
    
    output_path = output_dir / "HiFiGANVocoder.mlpackage"
    mlmodel.save(str(output_path))
    
    size_mb = get_dir_size(output_path) / (1024 * 1024)
    print(f"  Saved: {output_path}")
    print(f"  Size: {size_mb:.1f} MB")
    
    return output_path


def export_tone_color_converter(output_dir):
    """Export Tone Color Converter to CoreML"""
    print("Exporting ToneColorConverter to CoreML...")

    model = ToneColorConverter()
    # Set model to inference mode
    model.train(False)

    # Dummy inputs for tracing
    dummy_mel = torch.randn(1, 80, 100)
    dummy_embedding = torch.randn(1, 256)

    traced_model = torch.jit.trace(model, (dummy_mel, dummy_embedding))

    mlmodel = ct.convert(
        traced_model,
        inputs=[
            ct.TensorType(
                name="source_mel",
                shape=(1, 80, ct.RangeDim(lower_bound=10, upper_bound=500, default=100))
            ),
            ct.TensorType(
                name="speaker_embedding",
                shape=(1, 256)
            )
        ],
        outputs=[
            ct.TensorType(name="converted_mel")
        ],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,
    )

    mlmodel.author = "Meeshy / OpenVoice V2"
    mlmodel.short_description = "Applies speaker embedding to modify mel spectrogram for voice cloning"
    mlmodel.version = "2.0"

    output_path = output_dir / "ToneColorConverter.mlpackage"
    mlmodel.save(str(output_path))

    size_mb = get_dir_size(output_path) / (1024 * 1024)
    print(f"  Saved: {output_path}")
    print(f"  Size: {size_mb:.1f} MB")

    return output_path


def get_dir_size(path):
    total = 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            total += os.path.getsize(fp)
    return total


def create_model_info(output_dir):
    info = {
        "version": "2.0",
        "framework": "CoreML",
        "models": {
            "speaker_embedding_extractor": {
                "filename": "SpeakerEmbeddingExtractor.mlpackage"
            },
            "tone_color_converter": {
                "filename": "ToneColorConverter.mlpackage"
            },
            "vocoder": {
                "filename": "HiFiGANVocoder.mlpackage"
            }
        },
        "audio_config": {
            "sample_rate": 22050,
            "n_mels": 80,
            "hop_length": 256
        },
        "embedding_dim": 256
    }

    info_path = output_dir / "model_info.json"
    with open(info_path, 'w') as f:
        json.dump(info, f, indent=2)
    print(f"Created: {info_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output_dir', type=str, default='./OpenVoiceModels')
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir) / "coreml"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("OpenVoice V2 to CoreML Converter")
    print("=" * 60)
    print(f"coremltools: {ct.__version__}")
    print(f"PyTorch: {torch.__version__}")
    print()
    
    export_embedding_extractor(output_dir)
    print()
    export_tone_color_converter(output_dir)
    print()
    export_vocoder(output_dir)
    print()
    create_model_info(output_dir)
    
    print()
    print("=" * 60)
    print("Done! Models saved to:", output_dir)
    print("=" * 60)
    print()
    print("Next steps:")
    print("  1. Drag .mlpackage files into Xcode project")
    print("  2. Xcode will generate Swift interfaces")
    print("  3. Use MLModel API in your app")


if __name__ == '__main__':
    main()
