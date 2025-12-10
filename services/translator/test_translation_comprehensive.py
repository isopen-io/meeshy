#!/usr/bin/env python3
"""
Test complet de traduction - Simulation flux nominal ZMQ
Tests exhaustifs avec structures variées (simple → complexe → inattendu)
IMPORTANT: Préservation de la structure initiale
"""

import sys
import os
import asyncio
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
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

try:
    from services.translation_ml_service import TranslationMLService
    from config.settings import get_settings
    from utils.text_segmentation import EMOJI_PATTERN
    SERVICE_AVAILABLE = True
except ImportError as e:
    logger.error(f"❌ Impossible d'importer le service: {e}")
    SERVICE_AVAILABLE = False


@dataclass
class TestCase:
    """Cas de test avec métadonnées"""
    name: str
    text: str
    source_lang: str
    target_lang: str
    expected_min_length: int  # Longueur minimale attendue de la traduction
    expected_emojis_count: int
    expected_lines_tolerance: int  # Tolérance pour le nombre de lignes (± N)
    category: str  # "simple", "medium", "complex", "unexpected"


# ============================================================================
# CAS DE TEST - SIMPLES (< 100 caractères)
# ============================================================================

SIMPLE_TEST_CASES = [
    TestCase(
        name="Simple greeting",
        text="Hello, how are you today?",
        source_lang="en",
        target_lang="fr",
        expected_min_length=15,
        expected_emojis_count=0,
        expected_lines_tolerance=0,
        category="simple"
    ),
    TestCase(
        name="Simple greeting with emoji",
        text="Hello! 😊 How are you?",
        source_lang="en",
        target_lang="fr",
        expected_min_length=15,
        expected_emojis_count=1,
        expected_lines_tolerance=0,
        category="simple"
    ),
    TestCase(
        name="Question with emoji",
        text="What's the weather like? ☀️",
        source_lang="en",
        target_lang="fr",
        expected_min_length=15,
        expected_emojis_count=1,
        expected_lines_tolerance=0,
        category="simple"
    ),
    TestCase(
        name="Multiple emojis",
        text="Great work! 👍 🎉 Keep it up! 🚀",
        source_lang="en",
        target_lang="fr",
        expected_min_length=20,
        expected_emojis_count=3,
        expected_lines_tolerance=0,
        category="simple"
    ),
    TestCase(
        name="Two lines simple",
        text="First line\nSecond line",
        source_lang="en",
        target_lang="fr",
        expected_min_length=15,
        expected_emojis_count=0,
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
        source_lang="en",
        target_lang="fr",
        expected_min_length=120,
        expected_emojis_count=2,
        expected_lines_tolerance=2,
        category="medium"
    ),
    TestCase(
        name="List with checkmarks (180 chars)",
        text="✅ Task completed\n✅ Files uploaded\n✅ Report generated\n✅ Email sent\n\nAll systems are working perfectly! Great job team! 🎯",
        source_lang="en",
        target_lang="fr",
        expected_min_length=140,
        expected_emojis_count=5,
        expected_lines_tolerance=3,
        category="medium"
    ),
    TestCase(
        name="Technical update (165 chars)",
        text="🔧 System Update\n\n- Fixed memory leak in API\n- Improved database performance\n- Updated security patches\n\nDowntime: 5 minutes ⏰",
        source_lang="en",
        target_lang="fr",
        expected_min_length=130,
        expected_emojis_count=2,
        expected_lines_tolerance=3,
        category="medium"
    ),
    TestCase(
        name="Event invitation (145 chars)",
        text="📅 Team Meeting Tomorrow\n\nTime: 10:00 AM\nLocation: Conference Room A\nTopic: Q4 Planning\n\nPlease bring your laptops! 💼",
        source_lang="en",
        target_lang="fr",
        expected_min_length=110,
        expected_emojis_count=2,
        expected_lines_tolerance=3,
        category="medium"
    ),
    TestCase(
        name="Structured announcement (190 chars)",
        text="🚀 Product Launch - Beta v2.0\n\n🎨 New Features:\n- Dark mode support\n- Custom themes\n- Export functionality\n\n📊 Performance:\n- 50% faster loading\n- Reduced memory usage",
        source_lang="en",
        target_lang="fr",
        expected_min_length=150,
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
        source_lang="en",
        target_lang="fr",
        expected_min_length=700,
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
        source_lang="en",
        target_lang="fr",
        expected_min_length=250,
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
        source_lang="en",
        target_lang="fr",
        expected_min_length=220,
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
        source_lang="en",
        target_lang="fr",
        expected_min_length=30,
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
        source_lang="en",
        target_lang="fr",
        expected_min_length=60,
        expected_emojis_count=1,
        expected_lines_tolerance=3,
        category="unexpected"
    ),
    TestCase(
        name="URLs and hashtags",
        text="Check out our new site: https://example.com 🌐\n\nFollow us: #Tech #Innovation #AI 🚀",
        source_lang="en",
        target_lang="fr",
        expected_min_length=60,
        expected_emojis_count=2,
        expected_lines_tolerance=2,
        category="unexpected"
    ),
    TestCase(
        name="Emoji bombardment",
        text="🎉🎊🥳🎈🎁 CELEBRATION TIME! 🎂🍰🧁🍪🍩",
        source_lang="en",
        target_lang="fr",
        expected_min_length=15,
        expected_emojis_count=10,
        expected_lines_tolerance=0,
        category="unexpected"
    ),
    TestCase(
        name="Special characters",
        text="Price: $99.99 → $79.99 (20% OFF!) 💰\n\nOffer ends: 12/31/2024 @ 11:59 PM ⏰",
        source_lang="en",
        target_lang="fr",
        expected_min_length=50,
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
        source_lang="en",
        target_lang="fr",
        expected_min_length=80,
        expected_emojis_count=1,
        expected_lines_tolerance=4,
        category="unexpected"
    ),
    TestCase(
        name="Empty lines preservation",
        text="Line 1\n\n\nLine 2\n\n\n\nLine 3",
        source_lang="en",
        target_lang="fr",
        expected_min_length=15,
        expected_emojis_count=0,
        expected_lines_tolerance=5,
        category="unexpected"
    ),
]

