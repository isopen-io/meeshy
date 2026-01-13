"""
Tests d'intégration complets pour les services Voice API
Couvre: VoiceAnalyzerService, TranslationPipelineService, AnalyticsService, Voice API Router
"""

import pytest
import asyncio
import tempfile
import os
import json
from pathlib import Path
from datetime import datetime
from unittest.mock import MagicMock, AsyncMock, patch
import numpy as np

# Ajouter le chemin src pour les imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


# ═══════════════════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture
def temp_audio_file():
    """Crée un fichier audio temporaire WAV valide"""
    import struct
    import wave

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        # Créer un fichier WAV simple (1 seconde de silence à 22050Hz)
        sample_rate = 22050
        duration = 1.0
        n_samples = int(sample_rate * duration)

        # Générer une onde sinusoïdale pour simuler une voix
        frequency = 150  # Hz - voix masculine moyenne
        t = np.linspace(0, duration, n_samples, False)
        audio_data = (np.sin(2 * np.pi * frequency * t) * 32767).astype(np.int16)

        # Écrire le fichier WAV
        with wave.open(f.name, 'w') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_data.tobytes())

        yield f.name

    # Cleanup
    if os.path.exists(f.name):
        os.unlink(f.name)


@pytest.fixture
def temp_audio_file_high_pitch():
    """Crée un fichier audio avec un pitch élevé (voix féminine)"""
    import struct
    import wave

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        sample_rate = 22050
        duration = 1.0
        n_samples = int(sample_rate * duration)

        # Fréquence plus élevée pour voix féminine
        frequency = 220  # Hz
        t = np.linspace(0, duration, n_samples, False)
        audio_data = (np.sin(2 * np.pi * frequency * t) * 32767).astype(np.int16)

        with wave.open(f.name, 'w') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_data.tobytes())

        yield f.name

    if os.path.exists(f.name):
        os.unlink(f.name)


