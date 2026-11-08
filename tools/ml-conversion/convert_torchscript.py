#!/usr/bin/env python3
"""
Convert OpenVoice V2 to CoreML using TorchScript save/load.
Avoids dynamic operations by simplifying the pipeline.
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


class HParams:
    def __init__(self, d):
        for k, v in d.items():
            setattr(self, k, HParams(v) if isinstance(v, dict) else v)


def load_config(path):
    with open(path) as f:
        return HParams(json.load(f))


class SimplifiedVoiceConverter(nn.Module):
    """Simplified converter that avoids dynamic shape operations."""
    
    def __init__(self, enc_q, flow, dec):
        super().__init__()
        # Copy submodules
        self.enc_pre = enc_q.pre
        self.enc_wn = enc_q.enc  
        self.enc_proj = enc_q.proj
        self.out_channels = enc_q.out_channels
        
        self.flow = flow
        self.dec = dec
        
    def forward(self, spec, g_src, g_tgt):
        """
        spec: [1, 513, 512] - spectrogram
        g_src: [1, 256, 1] - source embedding  
        g_tgt: [1, 256, 1] - target embedding
        """
        # Fixed mask - all ones
        B, C, T = spec.shape
        mask = torch.ones(B, 1, T, dtype=spec.dtype, device=spec.device)
        
        # Posterior encoder
        x = self.enc_pre(spec) * mask
        x = self.enc_wn(x, mask, g=torch.zeros_like(g_src))  # zero_g=True
        stats = self.enc_proj(x) * mask
        m, logs = torch.split(stats, self.out_channels, dim=1)
        z = m * mask  # No sampling for inference
        
        # Flow
        z_p = self.flow(z, mask, g=g_src)
        z_hat = self.flow(z_p, mask, g=g_tgt, reverse=True)
        
        # Decoder
        o = self.dec(z_hat * mask, g=torch.zeros_like(g_tgt))  # zero_g=True
        
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

    print("Loading model...")
    model = SynthesizerTrn(n_vocab=0, n_speakers=0, **model_params)
    ckpt = torch.load(model_path, map_location='cpu')
    model.load_state_dict(ckpt['model'], strict=False)
    model.train(False)

    # Create simplified wrapper
    print("Creating simplified wrapper...")
    wrapper = SimplifiedVoiceConverter(model.enc_q, model.flow, model.dec)
    wrapper.train(False)

    # Test
    print("\nTesting forward pass...")
    spec = torch.randn(1, SPEC_CHANNELS, FIXED_FRAMES)
    g_src = torch.randn(1, EMBEDDING_DIM, 1)
    g_tgt = torch.randn(1, EMBEDDING_DIM, 1)
    
    with torch.no_grad():
        out = wrapper(spec, g_src, g_tgt)
        print(f"  Output shape: {out.shape}")

    # Trace with strict=False to handle some dynamic ops
    print("\nTracing model...")
    with torch.no_grad():
        traced = torch.jit.trace(wrapper, (spec, g_src, g_tgt), strict=False)

    # Save TorchScript
    script_dir = os.path.dirname(os.path.abspath(__file__))
    ts_path = os.path.join(script_dir, "temp_vc.pt")
    traced.save(ts_path)
    print(f"Saved TorchScript: {ts_path}")

    # Convert to CoreML
    print("\nConverting to CoreML...")
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

    print(f"Saving: {output_path}")
    mlmodel.save(output_path)

    # Cleanup
    os.remove(ts_path)

    print("\nDONE!")


if __name__ == "__main__":
    main()
