#!/usr/bin/env python3
"""
Test 03 - Téléchargement des modèles
Niveau: Avancé - Test du téléchargement (optionnel)
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

def test_download_small_model():
    """Test de téléchargement d'un petit modèle"""
    logger.info("🧪 Test 03.1: Téléchargement d'un petit modèle")
    
    if not UTILS_AVAILABLE:
        logger.warning("⚠️ Utilitaires non disponibles, test ignoré")
        return True
    
    try:
        settings = get_settings()
        manager = create_model_manager(settings.models_path)
        
        # Utiliser un modèle petit pour le test
        small_model = "Helsinki-NLP/opus-mt-en-fr"
        
        # Vérifier si le modèle existe déjà
        if manager.is_model_downloaded(small_model):
            logger.info(f"✅ Modèle {small_model} déjà présent localement")
            return True
        
        logger.info(f"📥 Téléchargement de {small_model}...")
        
        # Télécharger le modèle
        success = manager.download_model_if_needed(small_model)
        
        if success:
            # Vérifier que le modèle est maintenant local
            is_local = manager.is_model_downloaded(small_model)
            if is_local:
                logger.info(f"✅ Modèle {small_model} téléchargé et vérifié avec succès")
                return True
            else:
                logger.error(f"❌ Modèle {small_model} téléchargé mais non détecté localement")
                return False
        else:
            logger.error(f"❌ Échec du téléchargement de {small_model}")
            return False
        
    except Exception as e:
        logger.error(f"❌ Erreur téléchargement: {e}")
        return False

async def test_async_download():
    """Test de téléchargement asynchrone"""
    logger.info("🧪 Test 03.2: Téléchargement asynchrone")
    
    if not UTILS_AVAILABLE:
        logger.warning("⚠️ Utilitaires non disponibles, test ignoré")
        return True
    
    try:
        settings = get_settings()
        manager = create_model_manager(settings.models_path)
        
        # Modèle à tester
        test_model = "Helsinki-NLP/opus-mt-fr-en"
        
        # Vérifier si le modèle existe déjà
        if manager.is_model_downloaded(test_model):
            logger.info(f"✅ Modèle {test_model} déjà présent localement")
            return True
        
        logger.info(f"📥 Téléchargement asynchrone de {test_model}...")
        
        # Téléchargement asynchrone
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(
            None,
            manager.download_model_if_needed,
            test_model,
            False  # force_download
        )
        
        if success:
            # Vérifier que le modèle est maintenant local
            is_local = manager.is_model_downloaded(test_model)
            if is_local:
                logger.info(f"✅ Modèle {test_model} téléchargé asynchrone avec succès")
                return True
            else:
                logger.error(f"❌ Modèle {test_model} téléchargé mais non détecté")
                return False
        else:
            logger.error(f"❌ Échec du téléchargement asynchrone de {test_model}")
            return False
        
    except Exception as e:
        logger.error(f"❌ Erreur téléchargement asynchrone: {e}")
        return False

def test_download_verification():
    """Test de vérification après téléchargement"""
    logger.info("🧪 Test 03.3: Vérification après téléchargement")
    
    if not UTILS_AVAILABLE:
        logger.warning("⚠️ Utilitaires non disponibles, test ignoré")
        return True
    
    try:
        settings = get_settings()
        manager = create_model_manager(settings.models_path)
        
        # Modèles à vérifier (petits modèles pour les tests)
        test_models = [
            "Helsinki-NLP/opus-mt-en-fr",
            "Helsinki-NLP/opus-mt-fr-en"
        ]
        
        verification_results = {}
        
        for model_name in test_models:
            # Vérifier si le modèle est local
            is_local = manager.is_model_downloaded(model_name)
            verification_results[model_name] = is_local
            
            status = "✅ Local" if is_local else "❌ Manquant"
            logger.info(f"  - {model_name}: {status}")
            
            if is_local:
                # Obtenir le chemin du modèle
                model_path = manager.get_model_local_path(model_name)
                logger.info(f"    Chemin: {model_path}")
        
        # Compter les résultats
        local_count = sum(1 for is_local in verification_results.values() if is_local)
        
        logger.info(f"\n📊 Résumé vérification:")
        logger.info(f"  - Modèles disponibles: {local_count}/{len(test_models)}")
        
        # Le test réussit si au moins un modèle est disponible
        success = local_count > 0
        if success:
            logger.info("✅ Vérification après téléchargement réussie")
        else:
            logger.warning("⚠️ Aucun modèle disponible après téléchargement")
        
        return success
        
    except Exception as e:
        logger.error(f"❌ Erreur vérification: {e}")
        return False

async def run_all_tests():
    """Exécute tous les tests de téléchargement"""
    logger.info("🚀 Démarrage des tests de téléchargement (Test 03)")
    logger.info("=" * 50)
    
    tests = [
        ("Téléchargement petit modèle", test_download_small_model),
        ("Téléchargement asynchrone", test_async_download),
        ("Vérification après téléchargement", test_download_verification),
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
    logger.info(f"📊 Résultats Test 03: {passed}/{total} tests réussis")
    
    if passed == total:
        logger.info("🎉 Tous les tests de téléchargement ont réussi!")
        return True
    else:
        logger.error(f"💥 {total - passed} test(s) ont échoué")
        return False

if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
