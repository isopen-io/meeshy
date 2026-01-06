#!/usr/bin/env python3
"""
NLLB 600M to CoreML Converter - ANE Optimized

Converts Meta's NLLB-200 model to CoreML with:
- Fixed input shapes (no dynamic dimensions) 
- Float16 precision for ANE efficiency

Usage:
    python convert_nllb_to_coreml_ane.py --output_dir ./NLLBModels_ANE --seq_lengths 64 --quantize
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
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
except ImportError as e:
    print(f"Missing dependencies: {e}")
    print("Install with: pip install torch transformers coremltools sentencepiece")
    sys.exit(1)

NLLB_LANGUAGE_CODES = {
    "en": "eng_Latn", "fr": "fra_Latn", "es": "spa_Latn", "de": "deu_Latn",
    "pt": "por_Latn", "it": "ita_Latn", "nl": "nld_Latn", "ru": "rus_Cyrl",
    "zh": "zho_Hans", "ja": "jpn_Jpan", "ko": "kor_Hang", "ar": "arb_Arab",
}


class NLLBFullModelANE(nn.Module):
    """Full NLLB model wrapper optimized for ANE with fixed shapes."""
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask, decoder_input_ids):
        outputs = self.model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            decoder_input_ids=decoder_input_ids,
            return_dict=True
        )
        return outputs.logits


def download_model(model_name="facebook/nllb-200-distilled-600M"):
    """Download NLLB model from Hugging Face"""
    print(f"Downloading {model_name}...")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name, torch_dtype=torch.float32)
    model.requires_grad_(False)
    print(f"Loaded: {model.config.encoder_layers} encoder, {model.config.decoder_layers} decoder layers")
    return model, tokenizer


def get_dir_size(path):
    total = 0
    for dirpath, _, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            if os.path.exists(fp):
                total += os.path.getsize(fp)
    return total


def export_full_model_ane(model, output_dir, seq_len=64):
    """Export full model with FIXED shapes for ANE compatibility."""
    print(f"\nExporting Full Model (seq_len={seq_len}) for ANE...")

    wrapper = NLLBFullModelANE(model)
    wrapper.eval()

    # FIXED shapes - required for ANE
    batch_size = 1
    src_ids = torch.zeros((batch_size, seq_len), dtype=torch.long)
    src_mask = torch.ones((batch_size, seq_len), dtype=torch.long)
    tgt_ids = torch.zeros((batch_size, seq_len), dtype=torch.long)

    print("  Tracing model...")
    with torch.no_grad():
        traced = torch.jit.trace(wrapper, (src_ids, src_mask, tgt_ids))

    print("  Converting to CoreML (ANE optimized, float16)...")
    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType(name="input_ids", shape=(batch_size, seq_len), dtype=ct.converters.mil.mil.types.int32),
            ct.TensorType(name="attention_mask", shape=(batch_size, seq_len), dtype=ct.converters.mil.mil.types.int32),
            ct.TensorType(name="decoder_input_ids", shape=(batch_size, seq_len), dtype=ct.converters.mil.mil.types.int32),
        ],
        outputs=[ct.TensorType(name="logits", dtype=ct.converters.mil.mil.types.fp16)],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,
        convert_to="mlprogram",
        compute_precision=ct.precision.FLOAT16,
    )

    mlmodel.author = "Meta AI / NLLB (ANE Optimized)"
    mlmodel.short_description = f"NLLB-200 - 200 languages - Fixed seq_len={seq_len}"

    filename = f"NLLB600M_ANE_seq{seq_len}.mlpackage"
    path = output_dir / filename
    mlmodel.save(str(path))

    size_mb = get_dir_size(path) / 1024 / 1024
    print(f"  Saved: {path} ({size_mb:.1f} MB)")
    return path


def quantize_model(model_path, output_path, nbits=8):
    """Quantize model weights using palettization."""
    print(f"\nQuantizing to {nbits}-bit: {model_path.name}...")

    model = ct.models.MLModel(str(model_path))
    op_config = ct.optimize.coreml.OpPalettizerConfig(mode="kmeans", nbits=nbits)
    config = ct.optimize.coreml.OptimizationConfig(global_config=op_config)
    quantized = ct.optimize.coreml.palettize_weights(model, config)
    quantized.save(str(output_path))

    orig_size = get_dir_size(model_path) / 1024 / 1024
    new_size = get_dir_size(output_path) / 1024 / 1024
    print(f"  {orig_size:.1f} MB -> {new_size:.1f} MB ({100*new_size/orig_size:.0f}%)")
    return output_path


def export_tokenizer(tokenizer, output_dir):
    """Export tokenizer files"""
    print("\nExporting Tokenizer...")
    tok_dir = output_dir / "NLLBTokenizer"
    tok_dir.mkdir(exist_ok=True)
    tokenizer.save_pretrained(str(tok_dir))
    with open(tok_dir / "language_codes.json", 'w') as f:
        json.dump({"codes": NLLB_LANGUAGE_CODES}, f, indent=2)
    print(f"  Saved to: {tok_dir}")


def create_model_info(output_dir, config, seq_lengths):
    """Create model info JSON"""
    info = {
        "model": "NLLB-200-distilled-600M",
        "variant": "ANE-Optimized",
        "source": "https://huggingface.co/facebook/nllb-200-distilled-600M",
        "license": "CC-BY-NC-4.0",
        "vocab_size": config.vocab_size,
        "hidden_size": config.d_model,
        "supported_seq_lengths": seq_lengths,
        "compute_precision": "float16",
        "compute_units": "CPU + GPU + ANE",
        "languages": list(NLLB_LANGUAGE_CODES.keys()),
        "nllb_codes": NLLB_LANGUAGE_CODES,
    }
    with open(output_dir / "model_info.json", 'w') as f:
        json.dump(info, f, indent=2)
    print(f"\nCreated: model_info.json")


def main():
    parser = argparse.ArgumentParser(description="Convert NLLB to CoreML (ANE Optimized)")
    parser.add_argument('--model', default='facebook/nllb-200-distilled-600M')
    parser.add_argument('--output_dir', default='./NLLBModels_ANE')
    parser.add_argument('--seq_lengths', type=int, nargs='+', default=[64])
    parser.add_argument('--quantize', action='store_true')
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("NLLB-200 to CoreML (ANE Optimized)")
    print("=" * 60)

    model, tokenizer = download_model(args.model)

    for seq_len in args.seq_lengths:
        full_path = export_full_model_ane(model, output_dir, seq_len)
        if args.quantize:
            quantized_path = output_dir / f"NLLB600M_ANE_seq{seq_len}_8bit.mlpackage"
            quantize_model(full_path, quantized_path)

    export_tokenizer(tokenizer, output_dir)
    create_model_info(output_dir, model.config, args.seq_lengths)

    print("\n" + "=" * 60)
    print("Done! Use --quantize for smaller model size.")
    print("=" * 60)


if __name__ == '__main__':
    main()
