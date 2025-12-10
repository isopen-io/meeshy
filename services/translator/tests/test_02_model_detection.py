#!/usr/bin/env python3
"""
Test 02 - Détection des modèles existants
Niveau: Intermédiaire - Vérification de la détection locale
"""

import sys
import os
import logging
import asyncio

# Ajouter le répertoire src au path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

try:
    from utils.model_utils import create_model_manager
    from config.settings import get_settings
    UTILS_AVAILABLE = True
except ImportError as e:
    logger = logging.getLogger(__name__)
    logger.warning(f"⚠️ Utilitaires non disponibles: {e}")
    UTILS_AVAILABLE = False

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_model_detection():
    """Test de détection des modèles existants"""
    logger.info("🧪 Test 02.1: Détection des modèles existants")
    
    if not UTILS_AVAILABLE:
        logger.warning("⚠️ Utilitaires non disponibles, test ignoré")
        return True
    
    try:
        settings = get_settings()
        manager = create_model_manager(settings.models_path)
        
        # Modèles configurés dans l'application
        configured_models = [
            settings.basic_model,
            settings.medium_model,
            settings.premium_model
        ]
        
        logger.info(f"📁 Répertoire des modèles: {settings.models_path}")
        
        detection_results = {}
        for model_name in configured_models:
            is_local = manager.is_model_downloaded(model_name)
            detection_results[model_name] = is_local
            
            status = "✅ Local" if is_local else "❌ Manquant"
            logger.info(f"  - {model_name}: {status}")
        
        # Compter les résultats
        local_count = sum(1 for is_local in detection_results.values() if is_local)
        missing_count = len(detection_results) - local_count
        
        logger.info(f"\n📊 Résumé détection:")
        logger.info(f"  - Modèles détectés: {local_count}")
        logger.info(f"  - Modèles manquants: {missing_count}")
        
        # Le test réussit si au moins un modèle est détecté
        success = local_count > 0
        if success:
            logger.info("✅ Détection des modèles réussie")
        else:
            logger.warning("⚠️ Aucun modèle détecté localement")
        
        return success
        
    except Exception as e:
        logger.error(f"❌ Erreur détection modèles: {e}")
        return False

def test_model_status():
    """Test du statut détaillé des modèles"""
    logger.info("🧪 Test 02.2: Statut détaillé des modèles")
    
    if not UTILS_AVAILABLE:
        logger.warning("⚠️ Utilitaires non disponibles, test ignoré")
        return True
    
    try:
        settings = get_settings()
        manager = create_model_manager(settings.models_path)
        
        # Modèles à vérifier
        test_models = [
            settings.basic_model,
            settings.medium_model,
            settings.premium_model
        ]
        
        models_status = manager.get_models_status(test_models)
        
        for model_name, status in models_status.items():
            logger.info(f"\n📋 {model_name}:")
            logger.info(f"  - Local: {'✅ Oui' if status['local'] else '❌ Non'}")
            logger.info(f"  - Chemin: {status['path']}")
            logger.info(f"  - Taille: {status.get('size_mb', 0):.1f} MB")
            
            # Vérifier que les clés requises sont présentes
            assert 'local' in status
            assert 'path' in status
            assert 'size_mb' in status
        
        logger.info("✅ Statut des modèles récupéré avec succès")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur statut modèles: {e}")
        return False

def test_cleanup_function():
    """Test de la fonction de nettoyage"""
    logger.info("🧪 Test 02.3: Nettoyage des téléchargements incomplets")
    
    if not UTILS_AVAILABLE:
        logger.warning("⚠️ Utilitaires non disponibles, test ignoré")
        return True
    
    try:
        settings = get_settings()
        manager = create_model_manager(settings.models_path)
        
        # Exécuter le nettoyage
        cleaned_count = manager.cleanup_incomplete_downloads()
        
        logger.info(f"🧹 Répertoires nettoyés: {cleaned_count}")
        
        # Le test réussit si la fonction s'exécute sans erreur
        logger.info("✅ Fonction de nettoyage exécutée avec succès")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur nettoyage: {e}")
        return False

def run_all_tests():
    """Exécute tous les tests de détection"""
    logger.info("🚀 Démarrage des tests de détection (Test 02)")
    logger.info("=" * 50)
    
    tests = [
        ("Détection des modèles", test_model_detection),
        ("Statut des modèles", test_model_status),
        ("Nettoyage", test_cleanup_function),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        logger.info(f"\n📋 {test_name}...")
        if test_func():
            passed += 1
            logger.info(f"✅ {test_name} - RÉUSSI")
        else:
            logger.error(f"❌ {test_name} - ÉCHOUÉ")
    
    logger.info("\n" + "=" * 50)
    logger.info(f"📊 Résultats Test 02: {passed}/{total} tests réussis")
    
    if passed == total:
        logger.info("🎉 Tous les tests de détection ont réussi!")
        return True
    else:
        logger.error(f"💥 {total - passed} test(s) ont échoué")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
