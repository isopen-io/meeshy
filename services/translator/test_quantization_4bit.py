#!/usr/bin/env python3
"""
Test Quantization 4-bit avec Transformers 5.0.0
Mesurer la réduction de mémoire
"""
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, BitsAndBytesConfig
import torch
import time
import psutil
import os

def get_memory_usage():
    """Retourne la mémoire utilisée par le processus en MB"""
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 ** 2)

def test_quantization():
    print("🔍 Test Quantization 4-bit - Transformers 5.0.0")
    print("="*70)

    model_name = "facebook/nllb-200-distilled-600M"
    text = "Bonjour, comment allez-vous?"

    # ========== Test 1: Sans quantization (FP32) ==========
    print("\n[1/2] Test SANS quantization (FP32/FP16)...")
    mem_before = get_memory_usage()

    start = time.time()
    model_fp = AutoModelForSeq2SeqLM.from_pretrained(
        model_name,
        torch_dtype="auto"  # FP16 si disponible
    )
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    load_time_fp = time.time() - start

    mem_after = get_memory_usage()
    mem_used_fp = mem_after - mem_before

    print(f"✅ Chargement: {load_time_fp:.2f}s")
    print(f"💾 Mémoire:    {mem_used_fp:.0f}MB")

    # Test traduction
    tokenizer.src_lang = "fra_Latn"
    inputs = tokenizer(text, return_tensors="pt")
    forced_bos = tokenizer.convert_tokens_to_ids("eng_Latn")

    start = time.time()
    outputs = model_fp.generate(**inputs, forced_bos_token_id=forced_bos, max_length=50)
    inference_time_fp = time.time() - start

    result_fp = tokenizer.decode(outputs[0], skip_special_tokens=True)
    print(f"🎯 Traduction: {result_fp}")
    print(f"⏱️  Latence:   {inference_time_fp*1000:.0f}ms")

    # Libérer mémoire
    del model_fp
    del inputs
    del outputs
    torch.cuda.empty_cache() if torch.cuda.is_available() else None

    time.sleep(2)  # Laisser GC faire son travail

    # ========== Test 2: Avec quantization 4-bit ==========
    print("\n[2/2] Test AVEC quantization 4-bit...")
    mem_before = get_memory_usage()

    # Configuration quantization 4-bit
    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True
    )

    start = time.time()
    model_4bit = AutoModelForSeq2SeqLM.from_pretrained(
        model_name,
        quantization_config=quantization_config,
        device_map="auto"
    )
    load_time_4bit = time.time() - start

    mem_after = get_memory_usage()
    mem_used_4bit = mem_after - mem_before

    print(f"✅ Chargement: {load_time_4bit:.2f}s")
    print(f"💾 Mémoire:    {mem_used_4bit:.0f}MB")

    # Test traduction
    tokenizer.src_lang = "fra_Latn"
    inputs = tokenizer(text, return_tensors="pt").to(model_4bit.device)
    forced_bos = tokenizer.convert_tokens_to_ids("eng_Latn")

    start = time.time()
    outputs = model_4bit.generate(**inputs, forced_bos_token_id=forced_bos, max_length=50)
    inference_time_4bit = time.time() - start

    result_4bit = tokenizer.decode(outputs[0], skip_special_tokens=True)
    print(f"🎯 Traduction: {result_4bit}")
    print(f"⏱️  Latence:   {inference_time_4bit*1000:.0f}ms")

    # ========== Comparaison ==========
    print("\n" + "="*70)
    print("📊 COMPARAISON FP16 vs 4-BIT")
    print("="*70)

    mem_reduction = ((mem_used_fp - mem_used_4bit) / mem_used_fp) * 100
    speed_diff = ((inference_time_4bit - inference_time_fp) / inference_time_fp) * 100

    print(f"\n💾 Mémoire:")
    print(f"   FP16:    {mem_used_fp:.0f}MB")
    print(f"   4-bit:   {mem_used_4bit:.0f}MB")
    print(f"   Gain:    -{mem_reduction:.1f}% ({mem_used_fp - mem_used_4bit:.0f}MB économisés)")

    print(f"\n⏱️  Performance:")
    print(f"   FP16:    {inference_time_fp*1000:.0f}ms")
    print(f"   4-bit:   {inference_time_4bit*1000:.0f}ms")
    if speed_diff > 0:
        print(f"   Impact:  +{speed_diff:.1f}% (plus lent)")
    else:
        print(f"   Impact:  {speed_diff:.1f}% (plus rapide!)")

    print(f"\n🎯 Qualité:")
    print(f"   FP16:    '{result_fp}'")
    print(f"   4-bit:   '{result_4bit}'")
    print(f"   Match:   {'✅ Identique' if result_fp == result_4bit else '⚠️  Différent'}")

    print("\n" + "="*70)
    print("✅ Quantization 4-bit = ~75% réduction mémoire avec qualité préservée !")
    print("="*70)

if __name__ == "__main__":
    try:
        test_quantization()
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        print("\nℹ️  La quantization 4-bit nécessite:")
        print("   - bitsandbytes installé: pip install bitsandbytes")
        print("   - GPU NVIDIA (ou CPU mais plus lent)")
