#!/usr/bin/env python3
"""
Test simple de traduction
"""

import sys
import os
import logging
import asyncio

# Ajouter le chemin src au PYTHONPATH
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)


async def test_translation():
    """Test simple de traduction"""
    try:
        logger.info("🧪 Test simple de traduction")

        # Importer les services
        from services.translation_ml.model_loader import ModelLoader
        from services.translation_ml.translator_engine import TranslatorEngine
        from concurrent.futures import ThreadPoolExecutor

        # Créer model loader
        model_loader = ModelLoader()

        # Créer executor
        executor = ThreadPoolExecutor(max_workers=4)

        # Créer translator engine
        translator = TranslatorEngine(
            model_loader=model_loader,
            executor=executor,
            cache_size=50
        )

        logger.info("✅ Services créés")

        # Charger le modèle basic
        logger.info("📦 Chargement du modèle basic...")
        await model_loader.load_model('basic')

        logger.info("✅ Modèle chargé")

        # Tester traduction
        logger.info("\n🔤 Test traduction: Hello, how are you?")
        result = await translator.translate_text(
            text="Hello, how are you?",
            source_lang="en",
            target_lang="fr",
            model_type="basic"
        )

        logger.info(f"✅ Traduction: {result}")

        return True

    except Exception as e:
        logger.error(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    logger.info("🚀 Test simple de traduction\n")
    success = asyncio.run(test_translation())
    sys.exit(0 if success else 1)
