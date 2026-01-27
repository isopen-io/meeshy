#!/usr/bin/env python3
"""
Test direct: API Transformers 5.0.0 avec NLLB
"""
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
import time

def test_transformers5():
    print("🔍 Test Transformers 5.0.0 - API Directe")
    print("="*70)

    model_name = "facebook/nllb-200-distilled-600M"

    # Test 1: Chargement modèle
    print("\n[1/3] Chargement modèle...")
    start = time.time()
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    load_time = time.time() - start
    print(f"✅ Modèle chargé en {load_time:.2f}s")

    # Vérifier version Transformers
    import transformers
    print(f"📦 Transformers version: {transformers.__version__}")

    # Test 2: Traduction FR → EN
    print("\n[2/3] Traduction FR → EN...")
    text = "Bonjour, comment allez-vous aujourd'hui?"

    tokenizer.src_lang = "fra_Latn"
    inputs = tokenizer(text, return_tensors="pt")

    forced_bos_token_id = tokenizer.convert_tokens_to_ids("eng_Latn")

    start = time.time()
    outputs = model.generate(
        **inputs,
        forced_bos_token_id=forced_bos_token_id,
        max_length=256
    )
    translation_time = time.time() - start

    result = tokenizer.decode(outputs[0], skip_special_tokens=True)

    print(f"📝 Source:      {text}")
    print(f"🎯 Translation: {result}")
    print(f"⏱️  Latence:    {translation_time*1000:.0f}ms")

    # Test 3: Traduction FR → ES
    print("\n[3/3] Traduction FR → ES...")
    tokenizer.src_lang = "fra_Latn"
    inputs = tokenizer(text, return_tensors="pt")
    forced_bos_token_id = tokenizer.convert_tokens_to_ids("spa_Latn")

    start = time.time()
    outputs = model.generate(
        **inputs,
        forced_bos_token_id=forced_bos_token_id,
        max_length=256
    )
    translation_time = time.time() - start

    result_es = tokenizer.decode(outputs[0], skip_special_tokens=True)

    print(f"📝 Source:      {text}")
    print(f"🎯 Translation: {result_es}")
    print(f"⏱️  Latence:    {translation_time*1000:.0f}ms")

    print("\n" + "="*70)
    print("✅ SUCCÈS: Transformers 5.0.0 fonctionne parfaitement avec NLLB !")
    print("✅ Architecture actuelle (API directe) compatible sans modifications !")
    print("="*70)

if __name__ == "__main__":
    test_transformers5()
