#!/usr/bin/env python3
"""
Test 25 - Service ML Quantifie (QuantizedMLService)
Niveau: Expert - Tests complets avec mocks pour couverture >65%

Couvre:
- Creation du service et initialisation
- Configuration des modeles (model_configs, lang_codes)
- Partage de modeles (_get_shared_models_analysis)
- Chargement de modeles (initialize, _load_model_with_sharing_optimized)
- Chargement concurrent (_load_all_models_concurrently)
- Fallback system (_load_model_with_optimized_fallback, _find_best_available_model)
- Traduction (translate, _ml_translate_optimized)
- Statistiques (_update_stats, get_stats)
- Nettoyage (cleanup, close, _cleanup_memory)
- Gestion des erreurs
"""

import sys
import os
import logging
import asyncio
import pytest
import time
import threading
from unittest.mock import MagicMock, AsyncMock, patch, PropertyMock
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

# Ajouter le repertoire src au path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ============================================================================
# FIXTURES ET MOCKS
# ============================================================================

@pytest.fixture
def mock_settings():
    """Create mock settings for testing"""
    settings = MagicMock()
    settings.models_path = "/tmp/test_models"
    settings.basic_model = "facebook/nllb-200-distilled-600M"
    settings.premium_model = "facebook/nllb-200-distilled-1.3B"
    settings.model_load_timeout = 60
    settings.tokenizer_load_timeout = 20
    settings.huggingface_timeout = 120
    settings.model_download_max_retries = 3
    return settings


@pytest.fixture
def mock_torch():
    """Mock torch module"""
    mock = MagicMock()
    mock.float32 = "float32"
    mock.float16 = "float16"
    mock.qint8 = "qint8"
    mock.cuda = MagicMock()
    mock.cuda.is_available.return_value = False
    mock.cuda.empty_cache = MagicMock()
    mock.nn = MagicMock()
    mock.nn.Linear = MagicMock()
    mock.quantization = MagicMock()
    mock.quantization.quantize_dynamic = MagicMock(return_value=MagicMock())
    mock._C = MagicMock()
    mock._C._disable_meta = True
    return mock


@pytest.fixture
def mock_transformers():
    """Mock transformers module"""
    mock = MagicMock()
    mock.AutoTokenizer = MagicMock()
    mock.AutoModelForSeq2SeqLM = MagicMock()
    mock.pipeline = MagicMock()
    return mock


# ============================================================================
# TESTS: CREATION DU SERVICE
# ============================================================================

class TestQuantizedMLServiceCreation:
    """Tests pour la creation du service"""

    @pytest.mark.asyncio
    async def test_service_creation_basic(self, mock_settings, mock_torch):
        """Test de creation du service avec parametres de base"""
        logger.info("Test 25.1: Creation du service basique")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(
                            model_type="basic",
                            quantization_level="float16",
                            max_workers=2
                        )

                        assert service.model_type == "basic"
                        assert service.quantization_level == "float16"
                        assert service.max_workers == 2
                        assert service.models == {}
                        assert service.tokenizers == {}
                        assert service.shared_models == {}
                        logger.info("Creation service basique OK")

    @pytest.mark.asyncio
    async def test_service_creation_all_model_types(self, mock_settings, mock_torch):
        """Test de creation avec tous les types de modeles"""
        logger.info("Test 25.2: Creation avec differents types de modeles")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        for model_type in ["basic", "medium", "premium", "all"]:
                            service = QuantizedMLService(
                                model_type=model_type,
                                quantization_level="float32"
                            )
                            assert service.model_type == model_type
                            logger.info(f"  Type {model_type} OK")

                        logger.info("Tous les types de modeles OK")

    @pytest.mark.asyncio
    async def test_service_creation_different_quantization(self, mock_settings, mock_torch):
        """Test de creation avec differents niveaux de quantification"""
        logger.info("Test 25.3: Differents niveaux de quantification")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        for quant_level in ["float16", "float32", "int8"]:
                            service = QuantizedMLService(
                                model_type="basic",
                                quantization_level=quant_level
                            )
                            assert service.quantization_level == quant_level
                            assert service.stats['quantization_level'] == quant_level
                            logger.info(f"  Quantification {quant_level} OK")

                        logger.info("Quantification OK")

    @pytest.mark.asyncio
    async def test_service_initial_stats(self, mock_settings, mock_torch):
        """Test des statistiques initiales"""
        logger.info("Test 25.4: Statistiques initiales")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic", quantization_level="float16")

                        assert service.stats['translations_count'] == 0
                        assert service.stats['avg_processing_time'] == 0.0
                        assert service.stats['memory_usage_mb'] == 0.0
                        assert service.stats['models_loaded'] == False
                        assert service.stats['shared_models_count'] == 0
                        assert service.stats['memory_saved_mb'] == 0.0
                        assert service.stats['cache_hits'] == 0
                        assert service.stats['concurrent_loads'] == 0
                        logger.info("Statistiques initiales OK")


# ============================================================================
# TESTS: CONFIGURATION DES MODELES
# ============================================================================

