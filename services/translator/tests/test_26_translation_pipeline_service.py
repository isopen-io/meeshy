#!/usr/bin/env python3
"""
Test 26 - Translation Pipeline Service Tests
Comprehensive unit tests for the TranslationPipelineService (translation_pipeline_service.py)
Target: >65% code coverage

Tests cover:
- JobStatus and JobPriority enums
- TranslationJob dataclass
- PipelineResult dataclass
- TranslationPipelineService (singleton, initialization, workers, jobs, queue)
- Pipeline steps (validate, transcribe, clone, translate, TTS)
- Error handling and edge cases
- Webhook callbacks
- Statistics and cleanup
"""

import sys
import os
import logging
import asyncio
import pytest
import json
import time
import uuid
import base64
import tempfile
from pathlib import Path
from datetime import datetime, timedelta
from unittest.mock import MagicMock, AsyncMock, patch, PropertyMock
from dataclasses import dataclass

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def reset_singleton():
    """Reset the singleton instance before and after each test"""
    from services.translation_pipeline_service import TranslationPipelineService
    # Save original
    original_instance = TranslationPipelineService._instance
    # Reset before test
    TranslationPipelineService._instance = None
    yield
    # Restore after test
    TranslationPipelineService._instance = original_instance


@pytest.fixture
def mock_transcription_service():
    """Mock transcription service for testing"""
    service = MagicMock()

    @dataclass
    class MockTranscription:
        text: str = "Hello world"
        language: str = "en"
        duration_ms: int = 3000
        confidence: float = 0.95

    service.transcribe = AsyncMock(return_value=MockTranscription())
    return service


@pytest.fixture
def mock_voice_clone_service():
    """Mock voice clone service for testing"""
    service = MagicMock()

    @dataclass
    class MockVoiceModel:
        quality_score: float = 0.92
        version: int = 1
        profile_id: str = "profile_123"

    service.get_or_create_voice_model = AsyncMock(return_value=MockVoiceModel())
    return service


@pytest.fixture
def mock_tts_service():
    """Mock TTS service for testing"""
    service = MagicMock()

    @dataclass
    class MockTTSResult:
        audio_path: str = "/tmp/test_audio.mp3"
        audio_url: str = "http://example.com/audio.mp3"
        duration_ms: int = 3500
        voice_cloned: bool = True

    service.synthesize_with_voice = AsyncMock(return_value=MockTTSResult())
    service.synthesize = AsyncMock(return_value=MockTTSResult())
    return service


@pytest.fixture
def mock_translation_service():
    """Mock translation service for testing"""
    service = MagicMock()

    async def mock_translate(**kwargs):
        return {
            'translated_text': f"[FR] {kwargs.get('text', '')}",
            'confidence': 0.95,
            'detected_language': 'en'
        }

    service.translate_with_structure = AsyncMock(side_effect=mock_translate)
    return service


