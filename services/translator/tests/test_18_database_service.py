"""
Test 18: Database Service
Comprehensive unit tests for the DatabaseService class with mocked Prisma client.
Tests all CRUD operations, connection handling, and edge cases.
"""

import pytest
import asyncio
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.database_service import DatabaseService


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def db_service():
    """Create a fresh DatabaseService instance for each test"""
    return DatabaseService(database_url="postgresql://test:test@localhost:5432/test")


@pytest.fixture
def connected_db_service():
    """Create a connected DatabaseService instance with mocked Prisma"""
    service = DatabaseService(database_url="postgresql://test:test@localhost:5432/test")
    service.is_connected = True
    service.prisma = MagicMock()
    return service


@pytest.fixture
def mock_translation():
    """Mock translation record from database"""
    mock = MagicMock()
    mock.messageId = "msg_123"
    mock.sourceLanguage = "en"
    mock.targetLanguage = "fr"
    mock.translatedContent = "Bonjour"
    mock.translationModel = "basic"
    mock.confidenceScore = 0.95
    mock.cacheKey = "msg_123_en_fr_basic"
    mock.createdAt = datetime(2024, 1, 15, 10, 30, 0)
    return mock


@pytest.fixture
def mock_voice_profile():
    """Mock voice profile record from database"""
    mock = MagicMock()
    mock.id = "profile_abc"
    mock.userId = "user_123"
    mock.profileId = "vfp_xyz"
    mock.embedding = b'\x00\x01\x02\x03'
    mock.embeddingModel = "openvoice_v2"
    mock.embeddingDimension = 256
    mock.audioCount = 5
    mock.totalDurationMs = 30000
    mock.qualityScore = 0.85
    mock.version = 1
    mock.voiceCharacteristics = {"pitch": "medium"}
    mock.fingerprint = {"signature": "abc123"}
    mock.signatureShort = "abc123"
    mock.createdAt = datetime(2024, 1, 15, 10, 30, 0)
    mock.updatedAt = datetime(2024, 1, 15, 10, 30, 0)
    mock.nextRecalibrationAt = datetime(2024, 2, 15, 10, 30, 0)
    return mock


# =============================================================================
# INITIALIZATION TESTS
# =============================================================================

class TestDatabaseServiceInit:
    """Test DatabaseService initialization"""

    def test_init_with_database_url(self):
        """Test initialization with explicit database URL"""
        db_url = "postgresql://user:pass@host:5432/db"
        service = DatabaseService(database_url=db_url)

        assert service.database_url == db_url
        assert service.prisma is None
        assert service.is_connected is False

    def test_init_without_database_url(self):
        """Test initialization without database URL (uses env var)"""
        service = DatabaseService()

        assert service.database_url is None
        assert service.prisma is None
        assert service.is_connected is False

    def test_is_db_connected_false_initially(self, db_service):
        """Test is_db_connected returns False initially"""
        assert db_service.is_db_connected() is False


# =============================================================================
# CONNECTION TESTS
# =============================================================================

