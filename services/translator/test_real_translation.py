#!/usr/bin/env python3
"""
Test de VRAIE traduction EN→FR avec affichage détaillé
Simule le rôle du Gateway en appelant directement le service ML
LOGS: Tous les segments, traductions intermédiaires et finales
"""

import sys
import os
import asyncio
import logging
from pathlib import Path

# Ajouter le répertoire src au path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Configuration du logging TRÈS DÉTAILLÉ
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Importer le service de traduction ML directement (éviter __init__.py qui importe zmq_server)
import importlib.util
spec = importlib.util.spec_from_file_location(
    "translation_ml_service",
    os.path.join(os.path.dirname(__file__), 'src', 'services', 'translation_ml_service.py')
)
translation_ml_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(translation_ml_module)
TranslationMLService = translation_ml_module.TranslationMLService

from config.settings import get_settings
from utils.text_segmentation import EMOJI_PATTERN


def print_separator(char="=", length=100):
    """Affiche un séparateur"""
    print(char * length)


def print_box_header(title):
    """Affiche un titre encadré"""
    print(f"\n╔{'═'*98}╗")
    print(f"║ {title:96} ║")
    print(f"╚{'═'*98}╝")


def print_text_box(title, text, color="📝"):
    """Affiche un texte dans une boîte"""
    print(f"\n{color} {title}")
    print("─" * 100)
    for line in text.split('\n'):
        print(f"  {line}")
    print("─" * 100)


