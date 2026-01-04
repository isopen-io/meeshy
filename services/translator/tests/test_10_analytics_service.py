#!/usr/bin/env python3
"""
Test 10 - Analytics Service Tests
Comprehensive tests for analytics_service.py
Tests: Feedback, History, Stats, A/B Testing
"""

import sys
import os
import logging
import asyncio
import pytest
import tempfile
import shutil
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import service
try:
    from services.analytics_service import (
        AnalyticsService,
        QualityFeedback,
        TranslationHistoryEntry,
        UserStats,
        ABTest,
        FeedbackType,
        ABTestStatus,
        get_analytics_service
    )
    SERVICE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"AnalyticsService not available: {e}")
    SERVICE_AVAILABLE = False


# ═══════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════

@pytest.fixture
def temp_data_dir():
    """Create temporary data directory"""
    temp_path = tempfile.mkdtemp(prefix="analytics_test_")
    yield Path(temp_path)
    shutil.rmtree(temp_path, ignore_errors=True)


@pytest.fixture
def analytics_service(temp_data_dir):
    """Create fresh analytics service instance"""
    if not SERVICE_AVAILABLE:
        pytest.skip("AnalyticsService not available")

    # Reset singleton
    AnalyticsService._instance = None

    service = AnalyticsService(data_dir=str(temp_data_dir))
    return service


# ═══════════════════════════════════════════════════════════════
# ENUM TESTS
# ═══════════════════════════════════════════════════════════════

class TestEnums:
    """Test enum classes"""

    def test_feedback_type_values(self):
        """Test FeedbackType enum values"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        assert FeedbackType.VOICE_QUALITY.value == "voice_quality"
        assert FeedbackType.TRANSLATION_ACCURACY.value == "translation_accuracy"
        assert FeedbackType.SPEED.value == "speed"
        assert FeedbackType.OVERALL.value == "overall"

    def test_ab_test_status_values(self):
        """Test ABTestStatus enum values"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        assert ABTestStatus.DRAFT.value == "draft"
        assert ABTestStatus.ACTIVE.value == "active"
        assert ABTestStatus.PAUSED.value == "paused"
        assert ABTestStatus.COMPLETED.value == "completed"


# ═══════════════════════════════════════════════════════════════
# QUALITY FEEDBACK TESTS
# ═══════════════════════════════════════════════════════════════

class TestQualityFeedback:
    """Test QualityFeedback dataclass"""

    def test_creation(self):
        """Test basic feedback creation"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        feedback = QualityFeedback(
            id="fb_001",
            user_id="user_123",
            translation_id="trans_456",
            rating=4,
            feedback_type=FeedbackType.VOICE_QUALITY,
            comment="Good quality!",
            target_language="fr",
            voice_cloned=True
        )

        assert feedback.id == "fb_001"
        assert feedback.rating == 4
        assert feedback.voice_cloned is True

    def test_to_dict(self):
        """Test serialization"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        feedback = QualityFeedback(
            id="fb_002",
            user_id="user_456",
            translation_id="trans_789",
            rating=5,
            feedback_type=FeedbackType.OVERALL
        )

        data = feedback.to_dict()
        assert data["id"] == "fb_002"
        assert data["rating"] == 5
        assert data["feedback_type"] == "overall"
        assert "created_at" in data

    def test_from_dict(self):
        """Test deserialization"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        data = {
            "id": "fb_003",
            "user_id": "user_789",
            "translation_id": "trans_012",
            "rating": 3,
            "feedback_type": "translation_accuracy",
            "comment": "Could be better",
            "target_language": "es",
            "voice_cloned": False,
            "created_at": datetime.now().isoformat()
        }

        feedback = QualityFeedback.from_dict(data)
        assert feedback.id == "fb_003"
        assert feedback.rating == 3
        assert feedback.feedback_type == FeedbackType.TRANSLATION_ACCURACY


# ═══════════════════════════════════════════════════════════════
# TRANSLATION HISTORY ENTRY TESTS
# ═══════════════════════════════════════════════════════════════

class TestTranslationHistoryEntry:
    """Test TranslationHistoryEntry dataclass"""

    def test_creation(self):
        """Test basic entry creation"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        entry = TranslationHistoryEntry(
            id="hist_001",
            user_id="user_123",
            source_language="en",
            target_language="fr",
            original_text="Hello world",
            translated_text="Bonjour le monde",
            voice_cloned=True,
            voice_quality=0.85,
            processing_time_ms=1500,
            audio_url="/audio/output.wav"
        )

        assert entry.id == "hist_001"
        assert entry.source_language == "en"
        assert entry.voice_quality == 0.85

    def test_to_dict_text_truncation(self):
        """Test that long text is truncated in to_dict"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        long_text = "A" * 200  # 200 characters
        entry = TranslationHistoryEntry(
            id="hist_002",
            user_id="user_456",
            source_language="en",
            target_language="de",
            original_text=long_text,
            translated_text=long_text,
            voice_cloned=False,
            voice_quality=0.7,
            processing_time_ms=2000
        )

        data = entry.to_dict()
        # Text should be truncated to 100 chars + "..."
        assert len(data["original_text"]) == 103
        assert data["original_text"].endswith("...")

    def test_from_dict(self):
        """Test deserialization"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        data = {
            "id": "hist_003",
            "user_id": "user_789",
            "source_language": "fr",
            "target_language": "en",
            "original_text": "Bonjour",
            "translated_text": "Hello",
            "voice_cloned": True,
            "voice_quality": 0.9,
            "processing_time_ms": 800,
            "audio_url": None,
            "feedback_rating": 5,
            "created_at": datetime.now().isoformat()
        }

        entry = TranslationHistoryEntry.from_dict(data)
        assert entry.id == "hist_003"
        assert entry.feedback_rating == 5