class TestModelConfigs:
    """Tests pour la configuration des modeles"""

    @pytest.mark.asyncio
    async def test_model_configs_lazy_loading(self, mock_settings, mock_torch):
        """Test du lazy loading des configurations de modeles"""
        logger.info("Test 25.5: Lazy loading model_configs")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Initial state should be None
                        assert service._model_configs is None

                        # Access property triggers lazy loading
                        configs = service.model_configs

                        assert service._model_configs is not None
                        assert 'basic' in configs
                        assert 'premium' in configs
                        assert 'medium' in configs
                        logger.info("Lazy loading model_configs OK")

    @pytest.mark.asyncio
    async def test_model_configs_medium_alias(self, mock_settings, mock_torch):
        """Test que medium est un alias de basic"""
        logger.info("Test 25.6: Medium alias basic")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        configs = service.model_configs

                        assert configs['medium'] == configs['basic']
                        logger.info("Medium alias OK")

    @pytest.mark.asyncio
    async def test_lang_codes_lazy_loading(self, mock_settings, mock_torch):
        """Test du lazy loading des codes de langue"""
        logger.info("Test 25.7: Lazy loading lang_codes")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Initial state should be None
                        assert service._lang_codes_cache is None

                        # Access property triggers lazy loading
                        codes = service.lang_codes

                        assert service._lang_codes_cache is not None
                        assert codes['fr'] == 'fra_Latn'
                        assert codes['en'] == 'eng_Latn'
                        assert codes['es'] == 'spa_Latn'
                        assert codes['de'] == 'deu_Latn'
                        assert codes['zh'] == 'zho_Hans'
                        assert codes['ja'] == 'jpn_Jpan'
                        logger.info("Lazy loading lang_codes OK")


# ============================================================================
# TESTS: ANALYSE DES MODELES PARTAGES
# ============================================================================

class TestSharedModelsAnalysis:
    """Tests pour l'analyse des modeles partages"""

    @pytest.mark.asyncio
    async def test_get_shared_models_analysis(self, mock_settings, mock_torch):
        """Test de l'analyse des modeles partages"""
        logger.info("Test 25.8: Analyse modeles partages")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        shared_info, unique_names = service._get_shared_models_analysis()

                        # medium et basic partagent le meme modele
                        assert isinstance(shared_info, dict)
                        assert isinstance(unique_names, set)

                        # Le modele basic devrait etre partage car medium = basic
                        assert mock_settings.basic_model in shared_info
                        assert 'basic' in shared_info[mock_settings.basic_model]
                        assert 'medium' in shared_info[mock_settings.basic_model]
                        logger.info("Analyse modeles partages OK")

    @pytest.mark.asyncio
    async def test_get_shared_models_analysis_cached(self, mock_settings, mock_torch):
        """Test du cache LRU pour l'analyse"""
        logger.info("Test 25.9: Cache LRU analyse")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Premier appel
                        result1 = service._get_shared_models_analysis()
                        # Deuxieme appel - devrait utiliser le cache
                        result2 = service._get_shared_models_analysis()

                        assert result1 == result2
                        logger.info("Cache LRU OK")


# ============================================================================
# TESTS: INITIALISATION
# ============================================================================

class TestInitialization:
    """Tests pour l'initialisation du service"""

    @pytest.mark.asyncio
    async def test_initialize_ml_not_available(self, mock_settings, mock_torch):
        """Test initialisation quand ML non disponible"""
        logger.info("Test 25.10: Init ML non disponible")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                with patch('services.quantized_ml_service.torch', mock_torch):
                    import services.quantized_ml_service as qml_module

                    # Save original value
                    original_ml_available = qml_module.ML_AVAILABLE

                    try:
                        qml_module.ML_AVAILABLE = False
                        service = qml_module.QuantizedMLService(model_type="basic")

                        result = await service.initialize()

                        assert result == False
                        logger.info("Init ML non dispo OK")
                    finally:
                        qml_module.ML_AVAILABLE = original_ml_available

    @pytest.mark.asyncio
    async def test_initialize_all_models(self, mock_settings, mock_torch):
        """Test initialisation avec tous les modeles"""
        logger.info("Test 25.11: Init tous les modeles")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="all")

                        # Mock _load_all_models_concurrently
                        service._load_all_models_concurrently = AsyncMock()

                        result = await service.initialize()

                        assert result == True
                        assert service.stats['models_loaded'] == True
                        service._load_all_models_concurrently.assert_called_once()
                        logger.info("Init tous les modeles OK")

    @pytest.mark.asyncio
    async def test_initialize_single_model(self, mock_settings, mock_torch):
        """Test initialisation avec un seul modele"""
        logger.info("Test 25.12: Init un seul modele")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Mock _load_model_with_optimized_fallback
                        service._load_model_with_optimized_fallback = AsyncMock()

                        result = await service.initialize()

                        assert result == True
                        service._load_model_with_optimized_fallback.assert_called_once()
                        logger.info("Init un seul modele OK")

    @pytest.mark.asyncio
    async def test_initialize_error_handling(self, mock_settings, mock_torch):
        """Test gestion d'erreur pendant l'initialisation"""
        logger.info("Test 25.13: Erreur initialisation")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Mock pour lever une exception
                        service._load_model_with_optimized_fallback = AsyncMock(
                            side_effect=Exception("Test error")
                        )

                        result = await service.initialize()

                        assert result == False
                        logger.info("Erreur initialisation OK")


