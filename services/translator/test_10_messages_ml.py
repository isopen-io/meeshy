#!/usr/bin/env python3
"""
Test des 10 messages avec VRAIE traduction ML
"""

import sys
import os
import asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from utils.text_segmentation import EMOJI_PATTERN
from services.translation_ml_service import TranslationMLService
from config.settings import get_settings
import logging

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)


async def test_with_ml(service, name: str, text_en: str, show_details: bool = False) -> bool:
    """Test un message avec vraie traduction ML"""

    print("=" * 100)
    print(f"🧪 TEST: {name}")
    print("=" * 100)

    # Stats originales
    original_length = len(text_en)
    original_lines = text_en.count('\n')
    original_emojis = EMOJI_PATTERN.findall(text_en)

    if show_details:
        print(f"\n📥 ORIGINAL (EN) - {original_length} chars, {original_lines} lignes:")
        print("-" * 100)
        print(text_en)
        print("-" * 100)

    # Traduire
    try:
        result = await service.translate_with_structure(
            text=text_en,
            source_language="en",
            target_language="fr",
            model_type="basic"
        )

        text_fr = result.get('translated_text', '')

        # Stats traduites
        translated_length = len(text_fr)
        translated_lines = text_fr.count('\n')
        translated_emojis = EMOJI_PATTERN.findall(text_fr)

        if show_details:
            print(f"\n📤 TRADUIT (FR) - {translated_length} chars, {translated_lines} lignes:")
            print("-" * 100)
            print(text_fr)
            print("-" * 100)

        print(f"\n📊 Stats: {original_length}→{translated_length} chars, "
              f"{original_lines}→{translated_lines} lignes, "
              f"{len(original_emojis)}→{len(translated_emojis)} emojis, "
              f"{result.get('processing_time', 0):.2f}s")

        # Vérifications
        checks = []

        # 1. Texte traduit
        if text_fr != text_en:
            print("   ✅ Texte traduit")
            checks.append(True)
        else:
            print("   ❌ Texte non traduit")
            checks.append(False)

        # 2. Structure préservée
        if original_lines == translated_lines:
            print(f"   ✅ Structure préservée ({original_lines} lignes)")
            checks.append(True)
        else:
            print(f"   ⚠️  Structure modifiée ({original_lines}→{translated_lines})")
            checks.append(False)

        # 3. Emojis
        if len(original_emojis) == len(translated_emojis):
            print(f"   ✅ Emojis préservés ({len(original_emojis)})")
            checks.append(True)
        else:
            print(f"   ⚠️  Emojis modifiés ({len(original_emojis)}→{len(translated_emojis)})")
            checks.append(False)

        # 4. Code préservé (si présent)
        if '```' in text_en:
            # Vérifier que le code est présent
            code_blocks_original = text_en.split('```')
            code_blocks_translated = text_fr.split('```')

            if len(code_blocks_original) == len(code_blocks_translated):
                print(f"   ✅ Blocs de code préservés ({len(code_blocks_original)//2})")
                checks.append(True)
            else:
                print(f"   ❌ Blocs de code perdus")
                checks.append(False)

        success = all(checks)
        rate = (sum(checks) / len(checks)) * 100 if checks else 0

        print(f"\n{'='*100}")
        if success:
            print(f"✅ {name} - RÉUSSI ({rate:.0f}%)")
        else:
            print(f"⚠️  {name} - PARTIEL ({rate:.0f}%)")
        print(f"{'='*100}\n")

        return success

    except Exception as e:
        print(f"\n❌ ERREUR: {e}")
        import traceback
        traceback.print_exc()
        return False


async def run_all_tests():
    """Exécute tous les tests avec ML"""

    print("\n" + "🚀 " * 40)
    print("🚀 TESTS AVEC VRAIE TRADUCTION ML (EN → FR)")
    print("🚀 " * 40 + "\n")

    # Initialiser le service ML
    print("🔧 Initialisation du service ML...")
    settings = get_settings()
    service = TranslationMLService(settings, max_workers=2)

    init_success = await service.initialize()
    if not init_success:
        print("❌ Impossible d'initialiser le service ML")
        return False

    print("✅ Service ML initialisé\n")

    # Tests
    results = []

    # TEST 1: Message long structuré (ORIGINAL)
    results.append(await test_with_ml(
        service,
        "Message Long Structuré (900 chars)",
        """🎉 MAJOR UPDATES - Last 48 Hours 🚀

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
        show_details=True
    ))

    # TEST 2: Code Python
    results.append(await test_with_ml(
        service,
        "Code Python",
        """🔧 Quick Fix

Here's the solution:

```python
def calculate(items):
    total = 0
    for item in items:
        total += item['price']
    return total
```

Test it! ✅"""
    ))

    # TEST 3: Code JavaScript
    results.append(await test_with_ml(
        service,
        "Code JavaScript",
        """🚀 New Component

```javascript
const Profile = ({ user }) => {
    return (
        <div className="profile">
            <h1>{user.name}</h1>
        </div>
    );
};
```

Done! 🎨"""
    ))

    # TEST 4: Simple court
    results.append(await test_with_ml(
        service,
        "Message Simple",
        """🎉 Great news!

The bug is fixed. Deploy when ready! ✅"""
    ))

    # TEST 5: Listes
    results.append(await test_with_ml(
        service,
        "Message avec Listes",
        """⚙️ Requirements

**Minimum:**
- RAM: 8 GB
- CPU: 4 cores
- Storage: 50 GB

**Network:**
- Bandwidth: 100 Mbps
- Latency: < 50ms

Ready? 🚀"""
    ))

    # RAPPORT FINAL
    print("\n" + "=" * 100)
    print("📊 RAPPORT FINAL")
    print("=" * 100)

    total = len(results)
    passed = sum(results)
    rate = (passed / total) * 100 if total > 0 else 0

    print(f"\n📈 Résultats:")
    print(f"   • Total: {total} tests")
    print(f"   • Réussis: {passed} ✅")
    print(f"   • Échoués: {total - passed} ❌")
    print(f"   • Taux de réussite: {rate:.1f}%")

    if passed == total:
        print(f"\n🎉 TOUS LES TESTS ML ONT RÉUSSI !")
    else:
        print(f"\n⚠️  {total - passed} test(s) ont échoué")

    print("=" * 100)

    return passed == total


if __name__ == "__main__":
    try:
        success = asyncio.run(run_all_tests())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⏹️  Tests interrompus")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ ERREUR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