# Combiner tous les cas de test
ALL_TEST_CASES = SIMPLE_TEST_CASES + MEDIUM_TEST_CASES + COMPLEX_TEST_CASES + UNEXPECTED_TEST_CASES


async def test_single_translation(service: TranslationMLService, test_case: TestCase) -> Dict[str, Any]:
    """
    Test une seule traduction en simulant le flux nominal ZMQ
    """
    try:
        logger.info(f"\n{'='*80}")
        logger.info(f"🧪 TEST: {test_case.name} ({test_case.category})")
        logger.info(f"{'='*80}")
        logger.info(f"📝 Texte original ({len(test_case.text)} chars):")
        logger.info(f"{test_case.text}")
        logger.info(f"{'-'*80}")

        # SIMULATION FLUX ZMQ: Appel de translate_with_structure comme le ferait ZMQ
        result = await service.translate_with_structure(
            text=test_case.text,
            source_language=test_case.source_lang,
            target_language=test_case.target_lang,
            model_type="basic",
            source_channel="zmq"  # Simuler le canal ZMQ
        )

        if not result or 'translated_text' not in result:
            logger.error(f"❌ Pas de résultat de traduction")
            return {
                'test_name': test_case.name,
                'category': test_case.category,
                'success': False,
                'error': 'No translation result'
            }

        translated = result['translated_text']

        logger.info(f"📝 Texte traduit ({len(translated)} chars):")
        logger.info(f"{translated}")
        logger.info(f"{'-'*80}")

        # ============================================================
        # VÉRIFICATIONS DE QUALITÉ
        # ============================================================

        errors = []
        warnings = []

        # 1. Vérifier longueur minimale (traduction pas vide)
        if len(translated) < test_case.expected_min_length:
            errors.append(f"Traduction trop courte: {len(translated)} < {test_case.expected_min_length}")

        # 2. Vérifier que la traduction n'est pas identique à l'original
        if translated.lower().strip() == test_case.text.lower().strip():
            errors.append("Traduction identique à l'original (pas traduit)")

        # 3. Vérifier les emojis
        original_emojis = EMOJI_PATTERN.findall(test_case.text)
        translated_emojis = EMOJI_PATTERN.findall(translated)

        if len(original_emojis) != len(translated_emojis):
            errors.append(f"Emojis perdus: {len(original_emojis)} → {len(translated_emojis)}")
            logger.error(f"   Original emojis: {original_emojis}")
            logger.error(f"   Translated emojis: {translated_emojis}")

        # 4. Vérifier qu'il n'y a pas de placeholders non remplacés
        remaining_placeholders = re.findall(r'🔹EMOJI_\d+🔹', translated)
        if remaining_placeholders:
            errors.append(f"Placeholders non remplacés: {len(remaining_placeholders)}")
            logger.error(f"   Placeholders: {remaining_placeholders}")

        # 5. Vérifier la structure (nombre de lignes)
        original_lines = test_case.text.count('\n')
        translated_lines = translated.count('\n')
        lines_diff = abs(original_lines - translated_lines)

        if lines_diff > test_case.expected_lines_tolerance:
            warnings.append(f"Structure modifiée: {original_lines} → {translated_lines} lignes (tolérance: ±{test_case.expected_lines_tolerance})")

        # 6. Vérifier qu'il n'y a pas d'emojis au milieu des mots
        misplaced_emoji_pattern = re.compile(r'\w[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B50]+\w', flags=re.UNICODE)
        misplaced_emojis = misplaced_emoji_pattern.findall(translated)
        if misplaced_emojis:
            errors.append(f"Emojis mal placés: {misplaced_emojis}")

        # 7. Vérifier les métadonnées de traduction
        if result.get('segments_count', 0) == 0:
            warnings.append("Aucun segment détecté (traduction non structurée?)")

        # ============================================================
        # RÉSULTAT
        # ============================================================

        success = len(errors) == 0

        if success:
            logger.info(f"✅ TEST RÉUSSI: {test_case.name}")
            if warnings:
                logger.warning(f"⚠️  {len(warnings)} avertissement(s):")
                for warning in warnings:
                    logger.warning(f"   - {warning}")
        else:
            logger.error(f"❌ TEST ÉCHOUÉ: {test_case.name}")
            logger.error(f"   {len(errors)} erreur(s):")
            for error in errors:
                logger.error(f"   - {error}")
            if warnings:
                logger.warning(f"   {len(warnings)} avertissement(s):")
                for warning in warnings:
                    logger.warning(f"   - {warning}")

        return {
            'test_name': test_case.name,
            'category': test_case.category,
            'success': success,
            'errors': errors,
            'warnings': warnings,
            'original_length': len(test_case.text),
            'translated_length': len(translated),
            'emojis_preserved': len(original_emojis) == len(translated_emojis),
            'structure_preserved': lines_diff <= test_case.expected_lines_tolerance,
            'processing_time': result.get('processing_time', 0),
            'model_used': result.get('model_used', 'unknown')
        }

    except Exception as e:
        logger.error(f"❌ Exception lors du test {test_case.name}: {e}", exc_info=True)
        return {
            'test_name': test_case.name,
            'category': test_case.category,
            'success': False,
            'error': str(e)
        }