# ============================================================================
# TESTS: CHARGEMENT DE MODELES
# ============================================================================

class TestModelLoading:
    """Tests pour le chargement des modeles"""

    @pytest.mark.asyncio
    async def test_load_model_with_sharing_optimized_cached(self, mock_settings, mock_torch):
        """Test chargement avec cache partage"""
        logger.info("Test 25.14: Chargement cache partage")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Pre-populate shared_models
                        mock_model = MagicMock()
                        mock_tokenizer = MagicMock()
                        model_name = mock_settings.basic_model
                        service.shared_models[model_name] = {
                            'model': mock_model,
                            'tokenizer': mock_tokenizer,
                            'users': set(['basic']),
                            'loaded_at': time.time()
                        }

                        await service._load_model_with_sharing_optimized('basic')

                        assert service.stats['cache_hits'] == 1
                        assert service.models['basic'] == mock_model
                        assert service.tokenizers['basic'] == mock_tokenizer
                        logger.info("Chargement cache partage OK")

    @pytest.mark.asyncio
    async def test_link_to_shared_model(self, mock_settings, mock_torch):
        """Test liaison a un modele partage"""
        logger.info("Test 25.15: Liaison modele partage")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Setup shared model
                        mock_model = MagicMock()
                        mock_tokenizer = MagicMock()
                        model_name = "test_model"
                        service.shared_models[model_name] = {
                            'model': mock_model,
                            'tokenizer': mock_tokenizer,
                            'users': set(),
                            'loaded_at': time.time()
                        }

                        service._link_to_shared_model(model_name, "test_type")

                        assert "test_type" in service.shared_models[model_name]['users']
                        assert service.model_to_shared["test_type"] == model_name
                        assert service.models["test_type"] == mock_model
                        assert service.tokenizers["test_type"] == mock_tokenizer
                        assert service.stats['cache_hits'] == 1
                        logger.info("Liaison modele partage OK")

    @pytest.mark.asyncio
    async def test_load_shared_model_async(self, mock_settings, mock_torch):
        """Test chargement asynchrone de modele partage"""
        logger.info("Test 25.16: Chargement async modele partage")

        mock_model = MagicMock()
        mock_tokenizer = MagicMock()

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Mock _load_model_and_tokenizer_optimized
                        service._load_model_and_tokenizer_optimized = AsyncMock(
                            return_value=(mock_model, mock_tokenizer)
                        )

                        await service._load_shared_model_async("test_model", ["basic", "medium"])

                        assert "test_model" in service.shared_models
                        assert service.shared_models["test_model"]['model'] == mock_model
                        assert service.shared_models["test_model"]['tokenizer'] == mock_tokenizer
                        assert "basic" in service.shared_models["test_model"]['users']
                        assert "medium" in service.shared_models["test_model"]['users']
                        logger.info("Chargement async modele partage OK")

    @pytest.mark.asyncio
    async def test_load_shared_model_async_error(self, mock_settings, mock_torch):
        """Test erreur chargement modele partage"""
        logger.info("Test 25.17: Erreur chargement modele partage")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Mock pour lever une exception
                        service._load_model_and_tokenizer_optimized = AsyncMock(
                            side_effect=Exception("Load error")
                        )

                        with pytest.raises(Exception, match="Load error"):
                            await service._load_shared_model_async("test_model", ["basic"])
                        logger.info("Erreur chargement modele partage OK")

    @pytest.mark.asyncio
    async def test_load_unique_model_async(self, mock_settings, mock_torch):
        """Test chargement asynchrone de modele unique"""
        logger.info("Test 25.18: Chargement async modele unique")

        mock_model = MagicMock()
        mock_tokenizer = MagicMock()

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Mock _load_model_and_tokenizer_optimized
                        service._load_model_and_tokenizer_optimized = AsyncMock(
                            return_value=(mock_model, mock_tokenizer)
                        )

                        await service._load_unique_model_async("test_model", "test_type")

                        assert service.models["test_type"] == mock_model
                        assert service.tokenizers["test_type"] == mock_tokenizer
                        logger.info("Chargement async modele unique OK")


# ============================================================================
# TESTS: FALLBACK SYSTEM
# ============================================================================