# ═══════════════════════════════════════════════════════════════
# USER STATS TESTS
# ═══════════════════════════════════════════════════════════════

class TestUserStats:
    """Test UserStats dataclass"""

    def test_creation_defaults(self):
        """Test creation with defaults"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        stats = UserStats(user_id="user_123")

        assert stats.user_id == "user_123"
        assert stats.total_translations == 0
        assert stats.avg_rating == 0.0
        assert stats.languages_used == {}

    def test_to_dict(self):
        """Test serialization"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        stats = UserStats(
            user_id="user_456",
            total_translations=50,
            total_audio_seconds=1500.0,
            languages_used={"en": 30, "fr": 20},
            avg_rating=4.5,
            total_feedback=10,
            voice_profile_quality=0.8,
            first_translation=datetime.now() - timedelta(days=30),
            last_translation=datetime.now()
        )

        data = stats.to_dict()
        assert data["total_translations"] == 50
        assert data["languages_used"]["en"] == 30
        assert data["first_translation"] is not None


# ═══════════════════════════════════════════════════════════════
# AB TEST TESTS
# ═══════════════════════════════════════════════════════════════

class TestABTest:
    """Test ABTest dataclass"""

    def test_creation(self):
        """Test basic AB test creation"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        test = ABTest(
            id="ab_001",
            name="Voice Model Comparison",
            description="Compare OpenVoice vs XTTS",
            variants=[
                {"name": "control", "model": "openvoice"},
                {"name": "treatment", "model": "xtts"}
            ],
            traffic_split=[0.5, 0.5],
            target_sample_size=500
        )

        assert test.id == "ab_001"
        assert test.status == ABTestStatus.DRAFT
        assert len(test.variants) == 2

    def test_to_dict_with_results(self):
        """Test serialization with results"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        test = ABTest(
            id="ab_002",
            name="Speed Test",
            description="Test processing speed",
            status=ABTestStatus.ACTIVE,
            variants=[{"name": "A"}, {"name": "B"}],
            variant_counts={"A": 100, "B": 100},
            variant_ratings={"A": [4, 5, 4, 3], "B": [5, 5, 4, 5]}
        )
        test.started_at = datetime.now()

        data = test.to_dict()
        assert data["status"] == "active"
        assert data["results"]["counts"]["A"] == 100
        assert data["results"]["avg_ratings"]["A"] == 4.0
        assert data["results"]["avg_ratings"]["B"] == 4.75

    def test_from_dict(self):
        """Test deserialization"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        data = {
            "id": "ab_003",
            "name": "Quality Test",
            "description": "Test quality settings",
            "status": "completed",
            "variants": [{"name": "low"}, {"name": "high"}],
            "traffic_split": [0.3, 0.7],
            "variant_counts": {"low": 300, "high": 700},
            "variant_ratings": {},
            "created_at": datetime.now().isoformat(),
            "started_at": datetime.now().isoformat(),
            "ended_at": datetime.now().isoformat(),
            "target_sample_size": 1000
        }

        test = ABTest.from_dict(data)
        assert test.id == "ab_003"
        assert test.status == ABTestStatus.COMPLETED


# ═══════════════════════════════════════════════════════════════
# ANALYTICS SERVICE TESTS
# ═══════════════════════════════════════════════════════════════

class TestAnalyticsServiceInit:
    """Test AnalyticsService initialization"""

    @pytest.mark.asyncio
    async def test_initialization(self, analytics_service):
        """Test service initialization"""
        result = await analytics_service.initialize()
        assert result is True
        assert analytics_service.is_initialized is True

    @pytest.mark.asyncio
    async def test_double_initialization(self, analytics_service):
        """Test that double init doesn't cause issues"""
        await analytics_service.initialize()
        result = await analytics_service.initialize()
        assert result is True


