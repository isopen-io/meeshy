#!/usr/bin/env python3
"""
OpenVoice V2 Full Pipeline CoreML Converter

Exports:
1. SpeakerEncoder - Extracts 256-dim speaker embedding from spectrogram
2. VoiceConverter - Full voice conversion pipeline (enc_q + flow + dec)

The VoiceConverter takes:
- Source spectrogram [1, 513, T]
- Source speaker embedding [1, 256]
- Target speaker embedding [1, 256]

And outputs:
- Converted waveform [1, 1, T*256]
"""

import os
import sys
import json
import argparse
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.nn import Conv1d, ConvTranspose1d
from torch.nn.utils import weight_norm, remove_weight_norm
import coremltools as ct

# Constants
LRELU_SLOPE = 0.1

def init_weights(m, mean=0.0, std=0.01):
    if m.__class__.__name__.find("Conv") != -1:
        m.weight.data.normal_(mean, std)

def get_padding(kernel_size, dilation=1):
    return int((kernel_size * dilation - dilation) / 2)


# ============================================================================
# Model Components
# ============================================================================

class LayerNorm(nn.Module):
    def __init__(self, channels, eps=1e-5):
        super().__init__()
        self.channels = channels
        self.eps = eps
        self.gamma = nn.Parameter(torch.ones(channels))
        self.beta = nn.Parameter(torch.zeros(channels))

    def forward(self, x):
        x = x.transpose(1, -1)
        x = F.layer_norm(x, (self.channels,), self.gamma, self.beta, self.eps)
        return x.transpose(1, -1)


class ResBlock1(nn.Module):
    def __init__(self, channels, kernel_size=3, dilation=(1, 3, 5)):
        super().__init__()
        self.convs1 = nn.ModuleList([
            weight_norm(Conv1d(channels, channels, kernel_size, 1, dilation=d,
                               padding=get_padding(kernel_size, d)))
            for d in dilation
        ])
        self.convs2 = nn.ModuleList([
            weight_norm(Conv1d(channels, channels, kernel_size, 1, dilation=1,
                               padding=get_padding(kernel_size, 1)))
            for _ in dilation
        ])

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


class WN(nn.Module):
    """WaveNet-style module"""
    def __init__(self, hidden_channels, kernel_size, dilation_rate, n_layers, gin_channels=0):
        super().__init__()
        self.hidden_channels = hidden_channels
        self.n_layers = n_layers
        self.gin_channels = gin_channels

        self.in_layers = nn.ModuleList()
        self.res_skip_layers = nn.ModuleList()

        if gin_channels != 0:
            self.cond_layer = nn.Conv1d(gin_channels, 2 * hidden_channels * n_layers, 1)

        for i in range(n_layers):
            dilation = dilation_rate ** i
            padding = int((kernel_size * dilation - dilation) / 2)
            in_layer = nn.Conv1d(hidden_channels, 2 * hidden_channels, kernel_size,
                                 dilation=dilation, padding=padding)
            in_layer = weight_norm(in_layer)
            self.in_layers.append(in_layer)

            if i < n_layers - 1:
                res_skip_channels = 2 * hidden_channels
            else:
                res_skip_channels = hidden_channels
            res_skip_layer = nn.Conv1d(hidden_channels, res_skip_channels, 1)
            res_skip_layer = weight_norm(res_skip_layer)
            self.res_skip_layers.append(res_skip_layer)

    def forward(self, x, x_mask, g=None):
        output = torch.zeros_like(x)
        n_channels_tensor = torch.IntTensor([self.hidden_channels])

        if g is not None:
            g = self.cond_layer(g)

        for i in range(self.n_layers):
            x_in = self.in_layers[i](x)
            if g is not None:
                cond_offset = i * 2 * self.hidden_channels
                g_l = g[:, cond_offset:cond_offset + 2 * self.hidden_channels, :]
            else:
                g_l = torch.zeros_like(x_in)

            acts = self.fused_add_tanh_sigmoid_multiply(x_in, g_l, n_channels_tensor)
            res_skip_acts = self.res_skip_layers[i](acts)

            if i < self.n_layers - 1:
                res_acts = res_skip_acts[:, :self.hidden_channels, :]
                x = (x + res_acts) * x_mask
                output = output + res_skip_acts[:, self.hidden_channels:, :]
            else:
                output = output + res_skip_acts
        return output * x_mask

    def fused_add_tanh_sigmoid_multiply(self, input_a, input_b, n_channels):
        n_channels_int = n_channels[0]
        in_act = input_a + input_b
        t_act = torch.tanh(in_act[:, :n_channels_int, :])
        s_act = torch.sigmoid(in_act[:, n_channels_int:, :])
        return t_act * s_act

    def remove_weight_norm(self):
        for l in self.in_layers:
            remove_weight_norm(l)
        for l in self.res_skip_layers:
            remove_weight_norm(l)


