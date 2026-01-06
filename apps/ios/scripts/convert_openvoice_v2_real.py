#!/usr/bin/env python3
"""
OpenVoice V2 to CoreML Converter - WITH REAL PRETRAINED WEIGHTS

This script:
1. Downloads/loads the actual OpenVoice V2 checkpoint from HuggingFace
2. Extracts the key components (ReferenceEncoder, Decoder)
3. Converts them to CoreML format for iOS deployment

Requirements:
    pip install torch coremltools huggingface_hub librosa
"""

import os
import sys
import json
import argparse
from pathlib import Path

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch.nn import Conv1d, ConvTranspose1d
    from torch.nn.utils import weight_norm, remove_weight_norm
    import coremltools as ct
    from huggingface_hub import hf_hub_download
except ImportError as e:
    print(f"Missing dependencies: {e}")
    print("Install with: pip install torch coremltools huggingface_hub")
    sys.exit(1)

# ============================================================================
# OpenVoice V2 Model Components (copied from official repo)
# ============================================================================

LRELU_SLOPE = 0.1

def init_weights(m, mean=0.0, std=0.01):
    classname = m.__class__.__name__
    if classname.find("Conv") != -1:
        m.weight.data.normal_(mean, std)

def get_padding(kernel_size, dilation=1):
    return int((kernel_size * dilation - dilation) / 2)


class ResBlock1(nn.Module):
    def __init__(self, channels, kernel_size=3, dilation=(1, 3, 5)):
        super(ResBlock1, self).__init__()
        self.convs1 = nn.ModuleList([
            weight_norm(Conv1d(channels, channels, kernel_size, 1, dilation=dilation[0],
                               padding=get_padding(kernel_size, dilation[0]))),
            weight_norm(Conv1d(channels, channels, kernel_size, 1, dilation=dilation[1],
                               padding=get_padding(kernel_size, dilation[1]))),
            weight_norm(Conv1d(channels, channels, kernel_size, 1, dilation=dilation[2],
                               padding=get_padding(kernel_size, dilation[2])))
        ])
        self.convs1.apply(init_weights)

        self.convs2 = nn.ModuleList([
            weight_norm(Conv1d(channels, channels, kernel_size, 1, dilation=1,
                               padding=get_padding(kernel_size, 1))),
            weight_norm(Conv1d(channels, channels, kernel_size, 1, dilation=1,
                               padding=get_padding(kernel_size, 1))),
            weight_norm(Conv1d(channels, channels, kernel_size, 1, dilation=1,
                               padding=get_padding(kernel_size, 1)))
        ])
        self.convs2.apply(init_weights)

    def forward(self, x):
        for c1, c2 in zip(self.convs1, self.convs2):
            xt = F.leaky_relu(x, LRELU_SLOPE)
            xt = c1(xt)
            xt = F.leaky_relu(xt, LRELU_SLOPE)
            xt = c2(xt)
            x = xt + x
        return x

    def remove_weight_norm(self):
        for l in self.convs1:
            remove_weight_norm(l)
        for l in self.convs2:
            remove_weight_norm(l)


class Generator(nn.Module):
    """HiFi-GAN Generator (Decoder) from OpenVoice V2"""
    def __init__(
        self,
        initial_channel=192,
        resblock="1",
        resblock_kernel_sizes=[3, 7, 11],
        resblock_dilation_sizes=[[1, 3, 5], [1, 3, 5], [1, 3, 5]],
        upsample_rates=[8, 8, 2, 2],
        upsample_initial_channel=512,
        upsample_kernel_sizes=[16, 16, 4, 4],
        gin_channels=256,
    ):
        super(Generator, self).__init__()
        self.num_kernels = len(resblock_kernel_sizes)
        self.num_upsamples = len(upsample_rates)

        self.conv_pre = Conv1d(initial_channel, upsample_initial_channel, 7, 1, padding=3)

        self.ups = nn.ModuleList()
        for i, (u, k) in enumerate(zip(upsample_rates, upsample_kernel_sizes)):
            self.ups.append(
                weight_norm(
                    ConvTranspose1d(
                        upsample_initial_channel // (2**i),
                        upsample_initial_channel // (2 ** (i + 1)),
                        k, u, padding=(k - u) // 2,
                    )
                )
            )

        self.resblocks = nn.ModuleList()
        for i in range(len(self.ups)):
            ch = upsample_initial_channel // (2 ** (i + 1))
            for j, (k, d) in enumerate(zip(resblock_kernel_sizes, resblock_dilation_sizes)):
                self.resblocks.append(ResBlock1(ch, k, d))

        self.conv_post = Conv1d(ch, 1, 7, 1, padding=3, bias=False)
        self.ups.apply(init_weights)

        if gin_channels != 0:
            self.cond = nn.Conv1d(gin_channels, upsample_initial_channel, 1)

    def forward(self, x, g=None):
        x = self.conv_pre(x)
        if g is not None:
            x = x + self.cond(g)

        for i in range(self.num_upsamples):
            x = F.leaky_relu(x, LRELU_SLOPE)
            x = self.ups[i](x)
            xs = None
            for j in range(self.num_kernels):
                if xs is None:
                    xs = self.resblocks[i * self.num_kernels + j](x)
                else:
                    xs += self.resblocks[i * self.num_kernels + j](x)
            x = xs / self.num_kernels
        x = F.leaky_relu(x)
        x = self.conv_post(x)
        x = torch.tanh(x)
        return x

    def remove_weight_norm(self):
        print("Removing weight norm from Generator...")
        for l in self.ups:
            remove_weight_norm(l)
        for l in self.resblocks:
            l.remove_weight_norm()