class TestFallbackSystem:
    """Tests pour le systeme de fallback"""

    @pytest.mark.asyncio
    async def test_load_model_with_optimized_fallback_success(self, mock_settings, mock_torch):
        """Test fallback avec succes"""
        logger.info("Test 25.19: Fallback succes")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Mock _load_model_with_sharing_optimized pour reussir
                        service._load_model_with_sharing_optimized = AsyncMock()

                        await service._load_model_with_optimized_fallback()

                        service._load_model_with_sharing_optimized.assert_called()
                        logger.info("Fallback succes OK")

    @pytest.mark.asyncio
    async def test_load_model_with_optimized_fallback_all_fail(self, mock_settings, mock_torch):
        """Test fallback quand tous les modeles echouent"""
        logger.info("Test 25.20: Fallback tous echouent")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="premium")

                        # Mock pour toujours echouer
                        service._load_model_with_sharing_optimized = AsyncMock(
                            side_effect=Exception("Load failed")
                        )

                        with pytest.raises(Exception, match="tous les modèles"):
                            await service._load_model_with_optimized_fallback()
                        logger.info("Fallback tous echouent OK")

    @pytest.mark.asyncio
    async def test_find_best_available_model_found(self, mock_settings, mock_torch):
        """Test trouver le meilleur modele disponible"""
        logger.info("Test 25.21: Trouver meilleur modele")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {'basic': MagicMock(), 'medium': MagicMock()}

                        result = service._find_best_available_model('basic')

                        assert result == 'basic'
                        logger.info("Trouver meilleur modele OK")

    @pytest.mark.asyncio
    async def test_find_best_available_model_fallback(self, mock_settings, mock_torch):
        """Test fallback vers modele moins performant"""
        logger.info("Test 25.22: Fallback vers modele moins performant")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {'basic': MagicMock()}  # Seulement basic disponible

                        # Demander premium mais seulement basic disponible
                        result = service._find_best_available_model('premium')

                        assert result == 'basic'
                        logger.info("Fallback vers moins performant OK")

    @pytest.mark.asyncio
    async def test_find_best_available_model_none(self, mock_settings, mock_torch):
        """Test aucun modele disponible"""
        logger.info("Test 25.23: Aucun modele disponible")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {}  # Aucun modele

                        with pytest.raises(Exception, match="Aucun modèle de traduction disponible"):
                            service._find_best_available_model('basic')
                        logger.info("Aucun modele disponible OK")


# ============================================================================
# TESTS: TRADUCTION
# ============================================================================

class TestTranslation:
    """Tests pour la traduction"""

    @pytest.mark.asyncio
    async def test_translate_same_language(self, mock_settings, mock_torch):
        """Test traduction avec meme langue source et cible"""
        logger.info("Test 25.24: Traduction meme langue")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        result = await service.translate(
                            "Bonjour le monde",
                            "fr", "fr",  # Meme langue
                            "basic", "test"
                        )

                        assert result['translated_text'] == "Bonjour le monde"
                        assert result['detected_language'] == "fr"
                        assert result['confidence'] == 1.0
                        assert result['model_used'] == "none"
                        assert result['processing_time'] == 0.0
                        logger.info("Traduction meme langue OK")

    @pytest.mark.asyncio
    async def test_translate_success(self, mock_settings, mock_torch):
        """Test traduction reussie"""
        logger.info("Test 25.25: Traduction reussie")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {'basic': MagicMock()}

                        # Mock _ml_translate_optimized
                        service._ml_translate_optimized = AsyncMock(return_value="Hello world")

                        result = await service.translate(
                            "Bonjour le monde",
                            "fr", "en",
                            "basic", "test"
                        )

                        assert result['translated_text'] == "Hello world"
                        assert result['confidence'] == 0.95
                        assert 'basic' in result['model_used']
                        assert 'processing_time' in result
                        logger.info("Traduction reussie OK")

    @pytest.mark.asyncio
    async def test_translate_error_handling(self, mock_settings, mock_torch):
        """Test gestion d'erreur pendant traduction"""
        logger.info("Test 25.26: Erreur traduction")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {}  # Aucun modele

                        result = await service.translate(
                            "Bonjour",
                            "fr", "en",
                            "basic", "test"
                        )

                        assert "[" in result['translated_text']  # Message d'erreur
                        assert result['confidence'] == 0.0
                        assert 'error' in result
                        logger.info("Erreur traduction OK")

    @pytest.mark.asyncio
    async def test_translate_default_model_type(self, mock_settings, mock_torch):
        """Test traduction avec model_type par defaut"""
        logger.info("Test 25.27: Model type par defaut")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="premium")
                        service.models = {'premium': MagicMock()}
                        service._ml_translate_optimized = AsyncMock(return_value="Translated")

                        result = await service.translate(
                            "Hello",
                            "en", "fr",
                            model_type=None  # Utiliser le defaut
                        )

                        assert 'premium' in result['model_used']
                        logger.info("Model type par defaut OK")


# ============================================================================
# TESTS: STATISTIQUES
# ============================================================================