@pytest.fixture
def temp_data_dir():
    """Crée un répertoire temporaire pour les données"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


# ═══════════════════════════════════════════════════════════════════════════
# TESTS VOICE ANALYZER SERVICE
# ═══════════════════════════════════════════════════════════════════════════

class TestVoiceAnalyzerService:
    """Tests pour VoiceAnalyzerService"""

    @pytest.mark.asyncio
    async def test_singleton_pattern(self):
        """Vérifie le pattern singleton"""
        from services.voice_analyzer_service import VoiceAnalyzerService, get_voice_analyzer_service

        service1 = get_voice_analyzer_service()
        service2 = get_voice_analyzer_service()

        assert service1 is service2

    @pytest.mark.asyncio
    async def test_initialization(self, temp_data_dir):
        """Test l'initialisation du service"""
        from services.voice_analyzer_service import VoiceAnalyzerService

        # Reset singleton for testing
        VoiceAnalyzerService._instance = None

        service = VoiceAnalyzerService(cache_dir=temp_data_dir)
        result = await service.initialize()

        assert result is True
        assert service.is_initialized is True

    @pytest.mark.asyncio
    async def test_analyze_voice(self, temp_audio_file, temp_data_dir):
        """Test l'analyse vocale complète"""
        from services.voice_analyzer_service import VoiceAnalyzerService

        VoiceAnalyzerService._instance = None
        service = VoiceAnalyzerService(cache_dir=temp_data_dir)
        await service.initialize()

        result = await service.analyze(temp_audio_file)

        # Vérifier la structure du résultat
        assert result is not None
        assert hasattr(result, 'pitch_mean')
        assert hasattr(result, 'spectral_centroid')
        assert hasattr(result, 'mfcc_mean')
        assert hasattr(result, 'voice_type')
        assert hasattr(result, 'confidence')

    @pytest.mark.asyncio
    async def test_voice_classification(self, temp_data_dir):
        """Test la classification vocale par pitch"""
        from services.voice_analyzer_service import VoiceAnalyzerService

        VoiceAnalyzerService._instance = None
        service = VoiceAnalyzerService(cache_dir=temp_data_dir)

        # Test classification (based on PITCH_THRESHOLDS in service)
        # child: (250, 400), high_female: (200, 280), etc.
        voice_type_130 = service._classify_voice_type(130)
        voice_type_210 = service._classify_voice_type(210)
        voice_type_350 = service._classify_voice_type(350)
        voice_type_450 = service._classify_voice_type(450)  # Above child range

        # Verify we get valid types
        assert voice_type_130 in ["high_male", "medium_male", "low_female"]
        assert voice_type_210 in ["high_female", "medium_female"]
        assert voice_type_350 == "child"  # 350 is in child range (250-400)
        assert voice_type_450 == "very_high"  # 450 is above all ranges

        # Test gender estimation
        assert service._estimate_gender(120) == "male"
        assert service._estimate_gender(180) == "female"
        assert service._estimate_gender(280) == "child"

    @pytest.mark.asyncio
    async def test_voice_comparison(self, temp_audio_file, temp_audio_file_high_pitch, temp_data_dir):
        """Test la comparaison de deux voix"""
        from services.voice_analyzer_service import VoiceAnalyzerService

        VoiceAnalyzerService._instance = None
        service = VoiceAnalyzerService(cache_dir=temp_data_dir)
        await service.initialize()

        result = await service.compare(
            temp_audio_file,
            temp_audio_file_high_pitch,
            detailed=True
        )

        assert result is not None
        assert 0 <= result.overall_score <= 1
        assert hasattr(result, 'pitch_similarity')
        assert hasattr(result, 'mfcc_similarity')
        assert hasattr(result, 'is_likely_same_speaker')

    @pytest.mark.asyncio
    async def test_cache_behavior(self, temp_audio_file, temp_data_dir):
        """Test le comportement du cache"""
        from services.voice_analyzer_service import VoiceAnalyzerService

        VoiceAnalyzerService._instance = None
        service = VoiceAnalyzerService(cache_dir=temp_data_dir)
        await service.initialize()

        # Première analyse (cache miss)
        result1 = await service.analyze(temp_audio_file, use_cache=True)
        stats1 = await service.get_stats()
        cache_misses = stats1['cache_misses']

        # Deuxième analyse (cache hit)
        result2 = await service.analyze(temp_audio_file, use_cache=True)
        stats2 = await service.get_stats()

        assert stats2['cache_hits'] > stats1.get('cache_hits', 0)

    @pytest.mark.asyncio
    async def test_to_dict_serialization(self, temp_audio_file, temp_data_dir):
        """Test la sérialisation en dictionnaire"""
        from services.voice_analyzer_service import VoiceAnalyzerService

        VoiceAnalyzerService._instance = None
        service = VoiceAnalyzerService(cache_dir=temp_data_dir)
        await service.initialize()

        result = await service.analyze(temp_audio_file)
        result_dict = result.to_dict()

        assert 'pitch' in result_dict
        assert 'spectral' in result_dict
        assert 'mfcc' in result_dict
        assert 'classification' in result_dict
        assert 'metadata' in result_dict


# ═══════════════════════════════════════════════════════════════════════════
# TESTS TRANSLATION PIPELINE SERVICE
# ═══════════════════════════════════════════════════════════════════════════