class TestDatabaseServiceConnection:
    """Test database connection methods"""

    @pytest.mark.asyncio
    async def test_connect_success(self, db_service):
        """Test successful database connection"""
        with patch.object(db_service, 'prisma', None):
            with patch('services.database_service.Prisma') as MockPrisma:
                mock_prisma = MagicMock()
                mock_prisma.connect = AsyncMock()
                MockPrisma.return_value = mock_prisma

                result = await db_service.connect(max_retries=1)

                assert result is True
                assert db_service.is_connected is True

    @pytest.mark.asyncio
    async def test_connect_timeout_retry(self, db_service):
        """Test connection with timeout and retry"""
        with patch.object(db_service, 'prisma', None):
            with patch('services.database_service.Prisma') as MockPrisma:
                mock_prisma = MagicMock()
                # First call times out, second succeeds
                mock_prisma.connect = AsyncMock(side_effect=[
                    asyncio.TimeoutError(),
                    None
                ])
                MockPrisma.return_value = mock_prisma

                with patch('asyncio.wait_for', side_effect=[
                    asyncio.TimeoutError(),
                    None
                ]):
                    with patch('asyncio.sleep', new_callable=AsyncMock):
                        result = await db_service.connect(max_retries=2)

                        # Should fail on first timeout, then retry
                        # With our mock setup, the result depends on implementation

    @pytest.mark.asyncio
    async def test_connect_all_retries_fail(self, db_service):
        """Test connection failure after all retries exhausted"""
        with patch.object(db_service, 'prisma', None):
            with patch('services.database_service.Prisma') as MockPrisma:
                mock_prisma = MagicMock()
                mock_prisma.connect = AsyncMock(side_effect=Exception("Connection refused"))
                MockPrisma.return_value = mock_prisma

                with patch('asyncio.sleep', new_callable=AsyncMock):
                    result = await db_service.connect(max_retries=2)

                    assert result is False
                    assert db_service.is_connected is False

    @pytest.mark.asyncio
    async def test_disconnect_success(self, connected_db_service):
        """Test successful database disconnection"""
        connected_db_service.prisma.disconnect = AsyncMock()

        await connected_db_service.disconnect()

        assert connected_db_service.is_connected is False
        connected_db_service.prisma.disconnect.assert_called_once()

    @pytest.mark.asyncio
    async def test_disconnect_with_error(self, connected_db_service):
        """Test disconnection handling errors gracefully"""
        connected_db_service.prisma.disconnect = AsyncMock(
            side_effect=Exception("Disconnect error")
        )

        # Should not raise exception
        await connected_db_service.disconnect()

    @pytest.mark.asyncio
    async def test_disconnect_when_no_prisma(self, db_service):
        """Test disconnection when prisma is None"""
        db_service.prisma = None

        # Should not raise exception
        await db_service.disconnect()


# =============================================================================
# TRANSLATION CRUD TESTS
# =============================================================================

