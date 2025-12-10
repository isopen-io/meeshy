#!/usr/bin/env python3
"""
Test de segmentation de traduction - Simulation complète
Tests exhaustifs avec structures variées (simple → complexe → inattendu)
IMPORTANT: Préservation de la structure initiale

Ce test vérifie la segmentation et le réassemblage sans traduction ML réelle
pour valider la préservation de structure
"""

import sys
import os
import logging
import re
from pathlib import Path
from typing import Dict, Any, List
from dataclasses import dataclass

# Ajouter le répertoire src au path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

try:
    from utils.text_segmentation import TextSegmenter, EMOJI_PATTERN
    SERVICE_AVAILABLE = True
except ImportError as e:
    logger.error(f"❌ Impossible d'importer le segmenteur: {e}")
    SERVICE_AVAILABLE = False
    sys.exit(1)


@dataclass
class TestCase:
    """Cas de test avec métadonnées"""
    name: str
    text: str
    expected_emojis_count: int
    expected_lines_tolerance: int
    category: str


# ============================================================================
# CAS DE TEST - SIMPLES (< 100 caractères)
# ============================================================================

SIMPLE_TEST_CASES = [
    TestCase(
        name="Simple greeting",
        text="Hello, how are you today?",
        expected_emojis_count=0,
        expected_lines_tolerance=0,
        category="simple"
    ),
    TestCase(
        name="Simple greeting with emoji",
        text="Hello! 😊 How are you?",
        expected_emojis_count=1,
        expected_lines_tolerance=0,
        category="simple"
    ),
    TestCase(
        name="Question with emoji",
        text="What's the weather like? ☀️",
        expected_emojis_count=1,
        expected_lines_tolerance=0,
        category="simple"
    ),
    TestCase(
        name="Multiple emojis",
        text="Great work! 👍 🎉 Keep it up! 🚀",
        expected_emojis_count=3,
        expected_lines_tolerance=0,
        category="simple"
    ),
    TestCase(
        name="Two lines simple",
        text="First line\nSecond line",
        expected_emojis_count=0,
        expected_lines_tolerance=1,
        category="simple"
    ),
    TestCase(
        name="Three lines with emojis",
        text="Line 1 🎉\nLine 2 🚀\nLine 3 ✅",
        expected_emojis_count=3,
        expected_lines_tolerance=1,
        category="simple"
    ),
]

# ============================================================================
# CAS DE TEST - MOYENS (100-200 caractères)
# ============================================================================

MEDIUM_TEST_CASES = [
    TestCase(
        name="Product announcement (150 chars)",
        text="🎉 New Feature Alert!\n\nWe've just launched our new dashboard with real-time analytics. Check it out now and let us know what you think! 📊",
        expected_emojis_count=2,
        expected_lines_tolerance=2,
        category="medium"
    ),
    TestCase(
        name="List with checkmarks (180 chars)",
        text="✅ Task completed\n✅ Files uploaded\n✅ Report generated\n✅ Email sent\n\nAll systems are working perfectly! Great job team! 🎯",
        expected_emojis_count=5,
        expected_lines_tolerance=3,
        category="medium"
    ),
    TestCase(
        name="Technical update (165 chars)",
        text="🔧 System Update\n\n- Fixed memory leak in API\n- Improved database performance\n- Updated security patches\n\nDowntime: 5 minutes ⏰",
        expected_emojis_count=2,
        expected_lines_tolerance=3,
        category="medium"
    ),
    TestCase(
        name="Event invitation (145 chars)",
        text="📅 Team Meeting Tomorrow\n\nTime: 10:00 AM\nLocation: Conference Room A\nTopic: Q4 Planning\n\nPlease bring your laptops! 💼",
        expected_emojis_count=2,
        expected_lines_tolerance=3,
        category="medium"
    ),
    TestCase(
        name="Structured announcement (190 chars)",
        text="🚀 Product Launch - Beta v2.0\n\n🎨 New Features:\n- Dark mode support\n- Custom themes\n- Export functionality\n\n📊 Performance:\n- 50% faster loading\n- Reduced memory usage",
        expected_emojis_count=3,
        expected_lines_tolerance=4,
        category="medium"
    ),
]

# ============================================================================
# CAS DE TEST - COMPLEXES (200-500 caractères, structures riches)
# ============================================================================

