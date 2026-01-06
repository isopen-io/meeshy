#!/usr/bin/env python3
"""
Compare Python and CoreML outputs to identify where the discrepancy is.
"""

import torch
import torch.nn as nn
import numpy as np
import os
import sys
import json
import soundfile as sf
import librosa
import coremltools as ct
from typing import Optional
import types

FIXED_FRAMES = 512
SPEC_CHANNELS = 513
EMBEDDING_DIM = 256

OPENVOICE_PATH = os.path.expanduser("~/OpenVoice")
sys.path.insert(0, OPENVOICE_PATH)


class HParams:
    def __init__(self, d):
        for k, v in d.items():
            setattr(self, k, HParams(v) if isinstance(v, dict) else v)


def load_config(path):
    with open(path) as f:
        return HParams(json.load(f))


def patched_wn_forward(self, x: torch.Tensor, x_mask: torch.Tensor, g: Optional[torch.Tensor] = None, **kwargs) -> torch.Tensor:
    """Patched WN forward that uses int directly instead of IntTensor."""
    output = torch.zeros_like(x)
    n_ch: int = self.hidden_channels

    if g is not None:
        g = self.cond_layer(g)

    for i in range(self.n_layers):
        x_in = self.in_layers[i](x)
        if g is not None:
            cond_offset = i * 2 * self.hidden_channels
            g_l = g[:, cond_offset : cond_offset + 2 * self.hidden_channels, :]
        else:
            g_l = torch.zeros_like(x_in)

        in_act = x_in + g_l
        t_act = torch.tanh(in_act[:, :n_ch, :])
        s_act = torch.sigmoid(in_act[:, n_ch:, :])
        acts = t_act * s_act

        acts = self.drop(acts)

        res_skip_acts = self.res_skip_layers[i](acts)
        if i < self.n_layers - 1:
            res_acts = res_skip_acts[:, :self.hidden_channels, :]
            x = (x + res_acts) * x_mask
            output = output + res_skip_acts[:, self.hidden_channels:, :]
        else:
            output = output + res_skip_acts
    return output * x_mask


def patch_all_wn_instances(model):
    """Recursively patch all WN module instances."""
    from openvoice.modules import WN

    patched_count = 0
    for name, module in model.named_modules():
        if isinstance(module, WN):
            module.forward = types.MethodType(patched_wn_forward, module)
            patched_count += 1

    return patched_count


# Import the split model classes from convert_deterministic.py
class DeterministicEncoder(nn.Module):
    """Deterministic encoder that uses mean only (no random sampling)."""

    def __init__(self, enc_q):
        super().__init__()
        self.pre = enc_q.pre
        self.enc = enc_q.enc
        self.proj = enc_q.proj
        self.out_channels = enc_q.out_channels

    def forward(self, x: torch.Tensor, x_mask: torch.Tensor, g: torch.Tensor) -> torch.Tensor:
        x = self.pre(x) * x_mask
        x = self.enc(x, x_mask, g=g)
        stats = self.proj(x) * x_mask
        m, logs = torch.split(stats, self.out_channels, dim=1)
        return m * x_mask


class FlowForward(nn.Module):
    """Flow network with reverse=False hardcoded."""

    def __init__(self, flow):
        super().__init__()
        self.flows = flow.flows

    def forward(self, x: torch.Tensor, x_mask: torch.Tensor, g: torch.Tensor) -> torch.Tensor:
        for flow in self.flows:
            x, _ = flow(x, x_mask, g=g, reverse=False)
        return x


class FlowReverse(nn.Module):
    """Flow network with reverse=True hardcoded."""

    def __init__(self, flow):
        super().__init__()
        self.flows = nn.ModuleList(list(reversed(list(flow.flows))))

    def forward(self, x: torch.Tensor, x_mask: torch.Tensor, g: torch.Tensor) -> torch.Tensor:
        for flow in self.flows:
            x = flow(x, x_mask, g=g, reverse=True)
        return x


class VoiceConverterForward(nn.Module):
    """Forward pass: spec + g_src -> z_p"""

    def __init__(self, model):
        super().__init__()
        self.encoder = DeterministicEncoder(model.enc_q)
        self.flow = FlowForward(model.flow)

    def forward(self, spec: torch.Tensor, g_src: torch.Tensor) -> torch.Tensor:
        B, C, T = spec.shape
        mask = torch.ones(B, 1, T, dtype=spec.dtype, device=spec.device)
        zero_g = torch.zeros_like(g_src)

        z = self.encoder(spec, mask, zero_g)
        z_p = self.flow(z, mask, g_src)

        return z_p