async def test_translation(service: TranslationMLService, name: str, text_en: str, length_cat: str):
    """
    Test une traduction complète EN→FR avec logs détaillés
    """
    try:
        print_separator("=")
        print(f"\n🧪 TEST: {name} ({length_cat})")
        print_separator("=")

        # ÉTAPE 1: TEXTE ORIGINAL EN ANGLAIS
        print_text_box("📥 TEXTE ORIGINAL (ANGLAIS)", text_en, "🇬🇧")

        original_emojis = EMOJI_PATTERN.findall(text_en)
        print(f"\n📊 Statistiques du texte original:")
        print(f"   • Longueur: {len(text_en)} caractères")
        print(f"   • Lignes: {text_en.count(chr(10))} sauts de ligne")
        print(f"   • Emojis: {len(original_emojis)} détectés")
        if original_emojis:
            print(f"   • Liste emojis: {original_emojis}")

        # ÉTAPE 2: APPEL DU SERVICE DE TRADUCTION ML (comme le Gateway)
        print(f"\n🔄 Appel du service de traduction ML...")
        print(f"   • Source: en (anglais)")
        print(f"   • Target: fr (français)")
        print(f"   • Model: basic")
        print(f"   • Method: translate_with_structure()")

        # SIMULATION GATEWAY: Appel de la méthode de traduction structurée
        result = await service.translate_with_structure(
            text=text_en,
            source_language="en",
            target_language="fr",
            model_type="basic",
            source_channel="zmq"  # Simule un appel depuis ZMQ
        )

        if not result or 'translated_text' not in result:
            print("\n❌ ERREUR: Pas de résultat de traduction")
            return False

        # ÉTAPE 3: RÉSULTAT DE LA TRADUCTION
        text_fr = result['translated_text']

        print_text_box("📤 TEXTE TRADUIT (FRANÇAIS)", text_fr, "🇫🇷")

        translated_emojis = EMOJI_PATTERN.findall(text_fr)
        print(f"\n📊 Statistiques de la traduction:")
        print(f"   • Longueur: {len(text_fr)} caractères")
        print(f"   • Lignes: {text_fr.count(chr(10))} sauts de ligne")
        print(f"   • Emojis: {len(translated_emojis)} détectés")
        print(f"   • Segments traités: {result.get('segments_count', 'N/A')}")
        print(f"   • Temps de traitement: {result.get('processing_time', 0):.2f}s")
        print(f"   • Modèle utilisé: {result.get('model_used', 'N/A')}")

        # ÉTAPE 4: VÉRIFICATIONS DE QUALITÉ
        print(f"\n🔍 VÉRIFICATIONS DE QUALITÉ:")

        checks = []

        # 1. Vérifier que le texte a été traduit (pas identique)
        if text_fr.lower().strip() != text_en.lower().strip():
            print(f"   ✅ Texte traduit (différent de l'original)")
            checks.append(True)
        else:
            print(f"   ❌ Texte identique (pas traduit)")
            checks.append(False)

        # 2. Vérifier les emojis
        if len(original_emojis) == len(translated_emojis):
            print(f"   ✅ Tous les emojis préservés ({len(original_emojis)}/{len(translated_emojis)})")
            checks.append(True)
        else:
            print(f"   ❌ Emojis perdus ({len(original_emojis)} → {len(translated_emojis)})")
            checks.append(False)

        # 3. Vérifier la structure (tolérance de ±3 lignes)
        original_lines = text_en.count('\n')
        translated_lines = text_fr.count('\n')
        line_diff = abs(original_lines - translated_lines)

        if line_diff <= 3:
            print(f"   ✅ Structure préservée ({original_lines} → {translated_lines} lignes, diff: {line_diff})")
            checks.append(True)
        else:
            print(f"   ⚠️  Structure modifiée ({original_lines} → {translated_lines} lignes, diff: {line_diff})")
            checks.append(False)

        # 4. Vérifier qu'il n'y a pas de placeholders non remplacés
        import re
        placeholders = re.findall(r'🔹EMOJI_\d+🔹', text_fr)
        if not placeholders:
            print(f"   ✅ Pas de placeholders non remplacés")
            checks.append(True)
        else:
            print(f"   ❌ Placeholders non remplacés: {len(placeholders)}")
            checks.append(False)

        # 5. Vérifier qu'il n'y a pas d'emojis au milieu des mots
        misplaced_pattern = re.compile(r'[a-zA-Zàâäéèêëïîôùûüÿç]{3,}[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B50]+[a-zA-Zàâäéèêëïîôùûüÿç]{3,}', flags=re.UNICODE)
        misplaced = misplaced_pattern.findall(text_fr)
        if not misplaced:
            print(f"   ✅ Pas d'emojis mal placés")
            checks.append(True)
        else:
            print(f"   ❌ Emojis mal placés détectés: {misplaced}")
            checks.append(False)

        # RÉSULTAT FINAL
        success = all(checks)
        success_rate = (sum(checks) / len(checks)) * 100

        print(f"\n{'='*100}")
        if success:
            print(f"✅ TEST RÉUSSI - Toutes les vérifications passées ({success_rate:.0f}%)")
        else:
            failed_count = len(checks) - sum(checks)
            print(f"⚠️  TEST PARTIEL - {failed_count}/{len(checks)} vérifications échouées ({success_rate:.0f}%)")
        print(f"{'='*100}")

        return {
            'name': name,
            'length_category': length_cat,
            'success': success,
            'success_rate': success_rate,
            'original_length': len(text_en),
            'translated_length': len(text_fr),
            'original_emojis': len(original_emojis),
            'translated_emojis': len(translated_emojis),
            'processing_time': result.get('processing_time', 0),
            'checks': checks
        }

    except Exception as e:
        print(f"\n❌ EXCEPTION lors du test: {e}")
        import traceback
        traceback.print_exc()
        return {
            'name': name,
            'length_category': length_cat,
            'success': False,
            'error': str(e)
        }