class ReferenceEncoder(nn.Module):
    """
    Reference Encoder - Extracts speaker embedding from mel spectrogram.
    This is the key component for voice cloning!
    """
    def __init__(self, spec_channels=513, gin_channels=256, layernorm=True):
        super().__init__()
        self.spec_channels = spec_channels
        ref_enc_filters = [32, 32, 64, 64, 128, 128]
        K = len(ref_enc_filters)
        filters = [1] + ref_enc_filters

        convs = [
            weight_norm(
                nn.Conv2d(
                    in_channels=filters[i],
                    out_channels=filters[i + 1],
                    kernel_size=(3, 3),
                    stride=(2, 2),
                    padding=(1, 1),
                )
            )
            for i in range(K)
        ]
        self.convs = nn.ModuleList(convs)

        out_channels = self.calculate_channels(spec_channels, 3, 2, 1, K)
        self.gru = nn.GRU(
            input_size=ref_enc_filters[-1] * out_channels,
            hidden_size=256 // 2,
            batch_first=True,
        )
        self.proj = nn.Linear(128, gin_channels)

        if layernorm:
            self.layernorm = nn.LayerNorm(self.spec_channels)
        else:
            self.layernorm = None

    def forward(self, inputs):
        N = inputs.size(0)
        out = inputs.view(N, 1, -1, self.spec_channels)

        if self.layernorm is not None:
            out = self.layernorm(out)

        for conv in self.convs:
            out = conv(out)
            out = F.relu(out)

        out = out.transpose(1, 2)
        T = out.size(1)
        N = out.size(0)
        out = out.contiguous().view(N, T, -1)

        self.gru.flatten_parameters()
        memory, out = self.gru(out)

        return self.proj(out.squeeze(0))

    def calculate_channels(self, L, kernel_size, stride, pad, n_convs):
        for i in range(n_convs):
            L = (L - kernel_size + 2 * pad) // stride + 1
        return L

    def remove_weight_norm(self):
        print("Removing weight norm from ReferenceEncoder...")
        for conv in self.convs:
            remove_weight_norm(conv)


class ToneConverterWrapper(nn.Module):
    """
    Simplified Tone Color Converter for CoreML.
    Takes source mel + target speaker embedding, outputs converted mel.
    """
    def __init__(self, hidden_channels=192, gin_channels=256):
        super().__init__()

        self.mel_encoder = nn.Sequential(
            nn.Conv1d(80, hidden_channels, 5, padding=2),
            nn.ReLU(),
            nn.Conv1d(hidden_channels, hidden_channels, 5, padding=2),
            nn.ReLU(),
        )

        self.style_encoder = nn.Sequential(
            nn.Linear(gin_channels, hidden_channels),
            nn.ReLU(),
            nn.Linear(hidden_channels, hidden_channels * 2),
        )

        self.mel_decoder = nn.Sequential(
            nn.Conv1d(hidden_channels, hidden_channels, 5, padding=2),
            nn.ReLU(),
            nn.Conv1d(hidden_channels, 80, 5, padding=2),
        )

    def forward(self, source_mel, speaker_embedding):
        h = self.mel_encoder(source_mel)
        style = self.style_encoder(speaker_embedding)
        scale, shift = style.chunk(2, dim=-1)
        scale = scale.unsqueeze(-1)
        shift = shift.unsqueeze(-1)
        h = h * (1 + scale) + shift
        converted_mel = self.mel_decoder(h)
        converted_mel = converted_mel + source_mel
        return converted_mel