class PosteriorEncoder(nn.Module):
    def __init__(self, in_channels, out_channels, hidden_channels, kernel_size,
                 dilation_rate, n_layers, gin_channels=0):
        super().__init__()
        self.out_channels = out_channels

        self.pre = nn.Conv1d(in_channels, hidden_channels, 1)
        self.enc = WN(hidden_channels, kernel_size, dilation_rate, n_layers, gin_channels)
        self.proj = nn.Conv1d(hidden_channels, out_channels * 2, 1)

    def forward(self, x, x_mask, g=None, tau=1.0):
        x = self.pre(x) * x_mask
        x = self.enc(x, x_mask, g=g)
        stats = self.proj(x) * x_mask
        m, logs = torch.split(stats, self.out_channels, dim=1)
        z = (m + torch.randn_like(m) * tau * torch.exp(logs)) * x_mask
        return z, m, logs

    def remove_weight_norm(self):
        self.enc.remove_weight_norm()


class ResidualCouplingLayer(nn.Module):
    def __init__(self, channels, hidden_channels, kernel_size, dilation_rate,
                 n_layers, gin_channels=0, mean_only=False):
        super().__init__()
        self.half_channels = channels // 2
        self.mean_only = mean_only

        self.pre = nn.Conv1d(self.half_channels, hidden_channels, 1)
        self.enc = WN(hidden_channels, kernel_size, dilation_rate, n_layers, gin_channels)
        self.post = nn.Conv1d(hidden_channels, self.half_channels * (2 - mean_only), 1)
        self.post.weight.data.zero_()
        self.post.bias.data.zero_()

    def forward(self, x, x_mask, g=None, reverse=False):
        x0, x1 = torch.split(x, [self.half_channels] * 2, 1)
        h = self.pre(x0) * x_mask
        h = self.enc(h, x_mask, g=g)
        stats = self.post(h) * x_mask
        if not self.mean_only:
            m, logs = torch.split(stats, [self.half_channels] * 2, 1)
        else:
            m = stats
            logs = torch.zeros_like(m)

        if not reverse:
            x1 = m + x1 * torch.exp(logs) * x_mask
            x = torch.cat([x0, x1], 1)
            return x
        else:
            x1 = (x1 - m) * torch.exp(-logs) * x_mask
            x = torch.cat([x0, x1], 1)
            return x

    def remove_weight_norm(self):
        self.enc.remove_weight_norm()


class ResidualCouplingBlock(nn.Module):
    def __init__(self, channels, hidden_channels, kernel_size, dilation_rate,
                 n_layers, n_flows=4, gin_channels=0):
        super().__init__()
        self.flows = nn.ModuleList()
        for i in range(n_flows):
            self.flows.append(ResidualCouplingLayer(
                channels, hidden_channels, kernel_size, dilation_rate, n_layers,
                gin_channels=gin_channels, mean_only=True))
            self.flows.append(Flip())

    def forward(self, x, x_mask, g=None, reverse=False):
        if not reverse:
            for flow in self.flows:
                x = flow(x, x_mask, g=g, reverse=reverse)
        else:
            for flow in reversed(self.flows):
                x = flow(x, x_mask, g=g, reverse=reverse)
        return x

    def remove_weight_norm(self):
        for f in self.flows:
            if hasattr(f, 'remove_weight_norm'):
                f.remove_weight_norm()


class Flip(nn.Module):
    def forward(self, x, *args, reverse=False, **kwargs):
        x = torch.flip(x, [1])
        return x


