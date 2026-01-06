#!/usr/bin/env python3
"""
Convert OpenVoice V2 to CoreML via ONNX intermediate.
"""

import torch
import torch.nn as nn
import coremltools as ct
import numpy as np
import os
import sys
import json
from onnxcoreml import convert as onnx_to_coreml

FIXED_FRAMES = 512
SPEC_CHANNELS = 513
EMBEDDING_DIM = 256
SAMPLE_RATE = 22050
HOP_LENGTH = 256

OPENVOICE_PATH = os.path.expanduser("~/OpenVoice")
sys.path.insert(0, OPENVOICE_PATH)


class HParams:
    def __init__(self, data_dict):
        for key, value in data_dict.items():
            if isinstance(value, dict):
                setattr(self, key, HParams(value))
            else:
                setattr(self, key, value)


def load_config(config_path):
    with open(config_path, "r") as f:
        data = json.load(f)
    return HParams(data)


class VoiceConversionFixed(nn.Module):
    def __init__(self, model, zero_g=False):
        super().__init__()
        self.enc_q_pre = model.enc_q.pre
        self.enc_q_enc = model.enc_q.enc
        self.enc_q_proj = model.enc_q.proj
        self.enc_q_out_channels = model.enc_q.out_channels
        self.flow = model.flow
        self.dec = model.dec
        self.zero_g = zero_g

    def forward(self, spectrogram, source_embedding, target_embedding):
        batch_size = spectrogram.size(0)
        seq_len = spectrogram.size(2)
        y_mask = torch.ones(batch_size, 1, seq_len, device=spectrogram.device, dtype=spectrogram.dtype)

        g_src = source_embedding if not self.zero_g else torch.zeros_like(source_embedding)
        g_tgt = target_embedding if not self.zero_g else torch.zeros_like(target_embedding)

        x = self.enc_q_pre(spectrogram) * y_mask
        x = self.enc_q_enc(x, y_mask, g=g_src)
        stats = self.enc_q_proj(x) * y_mask
        m, logs = torch.split(stats, self.enc_q_out_channels, dim=1)
        z = m * y_mask

        z_p = self.flow(z, y_mask, g=g_src)
        z_hat = self.flow(z_p, y_mask, g=g_tgt, reverse=True)
        o_hat = self.dec(z_hat * y_mask, g=g_tgt)

        return o_hat


def load_model():
    from openvoice.models import SynthesizerTrn

    ckpt_dir = os.path.join(OPENVOICE_PATH, "checkpoints_v2/converter")
    config_path = os.path.join(ckpt_dir, "config.json")
    model_path = os.path.join(ckpt_dir, "checkpoint.pth")

    print(f"Loading config: {config_path}")
    hps = load_config(config_path)

    segment_size = 32
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

    if hasattr(hps.model, 'use_sdp'):
        model_params['use_sdp'] = hps.model.use_sdp
    if hasattr(hps.model, 'zero_g'):
        model_params['zero_g'] = hps.model.zero_g

    model = SynthesizerTrn(n_vocab=0, n_speakers=hps.data.n_speakers, **model_params)

    print(f"Loading weights: {model_path}")
    checkpoint = torch.load(model_path, map_location='cpu')
    missing, unexpected = model.load_state_dict(checkpoint['model'], strict=False)
    print(f"  Missing: {len(missing)}, Unexpected: {len(unexpected)}")

    model.train(False)

    zero_g = getattr(hps.model, 'zero_g', False)
    print(f"  zero_g: {zero_g}")

    return model, hps, zero_g


def export_to_onnx(wrapper, onnx_path):
    print(f"\nExporting to ONNX: {onnx_path}")
    wrapper.train(False)

    example_spec = torch.randn(1, SPEC_CHANNELS, FIXED_FRAMES)
    example_src_emb = torch.randn(1, EMBEDDING_DIM, 1)
    example_tgt_emb = torch.randn(1, EMBEDDING_DIM, 1)

    print("Testing forward...")
    with torch.no_grad():
        output = wrapper(example_spec, example_src_emb, example_tgt_emb)
        print(f"  Output: {output.shape}")

    print("Exporting...")
    torch.onnx.export(
        wrapper,
        (example_spec, example_src_emb, example_tgt_emb),
        onnx_path,
        input_names=["spectrogram", "source_embedding", "target_embedding"],
        output_names=["waveform"],
        opset_version=11,  # Use opset 11 for better onnx-coreml compat
        do_constant_folding=True,
    )
    print(f"ONNX saved: {onnx_path}")


def convert_onnx_to_coreml_file(onnx_path, output_path):
    print(f"\nConverting ONNX to CoreML...")

    # Use onnx-coreml converter
    mlmodel = onnx_to_coreml(
        onnx_path,
        minimum_ios_deployment_target='16.0',
    )

    # Save
    print(f"Saving: {output_path}")
    mlmodel.save(output_path)
    print(f"Model saved!")


def main():
    print("=" * 60)
    print("OpenVoice V2 -> CoreML (via ONNX)")
    print("=" * 60)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    onnx_path = os.path.join(script_dir, "temp_vc.onnx")
    output_path = os.path.join(script_dir, "Meeshy/Resources/MLModels/VoiceConverterPipeline.mlpackage")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    if os.path.exists(output_path):
        import shutil
        backup = output_path.replace(".mlpackage", "_backup.mlpackage")
        if os.path.exists(backup):
            shutil.rmtree(backup)
        shutil.move(output_path, backup)

    model, hps, zero_g = load_model()
    wrapper = VoiceConversionFixed(model, zero_g=zero_g)
    export_to_onnx(wrapper, onnx_path)
    convert_onnx_to_coreml_file(onnx_path, output_path)

    if os.path.exists(onnx_path):
        os.remove(onnx_path)

    print("\nDONE! Run: ruby scripts/add_mlmodels_to_xcode.rb")


if __name__ == "__main__":
    main()
