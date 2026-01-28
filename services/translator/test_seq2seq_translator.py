#!/usr/bin/env python3
"""
Test du wrapper générique Seq2SeqTranslator
Teste avec NLLB (et potentiellement d'autres modèles)
"""

import sys
import os
import logging

# Ajouter le chemin src au PYTHONPATH
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_seq2seq_nllb():
    """Test avec modèle NLLB"""
    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        from services.translation_ml.seq2seq_translator import Seq2SeqTranslator

        logger.info("✅ Imports réussis")

        # Charger le modèle NLLB
        model_name = "facebook/nllb-200-distilled-600M"
        logger.info(f"📦 Chargement du modèle NLLB: {model_name}")

        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_name)

        logger.info("✅ Modèle NLLB chargé")

        # Test 1: Création du wrapper (auto-détection NLLB)
        logger.info("\n🧪 Test 1: Auto-détection du type de modèle")
        translator = Seq2SeqTranslator(
            model=model,
            tokenizer=tokenizer,
            src_lang="eng_Latn",
            tgt_lang="fra_Latn",
            device=-1,
            max_length=512,
            batch_size=8
        )

        logger.info("✅ Wrapper créé avec succès!")

        # Vérifier les infos du modèle
        info = translator.get_model_info()
        logger.info(f"   Type détecté: {info['model_type']}")
        logger.info(f"   Langues: {info['src_lang']} → {info['tgt_lang']}")

        # Test 2: Traduction unique
        logger.info("\n🧪 Test 2: Traduction unique EN→FR")
        text = "Hello, how are you?"
        result = translator(
            text,
            max_length=256,
            num_beams=1,
            do_sample=False
        )

        logger.info(f"   Input: '{text}'")
        logger.info(f"   Output: '{result['translation_text']}'")

        # Test 3: Batch de traductions
        logger.info("\n🧪 Test 3: Batch de traductions EN→FR")
        texts = [
            "Good morning!",
            "How are you?",
            "Thank you very much."
        ]

        results = translator(
            texts,
            max_length=256,
            num_beams=1,
            do_sample=False
        )

        for i, (input_text, result) in enumerate(zip(texts, results)):
            logger.info(f"   [{i+1}] '{input_text}' → '{result['translation_text']}'")

        # Test 4: Changement de direction (FR→EN)
        logger.info("\n🧪 Test 4: Changement de direction FR→EN")
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

        # Test 5: Vérifier que le type est bien NLLB
        logger.info("\n🧪 Test 5: Vérification du type de modèle")
        from services.translation_ml.seq2seq_translator import ModelType

        if translator.model_type == ModelType.NLLB:
            logger.info("   ✅ Type NLLB correctement détecté")
        else:
            logger.error(f"   ❌ Type incorrect: {translator.model_type}")
            return False

        logger.info("\n✅ TOUS LES TESTS NLLB PASSÉS")
        return True

    except Exception as e:
        logger.error(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_model_detection():
    """Test de la détection automatique du type de modèle"""
    logger.info("\n" + "="*70)
    logger.info("🧪 Test de détection automatique de modèles")
    logger.info("="*70)

    from services.translation_ml.seq2seq_translator import Seq2SeqTranslator, ModelType

    # Simuler différents types de config
    class MockConfig:
        def __init__(self, model_type):
            self.model_type = model_type

    class MockModel:
        def __init__(self, model_type):
            self.config = MockConfig(model_type)

        def to(self, device):
            return self

    class MockTokenizer:
        def __init__(self):
            self.src_lang = None

        def convert_tokens_to_ids(self, token):
            return 12345

    # Test NLLB
    logger.info("\n📦 Test détection NLLB:")
    model = MockModel("nllb")
    translator = Seq2SeqTranslator(model, MockTokenizer(), "en", "fr", model_type=None)
    logger.info(f"   Type détecté: {translator.model_type.value}")
    assert translator.model_type == ModelType.NLLB, "NLLB non détecté"
    logger.info("   ✅ NLLB détecté correctement")

    # Test T5
    logger.info("\n📦 Test détection T5:")
    model = MockModel("t5")
    translator = Seq2SeqTranslator(model, MockTokenizer(), "English", "French", model_type=None)
    logger.info(f"   Type détecté: {translator.model_type.value}")
    assert translator.model_type == ModelType.T5, "T5 non détecté"
    logger.info("   ✅ T5 détecté correctement")

    # Test mT5
    logger.info("\n📦 Test détection mT5:")
    model = MockModel("mt5")
    translator = Seq2SeqTranslator(model, MockTokenizer(), "English", "French", model_type=None)
    logger.info(f"   Type détecté: {translator.model_type.value}")
    assert translator.model_type == ModelType.MT5, "mT5 non détecté"
    logger.info("   ✅ mT5 détecté correctement")

    # Test mBART
    logger.info("\n📦 Test détection mBART:")
    model = MockModel("mbart")
    translator = Seq2SeqTranslator(model, MockTokenizer(), "en", "fr", model_type=None)
    logger.info(f"   Type détecté: {translator.model_type.value}")
    assert translator.model_type == ModelType.MBART, "mBART non détecté"
    logger.info("   ✅ mBART détecté correctement")

    logger.info("\n✅ TOUS LES TESTS DE DÉTECTION PASSÉS")
    return True


if __name__ == "__main__":
    logger.info("🚀 Test du wrapper Seq2SeqTranslator\n")

    # Test 1: Détection automatique
    success1 = test_model_detection()

    # Test 2: NLLB réel
    success2 = test_seq2seq_nllb()

    sys.exit(0 if (success1 and success2) else 1)
