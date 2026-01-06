#!/usr/bin/env python3
"""
Convert OpenVoice V2 to CoreML with ALL WN modules patched.
Patches commons.fused_add_tanh_sigmoid_multiply at import time.
"""

import torch
import torch.nn as nn
import coremltools as ct
import numpy as np
import os
import sys
import json

FIXED_FRAMES = 512
SPEC_CHANNELS = 513  
EMBEDDING_DIM = 256

OPENVOICE_PATH = os.path.expanduser("~/OpenVoice")
sys.path.insert(0, OPENVOICE_PATH)

# Patch commons BEFORE importing models
import openvoice.commons as commons

# Store original function
_original_fused = commons.fused_add_tanh_sigmoid_multiply

def patched_fused_add_tanh_sigmoid_multiply(input_a, input_b, n_channels):
    """Patched version that handles both tensor and int n_channels."""
    if isinstance(n_channels, torch.Tensor):
        n_ch = n_channels.item()  # Extract scalar value
    else:
        n_ch = int(n_channels)
    
    in_act = input_a + input_b
    t_act = torch.tanh(in_act[:, :n_ch, :])
    s_act = torch.sigmoid(in_act[:, n_ch:, :])
    return t_act * s_act

# Apply patch
commons.fused_add_tanh_sigmoid_multiply = patched_fused_add_tanh_sigmoid_multiply

# Also patch attentions module
import openvoice.attentions as attentions
attentions.fused_add_tanh_sigmoid_multiply = patched_fused_add_tanh_sigmoid_multiply

# Also patch modules.py WN to not create IntTensor at all
import openvoice.modules as modules

class WNPatched(modules.WN):
    """Patched WN that uses int directly."""
    
    def forward(self, x, x_mask, g=None, **kwargs):
        output = torch.zeros_like(x)
        # Use int directly instead of IntTensor
        n_ch = self.hidden_channels
        
        if g is not None:
            g = self.cond_layer(g)
        
        for i in range(self.n_layers):
            x_in = self.in_layers[i](x)
            if g is not None:
                cond_offset = i * 2 * self.hidden_channels
                g_l = g[:, cond_offset : cond_offset + 2 * self.hidden_channels, :]
            else:
                g_l = torch.zeros_like(x_in)
            
            # Use patched function with int
            acts = patched_fused_add_tanh_sigmoid_multiply(x_in, g_l, n_ch)
            acts = self.drop(acts)
            
            res_skip_acts = self.res_skip_layers[i](acts)
            if i < self.n_layers - 1:
                res_acts = res_skip_acts[:, :self.hidden_channels, :]
                x = (x + res_acts) * x_mask
                output = output + res_skip_acts[:, self.hidden_channels:, :]
            else:
                output = output + res_skip_acts
        return output * x_mask

# Store original WN class
_original_WN = modules.WN

# Replace WN class in modules
modules.WN = WNPatched


class HParams:
    def __init__(self, d):
        for k, v in d.items():
            setattr(self, k, HParams(v) if isinstance(v, dict) else v)


def load_config(path):
    with open(path) as f:
        return HParams(json.load(f))


class VoiceConverterWrapper(nn.Module):
    """Simple wrapper."""
    
    def __init__(self, model):
        super().__init__()
        self.enc_q = model.enc_q
        self.flow = model.flow
        self.dec = model.dec
    
    def forward(self, spec, g_src, g_tgt):
        B, C, T = spec.shape
        mask = torch.ones(B, 1, T, dtype=spec.dtype, device=spec.device)
        spec_len = torch.tensor([T], dtype=torch.long)
        
        # zero_g=True means use zeros for conditioning
        zero_g = torch.zeros_like(g_src)
        
        # enc_q with tau=1.0
        z, m, logs, y_mask = self.enc_q(spec, spec_len, g=zero_g, tau=1.0)
        
        # Flow forward and reverse
        z_p = self.flow(z, mask, g=g_src)
        z_hat = self.flow(z_p, mask, g=g_tgt, reverse=True)
        
        # Decoder
        o = self.dec(z_hat * mask, g=zero_g)
        
        return o


def patch_all_wn_modules(model, hidden_channels):
    """Recursively patch all WN modules in the model."""
    for name, module in model.named_modules():
        if isinstance(module, _original_WN):
            # The module is already using our patched class due to monkey-patching
            print(f"  Found WN at: {name}")


def main():
    print("=" * 60)
    print("OpenVoice V2 -> CoreML (Full Patch)")
    print("=" * 60)

    # Now import models (will use patched WN)
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

    print("\nLoading model (with patched modules)...")
    model = SynthesizerTrn(n_vocab=0, n_speakers=0, **model_params)
    
    print("\nChecking WN modules:")
    patch_all_wn_modules(model, hidden_channels)
    
    ckpt = torch.load(model_path, map_location='cpu')
    model.load_state_dict(ckpt['model'], strict=False)
    model.train(False)

    print("\nCreating wrapper...")
    wrapper = VoiceConverterWrapper(model)
    wrapper.train(False)

    print("\nTesting forward pass...")
    spec = torch.randn(1, SPEC_CHANNELS, FIXED_FRAMES)
    g_src = torch.randn(1, EMBEDDING_DIM, 1)
    g_tgt = torch.randn(1, EMBEDDING_DIM, 1)
    
    with torch.no_grad():
        out = wrapper(spec, g_src, g_tgt)
        print(f"  Output shape: {out.shape}")

    print("\nTracing model...")
    with torch.no_grad():
        traced = torch.jit.trace(wrapper, (spec, g_src, g_tgt), strict=False)

    print("\nConverting to CoreML...")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "Meeshy/Resources/MLModels/VoiceConverterPipeline.mlpackage")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    if os.path.exists(output_path):
        import shutil
        backup = output_path.replace(".mlpackage", "_backup.mlpackage")
        if os.path.exists(backup):
            shutil.rmtree(backup)
        shutil.move(output_path, backup)

    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType(name="spectrogram", shape=(1, SPEC_CHANNELS, FIXED_FRAMES)),
            ct.TensorType(name="source_embedding", shape=(1, EMBEDDING_DIM, 1)),
            ct.TensorType(name="target_embedding", shape=(1, EMBEDDING_DIM, 1)),
        ],
        outputs=[ct.TensorType(name="waveform")],
        minimum_deployment_target=ct.target.iOS16,
        convert_to="mlprogram",
        compute_precision=ct.precision.FLOAT16,
    )

    mlmodel.author = "OpenVoice V2 Fixed"
    mlmodel.version = "2.0-fixed512"
    mlmodel.user_defined_metadata["fixed_frames"] = str(FIXED_FRAMES)
    mlmodel.user_defined_metadata["embedding_shape"] = "[1, 256, 1]"

    print(f"\nSaving: {output_path}")
    mlmodel.save(output_path)

    # Verify
    spec = mlmodel.get_spec()
    print("\nInputs:")
    for inp in spec.description.input:
        print(f"  {inp.name}: {list(inp.type.multiArrayType.shape)}")

    print("\nDONE!")


if __name__ == "__main__":
    main()