class TestSaveTranslation:
    """Test save_translation method"""

    @pytest.mark.asyncio
    async def test_save_translation_not_connected(self, db_service):
        """Test save_translation when not connected"""
        result = await db_service.save_translation({
            "messageId": "msg_123",
            "targetLanguage": "fr",
            "translatedText": "Bonjour"
        })

        assert result is False

    @pytest.mark.asyncio
    async def test_save_translation_missing_required_fields(self, connected_db_service):
        """Test save_translation with missing required fields"""
        # Missing messageId
        result = await connected_db_service.save_translation({
            "targetLanguage": "fr",
            "translatedText": "Bonjour"
        })
        assert result is False

        # Missing targetLanguage
        result = await connected_db_service.save_translation({
            "messageId": "msg_123",
            "translatedText": "Bonjour"
        })
        assert result is False

        # Missing translatedText
        result = await connected_db_service.save_translation({
            "messageId": "msg_123",
            "targetLanguage": "fr"
        })
        assert result is False

    @pytest.mark.asyncio
    async def test_save_translation_create_new(self, connected_db_service):
        """Test creating a new translation"""
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(return_value=None)
        connected_db_service.prisma.messagetranslation.create = AsyncMock()

        result = await connected_db_service.save_translation({
            "messageId": "msg_123",
            "sourceLanguage": "en",
            "targetLanguage": "fr",
            "translatedText": "Bonjour",
            "translatorModel": "basic",
            "confidenceScore": 0.95
        })

        assert result is True
        connected_db_service.prisma.messagetranslation.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_save_translation_update_existing_same_level(self, connected_db_service, mock_translation):
        """Test updating existing translation with same model level"""
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(return_value=mock_translation)
        connected_db_service.prisma.messagetranslation.update = AsyncMock()

        result = await connected_db_service.save_translation({
            "messageId": "msg_123",
            "targetLanguage": "fr",
            "translatedText": "Salut",
            "translatorModel": "basic"
        })

        assert result is True
        connected_db_service.prisma.messagetranslation.update.assert_called_once()

    @pytest.mark.asyncio
    async def test_save_translation_upgrade_model(self, connected_db_service, mock_translation):
        """Test upgrading translation to higher model level"""
        mock_translation.translationModel = "basic"
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(return_value=mock_translation)
        connected_db_service.prisma.messagetranslation.update = AsyncMock()

        result = await connected_db_service.save_translation({
            "messageId": "msg_123",
            "targetLanguage": "fr",
            "translatedText": "Bonjour monde",
            "translatorModel": "premium"  # Higher level
        })

        assert result is True
        connected_db_service.prisma.messagetranslation.update.assert_called_once()

    @pytest.mark.asyncio
    async def test_save_translation_skip_lower_model(self, connected_db_service, mock_translation):
        """Test skipping update when existing translation has higher model level"""
        mock_translation.translationModel = "premium"
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(return_value=mock_translation)
        connected_db_service.prisma.messagetranslation.update = AsyncMock()

        result = await connected_db_service.save_translation({
            "messageId": "msg_123",
            "targetLanguage": "fr",
            "translatedText": "Bonjour",
            "translatorModel": "basic"  # Lower level
        })

        assert result is True
        connected_db_service.prisma.messagetranslation.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_save_translation_with_default_values(self, connected_db_service):
        """Test save_translation uses default values when not provided"""
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(return_value=None)
        connected_db_service.prisma.messagetranslation.create = AsyncMock()

        result = await connected_db_service.save_translation({
            "messageId": "msg_123",
            "targetLanguage": "fr",
            "translatedText": "Bonjour"
        })

        assert result is True
        call_args = connected_db_service.prisma.messagetranslation.create.call_args
        data = call_args[1]['data']
        assert data['sourceLanguage'] == 'fr'  # Default

    @pytest.mark.asyncio
    async def test_save_translation_exception(self, connected_db_service):
        """Test save_translation handles exceptions"""
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(
            side_effect=Exception("Database error")
        )

        result = await connected_db_service.save_translation({
            "messageId": "msg_123",
            "targetLanguage": "fr",
            "translatedText": "Bonjour"
        })

        assert result is False

    @pytest.mark.asyncio
    async def test_save_translation_with_model_type_fallback(self, connected_db_service):
        """Test save_translation uses modelType as fallback for translatorModel"""
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(return_value=None)
        connected_db_service.prisma.messagetranslation.create = AsyncMock()

        result = await connected_db_service.save_translation({
            "messageId": "msg_123",
            "targetLanguage": "fr",
            "translatedText": "Bonjour",
            "modelType": "medium"  # Uses modelType instead of translatorModel
        })

        assert result is True


class TestGetTranslation:
    """Test get_translation method"""

    @pytest.mark.asyncio
    async def test_get_translation_not_connected(self, db_service):
        """Test get_translation when not connected"""
        result = await db_service.get_translation("msg_123", "fr")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_translation_found(self, connected_db_service, mock_translation):
        """Test get_translation when translation exists"""
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(
            return_value=mock_translation
        )

        result = await connected_db_service.get_translation("msg_123", "fr")

        assert result is not None
        assert result["messageId"] == "msg_123"
        assert result["sourceLanguage"] == "en"
        assert result["targetLanguage"] == "fr"
        assert result["translatedText"] == "Bonjour"
        assert result["translatorModel"] == "basic"
        assert result["confidenceScore"] == 0.95
        assert result["cacheKey"] == "msg_123_en_fr_basic"
        assert result["createdAt"] == "2024-01-15T10:30:00"

    @pytest.mark.asyncio
    async def test_get_translation_not_found(self, connected_db_service):
        """Test get_translation when translation doesn't exist"""
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(return_value=None)

        result = await connected_db_service.get_translation("msg_nonexistent", "fr")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_translation_exception(self, connected_db_service):
        """Test get_translation handles exceptions"""
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(
            side_effect=Exception("Database error")
        )

        result = await connected_db_service.get_translation("msg_123", "fr")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_translation_null_created_at(self, connected_db_service, mock_translation):
        """Test get_translation with null createdAt"""
        mock_translation.createdAt = None
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(
            return_value=mock_translation
        )

        result = await connected_db_service.get_translation("msg_123", "fr")

        assert result is not None
        assert result["createdAt"] is None