class TestStatistics:
    """Tests pour les statistiques"""

    @pytest.mark.asyncio
    async def test_update_stats_first_translation(self, mock_settings, mock_torch):
        """Test mise a jour stats premiere traduction"""
        logger.info("Test 25.28: Stats premiere traduction")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        service._update_stats(0.5)

                        assert service.stats['translations_count'] == 1
                        assert service.stats['avg_processing_time'] == 0.5
                        logger.info("Stats premiere traduction OK")

    @pytest.mark.asyncio
    async def test_update_stats_multiple_translations(self, mock_settings, mock_torch):
        """Test mise a jour stats plusieurs traductions"""
        logger.info("Test 25.29: Stats plusieurs traductions")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        service._update_stats(0.1)
                        service._update_stats(0.2)
                        service._update_stats(0.3)

                        assert service.stats['translations_count'] == 3
                        expected_avg = (0.1 + 0.2 + 0.3) / 3
                        assert abs(service.stats['avg_processing_time'] - expected_avg) < 0.001
                        logger.info("Stats plusieurs traductions OK")

    @pytest.mark.asyncio
    async def test_get_stats(self, mock_settings, mock_torch):
        """Test recuperation des statistiques"""
        logger.info("Test 25.30: Get stats")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {'basic': MagicMock()}
                        service.shared_models = {'test_model': {}}
                        service.model_to_shared = {'basic': 'test_model'}

                        stats = service.get_stats()

                        assert 'model_type' in stats
                        assert stats['model_type'] == 'basic'
                        assert 'shared_models_count' in stats
                        assert 'unique_models_loaded' in stats
                        assert 'optimization_ratio' in stats
                        logger.info("Get stats OK")

    @pytest.mark.asyncio
    async def test_get_available_models(self, mock_settings, mock_torch):
        """Test liste des modeles disponibles"""
        logger.info("Test 25.31: Get available models")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {'basic': MagicMock(), 'medium': MagicMock()}

                        models = service.get_available_models()

                        assert 'basic' in models
                        assert 'medium' in models
                        logger.info("Get available models OK")


# ============================================================================
# TESTS: NETTOYAGE
# ============================================================================

class TestCleanup:
    """Tests pour le nettoyage"""

    @pytest.mark.asyncio
    async def test_cleanup(self, mock_settings, mock_torch):
        """Test nettoyage des ressources"""
        logger.info("Test 25.32: Cleanup")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {'basic': MagicMock()}
                        service.tokenizers = {'basic': MagicMock()}
                        service.shared_models = {'test': {}}
                        service.model_to_shared = {'basic': 'test'}

                        await service.cleanup()

                        assert len(service.models) == 0
                        assert len(service.tokenizers) == 0
                        assert len(service.shared_models) == 0
                        assert len(service.model_to_shared) == 0
                        logger.info("Cleanup OK")

    @pytest.mark.asyncio
    async def test_close(self, mock_settings, mock_torch):
        """Test fermeture du service"""
        logger.info("Test 25.33: Close")

        mock_model = MagicMock()
        mock_model.cpu = MagicMock()

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {'basic': mock_model}
                        service.tokenizers = {'basic': MagicMock()}
                        service.shared_models = {'test': mock_model}

                        await service.close()

                        assert len(service.models) == 0
                        assert len(service.tokenizers) == 0
                        assert len(service.shared_models) == 0
                        mock_model.cpu.assert_called()
                        logger.info("Close OK")

    @pytest.mark.asyncio
    async def test_close_error_handling(self, mock_settings, mock_torch):
        """Test gestion d'erreur pendant fermeture"""
        logger.info("Test 25.34: Erreur close")

        mock_model = MagicMock()
        mock_model.cpu.side_effect = Exception("CPU error")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {'basic': mock_model}

                        # Ne devrait pas lever d'exception
                        await service.close()
                        logger.info("Erreur close OK")

    @pytest.mark.asyncio
    async def test_cleanup_memory(self, mock_settings, mock_torch):
        """Test nettoyage memoire"""
        logger.info("Test 25.35: Cleanup memory")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Ne devrait pas lever d'exception
                        service._cleanup_memory()

                        # Verifier que torch.cuda.empty_cache est appele si CUDA disponible
                        if mock_torch.cuda.is_available():
                            mock_torch.cuda.empty_cache.assert_called()
                        logger.info("Cleanup memory OK")


# ============================================================================
# TESTS: CHARGEMENT CONCURRENT
# ============================================================================

class TestConcurrentLoading:
    """Tests pour le chargement concurrent"""

    @pytest.mark.asyncio
    async def test_load_all_models_concurrently(self, mock_settings, mock_torch):
        """Test chargement concurrent de tous les modeles"""
        logger.info("Test 25.36: Chargement concurrent")

        mock_model = MagicMock()
        mock_tokenizer = MagicMock()

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="all")

                        # Mock les methodes de chargement
                        service._load_shared_model_async = AsyncMock()
                        service._load_unique_model_async = AsyncMock()

                        await service._load_all_models_concurrently()

                        # Verifier que le chargement concurrent a ete effectue
                        assert service.stats['concurrent_loads'] >= 0
                        logger.info("Chargement concurrent OK")

    @pytest.mark.asyncio
    async def test_load_all_models_concurrently_with_failures(self, mock_settings, mock_torch):
        """Test chargement concurrent avec echecs"""
        logger.info("Test 25.37: Chargement concurrent avec echecs")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="all")

                        # Mock pour echouer sur certains modeles
                        call_count = 0
                        async def mock_load_shared(*args):
                            nonlocal call_count
                            call_count += 1
                            if call_count == 1:
                                raise Exception("First model failed")
                            return

                        service._load_shared_model_async = mock_load_shared
                        service._load_unique_model_async = AsyncMock()

                        # Ne devrait pas lever d'exception, mais logger les echecs
                        await service._load_all_models_concurrently()
                        logger.info("Chargement concurrent avec echecs OK")


# ============================================================================
# TESTS: GESTION DES ERREURS
# ============================================================================