COMPLEX_TEST_CASES = [
    TestCase(
        name="Release notes (original user example)",
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
        expected_emojis_count=24,
        expected_lines_tolerance=5,
        category="complex"
    ),
    TestCase(
        name="Multi-section guide (320 chars)",
        text="""📚 Quick Start Guide

🔐 STEP 1: SETUP
- Create your account
- Verify your email
- Set up 2FA

🎨 STEP 2: CUSTOMIZE
- Choose your theme
- Upload profile picture
- Set preferences

🚀 STEP 3: GET STARTED
- Invite team members
- Create first project
- Start collaborating!

Need help? Contact support@example.com 💬""",
        expected_emojis_count=5,
        expected_lines_tolerance=7,
        category="complex"
    ),
    TestCase(
        name="Status report (280 chars)",
        text="""📊 WEEKLY STATUS REPORT

✅ COMPLETED
• Backend API deployment
• Database migration
• Security audit

🔄 IN PROGRESS
• Frontend redesign (80%)
• Mobile app testing (60%)
• Documentation update (40%)

⏰ UPCOMING
• User training session
• Product launch
• Marketing campaign

Team velocity: +25% 📈""",
        expected_emojis_count=4,
        expected_lines_tolerance=7,
        category="complex"
    ),
]

# ============================================================================
# CAS DE TEST - INATTENDUS (structures inhabituelles)
# ============================================================================

UNEXPECTED_TEST_CASES = [
    TestCase(
        name="Mixed languages",
        text="Hello! Comment ça va? 😊 Wie geht's? こんにちは",
        expected_emojis_count=1,
        expected_lines_tolerance=1,
        category="unexpected"
    ),
    TestCase(
        name="Code snippet in text",
        text="""Quick fix needed:

```python
def hello():
    print("Hello World")
```

Please review! 🔍""",
        expected_emojis_count=1,
        expected_lines_tolerance=3,
        category="unexpected"
    ),
    TestCase(
        name="URLs and hashtags",
        text="Check out our new site: https://example.com 🌐\n\nFollow us: #Tech #Innovation #AI 🚀",
        expected_emojis_count=2,
        expected_lines_tolerance=2,
        category="unexpected"
    ),
    TestCase(
        name="Emoji bombardment",
        text="🎉🎊🥳🎈🎁 CELEBRATION TIME! 🎂🍰🧁🍪🍩",
        expected_emojis_count=10,
        expected_lines_tolerance=0,
        category="unexpected"
    ),
    TestCase(
        name="Special characters",
        text="Price: $99.99 → $79.99 (20% OFF!) 💰\n\nOffer ends: 12/31/2024 @ 11:59 PM ⏰",
        expected_emojis_count=2,
        expected_lines_tolerance=2,
        category="unexpected"
    ),
    TestCase(
        name="Markdown formatting",
        text="""**Important Notice**

*Please note:*
- Bold text supported
- _Italic text_ supported
- ~~Strikethrough~~ too!

Read more → [docs](link) 📖""",
        expected_emojis_count=1,
        expected_lines_tolerance=4,
        category="unexpected"
    ),
    TestCase(
        name="Empty lines preservation",
        text="Line 1\n\n\nLine 2\n\n\n\nLine 3",
        expected_emojis_count=0,
        expected_lines_tolerance=5,
        category="unexpected"
    ),
    TestCase(
        name="Emoji at word boundaries",
        text="Start🎉middle🚀end ✅ proper spacing",
        expected_emojis_count=3,
        expected_lines_tolerance=0,
        category="unexpected"
    ),
]

# Combiner tous les cas de test
ALL_TEST_CASES = SIMPLE_TEST_CASES + MEDIUM_TEST_CASES + COMPLEX_TEST_CASES + UNEXPECTED_TEST_CASES


