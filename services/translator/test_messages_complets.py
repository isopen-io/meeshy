#!/usr/bin/env python3
"""
Tests complets avec messages réalistes
Incluant le message long structuré original de 900 chars
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from utils.text_segmentation import TextSegmenter, EMOJI_PATTERN
import logging

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)


def test_message(name: str, text: str, show_segments: bool = False) -> bool:
    """Test un message complet"""

    print("=" * 100)
    print(f"🧪 TEST: {name}")
    print("=" * 100)

    # Stats originales
    original_length = len(text)
    original_lines = text.count('\n')
    original_emojis = EMOJI_PATTERN.findall(text)

    print(f"\n📥 TEXTE ORIGINAL ({original_length} chars, {original_lines} lignes, {len(original_emojis)} emojis):")
    print("-" * 100)
    print(text)
    print("-" * 100)

    # Segmentation
    segmenter = TextSegmenter()
    segments, emojis_map = segmenter.segment_text(text)

    # Compter les types
    line_segments = [s for s in segments if s['type'] == 'line']
    code_segments = [s for s in segments if s['type'] == 'code']
    separator_segments = [s for s in segments if s['type'] == 'separator']

    print(f"\n📊 SEGMENTATION:")
    print(f"   • Total segments: {len(segments)}")
    print(f"   • Lignes à traduire: {len(line_segments)}")
    print(f"   • Blocs de code (NON traduits): {len(code_segments)}")
    print(f"   • Séparateurs: {len(separator_segments)}")
    print(f"   • Emojis extraits: {len(emojis_map)}")

    if show_segments:
        print(f"\n📋 DÉTAIL DES SEGMENTS:")
        for i, seg in enumerate(segments):
            seg_type = seg['type']
            seg_text = seg['text']

            if seg_type == 'separator':
                print(f"   {i:2d}. [separator] {seg_text.count(chr(10))}x \\n")
            elif seg_type == 'code':
                preview = seg_text[:50] + '...' if len(seg_text) > 50 else seg_text
                print(f"   {i:2d}. [CODE     ] {repr(preview)}")
            else:
                preview = seg_text[:50] + '...' if len(seg_text) > 50 else seg_text
                print(f"   {i:2d}. [{seg_type:9}] {repr(preview)}")

    # Réassemblage (sans traduction pour tester la préservation)
    reassembled = segmenter.reassemble_text(segments, emojis_map)

    # Stats réassemblées
    reassembled_length = len(reassembled)
    reassembled_lines = reassembled.count('\n')
    reassembled_emojis = EMOJI_PATTERN.findall(reassembled)

    print(f"\n📤 TEXTE RÉASSEMBLÉ ({reassembled_length} chars, {reassembled_lines} lignes, {len(reassembled_emojis)} emojis):")
    print("-" * 100)
    print(reassembled)
    print("-" * 100)

    # Vérifications
    print(f"\n🔍 VÉRIFICATIONS:")
    checks = []

    # 1. Texte identique
    if text == reassembled:
        print(f"   ✅ Texte identique à l'original")
        checks.append(True)
    else:
        print(f"   ❌ Texte différent")
        print(f"      Longueur: {original_length} → {reassembled_length}")
        checks.append(False)

    # 2. Structure préservée
    if original_lines == reassembled_lines:
        print(f"   ✅ Structure préservée ({original_lines} lignes)")
        checks.append(True)
    else:
        print(f"   ❌ Structure modifiée ({original_lines} → {reassembled_lines} lignes)")
        checks.append(False)

    # 3. Emojis préservés
    if len(original_emojis) == len(reassembled_emojis):
        print(f"   ✅ Emojis préservés ({len(original_emojis)})")
        checks.append(True)
    else:
        print(f"   ❌ Emojis perdus ({len(original_emojis)} → {len(reassembled_emojis)})")
        checks.append(False)

    # 4. Blocs de code détectés (si présents)
    if '```' in text:
        if len(code_segments) > 0:
            print(f"   ✅ Blocs de code détectés ({len(code_segments)} segments)")
            checks.append(True)
        else:
            print(f"   ❌ Blocs de code non détectés")
            checks.append(False)

    # Résultat
    success = all(checks)
    success_rate = (sum(checks) / len(checks)) * 100 if checks else 0

    print(f"\n{'='*100}")
    if success:
        print(f"✅ TEST RÉUSSI - {name} ({success_rate:.0f}%)")
    else:
        failed = len(checks) - sum(checks)
        print(f"❌ TEST ÉCHOUÉ - {name} ({failed}/{len(checks)} vérifications échouées)")
    print(f"{'='*100}\n")

    return success


def run_all_tests():
    """Exécute tous les tests"""

    print("\n" + "🚀 " * 40)
    print("🚀 TESTS COMPLETS - MESSAGES RÉALISTES")
    print("🚀 " * 40 + "\n")

    tests = []

    # ========================================================================
    # TEST 1: MESSAGE LONG STRUCTURÉ (900 chars) - ORIGINAL DE L'UTILISATEUR
    # ========================================================================
    tests.append(test_message(
        name="Message Long Structuré (900 chars) - ORIGINAL",
        text="""🎉 MAJOR UPDATES - Last 48 Hours 🚀