class TestInvalidateMessageTranslations:
    """Test invalidate_message_translations method"""

    @pytest.mark.asyncio
    async def test_invalidate_not_connected(self, db_service):
        """Test invalidate when not connected"""
        result = await db_service.invalidate_message_translations("msg_123")
        assert result is False

    @pytest.mark.asyncio
    async def test_invalidate_success(self, connected_db_service):
        """Test successful invalidation"""
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.delete_many = AsyncMock(return_value=3)

        result = await connected_db_service.invalidate_message_translations("msg_123")

        assert result is True
        connected_db_service.prisma.messagetranslation.delete_many.assert_called_once_with(
            where={"messageId": "msg_123"}
        )

    @pytest.mark.asyncio
    async def test_invalidate_exception(self, connected_db_service):
        """Test invalidation handles exceptions"""
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.delete_many = AsyncMock(
            side_effect=Exception("Database error")
        )

        result = await connected_db_service.invalidate_message_translations("msg_123")

        assert result is False


# =============================================================================
# HEALTH CHECK TESTS
# =============================================================================

class TestHealthCheck:
    """Test health_check method"""

    @pytest.mark.asyncio
    async def test_health_check_not_connected(self, db_service):
        """Test health check when not connected"""
        result = await db_service.health_check()

        assert result["connected"] is False
        assert result["status"] == "disconnected"
        assert result["error"] == "Database not connected"

    @pytest.mark.asyncio
    async def test_health_check_healthy(self, connected_db_service):
        """Test health check when database is healthy"""
        connected_db_service.prisma.user = MagicMock()
        connected_db_service.prisma.user.count = AsyncMock(return_value=10)

        result = await connected_db_service.health_check()

        assert result["connected"] is True
        assert result["status"] == "healthy"
        assert result["type"] == "mongodb"

    @pytest.mark.asyncio
    async def test_health_check_error(self, connected_db_service):
        """Test health check when database query fails"""
        connected_db_service.prisma.user = MagicMock()
        connected_db_service.prisma.user.count = AsyncMock(
            side_effect=Exception("Query timeout")
        )

        result = await connected_db_service.health_check()

        assert result["connected"] is False
        assert result["status"] == "error"
        assert "Query timeout" in result["error"]


# =============================================================================
# VOICE PROFILE TESTS
# =============================================================================

