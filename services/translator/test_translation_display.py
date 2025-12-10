#!/usr/bin/env python3
"""
Test de traduction avec affichage des entrées et sorties
Tests avec textes de 100 à 1500 caractères
IMPORTANT: Affichage clair des textes originaux et traduits
"""

import sys
import os
import logging
from pathlib import Path
from typing import Dict, Any
from dataclasses import dataclass

# Ajouter le répertoire src au path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Configuration du logging simplifié
logging.basicConfig(
    level=logging.WARNING,  # Réduire le bruit
    format='%(message)s'
)
logger = logging.getLogger(__name__)

try:
    from utils.text_segmentation import TextSegmenter, EMOJI_PATTERN
    SERVICE_AVAILABLE = True
except ImportError as e:
    print(f"❌ Impossible d'importer le segmenteur: {e}")
    sys.exit(1)


@dataclass
class TestCase:
    """Cas de test avec métadonnées"""
    name: str
    text: str
    length_category: str  # "100", "400", "600", "900", "1500"


# ============================================================================
# CAS DE TEST - 100-200 CARACTÈRES
# ============================================================================

TEST_100_CHARS = [
    TestCase(
        name="Product announcement",
        text="""🎉 New Feature Alert!

We've just launched our new dashboard with real-time analytics. Check it out now and let us know what you think! 📊""",
        length_category="100-200"
    ),
]

# ============================================================================
# CAS DE TEST - 400 CARACTÈRES
# ============================================================================

TEST_400_CHARS = [
    TestCase(
        name="Team update announcement",
        text="""📢 TEAM UPDATE - Week of Dec 4th

🎯 ACHIEVEMENTS
✅ Released v3.2 with 15 new features
✅ Reduced API response time by 40%
✅ Onboarded 5 new team members
✅ Completed security audit

🔄 IN PROGRESS
• Mobile app redesign (75% complete)
• Database migration to PostgreSQL
• New authentication system testing

⏰ UPCOMING
• Holiday team building event 🎄
• Q4 performance reviews
• 2025 roadmap planning session

Great work everyone! Keep up the momentum! 🚀💪

#TeamWork #Progress #Innovation""",
        length_category="400"
    ),
]

# ============================================================================
# CAS DE TEST - 600 CARACTÈRES
# ============================================================================

TEST_600_CHARS = [
    TestCase(
        name="Product release notes",
        text="""🚀 PRODUCT RELEASE v4.0 - Major Update

📱 NEW FEATURES

🎨 User Interface
✅ Complete redesign with modern Material Design 3
✅ Dark mode support across all screens
✅ Customizable themes and color schemes
✅ Improved navigation with bottom tabs
✅ Animated transitions and micro-interactions

⚡ Performance
✅ 60% faster app startup time
✅ Reduced memory usage by 35%
✅ Optimized image loading and caching
✅ Improved battery efficiency

🔐 Security
✅ End-to-end encryption for all messages
✅ Biometric authentication (Face ID / Touch ID)
✅ Two-factor authentication support
✅ Enhanced privacy controls

🐛 BUG FIXES
• Fixed crash on iOS 16
• Resolved sync issues
• Fixed notification delays

📥 Download now and experience the difference! 🎉

#AppUpdate #NewFeatures #UserExperience""",
        length_category="600"
    ),
]

# ============================================================================
# CAS DE TEST - 900 CARACTÈRES (EXEMPLE ORIGINAL DE L'UTILISATEUR)
# ============================================================================

TEST_900_CHARS = [
    TestCase(
        name="Major platform updates",
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
        length_category="900"
    ),
]

# ============================================================================
# CAS DE TEST - 1500 CARACTÈRES
# ============================================================================

