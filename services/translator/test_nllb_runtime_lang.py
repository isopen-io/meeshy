#!/usr/bin/env python3
"""
Test NLLB en passant src_lang/tgt_lang à l'exécution (pas à la création)
"""

import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_runtime_langs():
    """Test en passant langues à l'exécution"""
    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        logger.info("🧪 Test: Utilisation directe du modèle SANS pipeline")

        model_name = "facebook/nllb-200-distilled-600M"
        logger.info(f"📦 Chargement du modèle: {model_name}")

        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_name)

        logger.info("✅ Modèle et tokenizer chargés")

        # Test: traduction anglais → français
        text = "Hello, how are you?"
        logger.info(f"\n🔤 Texte à traduire: '{text}'")

        # Méthode 1: Avec tokenizer src_lang
        tokenizer.src_lang = "eng_Latn"
        inputs = tokenizer(text, return_tensors="pt")

        # Générer avec forced_bos_token_id pour la langue cible
        forced_bos_token_id = tokenizer.convert_tokens_to_ids("fra_Latn")
        logger.info(f"   forced_bos_token_id pour fra_Latn: {forced_bos_token_id}")

        outputs = model.generate(
            **inputs,
            forced_bos_token_id=forced_bos_token_id,
            max_length=256,
            num_beams=1,
            do_sample=False
        )

        translated = tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]
        logger.info(f"✅ Traduction: '{translated}'")

        logger.info("\n✅ TEST RÉUSSI")
        return True

    except Exception as e:
        logger.error(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    logger.info("🚀 Test NLLB sans pipeline\n")
    success = test_runtime_langs()
    sys.exit(0 if success else 1)