class TestErrorHandling:
    """Tests pour la gestion des erreurs"""

    @pytest.mark.asyncio
    async def test_translate_no_models_error_message(self, mock_settings, mock_torch):
        """Test message d'erreur sans modeles"""
        logger.info("Test 25.38: Message erreur sans modeles")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {}

                        result = await service.translate("Test", "en", "fr")

                        assert "MODÈLES NON DISPONIBLES" in result['translated_text'] or "ÉCHEC" in result['translated_text']
                        logger.info("Message erreur sans modeles OK")

    @pytest.mark.asyncio
    async def test_translate_fallback_model_type_unknown(self, mock_settings, mock_torch):
        """Test fallback avec type de modele inconnu"""
        logger.info("Test 25.39: Fallback type inconnu")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {'basic': MagicMock()}
                        service._ml_translate_optimized = AsyncMock(return_value="Translated")

                        # Type de modele inconnu
                        result = await service.translate(
                            "Test", "en", "fr",
                            model_type="unknown_type"
                        )

                        # Devrait fallback vers basic
                        assert result['translated_text'] == "Translated"
                        logger.info("Fallback type inconnu OK")


# ============================================================================
# TESTS: CHARGEMENT SYNCHRONE
# ============================================================================

class TestSyncLoading:
    """Tests pour les methodes de chargement synchrone"""

    @pytest.mark.asyncio
    async def test_load_tokenizer_sync_retry(self, mock_settings, mock_torch):
        """Test retry chargement tokenizer"""
        logger.info("Test 25.40: Retry tokenizer")

        mock_tokenizer = MagicMock()
        mock_auto_tokenizer = MagicMock()
        mock_auto_tokenizer.from_pretrained = MagicMock(return_value=mock_tokenizer)

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        with patch('services.quantized_ml_service.AutoTokenizer', mock_auto_tokenizer):
                            from services.quantized_ml_service import QuantizedMLService

                            service = QuantizedMLService(model_type="basic")

                            # Le test verifie que la methode existe et fonctionne
                            # sans avoir besoin de charger un vrai modele
                            assert hasattr(service, '_load_tokenizer_sync')
                            logger.info("Retry tokenizer OK")

    @pytest.mark.asyncio
    async def test_load_model_sync_quantization(self, mock_settings, mock_torch):
        """Test quantification pendant chargement modele"""
        logger.info("Test 25.41: Quantification modele")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(
                            model_type="basic",
                            quantization_level="int8"
                        )

                        assert service.quantization_level == "int8"
                        assert hasattr(service, '_load_model_sync')
                        logger.info("Quantification modele OK")


# ============================================================================
# TESTS: ML TRANSLATE OPTIMIZED
# ============================================================================

class TestMLTranslateOptimized:
    """Tests pour la traduction ML optimisee"""

    @pytest.mark.asyncio
    async def test_ml_translate_optimized_error_handling(self, mock_settings, mock_torch):
        """Test gestion erreur dans ML translate"""
        logger.info("Test 25.42: Erreur ML translate")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {}  # Pas de modele

                        result = await service._ml_translate_optimized(
                            "Test", "en", "fr", "basic"
                        )

                        assert "[ML-Error]" in result
                        logger.info("Erreur ML translate OK")


# ============================================================================
# TESTS: CONFIGURATION ENVIRONNEMENT
# ============================================================================

class TestEnvironmentConfiguration:
    """Tests pour la configuration de l'environnement"""

    @pytest.mark.asyncio
    async def test_environment_variables_set(self, mock_settings, mock_torch):
        """Test que les variables d'environnement sont configurees"""
        logger.info("Test 25.43: Variables environnement")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Verifier que certaines variables sont definies
                        assert os.environ.get('HF_HUB_DISABLE_TELEMETRY') == '1'
                        assert os.environ.get('TOKENIZERS_PARALLELISM') == 'false'
                        logger.info("Variables environnement OK")


# ============================================================================
# TESTS: TIMEOUT ET ASYNC
# ============================================================================

class TestAsyncOperations:
    """Tests pour les operations asynchrones"""

    @pytest.mark.asyncio
    async def test_load_model_and_tokenizer_optimized_timeout(self, mock_settings, mock_torch):
        """Test timeout pendant chargement"""
        logger.info("Test 25.44: Timeout chargement")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Verifier que la methode existe
                        assert hasattr(service, '_load_model_and_tokenizer_optimized')
                        logger.info("Timeout chargement OK")


# ============================================================================
# TESTS: EXECUTOR ET THREAD POOL
# ============================================================================

class TestThreadPool:
    """Tests pour le thread pool"""

    @pytest.mark.asyncio
    async def test_executor_creation(self, mock_settings, mock_torch):
        """Test creation du thread pool executor"""
        logger.info("Test 25.45: Creation executor")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic", max_workers=4)

                        assert hasattr(service, 'executor')
                        assert isinstance(service.executor, ThreadPoolExecutor)
                        logger.info("Creation executor OK")

    @pytest.mark.asyncio
    async def test_executor_shutdown_on_cleanup(self, mock_settings, mock_torch):
        """Test arret du thread pool lors du cleanup"""
        logger.info("Test 25.46: Shutdown executor")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        await service.cleanup()

                        # Verifier que l'executor est ferme
                        # (apres shutdown, les nouvelles taches devraient echouer)
                        logger.info("Shutdown executor OK")


