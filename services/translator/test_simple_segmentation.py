#!/usr/bin/env python3
"""
Test de la nouvelle segmentation simplifiée basée sur les retours à la ligne
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from utils.text_segmentation import TextSegmenter

def test_simple_lines():
    """Test avec lignes simples"""
    print("=" * 80)
    print("TEST 1: Lignes simples")
    print("=" * 80)

    text = """🎉 First line
Second line
Third line 🚀"""

    print(f"Original:\n{repr(text)}\n")

    segmenter = TextSegmenter()
    segments, emojis_map = segmenter.segment_text(text)

    print(f"Segments ({len(segments)}):")
    for i, seg in enumerate(segments):
        print(f"  {i}. [{seg['type']:10}] {repr(seg['text'])}")

    print(f"\nEmojis: {emojis_map}")

    # Réassembler
    reassembled = segmenter.reassemble_text(segments, emojis_map)

    print(f"\nReassembled:\n{repr(reassembled)}")
    print(f"\nMatch: {reassembled == text} ✅" if reassembled == text else f"\nMatch: {reassembled == text} ❌")

    if reassembled != text:
        print(f"\n⚠️  DIFF:")
        print(f"  Expected: {repr(text)}")
        print(f"  Got:      {repr(reassembled)}")

    return reassembled == text


def test_double_newlines():
    """Test avec doubles retours à la ligne (paragraphes)"""
    print("\n" + "=" * 80)
    print("TEST 2: Doubles retours à la ligne")
    print("=" * 80)

    text = """🎉 First paragraph

Second paragraph
With two lines

Third paragraph 🚀"""

    print(f"Original:\n{repr(text)}\n")

    segmenter = TextSegmenter()
    segments, emojis_map = segmenter.segment_text(text)

    print(f"Segments ({len(segments)}):")
    for i, seg in enumerate(segments):
        print(f"  {i}. [{seg['type']:10}] {repr(seg['text'])}")

    print(f"\nEmojis: {emojis_map}")

    # Réassembler
    reassembled = segmenter.reassemble_text(segments, emojis_map)

    print(f"\nReassembled:\n{repr(reassembled)}")
    print(f"\nMatch: {reassembled == text} ✅" if reassembled == text else f"\nMatch: {reassembled == text} ❌")

    if reassembled != text:
        print(f"\n⚠️  DIFF:")
        print(f"  Expected: {repr(text)}")
        print(f"  Got:      {repr(reassembled)}")

    return reassembled == text


def test_multiple_newlines():
    """Test avec multiples retours à la ligne"""
    print("\n" + "=" * 80)
    print("TEST 3: Multiples retours à la ligne (3x \\n)")
    print("=" * 80)

    text = """Title


Content with 3 newlines above"""

    print(f"Original:\n{repr(text)}\n")

    segmenter = TextSegmenter()
    segments, emojis_map = segmenter.segment_text(text)

    print(f"Segments ({len(segments)}):")
    for i, seg in enumerate(segments):
        print(f"  {i}. [{seg['type']:10}] {repr(seg['text'])}")

    # Réassembler
    reassembled = segmenter.reassemble_text(segments, emojis_map)

    print(f"\nReassembled:\n{repr(reassembled)}")
    print(f"\nMatch: {reassembled == text} ✅" if reassembled == text else f"\nMatch: {reassembled == text} ❌")

    if reassembled != text:
        print(f"\n⚠️  DIFF:")
        print(f"  Expected: {repr(text)}")
        print(f"  Got:      {repr(reassembled)}")
        print(f"  Expected newlines: {text.count(chr(10))}")
        print(f"  Got newlines:      {reassembled.count(chr(10))}")

    return reassembled == text


def test_complex_structure():
    """Test avec structure complexe (exemple réel)"""
    print("\n" + "=" * 80)
    print("TEST 4: Structure complexe avec emojis et listes")
    print("=" * 80)

    text = """🎉 MAJOR UPDATES - Last 48 Hours 🚀

🎤 AUDIO RECORDING OVERHAUL
✅ Universal MP4/AAC format
✅ Fixed Chrome buffer issues
✅ Up to 10-minute recordings

🖼️ IMAGES & ATTACHMENTS
✅ Fully responsive
✅ Smart alignment"""

    print(f"Original:\n{text}\n")
    print(f"Original (repr):\n{repr(text)}\n")

    segmenter = TextSegmenter()
    segments, emojis_map = segmenter.segment_text(text)

    print(f"Segments ({len(segments)}):")
    for i, seg in enumerate(segments):
        if seg['type'] == 'separator':
            sep_repr = seg['text'].replace('\n', '\\n')
            print(f"  {i}. [{seg['type']:10}] {repr(sep_repr)} ({len(seg['text'])} newlines)")
        else:
            print(f"  {i}. [{seg['type']:10}] {repr(seg['text'])}")

    print(f"\nEmojis ({len(emojis_map)}): {list(emojis_map.values())}")

    # Réassembler
    reassembled = segmenter.reassemble_text(segments, emojis_map)

    print(f"\nReassembled:\n{reassembled}\n")
    print(f"Reassembled (repr):\n{repr(reassembled)}\n")

    print(f"\nMatch: {reassembled == text} ✅" if reassembled == text else f"\nMatch: {reassembled == text} ❌")

    if reassembled != text:
        print(f"\n⚠️  DIFF:")
        print(f"  Expected lines: {text.count(chr(10))}")
        print(f"  Got lines:      {reassembled.count(chr(10))}")
        print(f"  Expected emojis: {len([c for c in text if ord(c) > 0x1F300])}")
        print(f"  Got emojis:      {len([c for c in reassembled if ord(c) > 0x1F300])}")

    return reassembled == text


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.WARNING)

    results = []

    results.append(("Lignes simples", test_simple_lines()))
    results.append(("Doubles retours à la ligne", test_double_newlines()))
    results.append(("Multiples retours à la ligne", test_multiple_newlines()))
    results.append(("Structure complexe", test_complex_structure()))

    print("\n" + "=" * 80)
    print("RÉSUMÉ DES TESTS")
    print("=" * 80)

    for name, success in results:
        emoji = "✅" if success else "❌"
        print(f"  {emoji} {name}")

    passed = sum(1 for _, s in results if s)
    total = len(results)
    print(f"\n{passed}/{total} tests réussis ({100*passed/total:.0f}%)")

    sys.exit(0 if all(s for _, s in results) else 1)
