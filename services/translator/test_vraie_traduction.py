#!/usr/bin/env python3
"""
Test avec VRAIE traduction ML utilisant le service local
"""

import sys
import os
import asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from utils.text_segmentation import TextSegmenter, EMOJI_PATTERN
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Tenter d'importer le service ML
try:
    from services.translation_ml_service import TranslationMLService
    from config.settings import get_settings
    ML_AVAILABLE = True
except ImportError as e:
    logger.error(f"Service ML non disponible: {e}")
    ML_AVAILABLE = False


async def test_real_translation():
    """Test avec vraie traduction ML"""

    if not ML_AVAILABLE:
        print("❌ Service ML non disponible. Installez les dépendances ou lancez dans Docker.")
        return False

    # Texte à traduire EN → FR
    original = """🎉 Quick Update

Here is the fix:

```python
def hello():
    print("Hello World")
```

Please test it! ✅"""

    print("=" * 80)
    print("🧪 TEST AVEC VRAIE TRADUCTION ML (EN → FR)")
    print("=" * 80)

    print("\n📥 TEXTE ORIGINAL (ANGLAIS):")
    print("-" * 80)
    print(original)
    print("-" * 80)
    print(f"Longueur: {len(original)} chars")
    print(f"Lignes: {original.count(chr(10))} retours")

    original_emojis = EMOJI_PATTERN.findall(original)
    print(f"Emojis: {len(original_emojis)}")

    # Initialiser le service ML
    print("\n🔧 INITIALISATION DU SERVICE ML...")
    try:
        settings = get_settings()
        service = TranslationMLService(settings, max_workers=2)

        init_success = await service.initialize()
        if not init_success:
            print("❌ Impossible d'initialiser le service ML")
            return False

        print("✅ Service ML initialisé")

        # Afficher les modèles chargés
        stats = await service.get_stats()
        print(f"\n📊 Modèles disponibles:")
        for model_type, model_info in stats.get('models_loaded', {}).items():
            print(f"   • {model_type}: {model_info.get('name', 'unknown')}")

    except Exception as e:
        print(f"❌ Erreur initialisation: {e}")
        import traceback
        traceback.print_exc()
        return False

    # Traduire avec structure
    print("\n🔄 TRADUCTION EN COURS...")
    try:
        result = await service.translate_with_structure(
            text=original,
            source_language="en",
            target_language="fr",
            model_type="basic"
        )

        translated = result.get('translated_text', '')

        print("\n📤 TEXTE TRADUIT (FRANÇAIS):")
        print("-" * 80)
        print(translated)
        print("-" * 80)
        print(f"Longueur: {len(translated)} chars")
        print(f"Lignes: {translated.count(chr(10))} retours")

        translated_emojis = EMOJI_PATTERN.findall(translated)
        print(f"Emojis: {len(translated_emojis)}")

        print(f"\n📊 Métriques:")
        print(f"   • Temps: {result.get('processing_time', 0):.2f}s")
        print(f"   • Segments: {result.get('segments_count', 0)}")
        print(f"   • Modèle: {result.get('model_used', 'N/A')}")

        # VÉRIFICATIONS
        print("\n🔍 VÉRIFICATIONS:")
        checks = []

        # 1. Texte traduit
        if translated != original:
            print("  ✅ Texte traduit (différent de l'original)")
            checks.append(True)
        else:
            print("  ❌ Texte identique (pas traduit)")
            checks.append(False)

        # 2. Même nombre de lignes
        if original.count('\n') == translated.count('\n'):
            print(f"  ✅ Structure préservée ({original.count(chr(10))} lignes)")
            checks.append(True)
        else:
            print(f"  ❌ Structure modifiée ({original.count(chr(10))} → {translated.count(chr(10))} lignes)")
            checks.append(False)

        # 3. Code préservé
        if '```python' in translated and 'def hello():' in translated:
            print("  ✅ Code Python préservé")
            checks.append(True)
        else:
            print("  ❌ Code Python modifié ou perdu")
            checks.append(False)

        # 4. Indentation préservée
        if '    print("Hello World")' in translated:
            print("  ✅ Indentation préservée")
            checks.append(True)
        else:
            print("  ❌ Indentation perdue")
            checks.append(False)

        # 5. Emojis préservés
        if len(original_emojis) == len(translated_emojis):
            print(f"  ✅ Emojis préservés ({len(original_emojis)})")
            checks.append(True)
        else:
            print(f"  ❌ Emojis perdus ({len(original_emojis)} → {len(translated_emojis)})")
            checks.append(False)

        # RÉSULTAT
        print("\n" + "=" * 80)
        success = all(checks)
        rate = (sum(checks) / len(checks)) * 100

        if success:
            print(f"✅ TEST RÉUSSI - Toutes vérifications passées ({rate:.0f}%)")
        else:
            failed = len(checks) - sum(checks)
            print(f"⚠️  TEST PARTIEL - {failed}/{len(checks)} échouées ({rate:.0f}%)")
        print("=" * 80)

        return success

    except Exception as e:
        print(f"\n❌ ERREUR lors de la traduction: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    if not ML_AVAILABLE:
        print("\n⚠️  Les dépendances ML ne sont pas disponibles.")
        print("Pour tester avec vraie traduction ML:")
        print("  1. Assurez-vous que le service translator tourne")
        print("  2. Ou installez: pip install torch transformers sentencepiece")
        sys.exit(1)

    try:
        success = asyncio.run(test_real_translation())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⏹️  Test interrompu")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ ERREUR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
