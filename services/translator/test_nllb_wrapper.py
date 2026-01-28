#!/usr/bin/env python3
"""
Test du wrapper NLLBTranslator
"""

import sys
import os
import logging

# Ajouter le chemin src au PYTHONPATH
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_nllb_wrapper():
    """Test du wrapper NLLBTranslator"""
    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        from services.translation_ml.nllb_translator import NLLBTranslator

        logger.info("✅ Imports réussis")

        # Charger le modèle et tokenizer
        model_name = "facebook/nllb-200-distilled-600M"
        logger.info(f"📦 Chargement du modèle: {model_name}")

        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_name)

        logger.info("✅ Modèle et tokenizer chargés")

        # Créer le wrapper
        logger.info("\n🧪 Test 1: Création du wrapper NLLBTranslator")
        translator = NLLBTranslator(
            model=model,
            tokenizer=tokenizer,
            src_lang="eng_Latn",
            tgt_lang="fra_Latn",
            device=-1,
            max_length=512,
            batch_size=8
        )

        logger.info("✅ Wrapper créé avec succès!")

        # Test 2: Traduction unique
        logger.info("\n🧪 Test 2: Traduction unique")
        text = "Hello, how are you?"
        result = translator(
            text,
            src_lang="eng_Latn",
            tgt_lang="fra_Latn",
            max_length=256,
            num_beams=1,
            do_sample=False
        )

        logger.info(f"   Input: '{text}'")
        logger.info(f"   Output: '{result['translation_text']}'")

        # Test 3: Batch de traductions
        logger.info("\n🧪 Test 3: Batch de traductions")
        texts = [
            "Good morning!",
            "How are you?",
            "Thank you very much."
        ]

        results = translator(
            texts,
            src_lang="eng_Latn",
            tgt_lang="fra_Latn",
            max_length=256,
            num_beams=1,
            do_sample=False
        )

        for i, (input_text, result) in enumerate(zip(texts, results)):
            logger.info(f"   [{i+1}] '{input_text}' → '{result['translation_text']}'")

        # Test 4: Changement de direction (français → anglais)
        logger.info("\n🧪 Test 4: Français → Anglais")
        fr_text = "Bonjour, comment allez-vous ?"
        result_en = translator(
            fr_text,
            src_lang="fra_Latn",
            tgt_lang="eng_Latn",
            max_length=256,
            num_beams=1,
            do_sample=False
        )

        logger.info(f"   Input: '{fr_text}'")
        logger.info(f"   Output: '{result_en['translation_text']}'")

        logger.info("\n✅ TOUS LES TESTS PASSÉS")
        return True

    except Exception as e:
        logger.error(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    logger.info("🚀 Test du wrapper NLLBTranslator\n")
    success = test_nllb_wrapper()
    sys.exit(0 if success else 1)