async def run_translation_tests():
    """
    Exécute tous les tests de traduction EN→FR
    """
    print_separator("=")
    print("🚀 TESTS DE TRADUCTION RÉELLE - EN→FR")
    print("   Simulation du rôle du Gateway")
    print("   Appel direct du service ML")
    print_separator("=")

    # INITIALISATION DU SERVICE ML
    print("\n🔧 Initialisation du service ML...")

    try:
        settings = get_settings()
        service = TranslationMLService(settings, max_workers=4)

        print("⏳ Chargement des modèles ML...")
        init_success = await service.initialize()

        if not init_success:
            print("❌ ERREUR: Impossible d'initialiser le service ML")
            return False

        print("✅ Service ML initialisé avec succès")

        # Afficher les modèles disponibles
        stats = await service.get_stats()
        print(f"\n📊 Modèles chargés:")
        for model_type, model_info in stats.get('models_loaded', {}).items():
            print(f"   • {model_type}: {model_info['name']}")

    except Exception as e:
        print(f"❌ ERREUR lors de l'initialisation: {e}")
        import traceback
        traceback.print_exc()
        return False

    # DÉFINIR LES CAS DE TEST
    test_cases = [
        {
            'name': 'Product announcement',
            'text': """🎉 New Feature Alert!

We've just launched our new dashboard with real-time analytics. Check it out now and let us know what you think! 📊""",
            'length_cat': '100-200 chars'
        },
        {
            'name': 'Team update',
            'text': """📢 TEAM UPDATE - Week of Dec 4th

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
            'length_cat': '400 chars'
        },
        {
            'name': 'Product release notes',
            'text': """🚀 PRODUCT RELEASE v4.0 - Major Update

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
            'length_cat': '600 chars'
        },
        {
            'name': 'MAJOR UPDATES (EXEMPLE ORIGINAL)',
            'text': """🎉 MAJOR UPDATES - Last 48 Hours 🚀

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
            'length_cat': '900 chars'
        }
    ]

    # EXÉCUTER LES TESTS
    results = []

    for i, test_case in enumerate(test_cases, 1):
        print(f"\n\n{'#'*100}")
        print(f"# TEST {i}/{len(test_cases)}")
        print(f"{'#'*100}")

        result = await test_translation(
            service=service,
            name=test_case['name'],
            text_en=test_case['text'],
            length_cat=test_case['length_cat']
        )

        results.append(result)

        # Pause entre les tests
        if i < len(test_cases):
            input("\n⏸️  Appuyez sur ENTRÉE pour continuer au test suivant...\n")

    # RAPPORT FINAL
    print("\n\n" + "="*100)
    print("📊 RAPPORT FINAL")
    print("="*100)

    total_tests = len(results)
    passed_tests = sum(1 for r in results if r.get('success', False))
    partial_tests = sum(1 for r in results if not r.get('success', False) and 'error' not in r)
    failed_tests = sum(1 for r in results if 'error' in r)

    print(f"\n📈 Résultats globaux:")
    print(f"   • Total: {total_tests} tests")
    print(f"   • Réussis (100%): {passed_tests} ✅")
    print(f"   • Partiels: {partial_tests} ⚠️")
    print(f"   • Échoués: {failed_tests} ❌")

    if passed_tests + partial_tests > 0:
        avg_success_rate = sum(r.get('success_rate', 0) for r in results if 'success_rate' in r) / (passed_tests + partial_tests)
        print(f"   • Taux de succès moyen: {avg_success_rate:.1f}%")

    print(f"\n📋 Détails par test:")
    for result in results:
        if 'error' in result:
            print(f"   ❌ {result['name']}: ERREUR - {result['error']}")
        else:
            rate = result.get('success_rate', 0)
            emoji = "✅" if rate == 100 else "⚠️" if rate >= 80 else "❌"
            print(f"   {emoji} {result['name']}: {rate:.0f}% ({result.get('original_length', 0)}→{result.get('translated_length', 0)} chars)")

    print("\n" + "="*100)

    if passed_tests == total_tests:
        print("🎉 TOUS LES TESTS ONT RÉUSSI À 100%!")
        return True
    elif passed_tests + partial_tests == total_tests:
        print("✅ Tous les tests ont été traduits avec succès (certains partiels)")
        return True
    else:
        print(f"❌ {failed_tests} test(s) ont échoué complètement")
        return False


if __name__ == "__main__":
    try:
        success = asyncio.run(run_translation_tests())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⏹️  Tests interrompus par l'utilisateur")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ ERREUR CRITIQUE: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