TEST_1500_CHARS = [
    TestCase(
        name="Comprehensive quarterly report",
        text="""📊 Q4 2025 QUARTERLY REPORT

🎯 EXECUTIVE SUMMARY
We're thrilled to share our strongest quarter yet! Revenue up 145%, user growth at 220%, and customer satisfaction at an all-time high of 96%. Our team has worked incredibly hard to deliver exceptional results. 🚀

💰 FINANCIAL HIGHLIGHTS
✅ Revenue: $4.2M (↑ 145% YoY)
✅ ARR: $16.8M (↑ 180% YoY)
✅ Gross Margin: 78% (↑ 5pts)
✅ Cash Position: $8.5M
✅ Burn Rate: -$350K/month (improved 40%)

📈 GROWTH METRICS
✅ Total Users: 125,000 (↑ 220% YoY)
✅ Active Users (DAU): 45,000 (↑ 190%)
✅ Enterprise Customers: 450 (↑ 280%)
✅ Customer Retention: 94% (best in class)
✅ NPS Score: 72 (industry leading)

🚀 PRODUCT ACHIEVEMENTS
✅ Launched 5 major features
✅ 99.98% uptime maintained
✅ API response time: 120ms avg (↓ 40%)
✅ Mobile apps: 4.8★ rating (25K reviews)
✅ Integration partnerships: +15 new

👥 TEAM GROWTH
✅ Headcount: 45 → 68 (+51%)
✅ Engineering: 18 → 28
✅ Sales: 8 → 15
✅ Customer Success: 5 → 10
✅ Diversity: 48% women, 35% underrepresented minorities

🎯 Q1 2025 OBJECTIVES
🔹 Launch enterprise tier with advanced features
🔹 Expand to European market (UK, DE, FR)
🔹 Achieve $6M+ revenue target
🔹 Scale team to 85 employees
🔹 Raise Series A funding ($15M target)

🎉 TEAM RECOGNITION
Huge shoutout to everyone who made this possible! Special recognition to Engineering for crushing performance goals, Sales for exceeding targets by 160%, and Customer Success for maintaining our 94% retention rate! 👏🌟

Let's keep this momentum going into 2025! 💪🚀

#QuarterlyReport #Growth #Success #TeamWork #Innovation""",
        length_category="1500"
    ),
]

# Combiner tous les cas de test
ALL_TEST_CASES = TEST_100_CHARS + TEST_400_CHARS + TEST_600_CHARS + TEST_900_CHARS + TEST_1500_CHARS


def print_separator(char="=", length=100):
    """Affiche un séparateur"""
    print(char * length)


def print_section_header(title):
    """Affiche un titre de section"""
    print("\n")
    print_separator("=")
    print(f"  {title}")
    print_separator("=")


def print_text_box(title, text, show_length=True):
    """Affiche un texte dans une boîte formatée"""
    print(f"\n┌─ {title} " + ("─" * (96 - len(title))))
    if show_length:
        print(f"│ Longueur: {len(text)} caractères, {text.count(chr(10))} lignes")
        emojis = EMOJI_PATTERN.findall(text)
        if emojis:
            print(f"│ Emojis: {len(emojis)} trouvés")
    print("├" + ("─" * 99))

    # Afficher le texte ligne par ligne avec des bordures
    for line in text.split('\n'):
        # Tronquer si trop long (pour l'affichage)
        display_line = line if len(line) <= 95 else line[:92] + "..."
        print(f"│ {display_line}")

    print("└" + ("─" * 99))


