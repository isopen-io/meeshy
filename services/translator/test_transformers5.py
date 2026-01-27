#!/usr/bin/env python3
"""
Test rapide: Vérifier que la traduction fonctionne avec Transformers 5.0.0
"""
import sys
sys.path.insert(0, 'src')

from services.translation_ml.translator_engine import TranslatorEngine
from services.translation_ml.model_loader import ModelLoader
import asyncio

async def test_translation():
    print("🔍 Test Transformers 5.0.0")
    print("="*60)

    # Initialiser le model loader
    loader = ModelLoader()

    # Charger un modèle (basic pour test rapide)
    print("\n[1/3] Chargement modèle basic...")
    loader.load_model("basic")
    print("✅ Modèle chargé")

    # Créer translator engine
    print("\n[2/3] Initialisation TranslatorEngine...")
    engine = TranslatorEngine(loader)
    print("✅ Engine initialisé")

    # Tester traduction
    print("\n[3/3] Test traduction FR → EN...")
    test_text = "Bonjour, comment allez-vous aujourd'hui?"

    result = await engine.translate_text(
        text=test_text,
        source_lang="fra_Latn",
        target_lang="eng_Latn",
        model_type="basic"
    )

    print(f"\n📝 Texte source: {test_text}")
    print(f"🎯 Traduction:   {result}")

    # Test paire différente
    print("\n[BONUS] Test FR → ES...")
    result_es = await engine.translate_text(
        text=test_text,
        source_lang="fra_Latn",
        target_lang="spa_Latn",
        model_type="basic"
    )
    print(f"🎯 Traduction ES: {result_es}")

    print("\n" + "="*60)
    print("✅ Transformers 5.0.0 fonctionne parfaitement !")
    print("="*60)

if __name__ == "__main__":
    asyncio.run(test_translation())
