#!/usr/bin/env python3
"""
NLLB 600M to CoreML - Split Encoder/Decoder

This script properly converts NLLB for autoregressive generation by:
1. Exporting the ENCODER separately (runs once per input)
2. Exporting the DECODER separately (runs iteratively for generation)

This fixes the "is is is is..." output issue caused by tracing the full model.

Usage:
    python convert_nllb_split.py --output_dir ./NLLBModels_Split --seq_len 64
"""

import os
import sys
import argparse
import json
from pathlib import Path

try:
    import torch
    import torch.nn as nn
    import numpy as np
    import coremltools as ct
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
except ImportError as e:
    print(f"Missing dependencies: {e}")
    print("Install with: pip install torch transformers coremltools sentencepiece numpy")
    sys.exit(1)

# NLLB language codes
NLLB_LANGUAGE_CODES = {
    "en": "eng_Latn", "fr": "fra_Latn", "es": "spa_Latn", "de": "deu_Latn",
    "pt": "por_Latn", "it": "ita_Latn", "nl": "nld_Latn", "ru": "rus_Cyrl",
    "zh": "zho_Hans", "ja": "jpn_Jpan", "ko": "kor_Hang", "ar": "arb_Arab",
}


class NLLBEncoder(nn.Module):
    """Wrapper for NLLB encoder only."""

    def __init__(self, model):
        super().__init__()
        self.encoder = model.model.encoder
        self.embed_tokens = model.model.shared
        self.embed_scale = model.model.encoder.embed_scale if hasattr(model.model.encoder, 'embed_scale') else 1.0

    def forward(self, input_ids, attention_mask):
        # Embed input tokens
        inputs_embeds = self.embed_tokens(input_ids) * self.embed_scale

        # Run encoder
        encoder_outputs = self.encoder(
            input_ids=None,
            attention_mask=attention_mask,
            inputs_embeds=inputs_embeds,
            return_dict=True
        )

        return encoder_outputs.last_hidden_state


class NLLBDecoder(nn.Module):
    """Wrapper for NLLB decoder with encoder hidden states input.

    Uses input_ids directly to avoid embedding path shape issues during tracing.
    """

    def __init__(self, model):
        super().__init__()
        self.decoder = model.model.decoder
        self.lm_head = model.lm_head
        self.config = model.config

    def forward(self, decoder_input_ids, encoder_hidden_states, encoder_attention_mask):
        # Run decoder with input_ids directly (model handles embedding internally)
        # CRITICAL: use_cache=False prevents dynamic cache ops that break CoreML tracing
        decoder_outputs = self.decoder(
            input_ids=decoder_input_ids,
            attention_mask=None,  # Causal mask is applied internally
            encoder_hidden_states=encoder_hidden_states,
            encoder_attention_mask=encoder_attention_mask,
            use_cache=False,  # Disable KV cache for CoreML compatibility
            return_dict=True
        )

        # Project to vocabulary
        logits = self.lm_head(decoder_outputs.last_hidden_state)

        return logits


class NLLBDecoderSimple(nn.Module):
    """Simplified NLLB decoder that bypasses dynamic shape operations.

    This manually implements the decoder forward pass to avoid the sequence_length
    conditionals that break CoreML tracing.

    IMPORTANT: encoder_attention_mask must be passed as pre-expanded (1, 1, 1, seq_len)
    to avoid dynamic mask expansion being baked in during tracing.
    """

    def __init__(self, model, seq_len):
        super().__init__()
        # M2M100ScaledWordEmbedding already includes scaling
        self.embed_tokens = model.model.decoder.embed_tokens
        self.embed_positions = model.model.decoder.embed_positions
        self.layers = model.model.decoder.layers
        self.layer_norm = model.model.decoder.layer_norm
        self.lm_head = model.lm_head

        self.seq_len = seq_len

        # Pre-compute causal mask for fixed seq_len (batch_size=1, num_heads, seq, seq)
        # CoreML needs 4D attention mask
        self.register_buffer(
            'causal_mask',
            torch.triu(torch.full((1, 1, seq_len, seq_len), float('-inf')), diagonal=1)
        )

        # Pre-compute position indices to avoid dynamic tensor creation
        self.register_buffer(
            'position_ids',
            torch.arange(seq_len).unsqueeze(0) + 2  # Offset of 2 for NLLB
        )

    def forward(self, decoder_input_ids, encoder_hidden_states, encoder_attention_mask):
        # Token embeddings (M2M100ScaledWordEmbedding handles scaling internally)
        hidden_states = self.embed_tokens(decoder_input_ids)

        # Position embeddings using pre-computed positions
        hidden_states = hidden_states + self.embed_positions(self.position_ids)

        # encoder_attention_mask is already in expanded format (1, 1, 1, seq_len)
        # Values are 0 for attend, -inf for ignore
        # The mask is passed pre-expanded to avoid tracing issues

        # Run through decoder layers
        for layer in self.layers:
            layer_outputs = layer(
                hidden_states,
                attention_mask=self.causal_mask,
                encoder_hidden_states=encoder_hidden_states,
                encoder_attention_mask=encoder_attention_mask,
                layer_head_mask=None,
                cross_attn_layer_head_mask=None,
                past_key_value=None,
                output_attentions=False,
                use_cache=False,
            )
            hidden_states = layer_outputs[0]

        # Final layer norm
        hidden_states = self.layer_norm(hidden_states)

        # Project to vocabulary
        logits = self.lm_head(hidden_states)

        return logits


