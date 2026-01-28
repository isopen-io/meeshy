#!/usr/bin/env python3
"""
Test détaillé pour comprendre le problème avec le task translation
"""

import sys
import re

print("🔍 Debug du task translation avec transformers")
print("=" * 80)

# Test 1: Vérifier le pattern accepté
print("\n1️⃣ Pattern de validation:")
pattern = r"^translation_(\w{2})_to_(\w{2})$"
test_formats = [
    "translation",
    "translation_en_to_fr",
    "translation_fr_to_en",
    "translation_eng_Latn_to_fra_Latn",
]

for fmt in test_formats:
    match = re.match(pattern, fmt)
    if match:
        print(f"   ✅ '{fmt}' → matché (src={match.group(1)}, tgt={match.group(2)})")
    else:
        print(f"   ❌ '{fmt}' → pas matché")

# Test 2: Créer un pipeline avec le bon format
print("\n2️⃣ Test création pipeline avec task=translation_en_to_fr:")
try:
    from transformers import pipeline, AutoModelForSeq2SeqLM, AutoTokenizer

    model_name = "facebook/nllb-200-distilled-600M"
    print(f"   📦 Chargement {model_name}...")

    # Option 1: Essayer avec task simple
    print("\n   Option 1: task='translation_en_to_fr'")
    try:
        translator = pipeline(
            "translation_en_to_fr",
            model=model_name,
            device=-1
        )
        print("   ✅ Pipeline créé avec succès!")

        # Tester
        result = translator("Hello world")
        print(f"   ✅ Traduction: {result}")

    except Exception as e:
        print(f"   ❌ Erreur: {e}")

except Exception as e:
    print(f"❌ Erreur globale: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 80)
