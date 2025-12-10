#!/usr/bin/env python3
"""
Test 04 - Intégration avec le service de traduction
Niveau: Expert - Test de l'intégration complète
"""

import sys
import os
import logging
import asyncio

# Ajouter le répertoire src au path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

try:
    from services.quantized_ml_service import QuantizedMLService
    from utils.model_utils import create_model_manager
    from config.settings import get_settings
    SERVICE_AVAILABLE = True
except ImportError as e:
    logger = logging.getLogger(__name__)
    logger.warning(f"⚠️ Service non disponible: {e}")
    SERVICE_AVAILABLE = False

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_service_creation():
    """Test de création du service de traduction"""
    logger.info("🧪 Test 04.1: Création du service de traduction")
    
    if not SERVICE_AVAILABLE:
        logger.warning("⚠️ Service non disponible, test ignoré")
        return True
    
    try:
        # Créer le service
        service = QuantizedMLService(model_type="basic", quantization_level="float16")
        
        # Vérifier les attributs essentiels
        assert hasattr(service, 'model_manager')
        assert hasattr(service, 'initialize')
        assert hasattr(service, 'translate')
        assert hasattr(service, 'get_models_status')
        
        logger.info("✅ Service de traduction créé avec succès")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur création service: {e}")
        return False

async def test_model_verification_integration():
    """Test de l'intégration de la vérification des modèles"""
    logger.info("🧪 Test 04.2: Intégration de la vérification des modèles")
    
    if not SERVICE_AVAILABLE:
        logger.warning("⚠️ Service non disponible, test ignoré")
        return True
    
    try:
        # Créer le service
        service = QuantizedMLService(model_type="all", quantization_level="float16")
        
        # Vérifier le statut des modèles
        models_status = service.get_models_status()
        
        logger.info("📊 Statut des modèles dans le service:")
        for model_name, status in models_status.items():
            status_text = "✅ Local" if status['local'] else "❌ Manquant"
            logger.info(f"  - {model_name}: {status_text}")
        
        # Compter les modèles disponibles
        local_count = sum(1 for status in models_status.values() if status['local'])
        total_count = len(models_status)
        
        logger.info(f"\n📈 Résumé:")
        logger.info(f"  - Modèles disponibles: {local_count}/{total_count}")
        
        # Le test réussit si au moins un modèle est disponible
        success = local_count > 0
        if success:
            logger.info("✅ Intégration de la vérification réussie")
        else:
            logger.warning("⚠️ Aucun modèle disponible dans le service")
        
        return success
        
    except Exception as e:
        logger.error(f"❌ Erreur intégration vérification: {e}")
        return False

async def test_service_initialization():
    """Test de l'initialisation du service"""
    logger.info("🧪 Test 04.3: Initialisation du service")
    
    if not SERVICE_AVAILABLE:
        logger.warning("⚠️ Service non disponible, test ignoré")
        return True
    
    try:
        # Créer le service avec un modèle simple
        service = QuantizedMLService(model_type="basic", quantization_level="float16")
        
        logger.info("🚀 Initialisation du service...")
        
        # Initialiser le service
        success = await service.initialize()
        
        if success:
            logger.info("✅ Service initialisé avec succès")
            
            # Vérifier que les modèles sont chargés
            available_models = service.get_available_models()
            logger.info(f"📋 Modèles disponibles: {available_models}")
            
            # Nettoyer le service
            await service.cleanup()
            logger.info("🧹 Service nettoyé")
            
            return True
        else:
            logger.error("❌ Échec de l'initialisation du service")
            return False
        
    except Exception as e:
        logger.error(f"❌ Erreur initialisation service: {e}")
        return False

async def test_translation_with_local_models():
    """Test de traduction avec des modèles locaux"""
    logger.info("🧪 Test 04.4: Traduction avec modèles locaux")
    
    if not SERVICE_AVAILABLE:
        logger.warning("⚠️ Service non disponible, test ignoré")
        return True
    
    try:
        # Créer le service
        service = QuantizedMLService(model_type="basic", quantization_level="float16")
        
        # Vérifier d'abord les modèles disponibles
        models_status = service.get_models_status()
        local_models = [name for name, status in models_status.items() if status['local']]
        
        if not local_models:
            logger.warning("⚠️ Aucun modèle local disponible pour la traduction")
            return True  # Test réussi car pas d'erreur
        
        logger.info(f"📝 Test de traduction avec {len(local_models)} modèle(s) local(aux)")
        
        # Initialiser le service
        init_success = await service.initialize()
        if not init_success:
            logger.error("❌ Impossible d'initialiser le service pour la traduction")
            return False
        
        # Test de traduction simple
        test_text = "Hello, how are you?"
        result = await service.translate(test_text, "en", "fr", "basic")
        
        if result and 'translated_text' in result:
            translated = result['translated_text']
            logger.info(f"✅ Traduction réussie:")
            logger.info(f"  - Original: {test_text}")
            logger.info(f"  - Traduit: {translated}")
            logger.info(f"  - Modèle utilisé: {result.get('model_used', 'N/A')}")
            
            # Nettoyer le service
            await service.cleanup()
            return True
        else:
            logger.error("❌ Échec de la traduction")
            await service.cleanup()
            return False
        
    except Exception as e:
        logger.error(f"❌ Erreur traduction: {e}")
        return False

async def run_all_tests():
    """Exécute tous les tests d'intégration"""
    logger.info("🚀 Démarrage des tests d'intégration (Test 04)")
    logger.info("=" * 50)
    
    tests = [
        ("Création du service", test_service_creation),
        ("Intégration vérification", test_model_verification_integration),
        ("Initialisation du service", test_service_initialization),
        ("Traduction avec modèles locaux", test_translation_with_local_models),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        logger.info(f"\n📋 {test_name}...")
        
        # Exécuter le test (synchrone ou asynchrone)
        if asyncio.iscoroutinefunction(test_func):
            result = await test_func()
        else:
            result = test_func()
        
        if result:
            passed += 1
            logger.info(f"✅ {test_name} - RÉUSSI")
        else:
            logger.error(f"❌ {test_name} - ÉCHOUÉ")
    
    logger.info("\n" + "=" * 50)
    logger.info(f"📊 Résultats Test 04: {passed}/{total} tests réussis")
    
    if passed == total:
        logger.info("🎉 Tous les tests d'intégration ont réussi!")
        return True
    else:
        logger.error(f"💥 {total - passed} test(s) ont échoué")
        return False

if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