async def run_all_tests():
    """
    Exécute tous les tests de traduction
    """
    logger.info("\n" + "="*80)
    logger.info("🚀 TESTS COMPLETS DE TRADUCTION - SIMULATION FLUX ZMQ")
    logger.info("="*80)

    if not SERVICE_AVAILABLE:
        logger.error("❌ Service de traduction non disponible")
        return False

    try:
        # Initialiser le service
        settings = get_settings()
        service = TranslationMLService(settings, max_workers=4)

        logger.info("\n🔧 Initialisation du service ML...")
        init_success = await service.initialize()

        if not init_success:
            logger.error("❌ Échec de l'initialisation du service")
            return False

        logger.info("✅ Service ML initialisé avec succès\n")

        # Exécuter tous les tests
        results = []

        for test_case in ALL_TEST_CASES:
            result = await test_single_translation(service, test_case)
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
        for category, stats in categories.items():
            success_rate = (stats['passed'] / stats['total']) * 100 if stats['total'] > 0 else 0
            logger.info(f"   {category.upper():12} : {stats['passed']}/{stats['total']} réussis ({success_rate:.1f}%)")

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
        elif success_rate >= 80:
            logger.warning(f"⚠️  {failed_tests} test(s) ont échoué (taux acceptable: {success_rate:.1f}%)")
            return True
        else:
            logger.error(f"❌ Trop de tests échoués ({failed_tests}/{total_tests})")
            return False

    except Exception as e:
        logger.error(f"❌ Erreur critique: {e}", exc_info=True)
        return False


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