class TestTranslationPipelineService:
    """Tests pour TranslationPipelineService"""

    @pytest.mark.asyncio
    async def test_singleton_pattern(self):
        """Vérifie le pattern singleton"""
        from services.translation_pipeline_service import (
            TranslationPipelineService,
            get_translation_pipeline_service
        )

        TranslationPipelineService._instance = None

        service1 = get_translation_pipeline_service()
        service2 = get_translation_pipeline_service()

        assert service1 is service2

    @pytest.mark.asyncio
    async def test_job_creation(self, temp_audio_file, temp_data_dir):
        """Test la création d'un job"""
        from services.translation_pipeline_service import (
            TranslationPipelineService,
            JobStatus,
            JobPriority
        )

        TranslationPipelineService._instance = None

        service = TranslationPipelineService(
            max_concurrent_jobs=2,
            audio_output_dir=temp_data_dir
        )
        await service.initialize()

        try:
            job = await service.submit_job(
                user_id="test_user",
                audio_path=temp_audio_file,
                target_languages=["en", "fr"],
                generate_voice_clone=False,
                priority=JobPriority.HIGH
            )

            assert job is not None
            assert job.id.startswith("mshy_")
            assert job.user_id == "test_user"
            assert job.status == JobStatus.PENDING
            assert "en" in job.target_languages
            assert "fr" in job.target_languages
        finally:
            await service.close()

    @pytest.mark.asyncio
    async def test_job_status(self, temp_audio_file, temp_data_dir):
        """Test la récupération du status d'un job"""
        from services.translation_pipeline_service import TranslationPipelineService

        TranslationPipelineService._instance = None

        service = TranslationPipelineService(
            max_concurrent_jobs=2,
            audio_output_dir=temp_data_dir
        )
        await service.initialize()

        try:
            job = await service.submit_job(
                user_id="test_user",
                audio_path=temp_audio_file,
                target_languages=["en"]
            )

            retrieved_job = await service.get_job(job.id)

            assert retrieved_job is not None
            assert retrieved_job.id == job.id
        finally:
            await service.close()

    @pytest.mark.asyncio
    async def test_job_cancellation(self, temp_audio_file, temp_data_dir):
        """Test l'annulation d'un job"""
        from services.translation_pipeline_service import TranslationPipelineService, JobStatus

        TranslationPipelineService._instance = None

        # Ne pas initialiser les workers pour garder le job en pending
        service = TranslationPipelineService(
            max_concurrent_jobs=0,  # Pas de workers
            audio_output_dir=temp_data_dir
        )
        # Ne pas appeler initialize() pour éviter de démarrer les workers

        # Créer manuellement le job
        service._jobs = {}
        service._job_queue = asyncio.Queue()

        job = await service.submit_job(
            user_id="test_user",
            audio_path=temp_audio_file,
            target_languages=["en"]
        )

        # Le job doit être en PENDING
        assert job.status == JobStatus.PENDING

        # Annuler le job
        cancelled = await service.cancel_job(job.id)
        assert cancelled is True

        # Vérifier le status
        job = await service.get_job(job.id)
        assert job.status == JobStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_queue_status(self, temp_data_dir):
        """Test le status de la queue"""
        from services.translation_pipeline_service import TranslationPipelineService

        TranslationPipelineService._instance = None

        service = TranslationPipelineService(
            max_concurrent_jobs=5,
            audio_output_dir=temp_data_dir
        )
        await service.initialize()

        try:
            status = await service.get_queue_status()

            assert 'queue_size' in status
            assert 'processing' in status
            assert 'workers_max' in status
            assert status['workers_max'] == 5
        finally:
            await service.close()

    @pytest.mark.asyncio
    async def test_generate_job_id(self, temp_data_dir):
        """Test la génération d'ID de job"""
        from services.translation_pipeline_service import TranslationPipelineService

        TranslationPipelineService._instance = None

        service = TranslationPipelineService(audio_output_dir=temp_data_dir)

        job_id = service._generate_job_id("user123")

        assert job_id.startswith("mshy_")
        assert "user123" in job_id

    @pytest.mark.asyncio
    async def test_generate_output_filename(self, temp_data_dir):
        """Test la génération de nom de fichier de sortie"""
        from services.translation_pipeline_service import TranslationPipelineService, TranslationJob

        TranslationPipelineService._instance = None

        service = TranslationPipelineService(audio_output_dir=temp_data_dir)

        job = TranslationJob(
            id="mshy_test_job",
            user_id="user123",
            model_version="mshy_gen_v1",
            embedding_type="openvoice_v2"
        )

        filename = service._generate_output_filename(job, "fr")

        assert "mshy_gen" in filename
        assert "openvoice_v2" in filename
        assert "fr" in filename
        assert filename.endswith(".mp3")