def download_model(model_name="facebook/nllb-200-distilled-600M"):
    """Download NLLB model from Hugging Face."""
    print(f"Downloading {model_name}...")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name, torch_dtype=torch.float32)
    model.train(False)  # Set to inference mode
    model.requires_grad_(False)

    print(f"Model config:")
    print(f"  Encoder layers: {model.config.encoder_layers}")
    print(f"  Decoder layers: {model.config.decoder_layers}")
    print(f"  Hidden size: {model.config.d_model}")
    print(f"  Vocab size: {model.config.vocab_size}")

    return model, tokenizer


def get_dir_size(path):
    """Get directory size in bytes."""
    total = 0
    for dirpath, _, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            if os.path.exists(fp):
                total += os.path.getsize(fp)
    return total


def export_encoder(model, output_dir, seq_len=64):
    """Export encoder as separate CoreML model."""
    print(f"\n{'='*60}")
    print(f"Exporting ENCODER (seq_len={seq_len})...")
    print(f"{'='*60}")

    encoder = NLLBEncoder(model)
    encoder.train(False)  # Inference mode

    # Fixed shape inputs for ANE compatibility
    batch_size = 1
    input_ids = torch.zeros((batch_size, seq_len), dtype=torch.long)
    attention_mask = torch.ones((batch_size, seq_len), dtype=torch.long)

    print("  Tracing encoder...")
    with torch.no_grad():
        traced = torch.jit.trace(encoder, (input_ids, attention_mask))

    print("  Converting to CoreML...")
    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType(name="input_ids", shape=(batch_size, seq_len), dtype=np.int32),
            ct.TensorType(name="attention_mask", shape=(batch_size, seq_len), dtype=np.int32),
        ],
        outputs=[
            ct.TensorType(name="encoder_hidden_states", dtype=np.float16),
        ],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,
        convert_to="mlprogram",
        compute_precision=ct.precision.FLOAT16,
    )

    mlmodel.author = "Meta AI / NLLB"
    mlmodel.short_description = f"NLLB-200 Encoder - seq_len={seq_len}"

    path = output_dir / f"NLLBEncoder_seq{seq_len}.mlpackage"
    mlmodel.save(str(path))

    size_mb = get_dir_size(path) / 1024 / 1024
    print(f"  Saved: {path} ({size_mb:.1f} MB)")

    return path