def test_single_case(segmenter: TextSegmenter, test_case: TestCase) -> Dict[str, Any]:
    """
    Test un seul cas de segmentation/réassemblage
    """
    try:
        logger.info(f"\n{'='*80}")
        logger.info(f"🧪 TEST: {test_case.name} ({test_case.category})")
        logger.info(f"{'='*80}")
        logger.info(f"📝 Texte original ({len(test_case.text)} chars, {test_case.text.count(chr(10))} lignes):")
        logger.info(f"{test_case.text}")
        logger.info(f"{'-'*80}")

        # Segmentation
        segments, emojis_map = segmenter.segment_text(test_case.text)

        logger.info(f"📊 Segmentation: {len(segments)} segments, {len(emojis_map)} emojis extraits")

        # Réassemblage (sans traduction réelle, juste pour tester la structure)
        reassembled = segmenter.reassemble_text(segments, emojis_map)

        logger.info(f"📝 Texte réassemblé ({len(reassembled)} chars, {reassembled.count(chr(10))} lignes):")
        logger.info(f"{reassembled}")
        logger.info(f"{'-'*80}")

        # ============================================================
        # VÉRIFICATIONS
        # ============================================================

        errors = []
        warnings = []

        # 1. Vérifier identité parfaite
        if reassembled != test_case.text:
            errors.append("Texte réassemblé différent de l'original")

            # Détails des différences
            if len(reassembled) != len(test_case.text):
                errors.append(f"Longueur différente: {len(test_case.text)} → {len(reassembled)}")

            original_lines = test_case.text.count('\n')
            reassembled_lines = reassembled.count('\n')
            if original_lines != reassembled_lines:
                errors.append(f"Lignes différentes: {original_lines} → {reassembled_lines}")

        # 2. Vérifier les emojis
        original_emojis = EMOJI_PATTERN.findall(test_case.text)
        reassembled_emojis = EMOJI_PATTERN.findall(reassembled)

        if len(original_emojis) != len(reassembled_emojis):
            errors.append(f"Emojis perdus: {len(original_emojis)} → {len(reassembled_emojis)}")

        # 3. Vérifier qu'il n'y a pas de placeholders
        remaining_placeholders = re.findall(r'🔹EMOJI_\d+🔹', reassembled)
        if remaining_placeholders:
            errors.append(f"Placeholders non remplacés: {len(remaining_placeholders)}")

        # 4. Vérifier les emojis mal placés
        misplaced_emoji_pattern = re.compile(r'\w[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B50]+\w', flags=re.UNICODE)
        misplaced_emojis = misplaced_emoji_pattern.findall(reassembled)
        if misplaced_emojis:
            errors.append(f"Emojis mal placés: {misplaced_emojis}")

        # ============================================================
        # RÉSULTAT
        # ============================================================

        success = len(errors) == 0

        if success:
            logger.info(f"✅ TEST RÉUSSI: {test_case.name}")
        else:
            logger.error(f"❌ TEST ÉCHOUÉ: {test_case.name}")
            for error in errors:
                logger.error(f"   - {error}")

        return {
            'test_name': test_case.name,
            'category': test_case.category,
            'success': success,
            'errors': errors,
            'warnings': warnings,
            'emojis_extracted': len(emojis_map),
            'segments_count': len(segments)
        }

    except Exception as e:
        logger.error(f"❌ Exception: {e}", exc_info=True)
        return {
            'test_name': test_case.name,
            'category': test_case.category,
            'success': False,
            'error': str(e)
        }


def run_all_tests():
    """
    Exécute tous les tests
    """
    logger.info("\n" + "="*80)
    logger.info("🚀 TESTS COMPLETS DE SEGMENTATION/RÉASSEMBLAGE")
    logger.info(f"📋 {len(ALL_TEST_CASES)} cas de test")
    logger.info("="*80)

    segmenter = TextSegmenter(max_segment_length=100)
    results = []

    for test_case in ALL_TEST_CASES:
        result = test_single_case(segmenter, test_case)
        results.append(result)

    # ============================================================
    # RAPPORT FINAL
    # ============================================================

    logger.info("\n" + "="*80)
    logger.info("📊 RAPPORT FINAL")
    logger.info("="*80)

    # Statistiques par catégorie
    categories = {}
    for result in results:
        category = result['category']
        if category not in categories:
            categories[category] = {'total': 0, 'passed': 0, 'failed': 0}

        categories[category]['total'] += 1
        if result['success']:
            categories[category]['passed'] += 1
        else:
            categories[category]['failed'] += 1

    logger.info("\n📈 Résultats par catégorie:")
    for category, stats in sorted(categories.items()):
        success_rate = (stats['passed'] / stats['total']) * 100 if stats['total'] > 0 else 0
        emoji = "✅" if success_rate == 100 else "⚠️" if success_rate >= 80 else "❌"
        logger.info(f"   {emoji} {category.upper():12} : {stats['passed']}/{stats['total']} réussis ({success_rate:.1f}%)")

    # Statistiques globales
    total_tests = len(results)
    passed_tests = sum(1 for r in results if r['success'])
    failed_tests = total_tests - passed_tests
    success_rate = (passed_tests / total_tests) * 100 if total_tests > 0 else 0

    logger.info(f"\n📊 Résultats globaux:")
    logger.info(f"   Total:   {total_tests} tests")
    logger.info(f"   Réussis: {passed_tests} ✅")
    logger.info(f"   Échoués: {failed_tests} ❌")
    logger.info(f"   Taux de réussite: {success_rate:.1f}%")

    # Tests échoués
    if failed_tests > 0:
        logger.info(f"\n❌ Tests échoués:")
        for result in results:
            if not result['success']:
                logger.info(f"   - {result['test_name']} ({result['category']})")
                if 'errors' in result:
                    for error in result['errors']:
                        logger.info(f"     • {error}")

    logger.info("\n" + "="*80)

    if success_rate == 100:
        logger.info("🎉 TOUS LES TESTS ONT RÉUSSI!")
        return True
    else:
        logger.error(f"❌ {failed_tests} test(s) ont échoué")
        return False


if __name__ == "__main__":
    import sys
    success = run_all_tests()
    sys.exit(0 if success else 1)
