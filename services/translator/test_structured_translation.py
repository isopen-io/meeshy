#!/usr/bin/env python3
"""
Test de traduction structurée avec des longs textes
Test avec emojis, titres, listes, paragraphes multiples
"""

import sys
import os
import asyncio
import logging
from pathlib import Path

# Ajouter le répertoire src au path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Configuration du logging détaillé
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

try:
    from services.translation_ml_service import TranslationMLService
    from config.settings import get_settings
    SERVICE_AVAILABLE = True
except ImportError as e:
    logger.error(f"❌ Impossible d'importer le service: {e}")
    SERVICE_AVAILABLE = False

# Texte de test complexe fourni par l'utilisateur
COMPLEX_TEST_TEXT = """🎉 MAJOR UPDATES - Last 48 Hours 🚀

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

#Meeshy #Updates #RealTimeMessaging #AudioMessages"""


async def test_segmentation_only():
    """Test de segmentation SEULE (sans traduction)"""
    logger.info("=" * 80)
    logger.info("🧪 TEST 1: SEGMENTATION SEULE")
    logger.info("=" * 80)

    try:
        from utils.text_segmentation import TextSegmenter

        segmenter = TextSegmenter(max_segment_length=100)

        # Segmenter le texte
        logger.info("\n📝 Texte original:")
        logger.info("-" * 80)
        logger.info(COMPLEX_TEST_TEXT)
        logger.info("-" * 80)

        # Segmentation
        segments, emojis_map = segmenter.segment_text(COMPLEX_TEST_TEXT)

        logger.info(f"\n📊 Résultats de segmentation:")
        logger.info(f"   - Nombre de segments: {len(segments)}")
        logger.info(f"   - Nombre d'emojis extraits: {len(emojis_map)}")
        logger.info(f"\n📋 Emojis extraits:")
        for idx, emoji in emojis_map.items():
            logger.info(f"   {idx}: {emoji}")

        logger.info(f"\n📋 Segments détaillés:")
        for i, segment in enumerate(segments):
            segment_type = segment['type']
            segment_text = segment['text'][:60] + "..." if len(segment['text']) > 60 else segment['text']
            logger.info(f"   [{i}] {segment_type}: {repr(segment_text)}")

        # Réassemblage sans traduction (test de préservation)
        reassembled = segmenter.reassemble_text(segments, emojis_map)

        logger.info(f"\n📝 Texte réassemblé:")
        logger.info("-" * 80)
        logger.info(reassembled)
        logger.info("-" * 80)

        # Vérification
        if reassembled == COMPLEX_TEST_TEXT:
            logger.info("✅ SUCCÈS: Le texte réassemblé est identique à l'original!")
            return True
        else:
            logger.error("❌ ÉCHEC: Le texte réassemblé diffère de l'original")
            logger.error(f"\nDifférences:")
            logger.error(f"Original length: {len(COMPLEX_TEST_TEXT)}")
            logger.error(f"Reassembled length: {len(reassembled)}")

            # Afficher les différences caractère par caractère
            for i, (orig_char, reass_char) in enumerate(zip(COMPLEX_TEST_TEXT, reassembled)):
                if orig_char != reass_char:
                    logger.error(f"Position {i}: '{orig_char}' != '{reass_char}'")

            return False

    except Exception as e:
        logger.error(f"❌ Erreur lors du test de segmentation: {e}", exc_info=True)
        return False