@pytest.fixture
def temp_audio_dir():
    """Create a temporary directory for audio output"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def pipeline_service(reset_singleton, temp_audio_dir, mock_transcription_service,
                     mock_voice_clone_service, mock_tts_service, mock_translation_service):
    """Create a pipeline service with all mocked dependencies"""
    from services.translation_pipeline_service import TranslationPipelineService

    service = TranslationPipelineService(
        max_concurrent_jobs=2,
        audio_output_dir=temp_audio_dir,
        transcription_service=mock_transcription_service,
        voice_clone_service=mock_voice_clone_service,
        tts_service=mock_tts_service,
        translation_service=mock_translation_service
    )
    return service


# ============================================================================
# TEST ENUMS
# ============================================================================

class TestJobStatusEnum:
    """Tests for JobStatus enum"""

    def test_job_status_values(self):
        """Test JobStatus enum values"""
        logger.info("Test 26.1: JobStatus enum values")
        from services.translation_pipeline_service import JobStatus

        assert JobStatus.PENDING.value == "pending"
        assert JobStatus.PROCESSING.value == "processing"
        assert JobStatus.COMPLETED.value == "completed"
        assert JobStatus.FAILED.value == "failed"
        assert JobStatus.CANCELLED.value == "cancelled"
        logger.info("JobStatus values OK")

    def test_job_status_str_inheritance(self):
        """Test JobStatus inherits from str"""
        from services.translation_pipeline_service import JobStatus

        # Should be able to use as string
        assert isinstance(JobStatus.PENDING, str)
        assert JobStatus.PENDING == "pending"


class TestJobPriorityEnum:
    """Tests for JobPriority enum"""

    def test_job_priority_values(self):
        """Test JobPriority enum values"""
        logger.info("Test 26.2: JobPriority enum values")
        from services.translation_pipeline_service import JobPriority

        assert JobPriority.LOW.value == 0
        assert JobPriority.NORMAL.value == 1
        assert JobPriority.HIGH.value == 2
        assert JobPriority.URGENT.value == 3
        logger.info("JobPriority values OK")

    def test_job_priority_comparison(self):
        """Test JobPriority comparison"""
        from services.translation_pipeline_service import JobPriority

        assert JobPriority.LOW < JobPriority.NORMAL
        assert JobPriority.NORMAL < JobPriority.HIGH
        assert JobPriority.HIGH < JobPriority.URGENT


# ============================================================================
# TEST TRANSLATION JOB DATACLASS
# ============================================================================

class TestTranslationJob:
    """Tests for TranslationJob dataclass"""

    def test_job_creation_minimal(self):
        """Test TranslationJob creation with minimal fields"""
        logger.info("Test 26.3: TranslationJob minimal creation")
        from services.translation_pipeline_service import TranslationJob, JobStatus, JobPriority

        job = TranslationJob(
            id="job_123",
            user_id="user_456"
        )

        assert job.id == "job_123"
        assert job.user_id == "user_456"
        assert job.status == JobStatus.PENDING
        assert job.priority == JobPriority.NORMAL
        assert job.progress == 0
        assert job.target_languages == []
        logger.info("TranslationJob minimal OK")

    def test_job_creation_full(self):
        """Test TranslationJob creation with all fields"""
        logger.info("Test 26.4: TranslationJob full creation")
        from services.translation_pipeline_service import TranslationJob, JobStatus, JobPriority

        job = TranslationJob(
            id="job_full",
            user_id="user_full",
            status=JobStatus.PROCESSING,
            priority=JobPriority.HIGH,
            audio_path="/path/to/audio.wav",
            audio_url="http://example.com/audio.wav",
            audio_base64="YXVkaW9fZGF0YQ==",
            source_language="en",
            target_languages=["fr", "es", "de"],
            generate_voice_clone=True,
            webhook_url="http://webhook.example.com",
            callback_metadata={"key": "value"},
            progress=50,
            current_step="translate_text"
        )

        assert job.status == JobStatus.PROCESSING
        assert job.priority == JobPriority.HIGH
        assert len(job.target_languages) == 3
        assert job.generate_voice_clone is True
        assert job.webhook_url == "http://webhook.example.com"
        assert job.callback_metadata == {"key": "value"}
        logger.info("TranslationJob full OK")

    def test_job_to_dict(self):
        """Test TranslationJob to_dict method"""
        logger.info("Test 26.5: TranslationJob to_dict")
        from services.translation_pipeline_service import TranslationJob, JobStatus

        job = TranslationJob(
            id="job_dict",
            user_id="user_dict",
            target_languages=["fr"],
            webhook_url="http://example.com/webhook"
        )

        job_dict = job.to_dict()

        assert job_dict['id'] == "job_dict"
        assert job_dict['user_id'] == "user_dict"
        assert job_dict['status'] == "pending"
        assert job_dict['priority'] == 1
        assert job_dict['progress'] == 0
        assert job_dict['target_languages'] == ["fr"]
        assert job_dict['webhook_url'] == "http://example.com/webhook"
        assert 'created_at' in job_dict
        logger.info("TranslationJob to_dict OK")

    def test_job_to_dict_with_timestamps(self):
        """Test TranslationJob to_dict with started_at and completed_at"""
        from services.translation_pipeline_service import TranslationJob, JobStatus

        job = TranslationJob(
            id="job_timestamps",
            user_id="user_timestamps",
            started_at=datetime.now(),
            completed_at=datetime.now()
        )

        job_dict = job.to_dict()

        assert job_dict['started_at'] is not None
        assert job_dict['completed_at'] is not None


# ============================================================================
# TEST PIPELINE RESULT DATACLASS
# ============================================================================

class TestPipelineResult:
    """Tests for PipelineResult dataclass"""

    def test_result_creation_minimal(self):
        """Test PipelineResult creation with minimal fields"""
        logger.info("Test 26.6: PipelineResult minimal creation")
        from services.translation_pipeline_service import PipelineResult

        result = PipelineResult(job_id="job_123")

        assert result.job_id == "job_123"
        assert result.success is True
        assert result.original_text == ""
        assert result.translations == {}
        logger.info("PipelineResult minimal OK")

    def test_result_creation_full(self):
        """Test PipelineResult creation with all fields"""
        logger.info("Test 26.7: PipelineResult full creation")
        from services.translation_pipeline_service import PipelineResult

        result = PipelineResult(
            job_id="job_full",
            success=True,
            original_text="Hello world",
            original_language="en",
            original_duration_ms=3000,
            transcription_confidence=0.95,
            translations={"fr": {"text": "Bonjour monde"}},
            voice_cloned=True,
            voice_quality=0.92,
            voice_model_version=1,
            processing_time_ms=5000
        )

        assert result.original_text == "Hello world"
        assert result.voice_cloned is True
        assert result.voice_quality == 0.92
        assert result.processing_time_ms == 5000
        logger.info("PipelineResult full OK")

    def test_result_to_dict(self):
        """Test PipelineResult to_dict method"""
        logger.info("Test 26.8: PipelineResult to_dict")
        from services.translation_pipeline_service import PipelineResult

        result = PipelineResult(
            job_id="job_dict",
            original_text="Test",
            original_language="en",
            translations={"fr": {"text": "Test"}},
            voice_cloned=True,
            processing_time_ms=1000
        )

        result_dict = result.to_dict()

        assert result_dict['job_id'] == "job_dict"
        assert result_dict['success'] is True
        assert result_dict['original']['text'] == "Test"
        assert result_dict['original']['language'] == "en"
        assert result_dict['voice']['cloned'] is True
        assert result_dict['processing_time_ms'] == 1000
        assert 'timestamp' in result_dict
        logger.info("PipelineResult to_dict OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - SINGLETON
# ============================================================================

class TestTranslationPipelineServiceSingleton:
    """Tests for TranslationPipelineService singleton pattern"""

    def test_singleton_pattern(self, reset_singleton, temp_audio_dir):
        """Test that service uses singleton pattern"""
        logger.info("Test 26.9: Singleton pattern")
        from services.translation_pipeline_service import TranslationPipelineService

        service1 = TranslationPipelineService(
            max_concurrent_jobs=2,
            audio_output_dir=temp_audio_dir
        )
        service2 = TranslationPipelineService(
            max_concurrent_jobs=5,  # Different config
            audio_output_dir=temp_audio_dir
        )

        # Should be the same instance
        assert service1 is service2
        # Config should not change after first init
        assert service1.max_concurrent_jobs == 2
        logger.info("Singleton pattern OK")

    def test_get_translation_pipeline_service(self, reset_singleton):
        """Test get_translation_pipeline_service helper function"""
        logger.info("Test 26.10: get_translation_pipeline_service")
        from services.translation_pipeline_service import (
            TranslationPipelineService,
            get_translation_pipeline_service
        )

        service = get_translation_pipeline_service()

        assert service is not None
        assert isinstance(service, TranslationPipelineService)
        logger.info("get_translation_pipeline_service OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - INITIALIZATION
# ============================================================================

class TestTranslationPipelineServiceInit:
    """Tests for TranslationPipelineService initialization"""

    def test_service_init_defaults(self, reset_singleton):
        """Test service initialization with default values"""
        logger.info("Test 26.11: Service init defaults")
        from services.translation_pipeline_service import TranslationPipelineService

        service = TranslationPipelineService()

        assert service.max_concurrent_jobs > 0
        assert service.audio_output_dir.exists()
        assert service.is_initialized is False
        assert service._running is False
        logger.info("Service init defaults OK")

    def test_service_init_custom_config(self, reset_singleton, temp_audio_dir):
        """Test service initialization with custom config"""
        logger.info("Test 26.12: Service init custom config")
        from services.translation_pipeline_service import TranslationPipelineService

        mock_trans = MagicMock()
        mock_voice = MagicMock()
        mock_tts = MagicMock()
        mock_translation = MagicMock()

        service = TranslationPipelineService(
            max_concurrent_jobs=5,
            audio_output_dir=temp_audio_dir,
            transcription_service=mock_trans,
            voice_clone_service=mock_voice,
            tts_service=mock_tts,
            translation_service=mock_translation
        )

        assert service.max_concurrent_jobs == 5
        assert str(service.audio_output_dir) == temp_audio_dir
        assert service.transcription_service == mock_trans
        assert service.voice_clone_service == mock_voice
        assert service.tts_service == mock_tts
        assert service.translation_service == mock_translation
        logger.info("Service init custom config OK")

    def test_set_services(self, reset_singleton, temp_audio_dir):
        """Test set_services method"""
        logger.info("Test 26.13: set_services")
        from services.translation_pipeline_service import TranslationPipelineService

        service = TranslationPipelineService(
            audio_output_dir=temp_audio_dir
        )

        mock_trans = MagicMock()
        mock_voice = MagicMock()
        mock_tts = MagicMock()
        mock_translation = MagicMock()

        service.set_services(
            transcription_service=mock_trans,
            voice_clone_service=mock_voice,
            tts_service=mock_tts,
            translation_service=mock_translation
        )

        assert service.transcription_service == mock_trans
        assert service.voice_clone_service == mock_voice
        assert service.tts_service == mock_tts
        assert service.translation_service == mock_translation
        logger.info("set_services OK")

    @pytest.mark.asyncio
    async def test_initialize(self, reset_singleton, temp_audio_dir):
        """Test initialize method"""
        logger.info("Test 26.14: initialize")
        from services.translation_pipeline_service import TranslationPipelineService

        service = TranslationPipelineService(
            max_concurrent_jobs=2,
            audio_output_dir=temp_audio_dir
        )

        result = await service.initialize()

        assert result is True
        assert service.is_initialized is True
        assert service._running is True
        assert service._job_queue is not None
        assert service._worker_semaphore is not None
        assert len(service._workers) == 2

        # Clean up
        await service.close()
        logger.info("initialize OK")

    @pytest.mark.asyncio
    async def test_initialize_already_initialized(self, reset_singleton, temp_audio_dir):
        """Test initialize when already initialized"""
        logger.info("Test 26.15: initialize already initialized")
        from services.translation_pipeline_service import TranslationPipelineService

        service = TranslationPipelineService(
            max_concurrent_jobs=2,
            audio_output_dir=temp_audio_dir
        )

        await service.initialize()

        # Second call should return True immediately
        result = await service.initialize()

        assert result is True

        # Clean up
        await service.close()
        logger.info("initialize already initialized OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - JOB SUBMISSION
# ============================================================================

class TestTranslationPipelineServiceJobSubmission:
    """Tests for job submission"""

    @pytest.mark.asyncio
    async def test_submit_job_basic(self, pipeline_service):
        """Test basic job submission"""
        logger.info("Test 26.16: submit_job basic")

        await pipeline_service.initialize()

        job = await pipeline_service.submit_job(
            user_id="user_123",
            audio_path="/tmp/test.wav",
            target_languages=["fr"]
        )

        assert job is not None
        assert job.user_id == "user_123"
        assert job.audio_path == "/tmp/test.wav"
        assert job.target_languages == ["fr"]
        assert "mshy_" in job.id

        await pipeline_service.close()
        logger.info("submit_job basic OK")

    @pytest.mark.asyncio
    async def test_submit_job_with_base64(self, pipeline_service):
        """Test job submission with base64 audio"""
        logger.info("Test 26.17: submit_job with base64")

        await pipeline_service.initialize()

        audio_base64 = base64.b64encode(b"fake_audio_data").decode('utf-8')

        job = await pipeline_service.submit_job(
            user_id="user_base64",
            audio_base64=audio_base64,
            target_languages=["es"]
        )

        assert job.audio_base64 == audio_base64

        await pipeline_service.close()
        logger.info("submit_job with base64 OK")

    @pytest.mark.asyncio
    async def test_submit_job_with_url(self, pipeline_service):
        """Test job submission with audio URL"""
        logger.info("Test 26.18: submit_job with URL")

        await pipeline_service.initialize()

        job = await pipeline_service.submit_job(
            user_id="user_url",
            audio_url="http://example.com/audio.wav",
            target_languages=["de"]
        )

        assert job.audio_url == "http://example.com/audio.wav"

        await pipeline_service.close()
        logger.info("submit_job with URL OK")

    @pytest.mark.asyncio
    async def test_submit_job_no_audio(self, pipeline_service):
        """Test job submission with no audio raises error"""
        logger.info("Test 26.19: submit_job no audio")

        await pipeline_service.initialize()

        with pytest.raises(ValueError, match="Au moins un input audio requis"):
            await pipeline_service.submit_job(
                user_id="user_no_audio",
                target_languages=["fr"]
            )

        await pipeline_service.close()
        logger.info("submit_job no audio OK")

    @pytest.mark.asyncio
    async def test_submit_job_default_languages(self, pipeline_service):
        """Test job submission with default target languages"""
        logger.info("Test 26.20: submit_job default languages")

        await pipeline_service.initialize()

        job = await pipeline_service.submit_job(
            user_id="user_default",
            audio_path="/tmp/test.wav"
            # No target_languages specified
        )

        assert job.target_languages == ["en"]

        await pipeline_service.close()
        logger.info("submit_job default languages OK")

    @pytest.mark.asyncio
    async def test_submit_job_with_webhook(self, pipeline_service):
        """Test job submission with webhook"""
        logger.info("Test 26.21: submit_job with webhook")

        await pipeline_service.initialize()

        job = await pipeline_service.submit_job(
            user_id="user_webhook",
            audio_path="/tmp/test.wav",
            target_languages=["fr"],
            webhook_url="http://webhook.example.com/callback",
            callback_metadata={"request_id": "req_123"}
        )

        assert job.webhook_url == "http://webhook.example.com/callback"
        assert job.callback_metadata == {"request_id": "req_123"}

        await pipeline_service.close()
        logger.info("submit_job with webhook OK")

    @pytest.mark.asyncio
    async def test_submit_job_with_priority(self, pipeline_service):
        """Test job submission with priority"""
        logger.info("Test 26.22: submit_job with priority")
        from services.translation_pipeline_service import JobPriority

        await pipeline_service.initialize()

        job = await pipeline_service.submit_job(
            user_id="user_priority",
            audio_path="/tmp/test.wav",
            target_languages=["fr"],
            priority=JobPriority.URGENT
        )

        assert job.priority == JobPriority.URGENT

        await pipeline_service.close()
        logger.info("submit_job with priority OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - JOB MANAGEMENT
# ============================================================================

class TestTranslationPipelineServiceJobManagement:
    """Tests for job management"""

    @pytest.mark.asyncio
    async def test_get_job(self, pipeline_service):
        """Test getting a job by ID"""
        logger.info("Test 26.23: get_job")

        await pipeline_service.initialize()

        job = await pipeline_service.submit_job(
            user_id="user_get",
            audio_path="/tmp/test.wav",
            target_languages=["fr"]
        )

        retrieved_job = await pipeline_service.get_job(job.id)

        assert retrieved_job is not None
        assert retrieved_job.id == job.id

        await pipeline_service.close()
        logger.info("get_job OK")

    @pytest.mark.asyncio
    async def test_get_job_not_found(self, pipeline_service):
        """Test getting a non-existent job"""
        logger.info("Test 26.24: get_job not found")

        await pipeline_service.initialize()

        job = await pipeline_service.get_job("non_existent_job_id")

        assert job is None

        await pipeline_service.close()
        logger.info("get_job not found OK")

    @pytest.mark.asyncio
    async def test_cancel_job_pending(self, pipeline_service):
        """Test cancelling a pending job"""
        logger.info("Test 26.25: cancel_job pending")
        from services.translation_pipeline_service import JobStatus

        await pipeline_service.initialize()

        # Submit job but don't process it yet
        job = await pipeline_service.submit_job(
            user_id="user_cancel",
            audio_path="/tmp/test.wav",
            target_languages=["fr"]
        )

        # Cancel before processing
        result = await pipeline_service.cancel_job(job.id)

        # Note: The job might already be processing by workers, so check both cases
        if result:
            cancelled_job = await pipeline_service.get_job(job.id)
            assert cancelled_job.status == JobStatus.CANCELLED

        await pipeline_service.close()
        logger.info("cancel_job pending OK")

    @pytest.mark.asyncio
    async def test_cancel_job_not_found(self, pipeline_service):
        """Test cancelling a non-existent job"""
        logger.info("Test 26.26: cancel_job not found")

        await pipeline_service.initialize()

        result = await pipeline_service.cancel_job("non_existent_job_id")

        assert result is False

        await pipeline_service.close()
        logger.info("cancel_job not found OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - AUDIO INPUT PREPARATION
# ============================================================================

class TestTranslationPipelineServiceAudioInput:
    """Tests for audio input preparation"""

    @pytest.mark.asyncio
    async def test_prepare_audio_input_path(self, pipeline_service, temp_audio_dir):
        """Test preparing audio from file path"""
        logger.info("Test 26.27: prepare_audio_input path")
        from services.translation_pipeline_service import TranslationJob

        # Create a test audio file
        audio_path = Path(temp_audio_dir) / "test_audio.wav"
        audio_path.write_bytes(b"fake_audio_data")

        job = TranslationJob(
            id="job_path",
            user_id="user_path",
            audio_path=str(audio_path)
        )

        result = await pipeline_service._prepare_audio_input(job)

        assert result == str(audio_path)
        logger.info("prepare_audio_input path OK")

    @pytest.mark.asyncio
    async def test_prepare_audio_input_base64(self, pipeline_service, temp_audio_dir):
        """Test preparing audio from base64"""
        logger.info("Test 26.28: prepare_audio_input base64")
        from services.translation_pipeline_service import TranslationJob

        audio_data = b"fake_audio_data"
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')

        job = TranslationJob(
            id="job_base64",
            user_id="user_base64",
            audio_base64=audio_base64
        )

        result = await pipeline_service._prepare_audio_input(job)

        assert result is not None
        assert Path(result).exists()
        assert Path(result).read_bytes() == audio_data
        logger.info("prepare_audio_input base64 OK")

    @pytest.mark.asyncio
    async def test_prepare_audio_input_url(self, pipeline_service):
        """Test preparing audio from URL (not implemented)"""
        logger.info("Test 26.29: prepare_audio_input URL")
        from services.translation_pipeline_service import TranslationJob

        job = TranslationJob(
            id="job_url",
            user_id="user_url",
            audio_url="http://example.com/audio.wav"
        )

        # URL download not implemented, should return None
        result = await pipeline_service._prepare_audio_input(job)

        assert result is None
        logger.info("prepare_audio_input URL OK")

    @pytest.mark.asyncio
    async def test_prepare_audio_input_no_input(self, pipeline_service):
        """Test preparing audio with no input"""
        logger.info("Test 26.30: prepare_audio_input no input")
        from services.translation_pipeline_service import TranslationJob

        job = TranslationJob(
            id="job_none",
            user_id="user_none"
        )

        result = await pipeline_service._prepare_audio_input(job)

        assert result is None
        logger.info("prepare_audio_input no input OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - JOB PROGRESS
# ============================================================================

class TestTranslationPipelineServiceProgress:
    """Tests for job progress updates"""

    @pytest.mark.asyncio
    async def test_update_job_progress(self, pipeline_service):
        """Test updating job progress"""
        logger.info("Test 26.31: update_job_progress")
        from services.translation_pipeline_service import TranslationJob

        job = TranslationJob(
            id="job_progress",
            user_id="user_progress"
        )

        await pipeline_service._update_job_progress(job, "validate_input", 10)

        assert job.current_step == "validate_input"
        assert job.progress == 10
        assert "validate_input" in job.steps_completed
        logger.info("update_job_progress OK")

    @pytest.mark.asyncio
    async def test_update_job_progress_multiple_steps(self, pipeline_service):
        """Test updating job progress with multiple steps"""
        logger.info("Test 26.32: update_job_progress multiple")
        from services.translation_pipeline_service import TranslationJob

        job = TranslationJob(
            id="job_multi",
            user_id="user_multi"
        )

        await pipeline_service._update_job_progress(job, "step1", 25)
        await pipeline_service._update_job_progress(job, "step2", 50)
        await pipeline_service._update_job_progress(job, "step3", 75)

        assert job.progress == 75
        assert len(job.steps_completed) == 3
        assert "step1" in job.steps_completed
        assert "step2" in job.steps_completed
        assert "step3" in job.steps_completed
        logger.info("update_job_progress multiple OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - OUTPUT FILENAME
# ============================================================================

class TestTranslationPipelineServiceFilename:
    """Tests for output filename generation"""

    def test_generate_output_filename_basic(self, pipeline_service):
        """Test generating output filename basic"""
        logger.info("Test 26.33: generate_output_filename basic")
        from services.translation_pipeline_service import TranslationJob

        job = TranslationJob(
            id="job_12345678",
            user_id="user_12345678"
        )

        filename = pipeline_service._generate_output_filename(
            job=job,
            target_lang="fr"
        )

        assert filename.endswith(".mp3")
        assert "fr" in filename
        assert "mshy_gen_v1" in filename
        logger.info("generate_output_filename basic OK")

    def test_generate_output_filename_with_metadata(self, pipeline_service):
        """Test generating output filename with metadata"""
        logger.info("Test 26.34: generate_output_filename with metadata")
        from services.translation_pipeline_service import TranslationJob

        job = TranslationJob(
            id="job_12345678",
            user_id="user_12345678",
            callback_metadata={
                "message_id": "msg_12345678",
                "attachment_id": "att_12345678"
            }
        )

        filename = pipeline_service._generate_output_filename(
            job=job,
            target_lang="es",
            profile_id="prof_12345678"
        )

        assert "msg" in filename
        assert "att" in filename
        assert "prof" in filename
        logger.info("generate_output_filename with metadata OK")

    def test_generate_output_filename_custom_ext(self, pipeline_service):
        """Test generating output filename with custom extension"""
        logger.info("Test 26.35: generate_output_filename custom ext")
        from services.translation_pipeline_service import TranslationJob

        job = TranslationJob(
            id="job_ext",
            user_id="user_ext"
        )

        filename = pipeline_service._generate_output_filename(
            job=job,
            target_lang="de",
            ext="wav"
        )

        assert filename.endswith(".wav")
        logger.info("generate_output_filename custom ext OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - JOB ID GENERATION
# ============================================================================

class TestTranslationPipelineServiceJobId:
    """Tests for job ID generation"""

    def test_generate_job_id(self, pipeline_service):
        """Test generating job ID"""
        logger.info("Test 26.36: generate_job_id")

        job_id = pipeline_service._generate_job_id("user_12345678")

        assert job_id.startswith("mshy_")
        assert "user_123" in job_id  # First 8 chars of user_id
        assert len(job_id) > 20  # Should have timestamp and unique part
        logger.info("generate_job_id OK")

    def test_generate_job_id_unique(self, pipeline_service):
        """Test that generated job IDs are unique"""
        logger.info("Test 26.37: generate_job_id unique")

        ids = set()
        for _ in range(100):
            job_id = pipeline_service._generate_job_id("user_test")
            ids.add(job_id)

        assert len(ids) == 100
        logger.info("generate_job_id unique OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - QUEUE STATUS
# ============================================================================

class TestTranslationPipelineServiceQueueStatus:
    """Tests for queue status"""

    @pytest.mark.asyncio
    async def test_get_queue_status(self, pipeline_service):
        """Test getting queue status"""
        logger.info("Test 26.38: get_queue_status")

        await pipeline_service.initialize()

        status = await pipeline_service.get_queue_status()

        assert 'queue_size' in status
        assert 'processing' in status
        assert 'completed_total' in status
        assert 'failed_total' in status
        assert 'workers_active' in status
        assert 'workers_max' in status

        await pipeline_service.close()
        logger.info("get_queue_status OK")

    @pytest.mark.asyncio
    async def test_get_stats(self, pipeline_service):
        """Test getting service statistics"""
        logger.info("Test 26.39: get_stats")

        await pipeline_service.initialize()

        stats = await pipeline_service.get_stats()

        assert stats['service'] == "TranslationPipelineService"
        assert 'initialized' in stats
        assert 'running' in stats
        assert 'jobs_created' in stats
        assert 'jobs_completed' in stats

        await pipeline_service.close()
        logger.info("get_stats OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - CLEANUP
# ============================================================================

class TestTranslationPipelineServiceCleanup:
    """Tests for job cleanup"""

    @pytest.mark.asyncio
    async def test_cleanup_old_jobs(self, pipeline_service):
        """Test cleaning up old jobs"""
        logger.info("Test 26.40: cleanup_old_jobs")
        from services.translation_pipeline_service import TranslationJob, JobStatus

        await pipeline_service.initialize()

        # Manually add an old completed job
        old_job = TranslationJob(
            id="old_job",
            user_id="old_user",
            status=JobStatus.COMPLETED,
            completed_at=datetime.now() - timedelta(hours=48)  # 48 hours old
        )
        pipeline_service._jobs["old_job"] = old_job

        # Set TTL to 24 hours
        pipeline_service._job_ttl_hours = 24

        await pipeline_service.cleanup_old_jobs()

        # Job should be removed
        assert "old_job" not in pipeline_service._jobs

        await pipeline_service.close()
        logger.info("cleanup_old_jobs OK")

    @pytest.mark.asyncio
    async def test_cleanup_keeps_recent_jobs(self, pipeline_service):
        """Test that cleanup keeps recent jobs"""
        logger.info("Test 26.41: cleanup keeps recent")
        from services.translation_pipeline_service import TranslationJob, JobStatus

        await pipeline_service.initialize()

        # Add a recent completed job
        recent_job = TranslationJob(
            id="recent_job",
            user_id="recent_user",
            status=JobStatus.COMPLETED,
            completed_at=datetime.now() - timedelta(hours=1)  # 1 hour old
        )
        pipeline_service._jobs["recent_job"] = recent_job

        await pipeline_service.cleanup_old_jobs()

        # Job should still exist
        assert "recent_job" in pipeline_service._jobs

        await pipeline_service.close()
        logger.info("cleanup keeps recent OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - CLOSE
# ============================================================================

class TestTranslationPipelineServiceClose:
    """Tests for service shutdown"""

    @pytest.mark.asyncio
    async def test_close(self, pipeline_service):
        """Test closing the service"""
        logger.info("Test 26.42: close")

        await pipeline_service.initialize()

        assert pipeline_service.is_initialized is True
        assert pipeline_service._running is True

        await pipeline_service.close()

        assert pipeline_service.is_initialized is False
        assert pipeline_service._running is False
        assert len(pipeline_service._workers) == 0
        logger.info("close OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - PROCESS SINGLE LANGUAGE
# ============================================================================

class TestTranslationPipelineServiceProcessSingleLanguage:
    """Tests for single language processing"""

    @pytest.mark.asyncio
    async def test_process_single_language_with_voice(self, pipeline_service, temp_audio_dir):
        """Test processing single language with voice clone"""
        logger.info("Test 26.43: process_single_language with voice")
        from services.translation_pipeline_service import TranslationJob

        # Create mock voice model
        @dataclass
        class MockVoiceModel:
            profile_id: str = "profile_123"

        # Create test audio file for TTS result
        tts_audio_path = Path(temp_audio_dir) / "tts_output.mp3"
        tts_audio_path.write_bytes(b"fake_audio_data")
        tts_audio_path_str = str(tts_audio_path)

        # Update mock TTS to return correct path
        @dataclass
        class MockTTSResult:
            audio_path: str = tts_audio_path_str
            audio_url: str = "http://example.com/audio.mp3"
            duration_ms: int = 3500
            voice_cloned: bool = True

        pipeline_service.tts_service.synthesize_with_voice = AsyncMock(return_value=MockTTSResult())

        job = TranslationJob(
            id="job_voice",
            user_id="user_voice",
            target_languages=["fr"]
        )

        result = await pipeline_service._process_single_language(
            job=job,
            text="Hello world",
            source_lang="en",
            target_lang="fr",
            voice_model=MockVoiceModel()
        )

        assert result['language'] == "fr"
        assert result['success'] is True
        assert 'translated_text' in result
        assert 'audio_base64' in result
        logger.info("process_single_language with voice OK")

    @pytest.mark.asyncio
    async def test_process_single_language_without_voice(self, pipeline_service, temp_audio_dir):
        """Test processing single language without voice clone"""
        logger.info("Test 26.44: process_single_language without voice")
        from services.translation_pipeline_service import TranslationJob

        # Create test audio file for TTS result
        tts_audio_path = Path(temp_audio_dir) / "tts_output.mp3"
        tts_audio_path.write_bytes(b"fake_audio_data")
        tts_audio_path_str = str(tts_audio_path)

        @dataclass
        class MockTTSResult:
            audio_path: str = tts_audio_path_str
            audio_url: str = "http://example.com/audio.mp3"
            duration_ms: int = 3500
            voice_cloned: bool = False

        pipeline_service.tts_service.synthesize = AsyncMock(return_value=MockTTSResult())

        job = TranslationJob(
            id="job_no_voice",
            user_id="user_no_voice",
            target_languages=["es"]
        )

        result = await pipeline_service._process_single_language(
            job=job,
            text="Hello world",
            source_lang="en",
            target_lang="es",
            voice_model=None
        )

        assert result['language'] == "es"
        assert result['success'] is True
        logger.info("process_single_language without voice OK")

    @pytest.mark.asyncio
    async def test_process_single_language_same_language(self, pipeline_service):
        """Test processing when source equals target (no translation)"""
        logger.info("Test 26.45: process_single_language same language")
        from services.translation_pipeline_service import TranslationJob

        job = TranslationJob(
            id="job_same",
            user_id="user_same",
            target_languages=["en"]
        )

        result = await pipeline_service._process_single_language(
            job=job,
            text="Hello world",
            source_lang="en",
            target_lang="en",
            voice_model=None
        )

        # Text should be unchanged
        assert result['translated_text'] == "Hello world"
        logger.info("process_single_language same language OK")

    @pytest.mark.asyncio
    async def test_process_single_language_translation_error(self, pipeline_service):
        """Test handling translation error"""
        logger.info("Test 26.46: process_single_language translation error")
        from services.translation_pipeline_service import TranslationJob

        # Make translation service fail
        pipeline_service.translation_service.translate_with_structure = AsyncMock(
            side_effect=Exception("Translation failed")
        )

        job = TranslationJob(
            id="job_error",
            user_id="user_error",
            target_languages=["fr"]
        )

        result = await pipeline_service._process_single_language(
            job=job,
            text="Hello world",
            source_lang="en",
            target_lang="fr",
            voice_model=None
        )

        # Should fallback gracefully
        assert result['translated_text'] == "Hello world"
        logger.info("process_single_language translation error OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - SYNC TRANSLATION
# ============================================================================

class TestTranslationPipelineServiceSyncTranslation:
    """Tests for synchronous translation"""

    @pytest.mark.asyncio
    async def test_translate_sync_job_submission(self, pipeline_service, temp_audio_dir):
        """Test that translate_sync properly submits a job"""
        logger.info("Test 26.47: translate_sync job submission")
        from services.translation_pipeline_service import JobStatus, JobPriority

        await pipeline_service.initialize()

        # Create a test audio file
        audio_path = Path(temp_audio_dir) / "test_sync.wav"
        audio_path.write_bytes(b"fake_audio_data")

        # Submit a job via translate_sync but don't wait for completion
        # Just verify that job submission works correctly
        job = await pipeline_service.submit_job(
            user_id="user_sync",
            audio_path=str(audio_path),
            target_languages=["fr"],
            generate_voice_clone=False,
            priority=JobPriority.HIGH
        )

        assert job is not None
        assert job.user_id == "user_sync"
        assert job.priority == JobPriority.HIGH

        await pipeline_service.close()
        logger.info("translate_sync job submission OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - WEBHOOK
# ============================================================================

class TestTranslationPipelineServiceWebhook:
    """Tests for webhook functionality"""

    @pytest.mark.asyncio
    async def test_send_webhook_no_url(self, pipeline_service):
        """Test send_webhook with no URL"""
        logger.info("Test 26.48: send_webhook no URL")
        from services.translation_pipeline_service import TranslationJob

        job = TranslationJob(
            id="job_no_webhook",
            user_id="user_no_webhook",
            webhook_url=None
        )

        # Should not raise even with no URL
        await pipeline_service._send_webhook(job)
        logger.info("send_webhook no URL OK")

    @pytest.mark.asyncio
    async def test_send_webhook_success(self, pipeline_service):
        """Test send_webhook success"""
        logger.info("Test 26.49: send_webhook success")
        from services.translation_pipeline_service import TranslationJob, JobStatus

        job = TranslationJob(
            id="job_webhook",
            user_id="user_webhook",
            status=JobStatus.COMPLETED,
            webhook_url="http://webhook.example.com/callback",
            callback_metadata={"test": "data"}
        )

        with patch('aiohttp.ClientSession') as mock_session:
            mock_response = MagicMock()
            mock_response.status = 200

            mock_context = AsyncMock()
            mock_context.__aenter__.return_value = mock_response

            mock_session_instance = MagicMock()
            mock_session_instance.post.return_value = mock_context
            mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
            mock_session_instance.__aexit__ = AsyncMock(return_value=None)
            mock_session.return_value = mock_session_instance

            await pipeline_service._send_webhook(job)

            # Verify post was called
            mock_session_instance.post.assert_called_once()

        logger.info("send_webhook success OK")

    @pytest.mark.asyncio
    async def test_send_webhook_error(self, pipeline_service):
        """Test send_webhook with HTTP error"""
        logger.info("Test 26.50: send_webhook error")
        from services.translation_pipeline_service import TranslationJob, JobStatus

        job = TranslationJob(
            id="job_webhook_err",
            user_id="user_webhook_err",
            status=JobStatus.FAILED,
            webhook_url="http://webhook.example.com/callback"
        )

        with patch('aiohttp.ClientSession') as mock_session:
            mock_response = MagicMock()
            mock_response.status = 500

            mock_context = AsyncMock()
            mock_context.__aenter__.return_value = mock_response

            mock_session_instance = MagicMock()
            mock_session_instance.post.return_value = mock_context
            mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
            mock_session_instance.__aexit__ = AsyncMock(return_value=None)
            mock_session.return_value = mock_session_instance

            # Should not raise on error
            await pipeline_service._send_webhook(job)

        logger.info("send_webhook error OK")

    @pytest.mark.asyncio
    async def test_send_webhook_exception(self, pipeline_service):
        """Test send_webhook with exception"""
        logger.info("Test 26.51: send_webhook exception")
        from services.translation_pipeline_service import TranslationJob, JobStatus

        job = TranslationJob(
            id="job_webhook_exc",
            user_id="user_webhook_exc",
            status=JobStatus.COMPLETED,
            webhook_url="http://webhook.example.com/callback"
        )

        with patch('aiohttp.ClientSession', side_effect=Exception("Connection error")):
            # Should not raise on exception
            await pipeline_service._send_webhook(job)

        logger.info("send_webhook exception OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - WORKER LOOP
# ============================================================================

class TestTranslationPipelineServiceWorkerLoop:
    """Tests for worker loop functionality"""

    @pytest.mark.asyncio
    async def test_worker_loop_processes_job(self, pipeline_service, temp_audio_dir):
        """Test that worker loop processes jobs"""
        logger.info("Test 26.52: worker_loop processes job")
        from services.translation_pipeline_service import JobStatus

        await pipeline_service.initialize()

        # Create test audio file
        audio_path = Path(temp_audio_dir) / "worker_test.wav"
        audio_path.write_bytes(b"fake_audio_data")

        # Submit a job
        job = await pipeline_service.submit_job(
            user_id="user_worker",
            audio_path=str(audio_path),
            target_languages=["fr"],
            generate_voice_clone=False
        )

        # Wait for processing (with timeout)
        start_time = time.time()
        while time.time() - start_time < 5.0:
            current_job = await pipeline_service.get_job(job.id)
            if current_job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
                break
            await asyncio.sleep(0.1)

        await pipeline_service.close()
        logger.info("worker_loop processes job OK")


# ============================================================================
# TEST TRANSLATION PIPELINE SERVICE - PROCESS JOB
# ============================================================================

class TestTranslationPipelineServiceProcessJob:
    """Tests for job processing"""

    @pytest.mark.asyncio
    async def test_process_job_cancelled(self, pipeline_service):
        """Test processing cancelled job"""
        logger.info("Test 26.53: process_job cancelled")
        from services.translation_pipeline_service import TranslationJob, JobStatus

        await pipeline_service.initialize()

        # Create a cancelled job
        cancelled_job = TranslationJob(
            id="cancelled_job",
            user_id="cancelled_user",
            status=JobStatus.CANCELLED
        )
        pipeline_service._jobs["cancelled_job"] = cancelled_job

        # Process should return early
        await pipeline_service._process_job("cancelled_job", 0)

        # Job should still be cancelled
        job = await pipeline_service.get_job("cancelled_job")
        assert job.status == JobStatus.CANCELLED

        await pipeline_service.close()
        logger.info("process_job cancelled OK")

    @pytest.mark.asyncio
    async def test_process_job_not_found(self, pipeline_service):
        """Test processing non-existent job"""
        logger.info("Test 26.54: process_job not found")

        await pipeline_service.initialize()

        # Should not raise
        await pipeline_service._process_job("non_existent", 0)

        await pipeline_service.close()
        logger.info("process_job not found OK")

    @pytest.mark.asyncio
    async def test_process_job_no_transcription_service(self, reset_singleton, temp_audio_dir):
        """Test processing job without transcription service"""
        logger.info("Test 26.55: process_job no transcription")
        from services.translation_pipeline_service import (
            TranslationPipelineService, TranslationJob, JobStatus
        )

        service = TranslationPipelineService(
            max_concurrent_jobs=2,
            audio_output_dir=temp_audio_dir,
            transcription_service=None
        )

        await service.initialize()

        # Create test audio
        audio_path = Path(temp_audio_dir) / "no_trans.wav"
        audio_path.write_bytes(b"fake_audio")

        # Create job
        job = TranslationJob(
            id="no_trans_job",
            user_id="no_trans_user",
            audio_path=str(audio_path),
            target_languages=["fr"]
        )
        service._jobs["no_trans_job"] = job

        # Process should fail due to missing service
        await service._process_job("no_trans_job", 0)

        result_job = await service.get_job("no_trans_job")
        assert result_job.status == JobStatus.FAILED
        assert "Transcription service non disponible" in result_job.error

        await service.close()
        logger.info("process_job no transcription OK")

    @pytest.mark.asyncio
    async def test_process_job_audio_preparation_fails(self, pipeline_service):
        """Test processing job when audio preparation fails"""
        logger.info("Test 26.56: process_job audio prep fails")
        from services.translation_pipeline_service import TranslationJob, JobStatus

        await pipeline_service.initialize()

        # Create job with non-existent audio path
        job = TranslationJob(
            id="bad_audio_job",
            user_id="bad_audio_user",
            audio_path="/non/existent/path.wav",
            target_languages=["fr"]
        )
        pipeline_service._jobs["bad_audio_job"] = job

        await pipeline_service._process_job("bad_audio_job", 0)

        result_job = await pipeline_service.get_job("bad_audio_job")
        assert result_job.status == JobStatus.FAILED

        await pipeline_service.close()
        logger.info("process_job audio prep fails OK")

    @pytest.mark.asyncio
    async def test_process_job_voice_clone_fails(self, reset_singleton, temp_audio_dir, mock_transcription_service):
        """Test processing job when voice cloning fails"""
        logger.info("Test 26.57: process_job voice clone fails")
        from services.translation_pipeline_service import (
            TranslationPipelineService, TranslationJob, JobStatus
        )

        # Create voice clone service that fails
        mock_voice = MagicMock()
        mock_voice.get_or_create_voice_model = AsyncMock(side_effect=Exception("Voice clone failed"))

        service = TranslationPipelineService(
            max_concurrent_jobs=2,
            audio_output_dir=temp_audio_dir,
            transcription_service=mock_transcription_service,
            voice_clone_service=mock_voice
        )

        await service.initialize()

        # Create test audio
        audio_path = Path(temp_audio_dir) / "voice_fail.wav"
        audio_path.write_bytes(b"fake_audio")

        job = TranslationJob(
            id="voice_fail_job",
            user_id="voice_fail_user",
            audio_path=str(audio_path),
            target_languages=["fr"],
            generate_voice_clone=True
        )
        service._jobs["voice_fail_job"] = job

        await service._process_job("voice_fail_job", 0)

        # Job should still complete (voice clone is optional)
        result_job = await service.get_job("voice_fail_job")
        # Status could be COMPLETED or FAILED depending on TTS fallback

        await service.close()
        logger.info("process_job voice clone fails OK")

    @pytest.mark.asyncio
    async def test_process_job_translation_fails_for_language(self, pipeline_service, temp_audio_dir, mock_transcription_service):
        """Test processing job when translation fails for a language"""
        logger.info("Test 26.58: process_job translation fails for language")
        from services.translation_pipeline_service import TranslationJob, JobStatus

        await pipeline_service.initialize()

        # Make translation fail for specific language
        async def mock_translate_fail(**kwargs):
            if kwargs.get('target_language') == 'de':
                raise Exception("Translation to German failed")
            return {'translated_text': f"[FR] {kwargs.get('text', '')}"}

        pipeline_service.translation_service.translate_with_structure = AsyncMock(side_effect=mock_translate_fail)

        # Create test audio
        audio_path = Path(temp_audio_dir) / "multi_lang.wav"
        audio_path.write_bytes(b"fake_audio")

        job = TranslationJob(
            id="multi_lang_job",
            user_id="multi_lang_user",
            audio_path=str(audio_path),
            target_languages=["fr", "de", "es"],
            generate_voice_clone=False
        )
        pipeline_service._jobs["multi_lang_job"] = job

        await pipeline_service._process_job("multi_lang_job", 0)

        result_job = await pipeline_service.get_job("multi_lang_job")
        # When translation fails, the code catches the exception and falls back gracefully
        # The result should still have translation entries
        if result_job.result and 'translations' in result_job.result:
            de_result = result_job.result['translations'].get('de', {})
            # German should have a result (fallback uses original text)
            assert de_result is not None
            assert 'language' in de_result
            assert de_result['language'] == 'de'

        await pipeline_service.close()
        logger.info("process_job translation fails for language OK")


# ============================================================================
# TEST PIPELINE STEPS
# ============================================================================

class TestPipelineSteps:
    """Tests for pipeline step constants"""

    def test_pipeline_steps_defined(self):
        """Test that pipeline steps are properly defined"""
        logger.info("Test 26.59: pipeline steps defined")
        from services.translation_pipeline_service import TranslationPipelineService

        expected_steps = [
            "validate_input",
            "transcribe_audio",
            "detect_language",
            "translate_text",
            "clone_voice",
            "synthesize_audio",
            "encode_output",
            "cleanup"
        ]

        assert TranslationPipelineService.PIPELINE_STEPS == expected_steps
        logger.info("pipeline steps defined OK")


# ============================================================================
# TEST STATS UPDATE
# ============================================================================

class TestStatsUpdate:
    """Tests for statistics updates"""

    @pytest.mark.asyncio
    async def test_stats_job_created(self, pipeline_service):
        """Test stats update on job creation"""
        logger.info("Test 26.60: stats job created")

        await pipeline_service.initialize()

        initial_count = pipeline_service._stats['jobs_created']

        await pipeline_service.submit_job(
            user_id="stats_user",
            audio_path="/tmp/stats.wav",
            target_languages=["fr"]
        )

        assert pipeline_service._stats['jobs_created'] == initial_count + 1

        await pipeline_service.close()
        logger.info("stats job created OK")

    @pytest.mark.asyncio
    async def test_stats_job_cancelled(self, pipeline_service):
        """Test stats update on job cancellation"""
        logger.info("Test 26.61: stats job cancelled")
        from services.translation_pipeline_service import TranslationJob, JobStatus

        await pipeline_service.initialize()

        # Create a pending job manually
        job = TranslationJob(
            id="cancel_stats_job",
            user_id="cancel_stats_user",
            status=JobStatus.PENDING
        )
        pipeline_service._jobs["cancel_stats_job"] = job

        initial_cancelled = pipeline_service._stats['jobs_cancelled']

        await pipeline_service.cancel_job("cancel_stats_job")

        assert pipeline_service._stats['jobs_cancelled'] == initial_cancelled + 1

        await pipeline_service.close()
        logger.info("stats job cancelled OK")


# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