def test_single_case(segmenter: TextSegmenter, test_case: TestCase) -> Dict[str, Any]:
    """
    Test un seul cas et affiche l'entrée et la sortie
    """
    print_section_header(f"🧪 TEST: {test_case.name} ({test_case.length_category} chars)")

    # AFFICHAGE: TEXTE ORIGINAL
    print_text_box("📥 TEXTE ORIGINAL (ENTRÉE)", test_case.text)

    try:
        # Segmentation
        segments, emojis_map = segmenter.segment_text(test_case.text)

        print(f"\n📊 Segmentation effectuée:")
        print(f"   • {len(segments)} segments créés")
        print(f"   • {len(emojis_map)} emojis extraits: {list(emojis_map.values())[:10]}{'...' if len(emojis_map) > 10 else ''}")

        # Réassemblage (simulation de traduction - on garde le texte original)
        # Dans le vrai système, chaque segment serait traduit ici
        reassembled = segmenter.reassemble_text(segments, emojis_map)

        # AFFICHAGE: TEXTE RÉASSEMBLÉ (simule la sortie de traduction)
        print_text_box("📤 TEXTE RÉASSEMBLÉ (SORTIE)", reassembled)

        # Vérifications
        errors = []

        # 1. Identité parfaite
        if reassembled != test_case.text:
            errors.append("Texte différent de l'original")
            if len(reassembled) != len(test_case.text):
                errors.append(f"Longueur: {len(test_case.text)} → {len(reassembled)}")

        # 2. Emojis
        original_emojis = EMOJI_PATTERN.findall(test_case.text)
        reassembled_emojis = EMOJI_PATTERN.findall(reassembled)
        if len(original_emojis) != len(reassembled_emojis):
            errors.append(f"Emojis: {len(original_emojis)} → {len(reassembled_emojis)}")

        # Résultat
        success = len(errors) == 0

        print(f"\n{'='*100}")
        if success:
            print(f"✅ TEST RÉUSSI - Structure parfaitement préservée!")
        else:
            print(f"❌ TEST ÉCHOUÉ - Problèmes détectés:")
            for error in errors:
                print(f"   • {error}")
        print(f"{'='*100}")

        return {
            'test_name': test_case.name,
            'length_category': test_case.length_category,
            'success': success,
            'errors': errors
        }

    except Exception as e:
        print(f"\n❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return {
            'test_name': test_case.name,
            'length_category': test_case.length_category,
            'success': False,
            'error': str(e)
        }


def run_all_tests():
    """
    Exécute tous les tests avec affichage détaillé
    """
    print("\n" + "="*100)
    print("🚀 TESTS DE TRADUCTION AVEC AFFICHAGE ENTRÉE/SORTIE")
    print(f"📋 {len(ALL_TEST_CASES)} cas de test (100 → 1500 caractères)")
    print("="*100)

    segmenter = TextSegmenter(max_segment_length=100)
    results = []

    for test_case in ALL_TEST_CASES:
        result = test_single_case(segmenter, test_case)
        results.append(result)

        # Pause entre les tests pour lisibilité
        input("\n⏸️  Appuyez sur ENTRÉE pour continuer au test suivant...\n")

    # ============================================================
    # RAPPORT FINAL
    # ============================================================

    print("\n" + "="*100)
    print("📊 RAPPORT FINAL")
    print("="*100)

    # Statistiques par longueur
    categories = {}
    for result in results:
        category = result['length_category']
        if category not in categories:
            categories[category] = {'total': 0, 'passed': 0}

        categories[category]['total'] += 1
        if result['success']:
            categories[category]['passed'] += 1

    print("\n📈 Résultats par taille de texte:")
    for category in sorted(categories.keys()):
        stats = categories[category]
        success_rate = (stats['passed'] / stats['total']) * 100 if stats['total'] > 0 else 0
        emoji = "✅" if success_rate == 100 else "❌"
        print(f"   {emoji} {category:12} chars : {stats['passed']}/{stats['total']} réussis ({success_rate:.0f}%)")

    # Statistiques globales
    total_tests = len(results)
    passed_tests = sum(1 for r in results if r['success'])
    failed_tests = total_tests - passed_tests
    success_rate = (passed_tests / total_tests) * 100 if total_tests > 0 else 0

    print(f"\n📊 Résultats globaux:")
    print(f"   Total:   {total_tests} tests")
    print(f"   Réussis: {passed_tests} ✅")
    print(f"   Échoués: {failed_tests} ❌")
    print(f"   Taux de réussite: {success_rate:.1f}%")

    if failed_tests > 0:
        print(f"\n❌ Tests échoués:")
        for result in results:
            if not result['success']:
                print(f"   • {result['test_name']} ({result['length_category']} chars)")
                if 'errors' in result:
                    for error in result['errors']:
                        print(f"     - {error}")

    print("\n" + "="*100)

    if success_rate == 100:
        print("🎉 TOUS LES TESTS ONT RÉUSSI!")
        return True
    else:
        print(f"⚠️  {failed_tests} test(s) ont échoué")
        return False


if __name__ == "__main__":
    try:
        success = run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⏹️  Tests interrompus par l'utilisateur")
        sys.exit(0)