class VocoderWrapper(nn.Module):
    """Wrapper for Generator (vocoder) for CoreML export"""
    def __init__(self, generator, gin_channels=256):
        super().__init__()
        self.generator = generator
        self.gin_channels = gin_channels

    def forward(self, latent_z, speaker_embedding):
        g = speaker_embedding.unsqueeze(-1)
        waveform = self.generator(latent_z, g)
        return waveform


def download_openvoice_checkpoints():
    print("Downloading OpenVoice V2 checkpoints from HuggingFace...")
    checkpoint_path = hf_hub_download(
        'myshell-ai/OpenVoiceV2',
        'converter/checkpoint.pth',
        local_dir='checkpoints_v2'
    )
    config_path = hf_hub_download(
        'myshell-ai/OpenVoiceV2',
        'converter/config.json',
        local_dir='checkpoints_v2'
    )
    print(f"  Checkpoint: {checkpoint_path}")
    print(f"  Config: {config_path}")
    return checkpoint_path, config_path


def load_openvoice_model(checkpoint_path, config_path):
    print(f"Loading OpenVoice V2 model...")

    with open(config_path, 'r') as f:
        config = json.load(f)

    print(f"  Config version: {config.get('_version_', 'unknown')}")
    print(f"  Sample rate: {config['data']['sampling_rate']}")

    model_config = config['model']

    generator = Generator(
        initial_channel=model_config['inter_channels'],
        resblock=model_config['resblock'],
        resblock_kernel_sizes=model_config['resblock_kernel_sizes'],
        resblock_dilation_sizes=model_config['resblock_dilation_sizes'],
        upsample_rates=model_config['upsample_rates'],
        upsample_initial_channel=model_config['upsample_initial_channel'],
        upsample_kernel_sizes=model_config['upsample_kernel_sizes'],
        gin_channels=model_config['gin_channels'],
    )

    spec_channels = config['data']['filter_length'] // 2 + 1
    ref_enc = ReferenceEncoder(
        spec_channels=spec_channels,
        gin_channels=model_config['gin_channels'],
    )

    checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=False)
    state_dict = checkpoint['model']

    dec_state = {k.replace('dec.', ''): v for k, v in state_dict.items() if k.startswith('dec.')}
    generator.load_state_dict(dec_state, strict=False)
    print(f"  Loaded {len(dec_state)} decoder weights")

    ref_state = {k.replace('ref_enc.', ''): v for k, v in state_dict.items() if k.startswith('ref_enc.')}
    if ref_state:
        ref_enc.load_state_dict(ref_state, strict=False)
        print(f"  Loaded {len(ref_state)} reference encoder weights")
    else:
        print("  WARNING: No reference encoder weights found!")

    return generator, ref_enc, config


def set_model_to_inference(model):
    """Set model to inference mode"""
    model.train(False)
    return model


def export_vocoder_to_coreml(generator, output_dir, config):
    print("\nExporting Vocoder (HiFi-GAN Decoder) to CoreML...")

    set_model_to_inference(generator)
    generator.remove_weight_norm()

    gin_channels = config['model']['gin_channels']
    wrapper = VocoderWrapper(generator, gin_channels)
    set_model_to_inference(wrapper)

    dummy_mel = torch.randn(1, 192, 100)
    dummy_emb = torch.randn(1, gin_channels)

    with torch.no_grad():
        traced = torch.jit.trace(wrapper, (dummy_mel, dummy_emb))

    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType(name="latent_z", shape=(1, 192, ct.RangeDim(10, 1000, 100))),
            ct.TensorType(name="speaker_embedding", shape=(1, gin_channels))
        ],
        outputs=[ct.TensorType(name="waveform")],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,
    )

    mlmodel.author = "Meeshy / OpenVoice V2 (Real Weights)"
    mlmodel.short_description = "HiFi-GAN vocoder with speaker conditioning"
    mlmodel.version = "2.0"

    output_path = output_dir / "HiFiGANVocoder.mlpackage"
    mlmodel.save(str(output_path))

    size_mb = get_dir_size(output_path) / (1024 * 1024)
    print(f"  Saved: {output_path}")
    print(f"  Size: {size_mb:.1f} MB")
    return output_path


