#!/usr/bin/env python3
"""
Test pour comprendre le format de task requis par transformers
"""

import sys
from transformers.pipelines import PIPELINE_REGISTRY

print("🔍 Investigation du format de task pour transformers")
print("=" * 70)

# Afficher tous les tasks supportés
print("\n1️⃣ Tous les tasks supportés:")
all_tasks = PIPELINE_REGISTRY.get_supported_tasks()
for task in sorted(all_tasks):
    if 'translat' in task.lower():
        print(f"   ✓ {task}")

# Tester check_task avec différents formats
print("\n2️⃣ Test de différents formats de task:")

test_formats = [
    "translation",
    "translation_en_to_fr",
    "translation_fr_to_en",
    "translation_de_to_es",
    "translation_eng_Latn_to_fra_Latn",
    ("translation", "en", "fr"),
]

for fmt in test_formats:
    try:
        result = PIPELINE_REGISTRY.check_task(fmt if isinstance(fmt, str) else fmt[0])
        print(f"   ✅ '{fmt}' → accepté: {result}")
    except KeyError as e:
        print(f"   ❌ '{fmt}' → rejeté: {e}")
    except Exception as e:
        print(f"   ⚠️  '{fmt}' → erreur: {e}")

print("\n" + "=" * 70)