class TestAnalyticsServiceFeedback:
    """Test feedback functionality"""

    @pytest.mark.asyncio
    async def test_submit_feedback(self, analytics_service):
        """Test submitting feedback"""
        await analytics_service.initialize()

        feedback_id = await analytics_service.submit_feedback(
            user_id="user_001",
            translation_id="trans_001",
            rating=5,
            feedback_type=FeedbackType.VOICE_QUALITY,
            comment="Excellent!"
        )

        assert feedback_id is not None
        assert feedback_id.startswith("fb_")

    @pytest.mark.asyncio
    async def test_get_feedback_by_translation(self, analytics_service):
        """Test getting feedback by translation ID"""
        await analytics_service.initialize()

        # Submit feedback
        await analytics_service.submit_feedback(
            user_id="user_002",
            translation_id="trans_002",
            rating=4,
            feedback_type=FeedbackType.OVERALL
        )

        # Get feedback
        feedback = await analytics_service.get_feedback_by_translation("trans_002")
        assert feedback is not None
        assert feedback.rating == 4

    @pytest.mark.asyncio
    async def test_get_feedback_nonexistent(self, analytics_service):
        """Test getting feedback that doesn't exist"""
        await analytics_service.initialize()

        feedback = await analytics_service.get_feedback_by_translation("nonexistent")
        assert feedback is None


class TestAnalyticsServiceHistory:
    """Test translation history functionality"""

    @pytest.mark.asyncio
    async def test_record_translation(self, analytics_service):
        """Test recording translation"""
        await analytics_service.initialize()

        entry_id = await analytics_service.record_translation(
            user_id="user_003",
            source_language="en",
            target_language="fr",
            original_text="Hello",
            translated_text="Bonjour",
            voice_cloned=True,
            voice_quality=0.85,
            processing_time_ms=1200
        )

        assert entry_id is not None

    @pytest.mark.asyncio
    async def test_get_user_history(self, analytics_service):
        """Test getting user history"""
        await analytics_service.initialize()

        # Record some translations
        for i in range(5):
            await analytics_service.record_translation(
                user_id="user_004",
                source_language="en",
                target_language="es",
                original_text=f"Text {i}",
                translated_text=f"Texto {i}",
                voice_cloned=False,
                voice_quality=0.7,
                processing_time_ms=1000
            )

        # Get history
        history = await analytics_service.get_user_history("user_004")
        assert len(history) == 5

    @pytest.mark.asyncio
    async def test_get_user_history_with_limit(self, analytics_service):
        """Test getting user history with limit"""
        await analytics_service.initialize()

        # Record many translations
        for i in range(10):
            await analytics_service.record_translation(
                user_id="user_005",
                source_language="fr",
                target_language="en",
                original_text=f"Texte {i}",
                translated_text=f"Text {i}",
                voice_cloned=True,
                voice_quality=0.8,
                processing_time_ms=900
            )

        # Get limited history
        history = await analytics_service.get_user_history("user_005", limit=5)
        assert len(history) == 5


