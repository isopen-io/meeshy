#!/usr/bin/env python3
"""
Convert OpenVoice V2 to CoreML using torch.jit.script.
Handles control flow properly (if not reverse: in Flow module).
"""

import torch
import torch.nn as nn
import coremltools as ct
import numpy as np
import os
import sys
import json
import types
from typing import Optional, Tuple

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

        # Inline fused_add_tanh_sigmoid_multiply with int
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
            print(f"  Patched: {name}")

    return patched_count


class VoiceConverterForward(nn.Module):
    """Wrapper for voice conversion forward pass (g_src -> z_p)."""

    def __init__(self, model):
        super().__init__()
        self.enc_q = model.enc_q
        self.flow = model.flow

    def forward(self, spec: torch.Tensor, g_src: torch.Tensor) -> torch.Tensor:
        B, C, T = spec.shape
        mask = torch.ones(B, 1, T, dtype=spec.dtype, device=spec.device)
        spec_len = torch.tensor([T], dtype=torch.long)

        zero_g = torch.zeros_like(g_src)

        z, m, logs, y_mask = self.enc_q(spec, spec_len, g=zero_g, tau=1.0)
        z_p = self.flow(z, mask, g=g_src, reverse=False)

        return z_p


class VoiceConverterReverse(nn.Module):
    """Wrapper for voice conversion reverse pass (z_p + g_tgt -> audio)."""

    def __init__(self, model):
        super().__init__()
        self.flow = model.flow
        self.dec = model.dec

    def forward(self, z_p: torch.Tensor, g_tgt: torch.Tensor) -> torch.Tensor:
        B = z_p.shape[0]
        T = z_p.shape[2]
        mask = torch.ones(B, 1, T, dtype=z_p.dtype, device=z_p.device)

        zero_g = torch.zeros_like(g_tgt)

        z_hat = self.flow(z_p, mask, g=g_tgt, reverse=True)
        o = self.dec(z_hat * mask, g=zero_g)

        return o


class VoiceConverterCombined(nn.Module):
    """Combined wrapper that handles both forward and reverse passes."""

    def __init__(self, model):
        super().__init__()
        self.enc_q = model.enc_q
        self.flow = model.flow
        self.dec = model.dec

    def forward(self, spec: torch.Tensor, g_src: torch.Tensor, g_tgt: torch.Tensor) -> torch.Tensor:
        B, C, T = spec.shape
        mask = torch.ones(B, 1, T, dtype=spec.dtype, device=spec.device)
        spec_len = torch.tensor([T], dtype=torch.long)

        zero_g = torch.zeros_like(g_src)

        # Encoder
        z, m, logs, y_mask = self.enc_q(spec, spec_len, g=zero_g, tau=1.0)

        # Flow forward (convert source speaker to latent)
        z_p = self.flow(z, mask, g=g_src, reverse=False)

        # Flow reverse (convert latent to target speaker)
        z_hat = self.flow(z_p, mask, g=g_tgt, reverse=True)

        # Decoder
        o = self.dec(z_hat * mask, g=zero_g)

        return o