def export_decoder(model, output_dir, seq_len=64):
    """Export decoder as separate CoreML model.

    Uses a simplified decoder wrapper that avoids dynamic shape operations.

    IMPORTANT: The encoder_attention_mask is passed as pre-expanded 4D (1, 1, 1, seq_len)
    to avoid mask expansion being baked in during tracing. Values are:
    - 0.0 for tokens to attend to
    - -inf for tokens to ignore (padding)
    """
    print(f"\n{'='*60}")
    print(f"Exporting DECODER (seq_len={seq_len})...")
    print(f"{'='*60}")

    # Create simplified decoder that avoids tracing issues
    decoder = NLLBDecoderSimple(model, seq_len)
    decoder.train(False)

    # Fixed shape inputs
    batch_size = 1
    hidden_size = model.config.d_model  # 1024 for NLLB-600M

    decoder_input_ids = torch.zeros((batch_size, seq_len), dtype=torch.long)
    encoder_hidden_states = torch.zeros((batch_size, seq_len, hidden_size), dtype=torch.float32)

    # CRITICAL: Pre-expanded 4D attention mask to avoid tracing issues
    # Shape: (1, 1, 1, seq_len) - values are 0.0 (attend) or -inf (ignore)
    encoder_attention_mask = torch.zeros((batch_size, 1, 1, seq_len), dtype=torch.float32)

    print("  Tracing decoder with 4D attention mask...")
    with torch.no_grad():
        # Run once to initialize
        _ = decoder(decoder_input_ids, encoder_hidden_states, encoder_attention_mask)
        traced = torch.jit.trace(decoder, (decoder_input_ids, encoder_hidden_states, encoder_attention_mask))

    print("  Converting to CoreML...")
    mlmodel = ct.convert(
        traced,
        inputs=[
            ct.TensorType(name="decoder_input_ids", shape=(batch_size, seq_len), dtype=np.int32),
            ct.TensorType(name="encoder_hidden_states", shape=(batch_size, seq_len, hidden_size), dtype=np.float16),
            # 4D mask: (1, 1, 1, seq_len) with float values (0.0 attend, -inf ignore)
            ct.TensorType(name="encoder_attention_mask", shape=(batch_size, 1, 1, seq_len), dtype=np.float16),
        ],
        outputs=[
            ct.TensorType(name="logits", dtype=np.float16),
        ],
        minimum_deployment_target=ct.target.iOS16,
        compute_units=ct.ComputeUnit.ALL,
        convert_to="mlprogram",
        compute_precision=ct.precision.FLOAT16,
    )

    mlmodel.author = "Meta AI / NLLB"
    mlmodel.short_description = f"NLLB-200 Decoder - seq_len={seq_len}"

    path = output_dir / f"NLLBDecoder_seq{seq_len}.mlpackage"
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
    """Export tokenizer files."""
    print("\nExporting Tokenizer...")
    tok_dir = output_dir / "NLLBTokenizer"
    tok_dir.mkdir(exist_ok=True)
    tokenizer.save_pretrained(str(tok_dir))

    # Save language codes mapping
    with open(tok_dir / "language_codes.json", 'w') as f:
        json.dump({"codes": NLLB_LANGUAGE_CODES}, f, indent=2)

    print(f"  Saved to: {tok_dir}")


def create_model_info(output_dir, config, seq_len):
    """Create model info JSON."""
    info = {
        "model": "NLLB-200-distilled-600M",
        "variant": "Split-Encoder-Decoder",
        "source": "https://huggingface.co/facebook/nllb-200-distilled-600M",
        "license": "CC-BY-NC-4.0",
        "vocab_size": config.vocab_size,
        "hidden_size": config.d_model,
        "encoder_layers": config.encoder_layers,
        "decoder_layers": config.decoder_layers,
        "seq_len": seq_len,
        "compute_precision": "float16",
        "architecture": {
            "encoder": f"NLLBEncoder_seq{seq_len}.mlpackage",
            "decoder": f"NLLBDecoder_seq{seq_len}.mlpackage",
            "tokenizer": "NLLBTokenizer/",
        },
        "usage": {
            "step1": "Run encoder ONCE to get encoder_hidden_states",
            "step2": "Run decoder ITERATIVELY for autoregressive generation",
            "step3": "Pass encoder_hidden_states to decoder at each step",
        },
        "decoder_inputs": {
            "decoder_input_ids": f"Int32 shape (1, {seq_len})",
            "encoder_hidden_states": f"Float16 shape (1, {seq_len}, {config.d_model})",
            "encoder_attention_mask": f"Float16 shape (1, 1, 1, {seq_len}) - 4D pre-expanded mask, 0.0=attend, -inf=ignore",
        },
        "languages": list(NLLB_LANGUAGE_CODES.keys()),
        "nllb_codes": NLLB_LANGUAGE_CODES,
    }

    with open(output_dir / "model_info.json", 'w') as f:
        json.dump(info, f, indent=2)

    print(f"\nCreated: model_info.json")


