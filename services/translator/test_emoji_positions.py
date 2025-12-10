#!/usr/bin/env python3
"""
Test de préservation des positions d'emojis (début/fin de phrase/ligne)
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from utils.text_segmentation import TextSegmenter

# Tests spécifiques pour les emojis en début et fin
test_cases = [
    {
        'name': 'Emoji au début',
        'text': '🎉 Hello world!'
    },
    {
        'name': 'Emoji à la fin',
        'text': 'Hello world! 🎉'
    },
    {
        'name': 'Emojis début et fin',
        'text': '🎉 Hello world! 🚀'
    },
    {
        'name': 'Emoji début de ligne',
        'text': 'First line\n🎉 Second line\nThird line'
    },
    {
        'name': 'Emoji fin de ligne',
        'text': 'First line 🎉\nSecond line\nThird line 🚀'
    },
    {
        'name': 'Multiple emojis mixtes',
        'text': '🎉 Title\n\n✅ Item 1\n✅ Item 2\n\nEnd message 🚀'
    }
]

def test_emoji_preservation():
    """Test que les emojis sont bien préservés aux bonnes positions"""
    print("="*80)
    print("🧪 TEST DE PRÉSERVATION DES POSITIONS D'EMOJIS")
    print("="*80)

    segmenter = TextSegmenter(max_segment_length=100)
    results = []

    for test in test_cases:
        print(f"\n📋 Test: {test['name']}")
        print(f"Original: {repr(test['text'])}")

        # Segmenter
        segments, emojis_map = segmenter.segment_text(test['text'])

        # Réassembler
        reassembled = segmenter.reassemble_text(segments, emojis_map)

        print(f"Réassemblé: {repr(reassembled)}")

        # Vérifier
        if reassembled == test['text']:
            print("✅ IDENTIQUE")
            results.append(True)
        else:
            print("❌ DIFFÉRENT")
            print(f"   Attendu: {repr(test['text'])}")
            print(f"   Obtenu:  {repr(reassembled)}")
            results.append(False)

    print("\n" + "="*80)
    passed = sum(results)
    total = len(results)
    print(f"📊 Résultats: {passed}/{total} tests réussis ({100*passed/total:.0f}%)")
    print("="*80)

    return all(results)


def show_model_selection_logic():
    """Affiche la logique de sélection automatique des modèles"""
    print("\n" + "="*80)
    print("🤖 LOGIQUE DE SÉLECTION AUTOMATIQUE DES MODÈLES")
    print("="*80)

    test_lengths = [25, 49, 50, 100, 199, 200, 500, 900]

    print("\nSélection selon la longueur du texte:")
    print("-" * 80)

    for length in test_lengths:
        if length >= 200:
            model = "PREMIUM"
            reason = "≥ 200 chars → qualité maximale"
        elif length >= 50:
            model = "MEDIUM"
            reason = "≥ 50 chars → meilleure qualité"
        else:
            model = "BASIC"
            reason = "< 50 chars → rapide"

        print(f"  {length:4d} chars → {model:7} ({reason})")

    print("-" * 80)


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.WARNING)

    # Test de préservation des emojis
    success = test_emoji_preservation()

    # Afficher la logique de sélection
    show_model_selection_logic()

    sys.exit(0 if success else 1)