def main():
    print("=" * 60)
    print("OpenVoice V2 -> CoreML (TorchScript)")
    print("=" * 60)

    from openvoice.models import SynthesizerTrn

    ckpt_dir = os.path.join(OPENVOICE_PATH, "checkpoints_v2/converter")
    config_path = os.path.join(ckpt_dir, "config.json")
    model_path = os.path.join(ckpt_dir, "checkpoint.pth")

    hps = load_config(config_path)
    hidden_channels = hps.model.hidden_channels
    print(f"hidden_channels: {hidden_channels}")

    model_params = {
        'spec_channels': hps.data.filter_length // 2 + 1,
        'segment_size': 32,
        'inter_channels': hps.model.inter_channels,
        'hidden_channels': hidden_channels,
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

    print("\nCreating model...")
    model = SynthesizerTrn(n_vocab=0, n_speakers=0, **model_params)

    print("\nPatching WN instances:")
    count = patch_all_wn_instances(model)
    print(f"Patched {count} WN modules")

    print("\nLoading weights...")
    ckpt = torch.load(model_path, map_location='cpu')
    model.load_state_dict(ckpt['model'], strict=False)
    model.train(False)

    # Try splitting into two models: forward and reverse
    print("\n" + "=" * 60)
    print("APPROACH: Split into Forward + Reverse models")
    print("=" * 60)

    print("\nCreating forward wrapper (enc_q + flow forward)...")
    forward_wrapper = VoiceConverterForward(model)
    forward_wrapper.train(False)

    print("Creating reverse wrapper (flow reverse + dec)...")
    reverse_wrapper = VoiceConverterReverse(model)
    reverse_wrapper.train(False)

    # Test forward pass
    print("\nTesting forward pass...")
    spec = torch.randn(1, SPEC_CHANNELS, FIXED_FRAMES)
    g_src = torch.randn(1, EMBEDDING_DIM, 1)
    g_tgt = torch.randn(1, EMBEDDING_DIM, 1)

    with torch.no_grad():
        z_p = forward_wrapper(spec, g_src)
        print(f"  z_p shape: {z_p.shape}")

        out = reverse_wrapper(z_p, g_tgt)
        print(f"  Output shape: {out.shape}")

    # Trace both models separately
    print("\nTracing forward model...")
    with torch.no_grad():
        traced_forward = torch.jit.trace(forward_wrapper, (spec, g_src), strict=False)

    print("Tracing reverse model...")
    with torch.no_grad():
        traced_reverse = torch.jit.trace(reverse_wrapper, (z_p.detach(), g_tgt), strict=False)

    # Verify traced models produce correct output
    print("\nVerifying traced models...")
    with torch.no_grad():
        z_p_traced = traced_forward(spec, g_src)
        out_traced = traced_reverse(z_p_traced, g_tgt)

        # Compare with untraced
        z_p_orig = forward_wrapper(spec, g_src)
        out_orig = reverse_wrapper(z_p_orig, g_tgt)

        z_p_diff = (z_p_traced - z_p_orig).abs().max().item()
        out_diff = (out_traced - out_orig).abs().max().item()

        print(f"  z_p max diff: {z_p_diff:.6f}")
        print(f"  output max diff: {out_diff:.6f}")

    # Convert to CoreML
    script_dir = os.path.dirname(os.path.abspath(__file__))

    print("\nConverting forward model to CoreML...")
    forward_path = os.path.join(script_dir, "../Meeshy/Resources/MLModels/VoiceConverterForward.mlpackage")
    os.makedirs(os.path.dirname(forward_path), exist_ok=True)

    if os.path.exists(forward_path):
        import shutil
        shutil.rmtree(forward_path)

    forward_ml = ct.convert(
        traced_forward,
        inputs=[
            ct.TensorType(name="spectrogram", shape=(1, SPEC_CHANNELS, FIXED_FRAMES)),
            ct.TensorType(name="source_embedding", shape=(1, EMBEDDING_DIM, 1)),
        ],
        outputs=[ct.TensorType(name="z_p")],
        minimum_deployment_target=ct.target.iOS16,
        convert_to="mlprogram",
        compute_precision=ct.precision.FLOAT16,
    )
    forward_ml.author = "OpenVoice V2"
    forward_ml.version = "2.0"
    forward_ml.save(forward_path)
    print(f"  Saved: {forward_path}")

    print("\nConverting reverse model to CoreML...")
    reverse_path = os.path.join(script_dir, "../Meeshy/Resources/MLModels/VoiceConverterReverse.mlpackage")

    if os.path.exists(reverse_path):
        import shutil
        shutil.rmtree(reverse_path)

    # Get z_p shape from forward output
    z_p_channels = z_p.shape[1]

    reverse_ml = ct.convert(
        traced_reverse,
        inputs=[
            ct.TensorType(name="z_p", shape=(1, z_p_channels, FIXED_FRAMES)),
            ct.TensorType(name="target_embedding", shape=(1, EMBEDDING_DIM, 1)),
        ],
        outputs=[ct.TensorType(name="waveform")],
        minimum_deployment_target=ct.target.iOS16,
        convert_to="mlprogram",
        compute_precision=ct.precision.FLOAT16,
    )
    reverse_ml.author = "OpenVoice V2"
    reverse_ml.version = "2.0"
    reverse_ml.save(reverse_path)
    print(f"  Saved: {reverse_path}")

    # Print model info
    print("\n" + "=" * 60)
    print("MODEL INFO")
    print("=" * 60)

    print("\nForward model inputs:")
    spec = forward_ml.get_spec()
    for inp in spec.description.input:
        shape = list(inp.type.multiArrayType.shape) if inp.type.multiArrayType.shape else "dynamic"
        print(f"  {inp.name}: {shape}")

    print("\nReverse model inputs:")
    spec = reverse_ml.get_spec()
    for inp in spec.description.input:
        shape = list(inp.type.multiArrayType.shape) if inp.type.multiArrayType.shape else "dynamic"
        print(f"  {inp.name}: {shape}")

    print(f"\nz_p channels: {z_p_channels}")

    print("\nDONE!")


if __name__ == "__main__":
    main()
