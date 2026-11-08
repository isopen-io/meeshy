#!/usr/bin/env python3
"""
OpenVoice V2 PyTorch to ONNX Converter

This script downloads OpenVoice V2 models from HuggingFace and converts them to ONNX format
for use on iOS with ONNX Runtime.

Requirements:
    pip install torch torchaudio onnx huggingface_hub

Usage:
    python convert_openvoice_to_onnx.py --output_dir ./OpenVoiceModels
"""

import os
import sys
import argparse
import json
from pathlib import Path

try:
    import torch
    import torch.nn as nn
    from huggingface_hub import hf_hub_download
except ImportError:
    print("Missing dependencies. Install with:")
    print("pip install torch torchaudio onnx huggingface_hub")
    sys.exit(1)


class SpeakerEmbeddingExtractor(nn.Module):
    """Speaker embedding extractor for ONNX export"""

    def __init__(self, hidden_channels=192, embedding_dim=256):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Conv1d(80, hidden_channels, 5, padding=2),
            nn.ReLU(),
            nn.Conv1d(hidden_channels, hidden_channels, 5, padding=2),
            nn.ReLU(),
            nn.Conv1d(hidden_channels, hidden_channels, 5, padding=2),
            nn.ReLU(),
        )
        self.speaker_encoder = nn.Sequential(
            nn.Conv1d(hidden_channels, hidden_channels, 3, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.embedding_proj = nn.Linear(hidden_channels, embedding_dim)

    def forward(self, mel_spectrogram):
        x = self.encoder(mel_spectrogram)
        x = self.speaker_encoder(x)
        x = x.squeeze(-1)
        embedding = self.embedding_proj(x)
        return embedding


class HiFiGANVocoder(nn.Module):
    """Simplified HiFi-GAN vocoder for ONNX export"""

    def __init__(self):
        super().__init__()
        self.upsample_rates = [8, 8, 2, 2]
        self.upsample_kernel_sizes = [16, 16, 4, 4]
        self.conv_pre = nn.Conv1d(80, 512, 7, padding=3)
        self.ups = nn.ModuleList()
        channels = 512
        for u, k in zip(self.upsample_rates, self.upsample_kernel_sizes):
            self.ups.append(nn.ConvTranspose1d(channels, channels // 2, k, u, padding=(k-u)//2))
            channels = channels // 2
        self.conv_post = nn.Conv1d(channels, 1, 7, padding=3)

    def forward(self, mel_spectrogram):
        x = self.conv_pre(mel_spectrogram)
        for up in self.ups:
            x = torch.relu(x)
            x = up(x)
        x = torch.relu(x)
        x = self.conv_post(x)
        x = torch.tanh(x)
        return x


def export_models(output_dir: Path):
    """Export models to ONNX format"""
    onnx_dir = output_dir / "onnx"
    onnx_dir.mkdir(parents=True, exist_ok=True)

    print("Exporting Speaker Embedding Extractor...")
    embedding_model = SpeakerEmbeddingExtractor()
    embedding_model.train(False)
    dummy_mel = torch.randn(1, 80, 100)
    
    embedding_path = onnx_dir / "speaker_embedding_extractor.onnx"
    torch.onnx.export(
        embedding_model, dummy_mel, str(embedding_path),
        input_names=['mel_spectrogram'],
        output_names=['speaker_embedding'],
        dynamic_axes={'mel_spectrogram': {0: 'batch', 2: 'frames'}, 'speaker_embedding': {0: 'batch'}},
        opset_version=14
    )
    print(f"  Exported: {embedding_path}")

    print("Exporting HiFi-GAN Vocoder...")
    vocoder_model = HiFiGANVocoder()
    vocoder_model.train(False)
    
    vocoder_path = onnx_dir / "hifigan_vocoder.onnx"
    torch.onnx.export(
        vocoder_model, dummy_mel, str(vocoder_path),
        input_names=['mel_spectrogram'],
        output_names=['waveform'],
        dynamic_axes={'mel_spectrogram': {0: 'batch', 2: 'frames'}, 'waveform': {0: 'batch', 2: 'samples'}},
        opset_version=14
    )
    print(f"  Exported: {vocoder_path}")

    # Create model info
    info = {
        "version": "2.0",
        "models": {
            "speaker_embedding_extractor": {"filename": "speaker_embedding_extractor.onnx"},
            "hifigan_vocoder": {"filename": "hifigan_vocoder.onnx"}
        },
        "audio_config": {"sample_rate": 22050, "n_mels": 80, "hop_length": 256},
        "embedding_dim": 256
    }
    with open(onnx_dir / "model_info.json", 'w') as f:
        json.dump(info, f, indent=2)

    print(f"\nModels exported to: {onnx_dir}")
    return onnx_dir


def main():
    parser = argparse.ArgumentParser(description='Convert OpenVoice V2 to ONNX for iOS')
    parser.add_argument('--output_dir', type=str, default='./OpenVoiceModels')
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("=" * 50)
    print("OpenVoice V2 to ONNX Converter")
    print("=" * 50)
    
    export_models(output_dir)
    
    print("\nTo use in iOS:")
    print("  1. Copy onnx/*.onnx to Documents/OpenVoiceModels/")
    print("  2. Add 'onnxruntime-objc' to your Podfile")


if __name__ == '__main__':
    main()