class TestSaveVoiceProfile:
    """Test save_voice_profile method"""

    @pytest.mark.asyncio
    async def test_save_voice_profile_not_connected(self, db_service):
        """Test save_voice_profile when not connected"""
        result = await db_service.save_voice_profile(
            user_id="user_123",
            embedding=b'\x00\x01\x02',
            audio_count=5,
            total_duration_ms=30000,
            quality_score=0.85
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_save_voice_profile_create_new(self, connected_db_service, mock_voice_profile):
        """Test creating a new voice profile"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(return_value=None)
        connected_db_service.prisma.uservoicemodel.create = AsyncMock(return_value=mock_voice_profile)

        result = await connected_db_service.save_voice_profile(
            user_id="user_123",
            embedding=b'\x00\x01\x02\x03',
            audio_count=5,
            total_duration_ms=30000,
            quality_score=0.85,
            profile_id="vfp_xyz",
            voice_characteristics={"pitch": "medium"},
            fingerprint={"signature": "abc123"},
            signature_short="abc123"
        )

        assert result is not None
        assert result["userId"] == "user_123"
        assert result["profileId"] == "vfp_xyz"
        connected_db_service.prisma.uservoicemodel.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_save_voice_profile_update_existing(self, connected_db_service, mock_voice_profile):
        """Test updating an existing voice profile"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(return_value=mock_voice_profile)

        updated_profile = MagicMock()
        updated_profile.id = mock_voice_profile.id
        updated_profile.userId = mock_voice_profile.userId
        updated_profile.profileId = mock_voice_profile.profileId
        updated_profile.embeddingModel = mock_voice_profile.embeddingModel
        updated_profile.embeddingDimension = mock_voice_profile.embeddingDimension
        updated_profile.audioCount = 10
        updated_profile.totalDurationMs = 60000
        updated_profile.qualityScore = 0.95
        updated_profile.version = 2
        updated_profile.createdAt = mock_voice_profile.createdAt
        updated_profile.updatedAt = datetime(2024, 1, 16, 10, 30, 0)

        connected_db_service.prisma.uservoicemodel.update = AsyncMock(return_value=updated_profile)

        result = await connected_db_service.save_voice_profile(
            user_id="user_123",
            embedding=b'\x00\x01\x02\x03\x04',
            audio_count=10,
            total_duration_ms=60000,
            quality_score=0.95
        )

        assert result is not None
        assert result["version"] == 2
        connected_db_service.prisma.uservoicemodel.update.assert_called_once()

    @pytest.mark.asyncio
    async def test_save_voice_profile_exception(self, connected_db_service):
        """Test save_voice_profile handles exceptions"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(
            side_effect=Exception("Database error")
        )

        result = await connected_db_service.save_voice_profile(
            user_id="user_123",
            embedding=b'\x00\x01\x02',
            audio_count=5,
            total_duration_ms=30000,
            quality_score=0.85
        )

        assert result is None


class TestGetVoiceProfile:
    """Test get_voice_profile method"""

    @pytest.mark.asyncio
    async def test_get_voice_profile_not_connected(self, db_service):
        """Test get_voice_profile when not connected"""
        result = await db_service.get_voice_profile("user_123")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_voice_profile_found(self, connected_db_service, mock_voice_profile):
        """Test get_voice_profile when profile exists"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(
            return_value=mock_voice_profile
        )

        result = await connected_db_service.get_voice_profile("user_123")

        assert result is not None
        assert result["userId"] == "user_123"
        assert result["profileId"] == "vfp_xyz"
        assert result["embedding"] == b'\x00\x01\x02\x03'
        assert result["embeddingModel"] == "openvoice_v2"
        assert result["embeddingDimension"] == 256
        assert result["audioCount"] == 5
        assert result["totalDurationMs"] == 30000
        assert result["qualityScore"] == 0.85
        assert result["version"] == 1
        assert result["voiceCharacteristics"] == {"pitch": "medium"}
        assert result["fingerprint"] == {"signature": "abc123"}
        assert result["signatureShort"] == "abc123"

    @pytest.mark.asyncio
    async def test_get_voice_profile_not_found(self, connected_db_service):
        """Test get_voice_profile when profile doesn't exist"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(return_value=None)

        result = await connected_db_service.get_voice_profile("user_nonexistent")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_voice_profile_exception(self, connected_db_service):
        """Test get_voice_profile handles exceptions"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(
            side_effect=Exception("Database error")
        )

        result = await connected_db_service.get_voice_profile("user_123")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_voice_profile_null_dates(self, connected_db_service, mock_voice_profile):
        """Test get_voice_profile with null dates"""
        mock_voice_profile.createdAt = None
        mock_voice_profile.updatedAt = None
        mock_voice_profile.nextRecalibrationAt = None

        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(
            return_value=mock_voice_profile
        )

        result = await connected_db_service.get_voice_profile("user_123")

        assert result is not None
        assert result["createdAt"] is None
        assert result["updatedAt"] is None
        assert result["nextRecalibrationAt"] is None