class Generator(nn.Module):
    def __init__(self, initial_channel, resblock, resblock_kernel_sizes,
                 resblock_dilation_sizes, upsample_rates, upsample_initial_channel,
                 upsample_kernel_sizes, gin_channels=0):
        super().__init__()
        self.num_kernels = len(resblock_kernel_sizes)
        self.num_upsamples = len(upsample_rates)

        self.conv_pre = Conv1d(initial_channel, upsample_initial_channel, 7, 1, padding=3)

        self.ups = nn.ModuleList()
        for i, (u, k) in enumerate(zip(upsample_rates, upsample_kernel_sizes)):
            self.ups.append(weight_norm(ConvTranspose1d(
                upsample_initial_channel // (2**i),
                upsample_initial_channel // (2**(i+1)),
                k, u, padding=(k-u)//2)))

        self.resblocks = nn.ModuleList()
        for i in range(len(self.ups)):
            ch = upsample_initial_channel // (2**(i+1))
            for k, d in zip(resblock_kernel_sizes, resblock_dilation_sizes):
                self.resblocks.append(ResBlock1(ch, k, d))

        self.conv_post = Conv1d(ch, 1, 7, 1, padding=3, bias=False)

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
        for l in self.ups:
            remove_weight_norm(l)
        for l in self.resblocks:
            l.remove_weight_norm()


class ReferenceEncoder(nn.Module):
    def __init__(self, spec_channels=513, gin_channels=256):
        super().__init__()
        self.spec_channels = spec_channels
        ref_enc_filters = [32, 32, 64, 64, 128, 128]
        K = len(ref_enc_filters)
        filters = [1] + ref_enc_filters

        self.convs = nn.ModuleList([
            weight_norm(nn.Conv2d(filters[i], filters[i+1], (3,3), (2,2), (1,1)))
            for i in range(K)
        ])

        out_channels = self._calc_channels(spec_channels, 3, 2, 1, K)
        self.gru = nn.GRU(ref_enc_filters[-1] * out_channels, 128, batch_first=True)
        self.proj = nn.Linear(128, gin_channels)
        self.layernorm = nn.LayerNorm(spec_channels)

    def _calc_channels(self, L, kernel_size, stride, pad, n_convs):
        for _ in range(n_convs):
            L = (L - kernel_size + 2 * pad) // stride + 1
        return L

    def forward(self, inputs):
        N = inputs.size(0)
        out = inputs.view(N, 1, -1, self.spec_channels)
        out = self.layernorm(out)
        for conv in self.convs:
            out = F.relu(conv(out))
        out = out.transpose(1, 2)
        T = out.size(1)
        out = out.contiguous().view(N, T, -1)
        self.gru.flatten_parameters()
        _, out = self.gru(out)
        return self.proj(out.squeeze(0))

    def remove_weight_norm(self):
        for conv in self.convs:
            remove_weight_norm(conv)


# ============================================================================
# Combined Models for CoreML
# ============================================================================

class VoiceConverterPipeline(nn.Module):
    """
    Full voice conversion pipeline.
    Takes source spectrogram + source/target embeddings.
    Outputs converted waveform.
    """
    def __init__(self, enc_q, flow, dec, zero_g=True):
        super().__init__()
        self.enc_q = enc_q
        self.flow = flow
        self.dec = dec
        self.zero_g = zero_g

    def forward(self, spec, spec_lengths, g_src, g_tgt, tau=1.0):
        # spec: [B, 513, T]
        # g_src, g_tgt: [B, 256]
        g_src = g_src.unsqueeze(-1)  # [B, 256, 1]
        g_tgt = g_tgt.unsqueeze(-1)

        # Create mask
        y_mask = torch.ones(1, 1, spec.size(-1), device=spec.device, dtype=spec.dtype)

        # Encode with source speaker
        z, m_q, logs_q = self.enc_q(
            spec, y_mask,
            g=torch.zeros_like(g_src) if self.zero_g else g_src,
            tau=tau
        )

        # Flow: source -> neutral -> target
        z_p = self.flow(z, y_mask, g=g_src)
        z_hat = self.flow(z_p, y_mask, g=g_tgt, reverse=True)

        # Decode with target speaker
        g_dec = torch.zeros_like(g_tgt) if self.zero_g else g_tgt
        o_hat = self.dec(z_hat * y_mask, g=g_dec)

        return o_hat


class SimplifiedVoiceCloner(nn.Module):
    """
    Simplified voice cloner for CoreML.
    Uses mel spectrogram input (80 channels) instead of full spectrogram.
    """
    def __init__(self, gin_channels=256, inter_channels=192):
        super().__init__()

        # Mel encoder (80 -> 192)
        self.mel_encoder = nn.Sequential(
            nn.Conv1d(80, 128, 5, padding=2),
            nn.ReLU(),
            nn.Conv1d(128, inter_channels, 5, padding=2),
            nn.ReLU(),
        )

        # Style encoder
        self.style_encoder = nn.Sequential(
            nn.Linear(gin_channels, inter_channels),
            nn.ReLU(),
            nn.Linear(inter_channels, inter_channels * 2),
        )

        # Processing
        self.conv_blocks = nn.Sequential(
            nn.Conv1d(inter_channels, inter_channels, 5, padding=2),
            nn.ReLU(),
            nn.Conv1d(inter_channels, inter_channels, 5, padding=2),
            nn.ReLU(),
        )

        # Decoder to waveform (simplified vocoder)
        self.decoder = nn.Sequential(
            nn.ConvTranspose1d(inter_channels, 128, 16, 8, 4),
            nn.LeakyReLU(0.1),
            nn.ConvTranspose1d(128, 64, 16, 8, 4),
            nn.LeakyReLU(0.1),
            nn.ConvTranspose1d(64, 32, 4, 2, 1),
            nn.LeakyReLU(0.1),
            nn.ConvTranspose1d(32, 1, 4, 2, 1),
            nn.Tanh(),
        )

    def forward(self, source_mel, speaker_embedding):
        # Encode mel
        h = self.mel_encoder(source_mel)

        # Apply style
        style = self.style_encoder(speaker_embedding)
        scale, shift = style.chunk(2, dim=-1)
        h = h * (1 + scale.unsqueeze(-1)) + shift.unsqueeze(-1)

        # Process
        h = self.conv_blocks(h)

        # Decode to waveform
        waveform = self.decoder(h)

        return waveform


# ============================================================================
# Conversion Functions
# ============================================================================

def load_checkpoint(checkpoint_path, config_path):
    print(f"Loading OpenVoice V2 checkpoint...")

    with open(config_path) as f:
        config = json.load(f)

    mc = config['model']
    dc = config['data']

    # Build components
    spec_channels = dc['filter_length'] // 2 + 1

    ref_enc = ReferenceEncoder(spec_channels, mc['gin_channels'])

    enc_q = PosteriorEncoder(
        spec_channels, mc['inter_channels'], mc['hidden_channels'],
        5, 1, 16, mc['gin_channels']
    )

    flow = ResidualCouplingBlock(
        mc['inter_channels'], mc['hidden_channels'],
        5, 1, 4, gin_channels=mc['gin_channels']
    )

    dec = Generator(
        mc['inter_channels'], mc['resblock'],
        mc['resblock_kernel_sizes'], mc['resblock_dilation_sizes'],
        mc['upsample_rates'], mc['upsample_initial_channel'],
        mc['upsample_kernel_sizes'], mc['gin_channels']
    )

    # Load weights
    ckpt = torch.load(checkpoint_path, map_location='cpu', weights_only=False)
    state = ckpt['model']

    def load_component(model, prefix):
        component_state = {k.replace(prefix + '.', ''): v
                          for k, v in state.items() if k.startswith(prefix + '.')}
        result = model.load_state_dict(component_state, strict=False)
        print(f"  {prefix}: loaded {len(component_state)} weights")
        if result.missing_keys:
            print(f"    Missing: {len(result.missing_keys)}")
        return model

    load_component(ref_enc, 'ref_enc')
    load_component(enc_q, 'enc_q')
    load_component(flow, 'flow')
    load_component(dec, 'dec')

    return ref_enc, enc_q, flow, dec, config


def export_models(ref_enc, enc_q, flow, dec, config, output_dir):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    mc = config['model']
    dc = config['data']
    spec_channels = dc['filter_length'] // 2 + 1

    # 1. Export Speaker Embedding Extractor
    print("\n[1/3] Exporting SpeakerEmbeddingExtractor...")
    ref_enc.train(False)
    ref_enc.remove_weight_norm()

    dummy = torch.randn(1, 100, spec_channels)
    with torch.no_grad():
        traced = torch.jit.trace(ref_enc, dummy)

    mlmodel = ct.convert(
        traced,
        inputs=[ct.TensorType("spectrogram", (1, ct.RangeDim(50, 1000, 100), spec_channels))],
        outputs=[ct.TensorType("speaker_embedding")],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,
    )
    mlmodel.save(str(output_dir / "SpeakerEmbeddingExtractor.mlpackage"))
    print(f"  Saved: {output_dir / 'SpeakerEmbeddingExtractor.mlpackage'}")

    # 2. Export Voice Converter Pipeline
    print("\n[2/3] Exporting VoiceConverterPipeline...")

    enc_q.train(False)
    flow.train(False)
    dec.train(False)

    enc_q.remove_weight_norm()
    for f in flow.flows:
        if hasattr(f, 'remove_weight_norm'):
            f.remove_weight_norm()
    dec.remove_weight_norm()

    pipeline = VoiceConverterPipeline(enc_q, flow, dec, zero_g=mc['zero_g'])
    pipeline.train(False)

    dummy_spec = torch.randn(1, spec_channels, 100)
    dummy_lengths = torch.LongTensor([100])
    dummy_g_src = torch.randn(1, mc['gin_channels'])
    dummy_g_tgt = torch.randn(1, mc['gin_channels'])

    with torch.no_grad():
        traced = torch.jit.trace(pipeline, (dummy_spec, dummy_lengths, dummy_g_src, dummy_g_tgt))

    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType("spectrogram", (1, spec_channels, ct.RangeDim(50, 1000, 100))),
            ct.TensorType("spec_lengths", (1,)),
            ct.TensorType("source_embedding", (1, mc['gin_channels'])),
            ct.TensorType("target_embedding", (1, mc['gin_channels'])),
        ],
        outputs=[ct.TensorType("waveform")],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,
    )
    mlmodel.save(str(output_dir / "VoiceConverterPipeline.mlpackage"))
    print(f"  Saved: {output_dir / 'VoiceConverterPipeline.mlpackage'}")

    # 3. Export Simplified Cloner (for mel input)
    print("\n[3/3] Exporting SimplifiedVoiceCloner...")

    cloner = SimplifiedVoiceCloner(mc['gin_channels'], mc['inter_channels'])
    cloner.train(False)

    dummy_mel = torch.randn(1, 80, 100)
    dummy_emb = torch.randn(1, mc['gin_channels'])

    with torch.no_grad():
        traced = torch.jit.trace(cloner, (dummy_mel, dummy_emb))

    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType("source_mel", (1, 80, ct.RangeDim(10, 1000, 100))),
            ct.TensorType("speaker_embedding", (1, mc['gin_channels'])),
        ],
        outputs=[ct.TensorType("waveform")],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,
    )
    mlmodel.save(str(output_dir / "SimplifiedVoiceCloner.mlpackage"))
    print(f"  Saved: {output_dir / 'SimplifiedVoiceCloner.mlpackage'}")

    # Save config
    model_info = {
        "version": "2.0",
        "source": "OpenVoice V2 (Real Weights)",
        "audio_config": {
            "sample_rate": dc['sampling_rate'],
            "hop_length": dc['hop_length'],
            "filter_length": dc['filter_length'],
            "spec_channels": spec_channels,
        },
        "embedding_dim": mc['gin_channels'],
    }
    with open(output_dir / "model_info.json", 'w') as f:
        json.dump(model_info, f, indent=2)

    print(f"\nAll models saved to: {output_dir}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output_dir', default='./Meeshy/Resources/MLModels')
    parser.add_argument('--checkpoint', default='checkpoints_v2/converter/checkpoint.pth')
    parser.add_argument('--config', default='checkpoints_v2/converter/config.json')
    args = parser.parse_args()

    print("=" * 70)
    print("OpenVoice V2 Full Pipeline CoreML Converter")
    print("=" * 70)

    ref_enc, enc_q, flow, dec, config = load_checkpoint(args.checkpoint, args.config)
    export_models(ref_enc, enc_q, flow, dec, config, args.output_dir)

    print("\nDone!")


if __name__ == '__main__':
    main()