class VoiceConverterReverse(nn.Module):
    """Reverse pass: z_p + g_tgt -> audio"""

    def __init__(self, model):
        super().__init__()
        self.flow = FlowReverse(model.flow)
        self.dec = model.dec

    def forward(self, z_p: torch.Tensor, g_tgt: torch.Tensor) -> torch.Tensor:
        B, C, T = z_p.shape
        mask = torch.ones(B, 1, T, dtype=z_p.dtype, device=z_p.device)
        zero_g = torch.zeros_like(g_tgt)

        z_hat = self.flow(z_p, mask, g_tgt)
        o = self.dec(z_hat * mask, g=zero_g)

        return o


def compute_spectrogram_python(audio: np.ndarray, sr: int = 22050, n_fft: int = 1024, hop_length: int = 256) -> np.ndarray:
    """Compute spectrogram exactly as OpenVoice does."""
    # OpenVoice uses librosa STFT with magnitude spectrogram
    stft = librosa.stft(audio, n_fft=n_fft, hop_length=hop_length, win_length=n_fft, center=True, pad_mode='reflect')
    spec = np.abs(stft)
    return spec


def main():
    print("=" * 60)
    print("Python vs CoreML Comparison")
    print("=" * 60)

    from openvoice.models import SynthesizerTrn

    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Load the Python model
    ckpt_dir = os.path.join(OPENVOICE_PATH, "checkpoints_v2/converter")
    config_path = os.path.join(ckpt_dir, "config.json")
    model_path = os.path.join(ckpt_dir, "checkpoint.pth")

    hps = load_config(config_path)

    model_params = {
        'spec_channels': hps.data.filter_length // 2 + 1,
        'segment_size': 32,
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
        'zero_g': hps.model.zero_g,
    }

    print("\n📦 Loading Python model...")
    model = SynthesizerTrn(n_vocab=0, n_speakers=0, **model_params)
    patch_all_wn_instances(model)
    ckpt = torch.load(model_path, map_location='cpu')
    model.load_state_dict(ckpt['model'], strict=False)
    model.train(False)

    # Create wrapper models
    forward_wrapper = VoiceConverterForward(model)
    forward_wrapper.train(False)
    reverse_wrapper = VoiceConverterReverse(model)
    reverse_wrapper.train(False)

    # Load audio
    audio_path = os.path.join(script_dir, "real_speech.wav")
    print(f"\n🎤 Loading audio: {audio_path}")
    audio, sr = librosa.load(audio_path, sr=22050)
    print(f"   Duration: {len(audio)/sr:.2f}s, samples: {len(audio)}")

    # Compute spectrogram
    print("\n📊 Computing spectrogram (Python method)...")
    spec = compute_spectrogram_python(audio, sr=22050, n_fft=1024, hop_length=256)
    print(f"   Raw spec shape: {spec.shape}")
    print(f"   Raw spec stats: min={spec.min():.4f}, max={spec.max():.4f}, mean={spec.mean():.4f}")

    # Pad/truncate to fixed frames
    if spec.shape[1] < FIXED_FRAMES:
        pad_width = FIXED_FRAMES - spec.shape[1]
        spec = np.pad(spec, ((0, 0), (0, pad_width)), mode='constant', constant_values=0)
    else:
        spec = spec[:, :FIXED_FRAMES]

    print(f"   Padded spec shape: {spec.shape}")

    # Convert to tensor
    spec_tensor = torch.FloatTensor(spec).unsqueeze(0)  # [1, 513, 512]
    print(f"   Tensor shape: {spec_tensor.shape}")

    # Create embeddings (using fixed values for reproducibility)
    torch.manual_seed(42)
    g_src = torch.randn(1, EMBEDDING_DIM, 1)
    g_tgt = torch.randn(1, EMBEDDING_DIM, 1)

    print(f"\n   Source embedding: min={g_src.min():.3f}, max={g_src.max():.3f}, norm={torch.norm(g_src):.3f}")
    print(f"   Target embedding: min={g_tgt.min():.3f}, max={g_tgt.max():.3f}, norm={torch.norm(g_tgt):.3f}")

    # Run Python model
    print("\n🔄 Running Python model...")
    with torch.no_grad():
        z_p_python = forward_wrapper(spec_tensor, g_src)
        audio_python = reverse_wrapper(z_p_python, g_tgt)

    print(f"   z_p shape: {z_p_python.shape}")
    print(f"   z_p stats: min={z_p_python.min():.4f}, max={z_p_python.max():.4f}, mean={z_p_python.mean():.4f}")
    print(f"   Output shape: {audio_python.shape}")
    print(f"   Output stats: min={audio_python.min():.4f}, max={audio_python.max():.4f}")

    # Save Python output
    audio_np = audio_python.squeeze().numpy()
    sf.write(os.path.join(script_dir, "python_output.wav"), audio_np, 22050)
    print(f"   Saved: python_output.wav")

    # Load CoreML models
    print("\n📦 Loading CoreML models...")
    forward_coreml_path = os.path.join(script_dir, "../Meeshy/Resources/MLModels/VoiceConverterForward.mlpackage")
    reverse_coreml_path = os.path.join(script_dir, "../Meeshy/Resources/MLModels/VoiceConverterReverse.mlpackage")

    if not os.path.exists(forward_coreml_path):
        print(f"   ❌ Forward model not found: {forward_coreml_path}")
        return

    if not os.path.exists(reverse_coreml_path):
        print(f"   ❌ Reverse model not found: {reverse_coreml_path}")
        return

    forward_coreml = ct.models.MLModel(forward_coreml_path)
    reverse_coreml = ct.models.MLModel(reverse_coreml_path)
    print("   ✅ Loaded both CoreML models")

    # Run CoreML models
    print("\n🔄 Running CoreML model...")
    spec_np = spec_tensor.numpy().astype(np.float32)
    g_src_np = g_src.numpy().astype(np.float32)
    g_tgt_np = g_tgt.numpy().astype(np.float32)

    forward_output = forward_coreml.predict({
        "spectrogram": spec_np,
        "source_embedding": g_src_np
    })
    z_p_coreml = forward_output["z_p"]

    print(f"   z_p shape: {z_p_coreml.shape}")
    print(f"   z_p stats: min={z_p_coreml.min():.4f}, max={z_p_coreml.max():.4f}, mean={z_p_coreml.mean():.4f}")

    reverse_output = reverse_coreml.predict({
        "z_p": z_p_coreml,
        "target_embedding": g_tgt_np
    })
    audio_coreml = reverse_output["waveform"]

    print(f"   Output shape: {audio_coreml.shape}")
    print(f"   Output stats: min={audio_coreml.min():.4f}, max={audio_coreml.max():.4f}")

    # Save CoreML output
    audio_coreml_np = audio_coreml.squeeze()
    sf.write(os.path.join(script_dir, "coreml_output.wav"), audio_coreml_np, 22050)
    print(f"   Saved: coreml_output.wav")

    # Compare outputs
    print("\n" + "=" * 60)
    print("COMPARISON")
    print("=" * 60)

    z_p_python_np = z_p_python.numpy()
    z_p_diff = np.abs(z_p_python_np - z_p_coreml).max()
    z_p_rel_diff = np.abs(z_p_python_np - z_p_coreml).mean() / np.abs(z_p_python_np).mean() * 100

    print(f"\n   z_p max diff: {z_p_diff:.6f}")
    print(f"   z_p relative diff: {z_p_rel_diff:.2f}%")

    audio_python_np = audio_python.numpy()
    audio_diff = np.abs(audio_python_np - audio_coreml).max()
    audio_rel_diff = np.abs(audio_python_np - audio_coreml).mean() / np.abs(audio_python_np).mean() * 100

    print(f"\n   Audio max diff: {audio_diff:.6f}")
    print(f"   Audio relative diff: {audio_rel_diff:.2f}%")

    # Run Whisper on both outputs
    print("\n" + "=" * 60)
    print("TRANSCRIPTION TEST")
    print("=" * 60)

    try:
        import whisper
        import warnings
        warnings.filterwarnings('ignore')

        whisper_model = whisper.load_model('base')

        print("\n   Python output transcription:")
        result_python = whisper_model.transcribe(os.path.join(script_dir, "python_output.wav"))
        print(f"   '{result_python['text']}'")

        print("\n   CoreML output transcription:")
        result_coreml = whisper_model.transcribe(os.path.join(script_dir, "coreml_output.wav"))
        print(f"   '{result_coreml['text']}'")

    except Exception as e:
        print(f"   ⚠️ Whisper transcription failed: {e}")

    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)


if __name__ == "__main__":
    main()
