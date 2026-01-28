#!/usr/bin/env python3
"""
Test NLLB avec codes courts (translation_XX_to_YY)
"""

import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_nllb_short_codes():
    """Test avec codes courts en→fr"""
    try:
        from transformers import pipeline

        logger.info("🧪 Test: task='translation_en_to_fr'")

        # Créer pipeline avec codes courts
        translator = pipeline(
            "translation_en_to_fr",  # Format court!
            model="facebook/nllb-200-distilled-600M",
            device=-1
        )

        logger.info("✅ Pipeline créé avec succès!")

        # Tester traduction
        test_texts = [
            "Hello, how are you?",
            "This is a test.",
            "Good morning!"
        ]

        for text in test_texts:
            result = translator(text)
            logger.info(f"   '{text}' → '{result[0]['translation_text']}'")

        logger.info("\n✅ TOUS LES TESTS PASSÉS")
        return True

    except Exception as e:
        logger.error(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    logger.info("🚀 Test NLLB avec codes courts\n")
    success = test_nllb_short_codes()
    sys.exit(0 if success else 1)
