#!/usr/bin/env python3
"""
Test 01 - Utilitaires de base du gestionnaire de modèles
Niveau: Simple - Vérification des fonctions de base
"""

import sys
import os
import logging

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

def test_model_manager_creation():
    """Test de création du gestionnaire de modèles"""
    logger.info("🧪 Test 01.1: Création du gestionnaire de modèles")
    
    if not UTILS_AVAILABLE:
        logger.warning("⚠️ Utilitaires non disponibles, test ignoré")
        return True
    
    try:
        settings = get_settings()
        manager = create_model_manager(settings.models_path)
        
        assert manager is not None
        assert hasattr(manager, 'models_path')
        assert hasattr(manager, 'is_model_downloaded')
        assert hasattr(manager, 'download_model_if_needed')
        
        logger.info("✅ Gestionnaire de modèles créé avec succès")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur création gestionnaire: {e}")
        return False

def test_model_path_generation():
    """Test de génération des chemins de modèles"""
    logger.info("🧪 Test 01.2: Génération des chemins de modèles")
    
    if not UTILS_AVAILABLE:
        logger.warning("⚠️ Utilitaires non disponibles, test ignoré")
        return True
    
    try:
        settings = get_settings()
        manager = create_model_manager(settings.models_path)
        
        # Test avec différents formats de noms
        test_models = [
            "facebook/nllb-200-distilled-600M",
            "Helsinki-NLP/opus-mt-en-fr",
            "t5-small"
        ]
        
        for model_name in test_models:
            path = manager.get_model_local_path(model_name)
            assert path is not None
            assert isinstance(path, type(manager.models_path))
            logger.info(f"  ✅ Chemin généré pour {model_name}: {path}")
        
        logger.info("✅ Génération des chemins réussie")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur génération chemins: {e}")
        return False

def test_model_info_retrieval():
    """Test de récupération des informations de modèles"""
    logger.info("🧪 Test 01.3: Récupération des informations de modèles")
    
    if not UTILS_AVAILABLE:
        logger.warning("⚠️ Utilitaires non disponibles, test ignoré")
        return True
    
    try:
        settings = get_settings()
        manager = create_model_manager(settings.models_path)
        
        # Test avec un modèle connu
        model_name = "facebook/nllb-200-distilled-600M"
        info = manager.get_model_info(model_name)
        
        assert info is not None
        assert 'id' in info
        assert 'size' in info
        assert 'downloads' in info
        
        logger.info(f"✅ Informations récupérées pour {model_name}")
        logger.info(f"  - ID: {info['id']}")
        logger.info(f"  - Taille: {info.get('size', 0)} bytes")
        logger.info(f"  - Téléchargements: {info.get('downloads', 0)}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur récupération infos: {e}")
        return False

def run_all_tests():
    """Exécute tous les tests de base"""
    logger.info("🚀 Démarrage des tests de base (Test 01)")
    logger.info("=" * 50)
    
    tests = [
        ("Création du gestionnaire", test_model_manager_creation),
        ("Génération des chemins", test_model_path_generation),
        ("Récupération des infos", test_model_info_retrieval),
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
    logger.info(f"📊 Résultats Test 01: {passed}/{total} tests réussis")
    
    if passed == total:
        logger.info("🎉 Tous les tests de base ont réussi!")
        return True
    else:
        logger.error(f"💥 {total - passed} test(s) ont échoué")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
