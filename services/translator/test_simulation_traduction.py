#!/usr/bin/env python3
"""
Test de simulation de traduction complète
Utilise la vraie segmentation et simule la traduction ML
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from utils.text_segmentation import TextSegmenter
import logging

logging.basicConfig(level=logging.INFO, format='%(message)s')

def simulate_translation(text: str, from_lang: str, to_lang: str) -> str:
    """
    Simule une traduction simple en ajoutant un préfixe
    Pour tester le flux sans avoir besoin des modèles ML
    """
    if not text.strip():
        return text

    # Simulation simple : ajouter "[FR]" devant chaque mot
    if to_lang == "fr":
        words = text.split()
        # Préserver la ponctuation
        translated = []
        for word in words:
            if word:
                translated.append(f"[FR:{word}]")
        return " ".join(translated)
    return text


def test_full_translation_flow():
    """
    Test complet du flux de traduction avec structure
    """

    # Texte original avec toutes les difficultés
    original = """🎉 MAJOR UPDATES - Last 48 Hours 🚀

🎤 AUDIO RECORDING
✅ Universal format
✅ Fixed issues

Here is the code:

```python
def hello():
    print("Hello World")
```

Please review! 🔍"""

    print("=" * 80)
    print("🧪 TEST DE SIMULATION TRADUCTION COMPLÈTE")
    print("=" * 80)

    print("\n📥 TEXTE ORIGINAL (EN):")
    print("-" * 80)
    print(original)
    print("-" * 80)
    print(f"Longueur: {len(original)} chars")
    print(f"Lignes: {original.count(chr(10))} retours à la ligne")

    # ÉTAPE 1: Segmentation
    print("\n🔧 ÉTAPE 1: SEGMENTATION")
    segmenter = TextSegmenter()
    segments, emojis_map = segmenter.segment_text(original)

    print(f"  • Segments totaux: {len(segments)}")
    print(f"  • Lignes à traduire: {len([s for s in segments if s['type'] == 'line'])}")
    print(f"  • Blocs de code: {len([s for s in segments if s['type'] == 'code'])}")
    print(f"  • Séparateurs: {len([s for s in segments if s['type'] == 'separator'])}")
    print(f"  • Emojis extraits: {len(emojis_map)}")

    print("\n📋 DÉTAIL DES SEGMENTS:")
    for i, seg in enumerate(segments):
        seg_type = seg['type']
        seg_text = seg['text']

        if seg_type == 'separator':
            print(f"  {i:2d}. [separator] {seg_text.count(chr(10))}x \\n")
        elif seg_type == 'code':
            preview = seg_text[:40] + '...' if len(seg_text) > 40 else seg_text
            print(f"  {i:2d}. [CODE     ] {repr(preview)} (NON TRADUIT)")
        else:
            preview = seg_text[:40] + '...' if len(seg_text) > 40 else seg_text
            print(f"  {i:2d}. [{seg_type:9}] {repr(preview)}")

    # ÉTAPE 2: Traduction (simulée)
    print("\n🔧 ÉTAPE 2: TRADUCTION")
    translated_segments = []

    for segment in segments:
        seg_type = segment['type']
        seg_text = segment['text']

        if seg_type in ['separator', 'empty_line', 'code']:
            # Préserver tel quel (pas de traduction)
            translated_segments.append(segment)
            if seg_type == 'code':
                print(f"  ⏭️  Code préservé: {repr(seg_text[:30])}...")
        elif seg_type == 'line':
            # Simuler la traduction
            translated_text = simulate_translation(seg_text, 'en', 'fr')
            translated_segments.append({
                'type': seg_type,
                'text': translated_text,
                'index': segment['index']
            })
            print(f"  ✅ Traduit: '{seg_text[:30]}...' → '{translated_text[:30]}...'")

    # ÉTAPE 3: Réassemblage
    print("\n🔧 ÉTAPE 3: RÉASSEMBLAGE")
    result = segmenter.reassemble_text(translated_segments, emojis_map)

    print("\n📤 TEXTE TRADUIT (FR):")
    print("-" * 80)
    print(result)
    print("-" * 80)
    print(f"Longueur: {len(result)} chars")
    print(f"Lignes: {result.count(chr(10))} retours à la ligne")

    # VÉRIFICATIONS
    print("\n🔍 VÉRIFICATIONS:")

    checks = []

    # 1. Même nombre de lignes
    original_lines = original.count('\n')
    result_lines = result.count('\n')
    if original_lines == result_lines:
        print(f"  ✅ Même nombre de lignes ({original_lines})")
        checks.append(True)
    else:
        print(f"  ❌ Nombre de lignes différent ({original_lines} → {result_lines})")
        checks.append(False)

    # 2. Code préservé
    if '```python' in result and 'def hello():' in result and 'print("Hello World")' in result:
        print(f"  ✅ Code Python préservé intégralement")
        checks.append(True)
    else:
        print(f"  ❌ Code Python modifié")
        checks.append(False)

    # 3. Emojis préservés
    from utils.text_segmentation import EMOJI_PATTERN
    original_emojis = EMOJI_PATTERN.findall(original)
    result_emojis = EMOJI_PATTERN.findall(result)
    if len(original_emojis) == len(result_emojis):
        print(f"  ✅ Tous les emojis préservés ({len(original_emojis)})")
        checks.append(True)
    else:
        print(f"  ❌ Emojis perdus ({len(original_emojis)} → {len(result_emojis)})")
        checks.append(False)

    # 4. Texte traduit (différent de l'original)
    if result != original:
        print(f"  ✅ Texte traduit (différent de l'original)")
        checks.append(True)
    else:
        print(f"  ❌ Texte identique (pas traduit)")
        checks.append(False)

    # 5. Indentation préservée
    if '    print("Hello World")' in result:
        print(f"  ✅ Indentation du code préservée")
        checks.append(True)
    else:
        print(f"  ❌ Indentation perdue")
        checks.append(False)

    # RÉSULTAT
    print("\n" + "=" * 80)
    success = all(checks)
    success_rate = (sum(checks) / len(checks)) * 100

    if success:
        print(f"✅ TEST RÉUSSI - Toutes les vérifications passées ({success_rate:.0f}%)")
    else:
        failed = len(checks) - sum(checks)
        print(f"⚠️  TEST PARTIEL - {failed}/{len(checks)} vérifications échouées ({success_rate:.0f}%)")

    print("=" * 80)

    return success


def test_code_blocks():
    """Test spécifique pour les blocs de code"""

    print("\n" + "=" * 80)
    print("🧪 TEST SPÉCIFIQUE: BLOCS DE CODE")
    print("=" * 80)

    test_cases = [
        {
            'name': 'Python code',
            'text': """Fix this:

```python
def add(a, b):
    return a + b
```

Done!"""
        },
        {
            'name': 'JavaScript code',
            'text': """New function:

```javascript
const multiply = (x, y) => {
    return x * y;
};
```

Test it!"""
        },
        {
            'name': 'Multiple code blocks',
            'text': """Two functions:

```python
def foo():
    pass
```

And:

```python
def bar():
    pass
```

All done!"""
        }
    ]

    segmenter = TextSegmenter()
    all_passed = True

    for i, test in enumerate(test_cases, 1):
        print(f"\n📋 Test {i}: {test['name']}")
        print("-" * 80)

        original = test['text']
        segments, emojis = segmenter.segment_text(original)

        # Compter les segments de code
        code_segments = [s for s in segments if s['type'] == 'code']
        line_segments = [s for s in segments if s['type'] == 'line']

        print(f"  • Segments de code: {len(code_segments)}")
        print(f"  • Lignes à traduire: {len(line_segments)}")

        # Réassembler sans modification
        reassembled = segmenter.reassemble_text(segments, emojis)

        if original == reassembled:
            print(f"  ✅ Code préservé identique")
        else:
            print(f"  ❌ Code modifié")
            all_passed = False

    print("\n" + "=" * 80)
    if all_passed:
        print("✅ TOUS LES TESTS DE CODE RÉUSSIS")
    else:
        print("❌ CERTAINS TESTS DE CODE ONT ÉCHOUÉ")
    print("=" * 80)

    return all_passed


if __name__ == "__main__":
    print("\n🚀 DÉMARRAGE DES TESTS DE SIMULATION\n")

    # Test 1: Flux complet
    test1 = test_full_translation_flow()

    # Test 2: Blocs de code spécifiques
    test2 = test_code_blocks()

    # Résumé
    print("\n" + "=" * 80)
    print("📊 RÉSUMÉ FINAL")
    print("=" * 80)
    print(f"  • Test flux complet: {'✅ RÉUSSI' if test1 else '❌ ÉCHOUÉ'}")
    print(f"  • Test blocs de code: {'✅ RÉUSSI' if test2 else '❌ ÉCHOUÉ'}")
    print("=" * 80)

    success = test1 and test2
    sys.exit(0 if success else 1)