async def test_structured_translation():
    """Test de traduction structurée complète (en→fr)"""
    logger.info("\n" + "=" * 80)
    logger.info("🧪 TEST 2: TRADUCTION STRUCTURÉE COMPLÈTE (EN → FR)")
    logger.info("=" * 80)

    if not SERVICE_AVAILABLE:
        logger.error("❌ Service de traduction non disponible")
        return False

    try:
        # Créer le service
        settings = get_settings()
        service = TranslationMLService(settings, max_workers=4)

        # Initialiser le service
        logger.info("\n🚀 Initialisation du service ML...")
        init_success = await service.initialize()

        if not init_success:
            logger.error("❌ Échec de l'initialisation du service")
            return False

        logger.info("✅ Service initialisé avec succès")

        # Test de traduction structurée
        logger.info("\n📝 Texte original (EN):")
        logger.info("-" * 80)
        logger.info(COMPLEX_TEST_TEXT)
        logger.info("-" * 80)

        logger.info("\n🔄 Traduction en cours...")

        result = await service.translate_with_structure(
            text=COMPLEX_TEST_TEXT,
            source_language="en",
            target_language="fr",
            model_type="basic",
            source_channel="test"
        )

        if result and 'translated_text' in result:
            translated = result['translated_text']

            logger.info("\n📝 Texte traduit (FR):")
            logger.info("-" * 80)
            logger.info(translated)
            logger.info("-" * 80)

            logger.info(f"\n📊 Statistiques de traduction:")
            logger.info(f"   - Temps de traitement: {result.get('processing_time', 0):.2f}s")
            logger.info(f"   - Modèle utilisé: {result.get('model_used', 'N/A')}")
            logger.info(f"   - Nombre de segments: {result.get('segments_count', 0)}")
            logger.info(f"   - Nombre d'emojis: {result.get('emojis_count', 0)}")
            logger.info(f"   - Confiance: {result.get('confidence', 0):.2f}")

            # Vérifications de qualité
            logger.info(f"\n🔍 Vérifications de qualité:")

            # 1. Vérifier que tous les emojis sont présents
            import re
            from utils.text_segmentation import EMOJI_PATTERN

            original_emojis = EMOJI_PATTERN.findall(COMPLEX_TEST_TEXT)
            translated_emojis = EMOJI_PATTERN.findall(translated)

            if len(original_emojis) == len(translated_emojis):
                logger.info(f"   ✅ Tous les emojis préservés ({len(original_emojis)} emojis)")
            else:
                logger.error(f"   ❌ Emojis perdus: {len(original_emojis)} → {len(translated_emojis)}")
                logger.error(f"      Original: {original_emojis}")
                logger.error(f"      Traduit: {translated_emojis}")

            # 2. Vérifier qu'il n'y a pas de placeholders non remplacés
            remaining_placeholders = re.findall(r'🔹EMOJI_\d+🔹', translated)
            if not remaining_placeholders:
                logger.info(f"   ✅ Aucun placeholder non remplacé")
            else:
                logger.error(f"   ❌ Placeholders non remplacés: {remaining_placeholders}")

            # 3. Vérifier la structure (nombre de lignes)
            original_lines = COMPLEX_TEST_TEXT.count('\n')
            translated_lines = translated.count('\n')

            if abs(original_lines - translated_lines) <= 2:  # Tolérance de 2 lignes
                logger.info(f"   ✅ Structure préservée ({original_lines} → {translated_lines} lignes)")
            else:
                logger.error(f"   ❌ Structure modifiée: {original_lines} → {translated_lines} lignes")

            # 4. Vérifier qu'il n'y a pas d'emojis au milieu des mots
            misplaced_emoji_pattern = re.compile(r'\w[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B50]+\w', flags=re.UNICODE)
            misplaced_emojis = misplaced_emoji_pattern.findall(translated)

            if not misplaced_emojis:
                logger.info(f"   ✅ Aucun emoji mal placé")
            else:
                logger.error(f"   ❌ Emojis mal placés détectés: {misplaced_emojis}")

            logger.info(f"\n✅ TEST TERMINÉ")

            return True
        else:
            logger.error("❌ Échec de la traduction (pas de résultat)")
            return False

    except Exception as e:
        logger.error(f"❌ Erreur lors du test de traduction: {e}", exc_info=True)
        return False


async def run_all_tests():
    """Exécute tous les tests"""
    logger.info("\n🚀 DÉMARRAGE DES TESTS DE TRADUCTION STRUCTURÉE")
    logger.info("=" * 80)

    tests = [
        ("Segmentation seule", test_segmentation_only),
        ("Traduction structurée complète", test_structured_translation),
    ]

    passed = 0
    total = len(tests)

    for test_name, test_func in tests:
        logger.info(f"\n📋 Exécution: {test_name}")

        result = await test_func()

        if result:
            passed += 1
            logger.info(f"\n✅ {test_name} - RÉUSSI\n")
        else:
            logger.error(f"\n❌ {test_name} - ÉCHOUÉ\n")

    logger.info("\n" + "=" * 80)
    logger.info(f"📊 RÉSULTATS FINAUX: {passed}/{total} tests réussis")
    logger.info("=" * 80)

    if passed == total:
        logger.info("🎉 TOUS LES TESTS ONT RÉUSSI!")
        return True
    else:
        logger.error(f"💥 {total - passed} TEST(S) ONT ÉCHOUÉ")
        return False


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