class TestAnalyticsServiceStats:
    """Test statistics functionality"""

    @pytest.mark.asyncio
    async def test_get_user_stats(self, analytics_service):
        """Test getting user statistics"""
        await analytics_service.initialize()

        # Record some translations
        for i in range(3):
            await analytics_service.record_translation(
                user_id="user_006",
                source_language="en",
                target_language=["fr", "es", "de"][i],
                original_text=f"Text {i}",
                translated_text=f"Translated {i}",
                voice_cloned=True,
                voice_quality=0.75,
                processing_time_ms=1100
            )

        stats = await analytics_service.get_user_stats("user_006")
        assert stats is not None
        assert stats.total_translations == 3

    @pytest.mark.asyncio
    async def test_get_global_stats(self, analytics_service):
        """Test getting global statistics"""
        await analytics_service.initialize()

        stats = await analytics_service.get_global_stats()
        assert stats is not None
        assert "total_translations" in stats
        assert "total_users" in stats


class TestAnalyticsServiceABTesting:
    """Test A/B testing functionality"""

    @pytest.mark.asyncio
    async def test_create_ab_test(self, analytics_service):
        """Test creating A/B test"""
        await analytics_service.initialize()

        test_id = await analytics_service.create_ab_test(
            name="Model Test",
            description="Compare TTS models",
            variants=[
                {"name": "openvoice", "config": {"model": "openvoice"}},
                {"name": "xtts", "config": {"model": "xtts"}}
            ],
            traffic_split=[0.5, 0.5]
        )

        assert test_id is not None
        assert test_id.startswith("ab_")

    @pytest.mark.asyncio
    async def test_get_ab_test(self, analytics_service):
        """Test getting A/B test"""
        await analytics_service.initialize()

        # Create test
        test_id = await analytics_service.create_ab_test(
            name="Speed Test",
            description="Test speed options",
            variants=[{"name": "fast"}, {"name": "slow"}]
        )

        # Get test
        test = await analytics_service.get_ab_test(test_id)
        assert test is not None
        assert test.name == "Speed Test"

    @pytest.mark.asyncio
    async def test_start_ab_test(self, analytics_service):
        """Test starting A/B test"""
        await analytics_service.initialize()

        test_id = await analytics_service.create_ab_test(
            name="Quality Test",
            description="Test quality settings",
            variants=[{"name": "low"}, {"name": "high"}]
        )

        success = await analytics_service.start_ab_test(test_id)
        assert success is True

        test = await analytics_service.get_ab_test(test_id)
        assert test.status == ABTestStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_get_variant_for_user(self, analytics_service):
        """Test getting variant for user"""
        await analytics_service.initialize()

        test_id = await analytics_service.create_ab_test(
            name="User Test",
            description="Assign users to variants",
            variants=[{"name": "A"}, {"name": "B"}],
            traffic_split=[0.5, 0.5]
        )
        await analytics_service.start_ab_test(test_id)

        variant = await analytics_service.get_variant_for_user(test_id, "user_123")
        assert variant is not None
        assert variant["name"] in ["A", "B"]

    @pytest.mark.asyncio
    async def test_record_ab_result(self, analytics_service):
        """Test recording A/B test result"""
        await analytics_service.initialize()

        test_id = await analytics_service.create_ab_test(
            name="Result Test",
            description="Test result recording",
            variants=[{"name": "control"}, {"name": "treatment"}]
        )
        await analytics_service.start_ab_test(test_id)

        # Record result
        success = await analytics_service.record_ab_result(
            test_id=test_id,
            variant_name="control",
            rating=5
        )
        assert success is True


class TestAnalyticsServicePersistence:
    """Test data persistence"""

    @pytest.mark.asyncio
    async def test_save_and_load(self, temp_data_dir):
        """Test data persistence across service restarts"""
        if not SERVICE_AVAILABLE:
            pytest.skip("Service not available")

        # Reset singleton
        AnalyticsService._instance = None

        # Create service and add data
        service1 = AnalyticsService(data_dir=str(temp_data_dir))
        await service1.initialize()

        await service1.submit_feedback(
            user_id="persist_user",
            translation_id="persist_trans",
            rating=5,
            feedback_type=FeedbackType.OVERALL
        )

        # Force save
        await service1._save_data()

        # Reset singleton and create new service
        AnalyticsService._instance = None
        service2 = AnalyticsService(data_dir=str(temp_data_dir))
        await service2.initialize()

        # Check data was loaded
        feedback = await service2.get_feedback_by_translation("persist_trans")
        assert feedback is not None
        assert feedback.rating == 5


# ═══════════════════════════════════════════════════════════════
# RUN TESTS
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