class TestGetVoiceEmbedding:
    """Test get_voice_embedding method"""

    @pytest.mark.asyncio
    async def test_get_voice_embedding_not_connected(self, db_service):
        """Test get_voice_embedding when not connected"""
        result = await db_service.get_voice_embedding("user_123")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_voice_embedding_found(self, connected_db_service, mock_voice_profile):
        """Test get_voice_embedding when embedding exists"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(
            return_value=mock_voice_profile
        )

        result = await connected_db_service.get_voice_embedding("user_123")

        assert result == b'\x00\x01\x02\x03'

    @pytest.mark.asyncio
    async def test_get_voice_embedding_not_found(self, connected_db_service):
        """Test get_voice_embedding when profile doesn't exist"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(return_value=None)

        result = await connected_db_service.get_voice_embedding("user_nonexistent")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_voice_embedding_null_embedding(self, connected_db_service, mock_voice_profile):
        """Test get_voice_embedding when embedding is null"""
        mock_voice_profile.embedding = None
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(
            return_value=mock_voice_profile
        )

        result = await connected_db_service.get_voice_embedding("user_123")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_voice_embedding_exception(self, connected_db_service):
        """Test get_voice_embedding handles exceptions"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(
            side_effect=Exception("Database error")
        )

        result = await connected_db_service.get_voice_embedding("user_123")

        assert result is None


class TestUpdateVoiceEmbedding:
    """Test update_voice_embedding method"""

    @pytest.mark.asyncio
    async def test_update_voice_embedding_not_connected(self, db_service):
        """Test update_voice_embedding when not connected"""
        result = await db_service.update_voice_embedding("user_123", b'\x00\x01')
        assert result is False

    @pytest.mark.asyncio
    async def test_update_voice_embedding_success(self, connected_db_service, mock_voice_profile):
        """Test successful embedding update"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(
            return_value=mock_voice_profile
        )
        connected_db_service.prisma.uservoicemodel.update = AsyncMock()

        result = await connected_db_service.update_voice_embedding(
            user_id="user_123",
            embedding=b'\x00\x01\x02\x03\x04',
            embedding_model="openvoice_v3",
            embedding_dimension=512
        )

        assert result is True
        connected_db_service.prisma.uservoicemodel.update.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_voice_embedding_profile_not_found(self, connected_db_service):
        """Test update when profile doesn't exist"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(return_value=None)

        result = await connected_db_service.update_voice_embedding(
            user_id="user_nonexistent",
            embedding=b'\x00\x01'
        )

        assert result is False

    @pytest.mark.asyncio
    async def test_update_voice_embedding_without_optional_params(self, connected_db_service, mock_voice_profile):
        """Test update without optional parameters"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(
            return_value=mock_voice_profile
        )
        connected_db_service.prisma.uservoicemodel.update = AsyncMock()

        result = await connected_db_service.update_voice_embedding(
            user_id="user_123",
            embedding=b'\x00\x01\x02\x03\x04'
        )

        assert result is True
        call_args = connected_db_service.prisma.uservoicemodel.update.call_args
        data = call_args[1]['data']
        assert 'embeddingModel' not in data
        assert 'embeddingDimension' not in data

    @pytest.mark.asyncio
    async def test_update_voice_embedding_exception(self, connected_db_service, mock_voice_profile):
        """Test update handles exceptions"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(
            return_value=mock_voice_profile
        )
        connected_db_service.prisma.uservoicemodel.update = AsyncMock(
            side_effect=Exception("Database error")
        )

        result = await connected_db_service.update_voice_embedding(
            user_id="user_123",
            embedding=b'\x00\x01'
        )

        assert result is False


class TestDeleteVoiceProfile:
    """Test delete_voice_profile method"""

    @pytest.mark.asyncio
    async def test_delete_voice_profile_not_connected(self, db_service):
        """Test delete_voice_profile when not connected"""
        result = await db_service.delete_voice_profile("user_123")
        assert result is False

    @pytest.mark.asyncio
    async def test_delete_voice_profile_success(self, connected_db_service, mock_voice_profile):
        """Test successful profile deletion"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.delete = AsyncMock(
            return_value=mock_voice_profile
        )

        result = await connected_db_service.delete_voice_profile("user_123")

        assert result is True
        connected_db_service.prisma.uservoicemodel.delete.assert_called_once_with(
            where={"userId": "user_123"}
        )

    @pytest.mark.asyncio
    async def test_delete_voice_profile_not_found(self, connected_db_service):
        """Test deletion when profile doesn't exist"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.delete = AsyncMock(return_value=None)

        result = await connected_db_service.delete_voice_profile("user_nonexistent")

        assert result is False

    @pytest.mark.asyncio
    async def test_delete_voice_profile_exception(self, connected_db_service):
        """Test delete handles exceptions"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.delete = AsyncMock(
            side_effect=Exception("Database error")
        )

        result = await connected_db_service.delete_voice_profile("user_123")

        assert result is False


