#!/usr/bin/env python3
"""
NLLB (No Language Left Behind) 600M to CoreML Converter

Converts Meta's NLLB-200 distilled 600M model to CoreML format for iOS deployment.
Supports 200 languages with a single multilingual model.

Model source: https://huggingface.co/facebook/nllb-200-distilled-600M

Usage:
    python convert_nllb_to_coreml.py --output_dir ./NLLBModels

Requirements:
    pip install torch transformers coremltools sentencepiece
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


# NLLB Flores-200 language codes
NLLB_LANGUAGE_CODES = {
    "en": "eng_Latn",
    "fr": "fra_Latn", 
    "es": "spa_Latn",
    "de": "deu_Latn",
    "pt": "por_Latn",
    "it": "ita_Latn",
    "nl": "nld_Latn",
    "ru": "rus_Cyrl",
    "zh": "zho_Hans",
    "ja": "jpn_Jpan",
    "ko": "kor_Hang",
    "ar": "arb_Arab",
}


class NLLBEncoderWrapper(nn.Module):
    """Wrapper for NLLB encoder"""
    def __init__(self, model):
        super().__init__()
        self.encoder = model.get_encoder()

    def forward(self, input_ids, attention_mask):
        outputs = self.encoder(
            input_ids=input_ids,
            attention_mask=attention_mask,
            return_dict=True
        )
        return outputs.last_hidden_state


class NLLBDecoderWrapper(nn.Module):
    """Wrapper for NLLB decoder"""
    def __init__(self, model):
        super().__init__()
        self.decoder = model.get_decoder()
        self.lm_head = model.lm_head

    def forward(self, decoder_input_ids, encoder_hidden_states, encoder_attention_mask):
        outputs = self.decoder(
            input_ids=decoder_input_ids,
            encoder_hidden_states=encoder_hidden_states,
            encoder_attention_mask=encoder_attention_mask,
            return_dict=True
        )
        logits = self.lm_head(outputs.last_hidden_state)
        return logits


class NLLBFullModel(nn.Module):
    """Full NLLB model wrapper"""
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
    print("This may take a while (~1.2GB)...")
    
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    model.requires_grad_(False)
    
    print(f"Loaded: {model.config.encoder_layers} encoder, {model.config.decoder_layers} decoder layers")
    return model, tokenizer


def get_dir_size(path):
    total = 0
    for dirpath, _, filenames in os.walk(path):
        for f in filenames:
            total += os.path.getsize(os.path.join(dirpath, f))
    return total


def export_encoder(model, output_dir, max_len=256):
    """Export encoder to CoreML"""
    print("\nExporting Encoder...")
    
    wrapper = NLLBEncoderWrapper(model)
    wrapper.eval()
    
    example_ids = torch.randint(0, 1000, (1, 64))
    example_mask = torch.ones(1, 64, dtype=torch.long)
    
    with torch.no_grad():
        traced = torch.jit.trace(wrapper, (example_ids, example_mask))
    
    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType(name="input_ids", shape=(1, ct.RangeDim(1, max_len, 64))),
            ct.TensorType(name="attention_mask", shape=(1, ct.RangeDim(1, max_len, 64))),
        ],
        outputs=[ct.TensorType(name="encoder_hidden_states")],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.CPU_AND_NE,
        convert_to="mlprogram",
    )
    
    mlmodel.author = "Meta AI / NLLB"
    mlmodel.short_description = "NLLB-200 Encoder (600M)"
    
    path = output_dir / "NLLBEncoder.mlpackage"
    mlmodel.save(str(path))
    print(f"  Saved: {path} ({get_dir_size(path)/1024/1024:.1f} MB)")
    return path


def export_full_model(model, output_dir, max_len=128):
    """Export full model to CoreML"""
    print("\nExporting Full Model...")
    
    wrapper = NLLBFullModel(model)
    wrapper.eval()
    
    src_ids = torch.randint(0, 1000, (1, 32))
    src_mask = torch.ones(1, 32, dtype=torch.long)
    tgt_ids = torch.randint(0, 1000, (1, 32))
    
    with torch.no_grad():
        traced = torch.jit.trace(wrapper, (src_ids, src_mask, tgt_ids))
    
    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType(name="input_ids", shape=(1, ct.RangeDim(1, max_len, 32))),
            ct.TensorType(name="attention_mask", shape=(1, ct.RangeDim(1, max_len, 32))),
            ct.TensorType(name="decoder_input_ids", shape=(1, ct.RangeDim(1, max_len, 32))),
        ],
        outputs=[ct.TensorType(name="logits")],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.CPU_AND_NE,
        convert_to="mlprogram",
    )
    
    mlmodel.author = "Meta AI / NLLB"
    mlmodel.short_description = "NLLB-200 Full Model - 200 languages (600M)"
    
    path = output_dir / "NLLB600M.mlpackage"
    mlmodel.save(str(path))
    print(f"  Saved: {path} ({get_dir_size(path)/1024/1024:.1f} MB)")
    return path


def export_tokenizer(tokenizer, output_dir):
    """Export tokenizer files"""
    print("\nExporting Tokenizer...")
    
    tok_dir = output_dir / "tokenizer"
    tok_dir.mkdir(exist_ok=True)
    tokenizer.save_pretrained(str(tok_dir))
    
    lang_info = {"codes": NLLB_LANGUAGE_CODES}
    with open(tok_dir / "language_codes.json", 'w') as f:
        json.dump(lang_info, f, indent=2)
    
    print(f"  Saved to: {tok_dir}")


def create_model_info(output_dir, config):
    """Create model info JSON"""
    info = {
        "model": "NLLB-200-distilled-600M",
        "source": "https://huggingface.co/facebook/nllb-200-distilled-600M",
        "license": "CC-BY-NC-4.0",
        "vocab_size": config.vocab_size,
        "hidden_size": config.d_model,
        "languages": list(NLLB_LANGUAGE_CODES.keys()),
        "nllb_codes": NLLB_LANGUAGE_CODES,
    }
    
    with open(output_dir / "model_info.json", 'w') as f:
        json.dump(info, f, indent=2)
    print(f"\nCreated: model_info.json")


def main():
    parser = argparse.ArgumentParser(description="Convert NLLB to CoreML")
    parser.add_argument('--model', default='facebook/nllb-200-distilled-600M')
    parser.add_argument('--output_dir', default='./NLLBModels')
    parser.add_argument('--max_length', type=int, default=128)
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("NLLB-200 to CoreML Converter")
    print("=" * 60)
    
    model, tokenizer = download_model(args.model)
    
    print("\nConverting (this takes several minutes)...")
    
    export_encoder(model, output_dir, args.max_length)
    export_full_model(model, output_dir, args.max_length)
    export_tokenizer(tokenizer, output_dir)
    create_model_info(output_dir, model.config)
    
    print("\n" + "=" * 60)
    print("Done! Models saved to:", output_dir)
    print("=" * 60)
    print("\nNext: Drag .mlpackage files into Xcode")


if __name__ == '__main__':
    main()