# ═══════════════════════════════════════════════════════════════════════════
# TESTS ANALYTICS SERVICE
# ═══════════════════════════════════════════════════════════════════════════

class TestAnalyticsService:
    """Tests pour AnalyticsService"""

    @pytest.mark.asyncio
    async def test_singleton_pattern(self):
        """Vérifie le pattern singleton"""
        from services.analytics_service import AnalyticsService, get_analytics_service

        AnalyticsService._instance = None

        service1 = get_analytics_service()
        service2 = get_analytics_service()

        assert service1 is service2

    @pytest.mark.asyncio
    async def test_submit_feedback(self, temp_data_dir):
        """Test la soumission de feedback"""
        from services.analytics_service import AnalyticsService, FeedbackType

        AnalyticsService._instance = None

        service = AnalyticsService(data_dir=temp_data_dir)
        await service.initialize()

        feedback = await service.submit_feedback(
            user_id="user123",
            translation_id="trans_001",
            rating=4,
            feedback_type=FeedbackType.VOICE_QUALITY,
            comment="Great voice cloning!",
            target_language="fr",
            voice_cloned=True
        )

        assert feedback is not None
        assert feedback.rating == 4
        assert feedback.user_id == "user123"
        assert feedback.feedback_type == FeedbackType.VOICE_QUALITY

    @pytest.mark.asyncio
    async def test_record_translation_history(self, temp_data_dir):
        """Test l'enregistrement dans l'historique"""
        from services.analytics_service import AnalyticsService

        AnalyticsService._instance = None

        service = AnalyticsService(data_dir=temp_data_dir)
        await service.initialize()

        entry = await service.record_translation(
            user_id="user123",
            translation_id="trans_001",
            source_language="en",
            target_language="fr",
            original_text="Hello world",
            translated_text="Bonjour le monde",
            voice_cloned=True,
            voice_quality=0.85,
            processing_time_ms=1500
        )

        assert entry is not None
        assert entry.source_language == "en"
        assert entry.target_language == "fr"

    @pytest.mark.asyncio
    async def test_get_user_history(self, temp_data_dir):
        """Test la récupération de l'historique utilisateur"""
        from services.analytics_service import AnalyticsService

        AnalyticsService._instance = None

        service = AnalyticsService(data_dir=temp_data_dir)
        await service.initialize()

        # Ajouter quelques entrées
        for i in range(5):
            await service.record_translation(
                user_id="user123",
                translation_id=f"trans_{i}",
                source_language="en",
                target_language="fr",
                original_text=f"Text {i}",
                translated_text=f"Texte {i}",
                voice_cloned=True,
                voice_quality=0.8
            )

        # Récupérer l'historique avec pagination
        entries, total = await service.get_user_history(
            user_id="user123",
            page=1,
            limit=3
        )

        assert len(entries) == 3
        assert total == 5

    @pytest.mark.asyncio
    async def test_user_stats(self, temp_data_dir):
        """Test les statistiques utilisateur"""
        from services.analytics_service import AnalyticsService, FeedbackType

        AnalyticsService._instance = None

        service = AnalyticsService(data_dir=temp_data_dir)
        await service.initialize()

        # Ajouter des traductions et feedbacks
        await service.record_translation(
            user_id="user123",
            translation_id="trans_001",
            source_language="en",
            target_language="fr",
            original_text="Hello",
            translated_text="Bonjour",
            voice_cloned=True,
            voice_quality=0.9
        )

        await service.submit_feedback(
            user_id="user123",
            translation_id="trans_001",
            rating=5,
            feedback_type=FeedbackType.OVERALL
        )

        # Récupérer les stats
        stats = await service.get_user_stats("user123")

        assert stats.total_translations == 1
        assert stats.total_feedback == 1
        assert stats.avg_rating == 5.0
        assert "fr" in stats.languages_used

    @pytest.mark.asyncio
    async def test_global_stats(self, temp_data_dir):
        """Test les statistiques globales"""
        from services.analytics_service import AnalyticsService

        AnalyticsService._instance = None

        service = AnalyticsService(data_dir=temp_data_dir)
        await service.initialize()

        stats = await service.get_global_stats()

        assert 'total_translations' in stats
        assert 'total_users' in stats
        assert 'avg_rating' in stats
        assert 'top_languages' in stats

    @pytest.mark.asyncio
    async def test_ab_test_creation(self, temp_data_dir):
        """Test la création d'un test A/B"""
        from services.analytics_service import AnalyticsService, ABTestStatus

        AnalyticsService._instance = None

        service = AnalyticsService(data_dir=temp_data_dir)
        await service.initialize()

        test = await service.create_ab_test(
            name="TTS Model Comparison",
            description="Compare XTTS v2 vs v3",
            variants=[
                {"name": "A", "model": "xtts_v2"},
                {"name": "B", "model": "xtts_v3"}
            ],
            traffic_split=[0.5, 0.5],
            target_sample_size=100
        )

        assert test is not None
        assert test.status == ABTestStatus.DRAFT
        assert len(test.variants) == 2

    @pytest.mark.asyncio
    async def test_ab_test_variant_selection(self, temp_data_dir):
        """Test la sélection de variante A/B"""
        from services.analytics_service import AnalyticsService

        AnalyticsService._instance = None

        service = AnalyticsService(data_dir=temp_data_dir)
        await service.initialize()

        # Créer et démarrer un test
        test = await service.create_ab_test(
            name="Test",
            description="Test",
            variants=[
                {"name": "A"},
                {"name": "B"}
            ]
        )
        await service.start_ab_test(test.id)

        # Sélectionner une variante (déterministe pour le même user)
        variant1 = await service.get_ab_test_variant(test.id, "user123")
        variant2 = await service.get_ab_test_variant(test.id, "user123")

        # Le même utilisateur doit toujours obtenir la même variante
        assert variant1['name'] == variant2['name']

    @pytest.mark.asyncio
    async def test_data_persistence(self, temp_data_dir):
        """Test la persistance des données"""
        from services.analytics_service import AnalyticsService, FeedbackType

        AnalyticsService._instance = None

        # Premier service - créer des données
        service1 = AnalyticsService(data_dir=temp_data_dir)
        await service1.initialize()

        await service1.submit_feedback(
            user_id="user123",
            translation_id="trans_001",
            rating=4,
            feedback_type=FeedbackType.OVERALL
        )

        await service1.close()

        # Deuxième service - charger les données
        AnalyticsService._instance = None
        service2 = AnalyticsService(data_dir=temp_data_dir)
        await service2.initialize()

        stats = await service2.get_stats()
        assert stats['feedback_count'] >= 1


