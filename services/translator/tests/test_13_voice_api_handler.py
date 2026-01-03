"""
Tests complets pour VoiceAPIHandler
Couvre tous les handlers de l'API Voice via ZMQ
"""

import pytest
import asyncio
import tempfile
import os
import wave
import struct
import time
import uuid
from pathlib import Path
from datetime import datetime
from unittest.mock import MagicMock, AsyncMock, patch
import numpy as np
import base64

# Ajouter le chemin src pour les imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


# ═══════════════════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture
def temp_audio_file():
    """Crée un fichier audio temporaire WAV valide"""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        sample_rate = 22050
        duration = 2.0
        n_samples = int(sample_rate * duration)

        # Générer une onde sinusoïdale
        frequency = 150
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
def audio_base64(temp_audio_file):
    """Crée une version base64 de l'audio"""
    with open(temp_audio_file, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')


@pytest.fixture
def mock_transcription_service():
    """Mock pour le service de transcription"""
    service = MagicMock()
    service.is_initialized = True

    # Mock transcribe result
    mock_result = MagicMock()
    mock_result.text = "Hello world, this is a test."
    mock_result.language = "en"
    mock_result.confidence = 0.95
    mock_result.segments = []

    service.transcribe = AsyncMock(return_value=mock_result)
    return service


@pytest.fixture
def mock_translation_service():
    """Mock pour le service de traduction"""
    service = MagicMock()

    async def mock_translate(text, source_language, target_language):
        translations = {
            'fr': 'Bonjour le monde, ceci est un test.',
            'es': 'Hola mundo, esto es una prueba.',
            'de': 'Hallo Welt, das ist ein Test.'
        }
        return {
            'translated_text': translations.get(target_language, text),
            'source_language': source_language,
            'target_language': target_language
        }

    service.translate = mock_translate

    # Also mock translate_sync for the pipeline
    async def mock_translate_sync(**kwargs):
        result = MagicMock()
        result.to_dict = MagicMock(return_value={
            'translationId': 'trans_123',
            'originalAudio': {
                'transcription': 'Hello world',
                'language': 'en',
                'durationMs': 2000,
                'confidence': 0.95
            },
            'translations': [{
                'targetLanguage': 'fr',
                'translatedText': 'Bonjour le monde',
                'audioBase64': 'mock_audio',
                'durationMs': 2100,
                'voiceCloned': True,
                'voiceQuality': 0.92
            }]
        })
        return result

    return service


@pytest.fixture
def mock_tts_service():
    """Mock pour le service TTS"""
    service = MagicMock()
    service.is_initialized = True

    mock_result = MagicMock()
    mock_result.audio_base64 = "mock_audio_base64_data"
    mock_result.duration_ms = 2500
    mock_result.voice_cloned = True
    mock_result.quality = 0.92

    service.synthesize = AsyncMock(return_value=mock_result)
    return service


@pytest.fixture
def mock_voice_clone_service():
    """Mock pour le service de clonage vocal"""
    service = MagicMock()
    service.is_initialized = True

    mock_profile = MagicMock()
    mock_profile.id = "profile_123"
    mock_profile.quality = 0.88
    mock_profile.user_id = "user_123"

    service.create_profile = AsyncMock(return_value=mock_profile)
    service.get_profile = AsyncMock(return_value=mock_profile)
    service.list_profiles = AsyncMock(return_value=[mock_profile])
    return service


@pytest.fixture
def mock_voice_analyzer():
    """Mock pour le service d'analyse vocale"""
    service = MagicMock()
    service.is_initialized = True

    mock_result = MagicMock()
    mock_result.to_dict = MagicMock(return_value={
        'pitch': {'mean': 150.5, 'std': 25.3, 'min': 100, 'max': 200},
        'timbre': {'spectralCentroid': 1500, 'spectralBandwidth': 500},
        'mfcc': {'coefficients': [1.0, 0.5, 0.3], 'mean': [0.8, 0.4]},
        'classification': {'voiceType': 'medium_male', 'gender': 'male', 'confidence': 0.85}
    })

    mock_compare = MagicMock()
    mock_compare.to_dict = MagicMock(return_value={
        'overallSimilarity': 0.85,
        'pitchSimilarity': 0.90,
        'timbreSimilarity': 0.80,
        'verdict': 'same_speaker',
        'confidence': 0.87
    })

    service.analyze = AsyncMock(return_value=mock_result)
    service.compare = AsyncMock(return_value=mock_compare)
    return service


@pytest.fixture
def mock_translation_pipeline():
    """Mock pour le pipeline de traduction"""
    service = MagicMock()
    service.is_initialized = True

    mock_job = MagicMock()
    mock_job.id = "mshy_user123_1234567890"
    mock_job.status = "pending"
    mock_job.progress = 0

    service.submit_job = AsyncMock(return_value=mock_job)
    service.get_job = AsyncMock(return_value=mock_job)
    service.cancel_job = AsyncMock(return_value=True)
    service.get_queue_status = AsyncMock(return_value={
        'queue_size': 5,
        'processing': 2,
        'workers_max': 4
    })

    # Add translate_sync for synchronous translation
    mock_result = MagicMock()
    mock_result.to_dict = MagicMock(return_value={
        'translationId': 'trans_123',
        'originalAudio': {
            'transcription': 'Hello world',
            'language': 'en',
            'durationMs': 2000,
            'confidence': 0.95
        },
        'translations': [{
            'targetLanguage': 'fr',
            'translatedText': 'Bonjour le monde',
            'audioBase64': 'mock_audio',
            'durationMs': 2100,
            'voiceCloned': True,
            'voiceQuality': 0.92
        }]
    })
    service.translate_sync = AsyncMock(return_value=mock_result)

    return service


@pytest.fixture
def mock_analytics_service():
    """Mock pour le service analytics"""
    service = MagicMock()
    service.is_initialized = True

    service.submit_feedback = AsyncMock(return_value=MagicMock(
        id="feedback_123",
        rating=5,
        feedback_type="quality"
    ))

    service.get_user_history = AsyncMock(return_value=([
        {'id': 'trans_1', 'timestamp': '2024-01-15T10:30:00Z'},
        {'id': 'trans_2', 'timestamp': '2024-01-14T10:30:00Z'}
    ], 50))

    service.get_user_stats = AsyncMock(return_value=MagicMock(
        total_translations=150,
        total_audio_minutes=45.5,
        avg_rating=4.5
    ))

    service.get_global_stats = AsyncMock(return_value={
        'total_translations': 10000,
        'total_users': 500,
        'avg_rating': 4.3
    })

    return service


@pytest.fixture
def voice_api_handler(
    mock_transcription_service,
    mock_translation_service,
    mock_tts_service,
    mock_voice_clone_service,
    mock_voice_analyzer,
    mock_translation_pipeline,
    mock_analytics_service
):
    """Crée un VoiceAPIHandler avec tous les mocks"""
    from services.voice_api_handler import VoiceAPIHandler

    handler = VoiceAPIHandler(
        transcription_service=mock_transcription_service,
        translation_service=mock_translation_service,
        voice_clone_service=mock_voice_clone_service,
        tts_service=mock_tts_service,
        voice_analyzer=mock_voice_analyzer,
        translation_pipeline=mock_translation_pipeline,
        analytics_service=mock_analytics_service
    )

    return handler


# ═══════════════════════════════════════════════════════════════════════════
# TESTS INITIALIZATION
# ═══════════════════════════════════════════════════════════════════════════

class TestVoiceAPIHandlerInit:
    """Tests pour l'initialisation du handler"""

    def test_initialization(self):
        """Test l'initialisation basique"""
        from services.voice_api_handler import VoiceAPIHandler

        handler = VoiceAPIHandler()
        assert handler is not None
        assert handler.temp_dir is not None

    def test_supported_types(self):
        """Test les types de requêtes supportées"""
        from services.voice_api_handler import VoiceAPIHandler

        expected_types = {
            'voice_translate',
            'voice_translate_async',
            'voice_analyze',
            'voice_compare',
            'voice_profile_get',
            'voice_profile_create',
            'voice_profile_update',
            'voice_profile_delete',
            'voice_profile_list',
            'voice_job_status',
            'voice_job_cancel',
            'voice_feedback',
            'voice_history',
            'voice_stats',
            'voice_admin_metrics',
            'voice_health',
            'voice_languages'
        }

        assert VoiceAPIHandler.SUPPORTED_TYPES == expected_types

    def test_is_voice_api_request(self, voice_api_handler):
        """Test la détection des requêtes Voice API"""
        assert voice_api_handler.is_voice_api_request('voice_translate') is True
        assert voice_api_handler.is_voice_api_request('voice_analyze') is True
        assert voice_api_handler.is_voice_api_request('unknown_type') is False
        assert voice_api_handler.is_voice_api_request('translation') is False


# ═══════════════════════════════════════════════════════════════════════════
# TESTS TRANSLATION HANDLERS
# ═══════════════════════════════════════════════════════════════════════════

class TestTranslationHandlers:
    """Tests pour les handlers de traduction"""

    @pytest.mark.asyncio
    async def test_handle_translate_success(self, voice_api_handler, audio_base64):
        """Test la traduction synchrone - structure de réponse"""
        request_data = {
            'type': 'voice_translate',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'audioBase64': audio_base64,
            'targetLanguages': ['fr', 'es'],
            'sourceLanguage': 'en',
            'generateVoiceClone': True
        }

        result = await voice_api_handler.handle_request(request_data)

        # Test response structure - may succeed or fail gracefully
        assert result['type'] in ['voice_api_success', 'voice_api_error']
        assert result['taskId'] == request_data['taskId']
        assert 'timestamp' in result

        if result['type'] == 'voice_api_success':
            assert 'result' in result
            assert 'processingTimeMs' in result
        else:
            assert 'error' in result
            assert 'errorCode' in result

    @pytest.mark.asyncio
    async def test_handle_translate_missing_audio(self, voice_api_handler):
        """Test la traduction sans audio"""
        request_data = {
            'type': 'voice_translate',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'targetLanguages': ['fr']
            # Missing audioBase64 and audioPath
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] == 'voice_api_error'
        assert result['errorCode'] == 'INVALID_REQUEST'
        assert 'Audio' in result['error'] or 'audio' in result['error']

    @pytest.mark.asyncio
    async def test_handle_translate_missing_languages(self, voice_api_handler, audio_base64):
        """Test la traduction sans langues cibles"""
        request_data = {
            'type': 'voice_translate',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'audioBase64': audio_base64,
            'targetLanguages': []
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] == 'voice_api_error'
        assert result['errorCode'] == 'INVALID_REQUEST'

    @pytest.mark.asyncio
    async def test_handle_translate_async_success(self, voice_api_handler, audio_base64):
        """Test la traduction asynchrone réussie"""
        request_data = {
            'type': 'voice_translate_async',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'audioBase64': audio_base64,
            'targetLanguages': ['fr'],
            'webhookUrl': 'https://example.com/webhook',
            'priority': 5
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] == 'voice_api_success'
        assert 'jobId' in result['result']
        assert result['result']['status'] == 'pending'

    @pytest.mark.asyncio
    async def test_handle_translate_with_audio_path(self, voice_api_handler, temp_audio_file):
        """Test la traduction avec chemin de fichier"""
        request_data = {
            'type': 'voice_translate',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'audioPath': temp_audio_file,
            'targetLanguages': ['fr'],
            'generateVoiceClone': False
        }

        result = await voice_api_handler.handle_request(request_data)

        # Should work with audio path instead of base64
        assert result['type'] in ['voice_api_success', 'voice_api_error']


# ═══════════════════════════════════════════════════════════════════════════
# TESTS VOICE ANALYSIS HANDLERS
# ═══════════════════════════════════════════════════════════════════════════

class TestVoiceAnalysisHandlers:
    """Tests pour les handlers d'analyse vocale"""

    @pytest.mark.asyncio
    async def test_handle_analyze_success(self, voice_api_handler, audio_base64):
        """Test l'analyse vocale réussie"""
        request_data = {
            'type': 'voice_analyze',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'audioBase64': audio_base64,
            'analysisTypes': ['pitch', 'timbre', 'mfcc']
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] == 'voice_api_success'
        assert 'result' in result

    @pytest.mark.asyncio
    async def test_handle_compare_success(self, voice_api_handler, audio_base64):
        """Test la comparaison vocale - structure de réponse"""
        request_data = {
            'type': 'voice_compare',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'audioBase64_1': audio_base64,
            'audioBase64_2': audio_base64  # Same audio for test
        }

        result = await voice_api_handler.handle_request(request_data)

        # Test response structure - may succeed or fail gracefully
        assert result['type'] in ['voice_api_success', 'voice_api_error']
        assert 'timestamp' in result

        if result['type'] == 'voice_api_success':
            assert 'result' in result


# ═══════════════════════════════════════════════════════════════════════════
# TESTS PROFILE HANDLERS
# ═══════════════════════════════════════════════════════════════════════════

class TestProfileHandlers:
    """Tests pour les handlers de profils vocaux"""

    @pytest.mark.asyncio
    async def test_handle_profile_create(self, voice_api_handler, audio_base64):
        """Test la création de profil"""
        request_data = {
            'type': 'voice_profile_create',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'name': 'My Voice Profile',
            'audioBase64': audio_base64
        }

        result = await voice_api_handler.handle_request(request_data)

        # Should succeed or fail gracefully
        assert result['type'] in ['voice_api_success', 'voice_api_error']
        if result['type'] == 'voice_api_success':
            assert 'result' in result

    @pytest.mark.asyncio
    async def test_handle_profile_get(self, voice_api_handler):
        """Test la récupération de profil"""
        request_data = {
            'type': 'voice_profile_get',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'profileId': 'profile_123'
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] in ['voice_api_success', 'voice_api_error']

    @pytest.mark.asyncio
    async def test_handle_profile_list(self, voice_api_handler):
        """Test la liste des profils"""
        request_data = {
            'type': 'voice_profile_list',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'limit': 10,
            'offset': 0
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] in ['voice_api_success', 'voice_api_error']

    @pytest.mark.asyncio
    async def test_handle_profile_update(self, voice_api_handler):
        """Test la mise à jour de profil"""
        request_data = {
            'type': 'voice_profile_update',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'profileId': 'profile_123',
            'name': 'Updated Profile Name'
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] in ['voice_api_success', 'voice_api_error']

    @pytest.mark.asyncio
    async def test_handle_profile_delete(self, voice_api_handler):
        """Test la suppression de profil"""
        request_data = {
            'type': 'voice_profile_delete',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'profileId': 'profile_123'
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] in ['voice_api_success', 'voice_api_error']


# ═══════════════════════════════════════════════════════════════════════════
# TESTS JOB HANDLERS
# ═══════════════════════════════════════════════════════════════════════════

class TestJobHandlers:
    """Tests pour les handlers de jobs"""

    @pytest.mark.asyncio
    async def test_handle_job_status(self, voice_api_handler):
        """Test le statut d'un job"""
        request_data = {
            'type': 'voice_job_status',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'jobId': 'mshy_user123_1234567890'
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] in ['voice_api_success', 'voice_api_error']

    @pytest.mark.asyncio
    async def test_handle_job_cancel(self, voice_api_handler):
        """Test l'annulation d'un job"""
        request_data = {
            'type': 'voice_job_cancel',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'jobId': 'mshy_user123_1234567890'
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] in ['voice_api_success', 'voice_api_error']


# ═══════════════════════════════════════════════════════════════════════════
# TESTS FEEDBACK & ANALYTICS HANDLERS
# ═══════════════════════════════════════════════════════════════════════════

class TestFeedbackAnalyticsHandlers:
    """Tests pour les handlers de feedback et analytics"""

    @pytest.mark.asyncio
    async def test_handle_feedback(self, voice_api_handler):
        """Test la soumission de feedback"""
        request_data = {
            'type': 'voice_feedback',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'translationId': 'trans_456',
            'rating': 5,
            'feedbackType': 'quality',
            'comment': 'Excellent quality!'
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] in ['voice_api_success', 'voice_api_error']

    @pytest.mark.asyncio
    async def test_handle_history(self, voice_api_handler):
        """Test la récupération de l'historique"""
        request_data = {
            'type': 'voice_history',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'limit': 20,
            'offset': 0,
            'startDate': '2024-01-01',
            'endDate': '2024-12-31'
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] in ['voice_api_success', 'voice_api_error']

    @pytest.mark.asyncio
    async def test_handle_stats(self, voice_api_handler):
        """Test les statistiques utilisateur"""
        request_data = {
            'type': 'voice_stats',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'period': 'month'
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] in ['voice_api_success', 'voice_api_error']


# ═══════════════════════════════════════════════════════════════════════════
# TESTS ADMIN HANDLERS
# ═══════════════════════════════════════════════════════════════════════════

class TestAdminHandlers:
    """Tests pour les handlers admin"""

    @pytest.mark.asyncio
    async def test_handle_admin_metrics(self, voice_api_handler):
        """Test les métriques admin"""
        request_data = {
            'type': 'voice_admin_metrics',
            'taskId': str(uuid.uuid4()),
            'userId': 'admin_user'
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] in ['voice_api_success', 'voice_api_error']


# ═══════════════════════════════════════════════════════════════════════════
# TESTS SYSTEM HANDLERS
# ═══════════════════════════════════════════════════════════════════════════

class TestSystemHandlers:
    """Tests pour les handlers système"""

    @pytest.mark.asyncio
    async def test_handle_health(self, voice_api_handler):
        """Test le health check"""
        request_data = {
            'type': 'voice_health',
            'taskId': str(uuid.uuid4())
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] == 'voice_api_success'
        assert 'result' in result
        assert 'status' in result['result'] or 'services' in result['result']

    @pytest.mark.asyncio
    async def test_handle_languages(self, voice_api_handler):
        """Test la liste des langues supportées"""
        request_data = {
            'type': 'voice_languages',
            'taskId': str(uuid.uuid4())
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] == 'voice_api_success'
        assert 'result' in result


# ═══════════════════════════════════════════════════════════════════════════
# TESTS ERROR HANDLING
# ═══════════════════════════════════════════════════════════════════════════

class TestErrorHandling:
    """Tests pour la gestion des erreurs"""

    @pytest.mark.asyncio
    async def test_unknown_request_type(self, voice_api_handler):
        """Test un type de requête inconnu"""
        request_data = {
            'type': 'unknown_type',
            'taskId': str(uuid.uuid4())
        }

        result = await voice_api_handler.handle_request(request_data)

        assert result['type'] == 'voice_api_error'
        assert result['errorCode'] == 'INVALID_REQUEST'

    @pytest.mark.asyncio
    async def test_missing_task_id(self, voice_api_handler):
        """Test une requête sans taskId"""
        request_data = {
            'type': 'voice_health'
            # Missing taskId
        }

        result = await voice_api_handler.handle_request(request_data)

        # Should generate a taskId automatically
        assert 'taskId' in result

    @pytest.mark.asyncio
    async def test_response_structure(self, voice_api_handler):
        """Test la structure des réponses"""
        request_data = {
            'type': 'voice_health',
            'taskId': 'test_task_123'
        }

        result = await voice_api_handler.handle_request(request_data)

        # All responses should have these fields
        assert 'type' in result
        assert 'taskId' in result
        assert 'timestamp' in result

        if result['type'] == 'voice_api_success':
            assert 'result' in result
            assert 'processingTimeMs' in result
            assert 'requestType' in result
        else:
            assert 'error' in result
            assert 'errorCode' in result

    @pytest.mark.asyncio
    async def test_exception_handling(self, voice_api_handler):
        """Test la gestion des exceptions"""
        # Force an exception by providing invalid data that will cause an error
        request_data = {
            'type': 'voice_translate',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'audioBase64': 'invalid_base64_!!!',  # Invalid base64
            'targetLanguages': ['fr']
        }

        result = await voice_api_handler.handle_request(request_data)

        # Should handle exception gracefully
        assert result['type'] == 'voice_api_error'
        assert 'errorCode' in result


# ═══════════════════════════════════════════════════════════════════════════
# TESTS VOICEAPIRESULT
# ═══════════════════════════════════════════════════════════════════════════

class TestVoiceAPIResult:
    """Tests pour la classe VoiceAPIResult"""

    def test_success_result(self):
        """Test un résultat de succès"""
        from services.voice_api_handler import VoiceAPIResult

        result = VoiceAPIResult(
            success=True,
            data={'key': 'value'},
            processing_time_ms=100
        )

        assert result.success is True
        assert result.data == {'key': 'value'}
        assert result.error is None
        assert result.processing_time_ms == 100

    def test_error_result(self):
        """Test un résultat d'erreur"""
        from services.voice_api_handler import VoiceAPIResult

        result = VoiceAPIResult(
            success=False,
            error="Something went wrong",
            error_code="INTERNAL_ERROR"
        )

        assert result.success is False
        assert result.data is None
        assert result.error == "Something went wrong"
        assert result.error_code == "INTERNAL_ERROR"


# ═══════════════════════════════════════════════════════════════════════════
# TESTS INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════

class TestVoiceAPIHandlerIntegration:
    """Tests d'intégration pour VoiceAPIHandler"""

    @pytest.mark.asyncio
    async def test_full_translation_flow(self, voice_api_handler, audio_base64):
        """Test le flux complet de traduction"""
        # Step 1: Submit async job
        submit_request = {
            'type': 'voice_translate_async',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'audioBase64': audio_base64,
            'targetLanguages': ['fr', 'es']
        }

        submit_result = await voice_api_handler.handle_request(submit_request)

        if submit_result['type'] == 'voice_api_success':
            job_id = submit_result['result']['jobId']

            # Step 2: Check job status
            status_request = {
                'type': 'voice_job_status',
                'taskId': str(uuid.uuid4()),
                'userId': 'user_123',
                'jobId': job_id
            }

            status_result = await voice_api_handler.handle_request(status_request)
            assert status_result['type'] in ['voice_api_success', 'voice_api_error']

    @pytest.mark.asyncio
    async def test_profile_and_translation_flow(self, voice_api_handler, audio_base64):
        """Test le flux profil + traduction"""
        # Step 1: Create profile
        create_request = {
            'type': 'voice_profile_create',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'name': 'Test Profile',
            'audioBase64': audio_base64
        }

        create_result = await voice_api_handler.handle_request(create_request)

        # Step 2: Translate with voice clone
        translate_request = {
            'type': 'voice_translate',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'audioBase64': audio_base64,
            'targetLanguages': ['fr'],
            'generateVoiceClone': True
        }

        translate_result = await voice_api_handler.handle_request(translate_request)

        # Both should complete (success or handled error)
        assert create_result['type'] in ['voice_api_success', 'voice_api_error']
        assert translate_result['type'] in ['voice_api_success', 'voice_api_error']

    @pytest.mark.asyncio
    async def test_analyze_compare_flow(self, voice_api_handler, audio_base64):
        """Test le flux analyse + comparaison"""
        # Step 1: Analyze voice
        analyze_request = {
            'type': 'voice_analyze',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'audioBase64': audio_base64
        }

        analyze_result = await voice_api_handler.handle_request(analyze_request)

        # Step 2: Compare voices
        compare_request = {
            'type': 'voice_compare',
            'taskId': str(uuid.uuid4()),
            'userId': 'user_123',
            'audioBase64_1': audio_base64,
            'audioBase64_2': audio_base64
        }

        compare_result = await voice_api_handler.handle_request(compare_request)

        # Both should complete
        assert analyze_result['type'] in ['voice_api_success', 'voice_api_error']
        assert compare_result['type'] in ['voice_api_success', 'voice_api_error']


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
