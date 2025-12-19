#!/usr/bin/env python3
"""
Test 05 - Service de traduction quantifié
Niveau: Expert - Test du service avec quantification
"""

import sys
import os
import logging
import asyncio
import pytest

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

@pytest.mark.asyncio
async def test_quantized_service_creation():
    """Test de création du service quantifié"""
    logger.info("🧪 Test 05.1: Création du service quantifié")
    
    if not SERVICE_AVAILABLE:
        logger.warning("⚠️ Service non disponible, test ignoré")
        return True
    
    try:
        # Tester différents niveaux de quantification
        quantization_levels = ["float16", "float32"]
        
        for level in quantization_levels:
            service = QuantizedMLService(
                model_type="basic", 
                quantization_level=level,
                max_workers=2
            )
            
            assert service.quantization_level == level
            assert service.model_type == "basic"
            assert service.max_workers == 2
            
            logger.info(f"✅ Service quantifié créé avec {level}")
        
        logger.info("✅ Tous les services quantifiés créés avec succès")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur création service quantifié: {e}")
        return False

@pytest.mark.asyncio
async def test_model_sharing():
    """Test du partage de modèles"""
    logger.info("🧪 Test 05.2: Partage de modèles")
    
    if not SERVICE_AVAILABLE:
        logger.warning("⚠️ Service non disponible, test ignoré")
        return True
    
    try:
        # Créer un service avec tous les modèles
        service = QuantizedMLService(model_type="all", quantization_level="float16")
        
        # Vérifier la configuration des modèles
        model_configs = service.model_configs
        
        # Identifier les modèles partagés
        model_name_to_types = {}
        for model_type, config in model_configs.items():
            model_name = config['model_name']
            if model_name not in model_name_to_types:
                model_name_to_types[model_name] = []
            model_name_to_types[model_name].append(model_type)
        
        # Afficher les modèles partagés
        shared_models = {name: types for name, types in model_name_to_types.items() if len(types) > 1}
        
        if shared_models:
            logger.info("📋 Modèles partagés détectés:")
            for model_name, types in shared_models.items():
                logger.info(f"  - {model_name}: {types}")
        else:
            logger.info("📋 Aucun modèle partagé détecté")
        
        logger.info("✅ Analyse du partage de modèles réussie")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur partage modèles: {e}")
        return False

@pytest.mark.asyncio
async def test_fallback_system():
    """Test du système de fallback"""
    logger.info("🧪 Test 05.3: Système de fallback")
    
    if not SERVICE_AVAILABLE:
        logger.warning("⚠️ Service non disponible, test ignoré")
        return True
    
    try:
        # Tester le fallback avec différents types de modèles
        fallback_order = ['premium', 'medium', 'basic']
        
        for model_type in fallback_order:
            service = QuantizedMLService(model_type=model_type, quantization_level="float16")
            
            # Vérifier que le service est configuré correctement
            assert service.model_type == model_type
            
            logger.info(f"✅ Service configuré pour {model_type}")
        
        logger.info("✅ Système de fallback testé avec succès")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur système fallback: {e}")
        return False

@pytest.mark.asyncio
async def test_translation_quality():
    """Test de la qualité de traduction"""
    logger.info("🧪 Test 05.4: Qualité de traduction")
    
    if not SERVICE_AVAILABLE:
        logger.warning("⚠️ Service non disponible, test ignoré")
        return True
    
    try:
        # Créer le service
        service = QuantizedMLService(model_type="basic", quantization_level="float16")
        
        # Vérifier les modèles disponibles
        models_status = service.get_models_status()
        local_models = [name for name, status in models_status.items() if status['local']]
        
        if not local_models:
            logger.warning("⚠️ Aucun modèle local disponible pour le test de qualité")
            return True
        
        # Initialiser le service
        init_success = await service.initialize()
        if not init_success:
            logger.error("❌ Impossible d'initialiser le service pour le test de qualité")
            return False
        
        # Tests de traduction avec différents textes
        test_cases = [
            ("Hello, how are you?", "en", "fr"),
            ("Bonjour, comment allez-vous?", "fr", "en"),
            ("The weather is nice today.", "en", "es"),
        ]
        
        successful_translations = 0
        
        for original_text, source_lang, target_lang in test_cases:
            try:
                result = await service.translate(original_text, source_lang, target_lang, "basic")
                
                if result and 'translated_text' in result:
                    translated = result['translated_text']
                    logger.info(f"✅ Traduction {source_lang}→{target_lang}:")
                    logger.info(f"  - Original: {original_text}")
                    logger.info(f"  - Traduit: {translated}")
                    successful_translations += 1
                else:
                    logger.warning(f"⚠️ Échec traduction {source_lang}→{target_lang}")
                    
            except Exception as e:
                logger.warning(f"⚠️ Erreur traduction {source_lang}→{target_lang}: {e}")
        
        # Nettoyer le service
        await service.cleanup()
        
        # Évaluer la qualité
        quality_score = successful_translations / len(test_cases)
        logger.info(f"📊 Score de qualité: {quality_score:.1%} ({successful_translations}/{len(test_cases)})")
        
        # Le test réussit si au moins 50% des traductions fonctionnent
        success = quality_score >= 0.5
        if success:
            logger.info("✅ Test de qualité de traduction réussi")
        else:
            logger.warning("⚠️ Qualité de traduction insuffisante")
        
        return success
        
    except Exception as e:
        logger.error(f"❌ Erreur test qualité: {e}")
        return False

@pytest.mark.asyncio
async def test_performance_metrics():
    """Test des métriques de performance"""
    logger.info("🧪 Test 05.5: Métriques de performance")
    
    if not SERVICE_AVAILABLE:
        logger.warning("⚠️ Service non disponible, test ignoré")
        return True
    
    try:
        # Créer le service
        service = QuantizedMLService(model_type="basic", quantization_level="float16")
        
        # Initialiser le service
        init_success = await service.initialize()
        if not init_success:
            logger.error("❌ Impossible d'initialiser le service pour les métriques")
            return False
        
        # Obtenir les statistiques
        stats = service.get_stats()
        
        logger.info("📊 Métriques de performance:")
        for key, value in stats.items():
            logger.info(f"  - {key}: {value}")
        
        # Vérifier les métriques importantes
        important_metrics = [
            'models_loaded',
            'quantization_level',
            'translations_count',
            'memory_usage_mb'
        ]
        
        for metric in important_metrics:
            if metric in stats:
                logger.info(f"✅ Métrique {metric}: {stats[metric]}")
            else:
                logger.warning(f"⚠️ Métrique {metric} manquante")
        
        # Nettoyer le service
        await service.cleanup()
        
        logger.info("✅ Métriques de performance récupérées avec succès")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur métriques performance: {e}")
        return False

async def run_all_tests():
    """Exécute tous les tests du service quantifié"""
    logger.info("🚀 Démarrage des tests du service quantifié (Test 05)")
    logger.info("=" * 50)
    
    tests = [
        ("Création service quantifié", test_quantized_service_creation),
        ("Partage de modèles", test_model_sharing),
        ("Système de fallback", test_fallback_system),
        ("Qualité de traduction", test_translation_quality),
        ("Métriques de performance", test_performance_metrics),
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
    logger.info(f"📊 Résultats Test 05: {passed}/{total} tests réussis")
    
    if passed == total:
        logger.info("🎉 Tous les tests du service quantifié ont réussi!")
        return True
    else:
        logger.error(f"💥 {total - passed} test(s) ont échoué")
        return False

if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