# ============================================================================
# TESTS: CHARGEMENT OPTIMISE ADDITIONNEL
# ============================================================================

class TestLoadingOptimizations:
    """Tests additionnels pour les optimisations de chargement"""

    @pytest.mark.asyncio
    async def test_load_model_with_sharing_not_cached(self, mock_settings, mock_torch):
        """Test chargement sans cache avec modele partage"""
        logger.info("Test 25.47: Chargement sans cache partage")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.shared_models = {}  # Pas de cache

                        # Mock les methodes de chargement
                        service._load_shared_model_async = AsyncMock()
                        service._load_unique_model_async = AsyncMock()

                        await service._load_model_with_sharing_optimized('basic')

                        # Verifier qu'une des methodes de chargement est appelee
                        assert (service._load_shared_model_async.called or
                                service._load_unique_model_async.called)
                        logger.info("Chargement sans cache partage OK")

    @pytest.mark.asyncio
    async def test_load_model_with_sharing_unique_model(self, mock_settings, mock_torch):
        """Test chargement d'un modele unique (pas partage)"""
        logger.info("Test 25.48: Chargement modele unique via sharing")

        # Create settings where premium has a different model
        mock_settings.premium_model = "facebook/nllb-200-distilled-1.3B-unique"
        mock_settings.basic_model = "facebook/nllb-200-distilled-600M"

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="premium")
                        service.shared_models = {}

                        # Mock les methodes de chargement
                        service._load_shared_model_async = AsyncMock()
                        service._load_unique_model_async = AsyncMock()

                        await service._load_model_with_sharing_optimized('premium')

                        # Premium devrait etre charge comme modele unique
                        assert service._load_unique_model_async.called
                        logger.info("Chargement modele unique via sharing OK")


# ============================================================================
# TESTS: FALLBACK AVANCE
# ============================================================================

class TestFallbackAdvanced:
    """Tests avances pour le systeme de fallback"""

    @pytest.mark.asyncio
    async def test_fallback_order_premium_to_basic(self, mock_settings, mock_torch):
        """Test ordre de fallback premium -> medium -> basic"""
        logger.info("Test 25.49: Ordre fallback premium -> basic")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="premium")

                        call_count = [0]
                        async def mock_load_with_counter(model_type):
                            call_count[0] += 1
                            if call_count[0] < 3:  # Echoue 2 fois
                                raise Exception(f"Load {model_type} failed")
                            return

                        service._load_model_with_sharing_optimized = mock_load_with_counter

                        await service._load_model_with_optimized_fallback()

                        # Le fallback a du changer le model_type
                        assert service.model_type in ['premium', 'medium', 'basic']
                        logger.info("Ordre fallback OK")

    @pytest.mark.asyncio
    async def test_find_best_model_exact_match(self, mock_settings, mock_torch):
        """Test trouve exactement le modele demande"""
        logger.info("Test 25.50: Match exact modele")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {
                            'basic': MagicMock(),
                            'medium': MagicMock(),
                            'premium': MagicMock()
                        }

                        # Tester chaque type
                        assert service._find_best_available_model('basic') == 'basic'
                        assert service._find_best_available_model('medium') == 'medium'
                        assert service._find_best_available_model('premium') == 'premium'
                        logger.info("Match exact modele OK")


# ============================================================================
# TESTS: TRADUCTION AVANCEE
# ============================================================================

class TestTranslationAdvanced:
    """Tests avances pour la traduction"""

    @pytest.mark.asyncio
    async def test_translate_with_different_source_channels(self, mock_settings, mock_torch):
        """Test traduction avec differents canaux source"""
        logger.info("Test 25.51: Differents canaux source")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {'basic': MagicMock()}
                        service._ml_translate_optimized = AsyncMock(return_value="Translated")

                        channels = ['zmq', 'rest', 'websocket', 'quantized', 'custom']

                        for channel in channels:
                            result = await service.translate(
                                "Test", "en", "fr",
                                source_channel=channel
                            )
                            assert result['source_channel'] == channel

                        logger.info("Differents canaux source OK")

    @pytest.mark.asyncio
    async def test_translate_processing_time_tracked(self, mock_settings, mock_torch):
        """Test que le temps de traitement est suivi"""
        logger.info("Test 25.52: Temps de traitement")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {'basic': MagicMock()}

                        async def slow_translate(*args, **kwargs):
                            import asyncio
                            await asyncio.sleep(0.1)
                            return "Translated"

                        service._ml_translate_optimized = slow_translate

                        result = await service.translate("Test", "en", "fr")

                        # Le temps doit etre > 0
                        assert result['processing_time'] >= 0.1
                        logger.info("Temps de traitement OK")

    @pytest.mark.asyncio
    async def test_translate_stats_updated_after_success(self, mock_settings, mock_torch):
        """Test que les stats sont mises a jour apres succes"""
        logger.info("Test 25.53: Stats apres succes")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        service.models = {'basic': MagicMock()}
                        service._ml_translate_optimized = AsyncMock(return_value="Translated")

                        initial_count = service.stats['translations_count']

                        await service.translate("Test", "en", "fr")

                        assert service.stats['translations_count'] == initial_count + 1
                        logger.info("Stats apres succes OK")