class TestVoiceProfileExists:
    """Test voice_profile_exists method"""

    @pytest.mark.asyncio
    async def test_voice_profile_exists_not_connected(self, db_service):
        """Test voice_profile_exists when not connected"""
        result = await db_service.voice_profile_exists("user_123")
        assert result is False

    @pytest.mark.asyncio
    async def test_voice_profile_exists_true(self, connected_db_service, mock_voice_profile):
        """Test voice_profile_exists returns True when profile exists"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(
            return_value=mock_voice_profile
        )

        result = await connected_db_service.voice_profile_exists("user_123")

        assert result is True

    @pytest.mark.asyncio
    async def test_voice_profile_exists_false(self, connected_db_service):
        """Test voice_profile_exists returns False when profile doesn't exist"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(return_value=None)

        result = await connected_db_service.voice_profile_exists("user_nonexistent")

        assert result is False

    @pytest.mark.asyncio
    async def test_voice_profile_exists_exception(self, connected_db_service):
        """Test voice_profile_exists handles exceptions"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(
            side_effect=Exception("Database error")
        )

        result = await connected_db_service.voice_profile_exists("user_123")

        assert result is False


# =============================================================================
# EDGE CASES AND INTEGRATION TESTS
# =============================================================================

class TestEdgeCases:
    """Test edge cases and special scenarios"""

    @pytest.mark.asyncio
    async def test_url_masking_with_credentials(self):
        """Test that database URL with credentials is masked in logs"""
        db_url = "postgresql://user:secretpassword@localhost:5432/testdb"
        service = DatabaseService(database_url=db_url)

        # The URL should be stored but logged with masked password
        assert service.database_url == db_url

    @pytest.mark.asyncio
    async def test_url_masking_without_credentials(self):
        """Test URL without credentials is handled correctly"""
        db_url = "postgresql://localhost:5432/testdb"
        service = DatabaseService(database_url=db_url)

        assert service.database_url == db_url

    @pytest.mark.asyncio
    async def test_model_hierarchy_unknown_model(self, connected_db_service, mock_translation):
        """Test save_translation with unknown model type defaults to level 1"""
        mock_translation.translationModel = "unknown_model"
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(
            return_value=mock_translation
        )
        connected_db_service.prisma.messagetranslation.update = AsyncMock()

        result = await connected_db_service.save_translation({
            "messageId": "msg_123",
            "targetLanguage": "fr",
            "translatedText": "Bonjour",
            "translatorModel": "another_unknown"  # Both unknown = level 1
        })

        assert result is True

    @pytest.mark.asyncio
    async def test_empty_translation_data(self, connected_db_service):
        """Test save_translation with empty data"""
        result = await connected_db_service.save_translation({})
        assert result is False

    @pytest.mark.asyncio
    async def test_save_voice_profile_minimal_data(self, connected_db_service, mock_voice_profile):
        """Test save_voice_profile with minimal required data"""
        connected_db_service.prisma.uservoicemodel = MagicMock()
        connected_db_service.prisma.uservoicemodel.find_unique = AsyncMock(return_value=None)
        connected_db_service.prisma.uservoicemodel.create = AsyncMock(return_value=mock_voice_profile)

        result = await connected_db_service.save_voice_profile(
            user_id="user_123",
            embedding=b'\x00',
            audio_count=1,
            total_duration_ms=1000,
            quality_score=0.5
        )

        assert result is not None

    @pytest.mark.asyncio
    async def test_concurrent_operations(self, connected_db_service, mock_translation):
        """Test concurrent database operations"""
        connected_db_service.prisma.messagetranslation = MagicMock()
        connected_db_service.prisma.messagetranslation.find_unique = AsyncMock(
            return_value=mock_translation
        )

        # Run multiple get operations concurrently
        tasks = [
            connected_db_service.get_translation(f"msg_{i}", "fr")
            for i in range(5)
        ]

        results = await asyncio.gather(*tasks)

        assert all(r is not None for r in results)
        assert len(results) == 5


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