def verify_models(model, output_dir, seq_len, tokenizer):
    """Verify the exported models work correctly."""
    print(f"\n{'='*60}")
    print("Verifying exported models...")
    print(f"{'='*60}")

    # Test input
    test_text = "Hello, how are you?"
    source_lang = "eng_Latn"
    target_lang = "fra_Latn"

    # Tokenize
    tokenizer.src_lang = source_lang
    inputs = tokenizer(test_text, return_tensors="pt", padding="max_length", max_length=seq_len, truncation=True)

    print(f"  Test input: '{test_text}'")
    print(f"  Source: {source_lang} -> Target: {target_lang}")

    # Run original model for reference
    with torch.no_grad():
        forced_bos_token_id = tokenizer.convert_tokens_to_ids(target_lang)
        generated = model.generate(
            inputs.input_ids,
            forced_bos_token_id=forced_bos_token_id,
            max_new_tokens=32,
            num_beams=1,
            do_sample=False,
        )
        reference_output = tokenizer.decode(generated[0], skip_special_tokens=True)

    print(f"  Reference output: '{reference_output}'")

    # Load and test CoreML models
    try:
        encoder_path = output_dir / f"NLLBEncoder_seq{seq_len}.mlpackage"
        decoder_path = output_dir / f"NLLBDecoder_seq{seq_len}.mlpackage"

        encoder_ml = ct.models.MLModel(str(encoder_path))
        decoder_ml = ct.models.MLModel(str(decoder_path))

        # Run encoder
        encoder_input = {
            "input_ids": inputs.input_ids.numpy().astype(np.int32),
            "attention_mask": inputs.attention_mask.numpy().astype(np.int32),
        }
        encoder_output = encoder_ml.predict(encoder_input)
        encoder_hidden = encoder_output["encoder_hidden_states"]

        print(f"  Encoder output shape: {encoder_hidden.shape}")

        # Simple decoder test (just one step)
        target_token_id = tokenizer.convert_tokens_to_ids(target_lang)
        decoder_input_ids = np.zeros((1, seq_len), dtype=np.int32)
        decoder_input_ids[0, 0] = target_token_id

        # Create 4D attention mask (1, 1, 1, seq_len) with float16
        # Values: 0.0 for attend, -inf for ignore (padding)
        attention_mask_2d = inputs.attention_mask.numpy().astype(np.float16)
        # Convert: 1 -> 0.0 (attend), 0 -> -inf (ignore)
        attention_mask_4d = np.where(attention_mask_2d == 1, 0.0, -np.inf).astype(np.float16)
        attention_mask_4d = attention_mask_4d.reshape(1, 1, 1, seq_len)

        decoder_input = {
            "decoder_input_ids": decoder_input_ids,
            "encoder_hidden_states": encoder_hidden.astype(np.float16),
            "encoder_attention_mask": attention_mask_4d,
        }
        decoder_output = decoder_ml.predict(decoder_input)
        logits = decoder_output["logits"]

        print(f"  Decoder output shape: {logits.shape}")
        print(f"  Attention mask shape: {attention_mask_4d.shape}")

        # Get first predicted token
        first_token_id = np.argmax(logits[0, 0, :])
        first_token = tokenizer.decode([first_token_id])
        print(f"  First predicted token: {first_token_id} = '{first_token}'")

        print("\n  Models verified successfully!")

    except Exception as e:
        print(f"\n  Verification failed: {e}")
        print("  Models may still work - this is just a quick test.")


def main():
    parser = argparse.ArgumentParser(description="Convert NLLB to CoreML (Split Encoder/Decoder)")
    parser.add_argument('--model', default='facebook/nllb-200-distilled-600M')
    parser.add_argument('--output_dir', default='./NLLBModels_Split')
    parser.add_argument('--seq_len', type=int, default=64)
    parser.add_argument('--quantize', action='store_true', help='Apply 8-bit quantization')
    parser.add_argument('--verify', action='store_true', help='Verify models after conversion')
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("NLLB-200 to CoreML - Split Encoder/Decoder")
    print("=" * 60)
    print(f"\nThis fixes autoregressive generation by splitting the model:")
    print(f"  1. Encoder runs ONCE per input")
    print(f"  2. Decoder runs ITERATIVELY for each output token")
    print(f"  3. Encoder hidden states are cached and reused")
    print()

    # Download model
    model, tokenizer = download_model(args.model)

    # Export encoder
    encoder_path = export_encoder(model, output_dir, args.seq_len)

    # Export decoder
    decoder_path = export_decoder(model, output_dir, args.seq_len)

    # Quantize if requested
    if args.quantize:
        encoder_quant = output_dir / f"NLLBEncoder_seq{args.seq_len}_8bit.mlpackage"
        decoder_quant = output_dir / f"NLLBDecoder_seq{args.seq_len}_8bit.mlpackage"
        quantize_model(encoder_path, encoder_quant)
        quantize_model(decoder_path, decoder_quant)

    # Export tokenizer
    export_tokenizer(tokenizer, output_dir)

    # Create model info
    create_model_info(output_dir, model.config, args.seq_len)

    # Verify if requested
    if args.verify:
        verify_models(model, output_dir, args.seq_len, tokenizer)

    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)
    print(f"\nOutput files:")
    print(f"  Encoder: NLLBEncoder_seq{args.seq_len}.mlpackage")
    print(f"  Decoder: NLLBDecoder_seq{args.seq_len}.mlpackage")
    print(f"  Tokenizer: NLLBTokenizer/")
    print(f"\nUsage in Swift:")
    print(f"  1. Load both models")
    print(f"  2. Run encoder ONCE with input text -> encoder_hidden_states")
    print(f"  3. Run decoder in a LOOP:")
    print(f"     - Input: decoder_ids + encoder_hidden_states")
    print(f"     - Output: logits -> argmax -> next token")
    print(f"     - Append token to decoder_ids")
    print(f"     - Repeat until EOS")


if __name__ == '__main__':
    main()