🎤 AUDIO RECORDING OVERHAUL
✅ Universal MP4/AAC format - works on ALL browsers (Safari, Chrome, Firefox, Brave)
✅ Fixed Chrome buffer issues - no more audio glitches!
✅ Up to 10-minute recordings supported
✅ Multiple audio files in single message
✅ Smart send button - disabled during recording
✅ Optimized blob & memory management

🖼️ IMAGES & ATTACHMENTS
✅ Fully responsive on all screen sizes
✅ Smart alignment based on sender/receiver
✅ Optimized PNG support
✅ Enhanced image carousel

🔗 SECURE CONVERSATION LINKS
✅ Quick link creation modal
✅ New params: requireAccount & requireBirthday
✅ 2-step config with summary

⚡ PERFORMANCE & UX
✅ Google Analytics integrated
✅ Real-time WebSocket fixes
✅ Repositioned message actions
✅ Optimized mobile UI/UX

📊 40+ commits | Performance boost | Better audio quality!

#Meeshy #Updates #RealTimeMessaging #AudioMessages""",
        show_segments=False
    ))

    # ========================================================================
    # TEST 2: MESSAGE AVEC CODE PYTHON
    # ========================================================================
    tests.append(test_message(
        name="Message avec Code Python",
        text="""🔧 Quick Fix Needed

Here's the solution:

```python
def calculate_total(items):
    total = 0
    for item in items:
        total += item['price']
    return total
```

Please test and confirm! ✅""",
        show_segments=True
    ))

    # ========================================================================
    # TEST 3: MESSAGE AVEC CODE JAVASCRIPT
    # ========================================================================
    tests.append(test_message(
        name="Message avec Code JavaScript",
        text="""🚀 New React Component

Check this out:

```javascript
const UserProfile = ({ user }) => {
    return (
        <div className="profile">
            <h1>{user.name}</h1>
            <p>{user.email}</p>
        </div>
    );
};
```

Looks good? 🎨""",
        show_segments=False
    ))

    # ========================================================================
    # TEST 4: MESSAGE AVEC MULTIPLES BLOCS DE CODE
    # ========================================================================
    tests.append(test_message(
        name="Message avec Multiples Blocs de Code",
        text="""📚 Migration Guide

**Backend changes:**

```python
# Old way
def get_user(id):
    return db.query(User).get(id)
```

**Frontend changes:**

```javascript
// New API call
const user = await fetch(`/api/users/${id}`);
```

Both need to be updated! ⚠️""",
        show_segments=False
    ))

    # ========================================================================
    # TEST 5: MESSAGE TECHNIQUE AVEC LISTES
    # ========================================================================
    tests.append(test_message(
        name="Message Technique avec Listes",
        text="""⚙️ System Requirements

**Minimum:**
- RAM: 8 GB
- CPU: 4 cores
- Storage: 50 GB SSD

**Recommended:**
- RAM: 16 GB
- CPU: 8 cores
- Storage: 100 GB NVMe

**Network:**
- Bandwidth: 100 Mbps
- Latency: < 50ms

Ready to deploy? 🚀""",
        show_segments=False
    ))

    # ========================================================================
    # TEST 6: MESSAGE MARKDOWN COMPLEXE
    # ========================================================================
    tests.append(test_message(
        name="Message Markdown Complexe",
        text="""📝 Documentation Update

# Getting Started

## Installation

Run these commands:

```bash
npm install
npm run build
npm start
```

## Configuration

Edit `config.json`:

```json
{
    "port": 3000,
    "host": "localhost"
}
```

## Important Notes

- ⚠️ Always backup before updates
- 🔒 Use HTTPS in production
- 📊 Monitor performance metrics

Questions? Let me know! 💬""",
        show_segments=False
    ))

    # ========================================================================
    # TEST 7: MESSAGE SIMPLE COURT
    # ========================================================================
    tests.append(test_message(
        name="Message Simple Court",
        text="""🎉 Great news!

The bug is fixed. Deploy when ready! ✅""",
        show_segments=False
    ))

    # ========================================================================
    # TEST 8: MESSAGE AVEC LIGNES VIDES MULTIPLES
    # ========================================================================
    tests.append(test_message(
        name="Message avec Lignes Vides Multiples",
        text="""📢 Announcement


Please note:


Server maintenance tonight



Estimated downtime: 2 hours ⏰""",
        show_segments=False
    ))

    # ========================================================================
    # TEST 9: MESSAGE AVEC EMOJIS COLLÉS
    # ========================================================================
    tests.append(test_message(
        name="Message avec Emojis Collés",
        text="""Update🎉complete!

Everything🚀works🎯perfectly✅

No🚫issues👍found!""",
        show_segments=False
    ))

    # ========================================================================
    # TEST 10: MESSAGE MEETING NOTES
    # ========================================================================
    tests.append(test_message(
        name="Meeting Notes Structurées",
        text="""📅 Team Meeting - Dec 5th

**Attendees:** John, Sarah, Mike, Lisa

**Topics Discussed:**

1. Q4 Results
   - Revenue: +25%
   - User growth: +40%
   - Churn rate: -10%

2. Roadmap 2025
   - Mobile app launch
   - AI features
   - Enterprise plan

3. Action Items
   ✅ John: Finalize budget
   ✅ Sarah: Design mockups
   ✅ Mike: Setup CI/CD
   ✅ Lisa: Marketing plan

**Next Meeting:** Dec 12th @ 10:00 AM

Notes saved! 📝""",
        show_segments=False
    ))

    # ========================================================================
    # RAPPORT FINAL
    # ========================================================================
    print("\n" + "=" * 100)
    print("📊 RAPPORT FINAL")
    print("=" * 100)

    total = len(tests)
    passed = sum(tests)
    failed = total - passed
    rate = (passed / total) * 100 if total > 0 else 0

    print(f"\n📈 Résultats:")
    print(f"   • Total de tests: {total}")
    print(f"   • Réussis: {passed} ✅")
    print(f"   • Échoués: {failed} ❌")
    print(f"   • Taux de réussite: {rate:.1f}%")

    if passed == total:
        print(f"\n🎉 TOUS LES TESTS ONT RÉUSSI !")
    elif passed > 0:
        print(f"\n⚠️  {failed} test(s) ont échoué")
    else:
        print(f"\n❌ TOUS LES TESTS ONT ÉCHOUÉ")

    print("=" * 100)

    return passed == total


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