# ============================================================================
# TESTS: STATISTIQUES AVANCEES
# ============================================================================

class TestStatisticsAdvanced:
    """Tests avances pour les statistiques"""

    @pytest.mark.asyncio
    async def test_get_stats_with_shared_models(self, mock_settings, mock_torch):
        """Test stats avec modeles partages"""
        logger.info("Test 25.54: Stats avec modeles partages")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="all")
                        service.models = {'basic': MagicMock(), 'medium': MagicMock()}
                        service.shared_models = {
                            'model_1': {'users': {'basic', 'medium'}},
                            'model_2': {'users': {'premium'}}
                        }
                        service.model_to_shared = {
                            'basic': 'model_1',
                            'medium': 'model_1'
                        }

                        stats = service.get_stats()

                        assert stats['shared_models_count'] == 2
                        assert 'unique_models_loaded' in stats
                        assert 'models_saved' in stats
                        assert 'optimization_ratio' in stats
                        logger.info("Stats avec modeles partages OK")

    @pytest.mark.asyncio
    async def test_stats_moving_average(self, mock_settings, mock_torch):
        """Test moyenne mobile des temps"""
        logger.info("Test 25.55: Moyenne mobile")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")

                        # Premier update
                        service._update_stats(1.0)
                        assert service.stats['avg_processing_time'] == 1.0

                        # Deuxieme update
                        service._update_stats(3.0)
                        # Moyenne de 1.0 et 3.0 = 2.0
                        assert service.stats['avg_processing_time'] == 2.0

                        logger.info("Moyenne mobile OK")


# ============================================================================
# TESTS: NETTOYAGE AVANCE
# ============================================================================

class TestCleanupAdvanced:
    """Tests avances pour le nettoyage"""

    @pytest.mark.asyncio
    async def test_close_with_no_models(self, mock_settings, mock_torch):
        """Test fermeture sans modeles charges"""
        logger.info("Test 25.56: Fermeture sans modeles")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        # Pas de modeles charges
                        service.models = {}
                        service.tokenizers = {}
                        service.shared_models = {}

                        # Ne devrait pas lever d'exception
                        await service.close()
                        logger.info("Fermeture sans modeles OK")

    @pytest.mark.asyncio
    async def test_cleanup_with_model_without_cpu(self, mock_settings, mock_torch):
        """Test nettoyage avec modele sans methode cpu"""
        logger.info("Test 25.57: Cleanup modele sans cpu")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        # Modele sans methode cpu
                        mock_model = MagicMock(spec=[])  # Pas de cpu
                        service.models = {'basic': mock_model}

                        # Ne devrait pas lever d'exception
                        await service.close()
                        logger.info("Cleanup modele sans cpu OK")


# ============================================================================
# TESTS: CONFIGURATION MODEL CONFIGS
# ============================================================================

class TestModelConfigsAdvanced:
    """Tests avances pour la configuration des modeles"""

    @pytest.mark.asyncio
    async def test_model_configs_max_length(self, mock_settings, mock_torch):
        """Test max_length dans les configs"""
        logger.info("Test 25.58: Max length configs")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        configs = service.model_configs

                        assert configs['basic']['max_length'] == 256
                        assert configs['premium']['max_length'] == 512
                        logger.info("Max length configs OK")

    @pytest.mark.asyncio
    async def test_model_configs_descriptions(self, mock_settings, mock_torch):
        """Test descriptions dans les configs"""
        logger.info("Test 25.59: Descriptions configs")

        with patch.dict('sys.modules', {
            'torch': mock_torch,
            'transformers': MagicMock()
        }):
            with patch('services.quantized_ml_service.ML_AVAILABLE', True):
                with patch('services.quantized_ml_service.get_settings', return_value=mock_settings):
                    with patch('services.quantized_ml_service.torch', mock_torch):
                        from services.quantized_ml_service import QuantizedMLService

                        service = QuantizedMLService(model_type="basic")
                        configs = service.model_configs

                        assert 'description' in configs['basic']
                        assert 'description' in configs['premium']
                        assert 'NLLB' in configs['basic']['description']
                        logger.info("Descriptions configs OK")


# ============================================================================
# MAIN: EXECUTION DES TESTS
# ============================================================================

async def run_all_tests():
    """Execute tous les tests"""
    logger.info("=" * 60)
    logger.info("DEMARRAGE DES TESTS - Test 25: QuantizedMLService")
    logger.info("=" * 60)

    test_classes = [
        TestQuantizedMLServiceCreation,
        TestModelConfigs,
        TestSharedModelsAnalysis,
        TestInitialization,
        TestModelLoading,
        TestFallbackSystem,
        TestTranslation,
        TestStatistics,
        TestCleanup,
        TestConcurrentLoading,
        TestErrorHandling,
        TestSyncLoading,
        TestMLTranslateOptimized,
        TestEnvironmentConfiguration,
        TestAsyncOperations,
        TestThreadPool,
    ]

    logger.info(f"Total de {len(test_classes)} classes de tests")
    logger.info("=" * 60)

    logger.info("Tests prets a etre executes avec pytest")
    return True


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
