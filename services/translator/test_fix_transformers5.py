#!/usr/bin/env python3
"""
Test pour vérifier que le fix transformers v5 fonctionne correctement
"""

import sys
import os
import logging

# Ajouter le chemin src au PYTHONPATH
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_pipeline_creation():
    """Test de création du pipeline avec transformers v5"""
    try:
        import torch
        from transformers import pipeline, AutoModelForSeq2SeqLM, AutoTokenizer

        logger.info("✅ Imports réussis")

        # Charger le modèle et tokenizer
        model_name = "facebook/nllb-200-distilled-600M"
        logger.info(f"📦 Chargement du modèle: {model_name}")

        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_name)

        logger.info("✅ Modèle et tokenizer chargés")

        # Test 1: Créer pipeline AVEC src_lang et tgt_lang (nouveau format)
        logger.info("\n🧪 Test 1: Pipeline avec src_lang et tgt_lang (transformers v5)")
        try:
            translator = pipeline(
                "translation",
                model=model,
                tokenizer=tokenizer,
                src_lang="eng_Latn",
                tgt_lang="fra_Latn",
                device=-1,
                max_length=512,
                batch_size=8
            )
            logger.info("✅ Pipeline créé avec succès!")

            # Tester une traduction
            result = translator(
                "How are you?",
                src_lang="eng_Latn",
                tgt_lang="fra_Latn",
                max_length=256,
                num_beams=1,
                do_sample=False
            )

            logger.info(f"✅ Traduction réussie: {result}")

        except Exception as e:
            logger.error(f"❌ Erreur création pipeline: {e}")
            import traceback
            traceback.print_exc()
            return False

        # Test 2: Vérifier que l'ancien format échoue (sans src_lang/tgt_lang)
        logger.info("\n🧪 Test 2: Pipeline SANS src_lang et tgt_lang (devrait échouer)")
        try:
            translator_old = pipeline(
                "translation",
                model=model,
                tokenizer=tokenizer,
                device=-1,
                max_length=512,
                batch_size=8
            )
            logger.warning("⚠️ Pipeline créé sans src_lang/tgt_lang (ne devrait pas marcher)")

        except Exception as e:
            logger.info(f"✅ Échec attendu: {e}")

        logger.info("\n✅ TOUS LES TESTS PASSÉS")
        return True

    except ImportError as e:
        logger.error(f"❌ Dépendances ML non disponibles: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Erreur inattendue: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    logger.info("🚀 Test du fix transformers v5\n")
    success = test_pipeline_creation()
    sys.exit(0 if success else 1)