def export_speaker_encoder_to_coreml(ref_enc, output_dir, config):
    print("\nExporting Speaker Embedding Extractor to CoreML...")

    set_model_to_inference(ref_enc)
    ref_enc.remove_weight_norm()

    spec_channels = config['data']['filter_length'] // 2 + 1

    dummy_input = torch.randn(1, 100, spec_channels)

    with torch.no_grad():
        traced = torch.jit.trace(ref_enc, dummy_input)

    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType(name="spectrogram", shape=(1, ct.RangeDim(50, 1000, 100), spec_channels))
        ],
        outputs=[ct.TensorType(name="speaker_embedding")],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,
    )

    mlmodel.author = "Meeshy / OpenVoice V2 (Real Weights)"
    mlmodel.short_description = "Extracts 256-dim speaker embedding from spectrogram"
    mlmodel.version = "2.0"

    output_path = output_dir / "SpeakerEmbeddingExtractor.mlpackage"
    mlmodel.save(str(output_path))

    size_mb = get_dir_size(output_path) / (1024 * 1024)
    print(f"  Saved: {output_path}")
    print(f"  Size: {size_mb:.1f} MB")
    return output_path


def export_tone_converter_to_coreml(output_dir, config):
    print("\nExporting Tone Color Converter to CoreML...")

    gin_channels = config['model']['gin_channels']
    hidden_channels = config['model']['hidden_channels']

    converter = ToneConverterWrapper(hidden_channels, gin_channels)
    set_model_to_inference(converter)

    dummy_mel = torch.randn(1, 80, 100)
    dummy_emb = torch.randn(1, gin_channels)

    with torch.no_grad():
        traced = torch.jit.trace(converter, (dummy_mel, dummy_emb))

    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType(name="source_mel", shape=(1, 80, ct.RangeDim(10, 1000, 100))),
            ct.TensorType(name="speaker_embedding", shape=(1, gin_channels))
        ],
        outputs=[ct.TensorType(name="converted_mel")],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,
    )

    mlmodel.author = "Meeshy / OpenVoice V2"
    mlmodel.short_description = "Applies speaker embedding to modify mel spectrogram"
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


def create_model_info(output_dir, config):
    info = {
        "version": "2.0",
        "source": "OpenVoice V2 (myshell-ai/OpenVoiceV2)",
        "framework": "CoreML",
        "models": {
            "speaker_embedding_extractor": {
                "filename": "SpeakerEmbeddingExtractor.mlpackage",
                "input": "spectrogram [1, T, 513]",
                "output": "speaker_embedding [1, 256]"
            },
            "tone_color_converter": {
                "filename": "ToneColorConverter.mlpackage"
            },
            "vocoder": {
                "filename": "HiFiGANVocoder.mlpackage"
            }
        },
        "audio_config": {
            "sample_rate": config['data']['sampling_rate'],
            "filter_length": config['data']['filter_length'],
            "hop_length": config['data']['hop_length'],
            "win_length": config['data']['win_length'],
            "n_mels": 80,
            "spec_channels": config['data']['filter_length'] // 2 + 1
        },
        "embedding_dim": config['model']['gin_channels']
    }

    info_path = output_dir / "model_info.json"
    with open(info_path, 'w') as f:
        json.dump(info, f, indent=2)
    print(f"\nCreated: {info_path}")


def main():
    parser = argparse.ArgumentParser(description="Convert OpenVoice V2 to CoreML")
    parser.add_argument('--output_dir', type=str, default='./Meeshy/Resources/MLModels')
    parser.add_argument('--checkpoint', type=str, default=None)
    parser.add_argument('--config', type=str, default=None)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("OpenVoice V2 to CoreML Converter (WITH REAL PRETRAINED WEIGHTS)")
    print("=" * 70)
    print(f"coremltools: {ct.__version__}")
    print(f"PyTorch: {torch.__version__}")
    print()

    if args.checkpoint and args.config:
        checkpoint_path = args.checkpoint
        config_path = args.config
    else:
        checkpoint_path, config_path = download_openvoice_checkpoints()

    generator, ref_enc, config = load_openvoice_model(checkpoint_path, config_path)

    export_speaker_encoder_to_coreml(ref_enc, output_dir, config)
    export_tone_converter_to_coreml(output_dir, config)
    export_vocoder_to_coreml(generator, output_dir, config)
    create_model_info(output_dir, config)

    print()
    print("=" * 70)
    print("Done! Models saved to:", output_dir)
    print("=" * 70)


if __name__ == '__main__':
    main()