# ═══════════════════════════════════════════════════════════════════════════
# TESTS VOICE API ROUTER
# ═══════════════════════════════════════════════════════════════════════════

# Check if FastAPI is a real module or mocked
def _is_fastapi_available():
    """Check if real FastAPI is available (not mocked)"""
    try:
        import fastapi
        # If it's a MagicMock, the APIRouter would be a MagicMock too
        # Real APIRouter is a class, not a MagicMock
        from unittest.mock import MagicMock
        if isinstance(fastapi.APIRouter, MagicMock):
            return False
        # Also verify we can actually use the module
        if not hasattr(fastapi, '__version__'):
            return False
        return True
    except (ImportError, AttributeError):
        return False


FASTAPI_AVAILABLE = _is_fastapi_available()


class TestVoiceAPIRouter:
    """Tests pour le routeur Voice API"""

    @pytest.fixture
    def mock_services(self, temp_data_dir, monkeypatch):
        """Crée des mocks pour tous les services"""
        # Set environment variables to use temp directories
        monkeypatch.setenv('UPLOAD_DIR', temp_data_dir)
        monkeypatch.setenv('AUDIO_OUTPUT_DIR', temp_data_dir)

        # Mock transcription service
        transcription_service = MagicMock()
        transcription_service.is_initialized = True

        # Mock voice clone service
        voice_clone_service = MagicMock()
        voice_clone_service.is_initialized = True
        voice_clone_service.voice_cache_dir = Path(temp_data_dir)

        # Mock TTS service
        tts_service = MagicMock()
        tts_service.is_initialized = True

        # Mock translation service
        translation_service = MagicMock()

        # Mock translation pipeline
        translation_pipeline = MagicMock()
        translation_pipeline.is_initialized = True

        # Mock voice analyzer
        voice_analyzer = MagicMock()
        voice_analyzer.is_initialized = True

        # Mock analytics service
        analytics_service = MagicMock()
        analytics_service.is_initialized = True

        return {
            "transcription_service": transcription_service,
            "voice_clone_service": voice_clone_service,
            "tts_service": tts_service,
            "translation_service": translation_service,
            "translation_pipeline": translation_pipeline,
            "voice_analyzer": voice_analyzer,
            "analytics_service": analytics_service
        }

    @pytest.mark.skipif(not FASTAPI_AVAILABLE, reason="FastAPI not available (mocked)")
    def test_router_creation(self, mock_services):
        """Test la création du routeur"""
        from api.voice_api import create_voice_api_router

        router = create_voice_api_router(**mock_services)

        assert router is not None
        assert router.prefix == "/api/v1"

    @pytest.mark.skipif(not FASTAPI_AVAILABLE, reason="FastAPI not available (mocked)")
    def test_router_has_endpoints(self, mock_services):
        """Test que le routeur a les endpoints attendus"""
        from api.voice_api import create_voice_api_router

        router = create_voice_api_router(**mock_services)

        # Récupérer les paths des routes
        routes = [route.path for route in router.routes]

        # Vérifier les endpoints principaux
        expected_endpoints = [
            "/voice/translate",
            "/voice/translate/audio",
            "/voice/translate/async",
            "/voice/job/{job_id}",
            "/voice/profile",
            "/voice/profile/sample",
            "/voice/analyze",
            "/voice/compare",
            "/voice/languages",
            "/voice/feedback",
            "/voice/stats",
            "/voice/history",
            "/admin/metrics",
            "/admin/queue",
            "/admin/ab-test",
            "/health"
        ]

        for endpoint in expected_endpoints:
            assert any(endpoint in route for route in routes), f"Missing endpoint: {endpoint}"

    @pytest.mark.skipif(not FASTAPI_AVAILABLE, reason="FastAPI not available (mocked)")
    @pytest.mark.asyncio
    async def test_health_endpoint(self, mock_services):
        """Test l'endpoint health"""
        from fastapi.testclient import TestClient
        from fastapi import FastAPI
        from api.voice_api import create_voice_api_router

        app = FastAPI()
        router = create_voice_api_router(**mock_services)
        app.include_router(router)

        client = TestClient(app)
        response = client.get("/api/v1/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "services" in data

    @pytest.mark.skipif(not FASTAPI_AVAILABLE, reason="FastAPI not available (mocked)")
    @pytest.mark.asyncio
    async def test_languages_endpoint(self, mock_services):
        """Test l'endpoint languages"""
        from fastapi.testclient import TestClient
        from fastapi import FastAPI
        from api.voice_api import create_voice_api_router

        app = FastAPI()
        router = create_voice_api_router(**mock_services)
        app.include_router(router)

        client = TestClient(app)
        response = client.get("/api/v1/voice/languages")

        assert response.status_code == 200
        data = response.json()
        assert "transcription" in data
        assert "translation" in data
        assert "tts" in data
        assert "voice_cloning" in data
        assert len(data["translation"]) > 20  # Many languages supported


# ═══════════════════════════════════════════════════════════════════════════
# TESTS D'INTÉGRATION COMPLETS
# ═══════════════════════════════════════════════════════════════════════════

class TestFullIntegration:
    """Tests d'intégration bout-en-bout"""

    @pytest.mark.asyncio
    async def test_voice_analyzer_to_analytics_flow(self, temp_audio_file, temp_data_dir):
        """Test le flux complet: analyse vocale → enregistrement → stats"""
        from services.voice_analyzer_service import VoiceAnalyzerService
        from services.analytics_service import AnalyticsService, FeedbackType

        VoiceAnalyzerService._instance = None
        AnalyticsService._instance = None

        # Initialiser les services
        analyzer = VoiceAnalyzerService(cache_dir=temp_data_dir)
        analytics = AnalyticsService(data_dir=temp_data_dir)

        await analyzer.initialize()
        await analytics.initialize()

        # Analyser la voix
        voice_analysis = await analyzer.analyze(temp_audio_file)
        assert voice_analysis.confidence >= 0

        # Enregistrer une traduction
        entry = await analytics.record_translation(
            user_id="integration_test_user",
            translation_id="integration_trans_001",
            source_language="en",
            target_language="fr",
            original_text="Integration test",
            translated_text="Test d'intégration",
            voice_cloned=True,
            voice_quality=voice_analysis.confidence,
            processing_time_ms=500
        )

        # Soumettre un feedback
        feedback = await analytics.submit_feedback(
            user_id="integration_test_user",
            translation_id="integration_trans_001",
            rating=5,
            feedback_type=FeedbackType.VOICE_QUALITY
        )

        # Vérifier les stats
        stats = await analytics.get_user_stats("integration_test_user")
        assert stats.total_translations == 1
        assert stats.avg_rating == 5.0

    @pytest.mark.asyncio
    async def test_pipeline_job_lifecycle(self, temp_audio_file, temp_data_dir):
        """Test le cycle de vie complet d'un job"""
        from services.translation_pipeline_service import (
            TranslationPipelineService,
            JobStatus
        )

        TranslationPipelineService._instance = None

        service = TranslationPipelineService(
            max_concurrent_jobs=1,
            audio_output_dir=temp_data_dir
        )

        # Ne pas initialiser les workers pour contrôler le test

        service._jobs = {}
        service._job_queue = asyncio.Queue()

        # Créer un job
        job = await service.submit_job(
            user_id="lifecycle_test_user",
            audio_path=temp_audio_file,
            target_languages=["en", "fr", "es"]
        )

        assert job.status == JobStatus.PENDING
        assert len(job.target_languages) == 3

        # Vérifier qu'on peut récupérer le job
        retrieved = await service.get_job(job.id)
        assert retrieved.id == job.id

        # Annuler le job
        cancelled = await service.cancel_job(job.id)
        assert cancelled is True

        # Vérifier le status final
        final = await service.get_job(job.id)
        assert final.status == JobStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_ab_test_full_flow(self, temp_data_dir):
        """Test le flux complet A/B testing"""
        from services.analytics_service import AnalyticsService, ABTestStatus

        AnalyticsService._instance = None

        service = AnalyticsService(data_dir=temp_data_dir)
        await service.initialize()

        # Créer un test
        test = await service.create_ab_test(
            name="Full Flow Test",
            description="Test the complete A/B flow",
            variants=[
                {"name": "Control", "model": "base"},
                {"name": "Treatment", "model": "large"}
            ],
            target_sample_size=10
        )

        assert test.status == ABTestStatus.DRAFT

        # Démarrer le test
        test = await service.start_ab_test(test.id)
        assert test.status == ABTestStatus.ACTIVE

        # Simuler des participations
        variants_seen = []
        for i in range(15):
            variant = await service.get_ab_test_variant(test.id, f"user_{i}")

            # Variant peut être None si le test est terminé
            if variant is None:
                break

            variants_seen.append(variant)

            # Enregistrer un résultat
            rating = 4 if variant["name"] == "Treatment" else 3
            await service.record_ab_test_result(test.id, variant["name"], rating)

        # Vérifier qu'on a vu des variantes
        assert len(variants_seen) >= 10

        # Récupérer les résultats
        results = await service.get_ab_test_results(test.id)
        assert results is not None
        # Le test devrait être complété après 10 échantillons
        assert results["status"] in [ABTestStatus.ACTIVE.value, ABTestStatus.COMPLETED.value]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
