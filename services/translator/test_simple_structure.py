#!/usr/bin/env python3
"""
Test de la nouvelle approche simplifiée : SEGMENTATION + RÉASSEMBLAGE uniquement
Sans traduction ML (pour tester la structure)
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from utils.text_segmentation import TextSegmenter

def test_preservation():
    """Test que la structure est parfaitement préservée"""

    # Texte original avec structure complexe
    original = """🎉 MAJOR UPDATES - Last 48 Hours 🚀

🎤 AUDIO RECORDING OVERHAUL
✅ Universal MP4/AAC format - works on ALL browsers
✅ Fixed Chrome buffer issues
✅ Up to 10-minute recordings

🖼️ IMAGES & ATTACHMENTS
✅ Fully responsive on all screen sizes
✅ Smart alignment based on sender/receiver"""

    print("=" * 80)
    print("TEST: Préservation parfaite de la structure")
    print("=" * 80)
    print("\n📥 TEXTE ORIGINAL:")
    print("-" * 80)
    print(original)
    print("-" * 80)

    # Segmenter
    segmenter = TextSegmenter()
    segments, emojis_map = segmenter.segment_text(original)

    print(f"\n📊 SEGMENTATION:")
    print(f"  • Segments totaux: {len(segments)}")
    print(f"  • Lignes à traduire: {len([s for s in segments if s['type'] == 'line'])}")
    print(f"  • Séparateurs: {len([s for s in segments if s['type'] == 'separator'])}")
    print(f"  • Emojis extraits: {len(emojis_map)}")

    print(f"\n📋 DÉTAIL DES SEGMENTS:")
    for i, seg in enumerate(segments):
        if seg['type'] == 'separator':
            newline_count = seg['text'].count('\n')
            print(f"  {i:2d}. [separator] {newline_count}x \\n")
        else:
            preview = seg['text'][:50] + '...' if len(seg['text']) > 50 else seg['text']
            print(f"  {i:2d}. [{seg['type']:10}] {preview}")

    # Réassembler (sans traduire, juste pour tester)
    reassembled = segmenter.reassemble_text(segments, emojis_map)

    print("\n📤 TEXTE RÉASSEMBLÉ:")
    print("-" * 80)
    print(reassembled)
    print("-" * 80)

    # Vérifier
    print("\n🔍 VÉRIFICATION:")

    checks = []

    # 1. Texte identique
    if reassembled == original:
        print("  ✅ Texte identique à l'original")
        checks.append(True)
    else:
        print("  ❌ Texte différent de l'original")
        print(f"     Expected length: {len(original)}")
        print(f"     Got length:      {len(reassembled)}")
        checks.append(False)

    # 2. Même nombre de lignes
    original_lines = original.count('\n')
    reassembled_lines = reassembled.count('\n')
    if original_lines == reassembled_lines:
        print(f"  ✅ Même nombre de sauts de ligne ({original_lines})")
        checks.append(True)
    else:
        print(f"  ❌ Nombre de sauts de ligne différent ({original_lines} → {reassembled_lines})")
        checks.append(False)

    # 3. Même nombre d'emojis
    import re
    from utils.text_segmentation import EMOJI_PATTERN
    original_emojis = EMOJI_PATTERN.findall(original)
    reassembled_emojis = EMOJI_PATTERN.findall(reassembled)
    if len(original_emojis) == len(reassembled_emojis):
        print(f"  ✅ Même nombre d'emojis ({len(original_emojis)})")
        checks.append(True)
    else:
        print(f"  ❌ Nombre d'emojis différent ({len(original_emojis)} → {len(reassembled_emojis)})")
        checks.append(False)

    # Résultat
    success = all(checks)
    print("\n" + "=" * 80)
    if success:
        print("✅ TEST RÉUSSI - Structure parfaitement préservée!")
    else:
        print("❌ TEST ÉCHOUÉ - Structure non préservée")
    print("=" * 80)

    return success


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.WARNING)

    success = test_preservation()
    sys.exit(0 if success else 1)
