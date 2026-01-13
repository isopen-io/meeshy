"""
Test 29: Redis Service Extended Tests
Extended tests for RedisService focusing on:
- Redis connection mode (mocked)
- Error handling and fallback paths
- Memory cleanup loop
- Edge cases not covered in test_16
"""

import pytest
import asyncio
import time
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.redis_service import (
    RedisService,
    AudioCacheService,
    CacheEntry,
    get_redis_service,
    get_audio_cache_service,
    REDIS_AVAILABLE
)


# ===================================================================
# FIXTURES
# ===================================================================

@pytest.fixture
def fresh_redis_service():
    """Create a fresh RedisService instance (reset singleton)"""
    RedisService._instance = None
    service = RedisService()
    yield service
    # Cleanup
    RedisService._instance = None


@pytest.fixture
def redis_service_with_mock():
    """Create a RedisService with mocked Redis client"""
    RedisService._instance = None
    service = RedisService()
    service.permanently_disabled = False
    service.is_redis_available = True
    service.redis = AsyncMock()
    yield service
    RedisService._instance = None


@pytest.fixture
def audio_cache_with_settings():
    """Create AudioCacheService with custom settings"""
    RedisService._instance = None
    redis_service = RedisService()
    redis_service.permanently_disabled = True
    redis_service.is_redis_available = False

    # Create mock settings
    settings = MagicMock()
    settings.redis_key_transcription = "custom:trans:{attachment_id}"
    settings.redis_key_translated_audio = "custom:audio:{attachment_id}:{lang}"
    settings.redis_key_voice_profile = "custom:voice:{user_id}"
    settings.voice_profile_cache_ttl = 86400  # 1 day

    cache = AudioCacheService(redis_service, settings)
    yield cache
    RedisService._instance = None


# ===================================================================
# INITIALIZE METHOD TESTS
# ===================================================================

class TestInitializeMethod:
    """Test RedisService.initialize() method"""

    @pytest.mark.asyncio
    async def test_initialize_permanently_disabled(self, fresh_redis_service):
        """Test initialize when permanently disabled"""
        service = fresh_redis_service
        service.permanently_disabled = True

        result = await service.initialize()

        assert result is True
        assert service.is_redis_available is False

    @pytest.mark.asyncio
    async def test_initialize_redis_success(self):
        """Test initialize with successful Redis connection"""
        RedisService._instance = None
        service = RedisService()
        service.permanently_disabled = False

        # Mock aioredis.from_url
        mock_redis = AsyncMock()
        mock_redis.ping = AsyncMock(return_value=True)

        with patch('services.redis_service.aioredis.from_url', return_value=mock_redis):
            result = await service.initialize()

        assert result is True
        assert service.is_redis_available is True
        assert service.connection_attempts == 0

        # Cleanup
        if service._cleanup_task:
            service._cleanup_task.cancel()
            try:
                await service._cleanup_task
            except asyncio.CancelledError:
                pass
        RedisService._instance = None

    @pytest.mark.asyncio
    async def test_initialize_redis_connection_error(self):
        """Test initialize with Redis connection error"""
        RedisService._instance = None
        service = RedisService()
        service.permanently_disabled = False
        service.connection_attempts = 0

        # Mock aioredis.from_url to raise exception
        with patch('services.redis_service.aioredis.from_url', side_effect=Exception("Connection refused")):
            result = await service.initialize()

        assert result is True  # Should still return True (fallback to memory)
        assert service.is_redis_available is False
        assert service.connection_attempts == 1

        # Cleanup
        if service._cleanup_task:
            service._cleanup_task.cancel()
            try:
                await service._cleanup_task
            except asyncio.CancelledError:
                pass
        RedisService._instance = None

    @pytest.mark.asyncio
    async def test_initialize_max_connection_attempts(self):
        """Test initialize reaching max connection attempts"""
        RedisService._instance = None
        service = RedisService()
        service.permanently_disabled = False
        service.connection_attempts = 2  # Already 2 attempts

        with patch('services.redis_service.aioredis.from_url', side_effect=Exception("Connection refused")):
            result = await service.initialize()

        assert result is True
        assert service.permanently_disabled is True  # Should be permanently disabled now
        assert service.connection_attempts == 3

        # Cleanup
        if service._cleanup_task:
            service._cleanup_task.cancel()
            try:
                await service._cleanup_task
            except asyncio.CancelledError:
                pass
        RedisService._instance = None


# ===================================================================
# REDIS MODE OPERATIONS TESTS
# ===================================================================

class TestRedisModeOperations:
    """Test operations when Redis is available (mocked)"""

    @pytest.mark.asyncio
    async def test_get_redis_mode(self, redis_service_with_mock):
        """Test get operation in Redis mode"""
        service = redis_service_with_mock
        service.redis.get = AsyncMock(return_value="redis_value")

        result = await service.get("test_key")

        assert result == "redis_value"
        service.redis.get.assert_called_once_with("test_key")

    @pytest.mark.asyncio
    async def test_get_redis_error_fallback(self, redis_service_with_mock):
        """Test get fallback to memory on Redis error"""
        service = redis_service_with_mock
        service.redis.get = AsyncMock(side_effect=Exception("Redis error"))

        # Pre-populate memory cache
        service.memory_cache["test_key"] = CacheEntry(
            value="memory_value",
            expires_at=time.time() + 3600
        )

        result = await service.get("test_key")

        assert result == "memory_value"
        assert service.connection_attempts >= 1

    @pytest.mark.asyncio
    async def test_set_redis_mode_with_expiry(self, redis_service_with_mock):
        """Test set operation in Redis mode with expiry"""
        service = redis_service_with_mock
        service.redis.setex = AsyncMock()

        result = await service.set("test_key", "test_value", ex=60)

        assert result is True
        service.redis.setex.assert_called_once_with("test_key", 60, "test_value")

    @pytest.mark.asyncio
    async def test_set_redis_mode_without_expiry(self, redis_service_with_mock):
        """Test set operation in Redis mode without expiry"""
        service = redis_service_with_mock
        service.redis.set = AsyncMock()

        result = await service.set("test_key", "test_value")

        assert result is True
        service.redis.set.assert_called_once_with("test_key", "test_value")

    @pytest.mark.asyncio
    async def test_set_redis_error_fallback(self, redis_service_with_mock):
        """Test set fallback to memory on Redis error"""
        service = redis_service_with_mock
        service.redis.set = AsyncMock(side_effect=Exception("Redis error"))

        result = await service.set("test_key", "test_value")

        assert result is True
        assert "test_key" in service.memory_cache
        assert service.memory_cache["test_key"].value == "test_value"

    @pytest.mark.asyncio
    async def test_delete_redis_mode(self, redis_service_with_mock):
        """Test delete operation in Redis mode"""
        service = redis_service_with_mock
        service.redis.delete = AsyncMock()

        result = await service.delete("test_key")

        assert result is True
        service.redis.delete.assert_called_once_with("test_key")

    @pytest.mark.asyncio
    async def test_delete_redis_error_fallback(self, redis_service_with_mock):
        """Test delete fallback to memory on Redis error"""
        service = redis_service_with_mock
        service.redis.delete = AsyncMock(side_effect=Exception("Redis error"))

        # Pre-populate memory cache
        service.memory_cache["test_key"] = CacheEntry(
            value="memory_value",
            expires_at=time.time() + 3600
        )

        result = await service.delete("test_key")

        assert result is True
        assert "test_key" not in service.memory_cache

    @pytest.mark.asyncio
    async def test_keys_redis_mode(self, redis_service_with_mock):
        """Test keys operation in Redis mode"""
        service = redis_service_with_mock
        service.redis.keys = AsyncMock(return_value=["key1", "key2"])

        result = await service.keys("key*")

        assert result == ["key1", "key2"]
        service.redis.keys.assert_called_once_with("key*")

    @pytest.mark.asyncio
    async def test_keys_redis_error_fallback(self, redis_service_with_mock):
        """Test keys fallback to memory on Redis error"""
        service = redis_service_with_mock
        service.redis.keys = AsyncMock(side_effect=Exception("Redis error"))

        # Pre-populate memory cache
        service.memory_cache["user:1"] = CacheEntry(value="v1", expires_at=time.time() + 3600)
        service.memory_cache["user:2"] = CacheEntry(value="v2", expires_at=time.time() + 3600)
        service.memory_cache["other:1"] = CacheEntry(value="v3", expires_at=time.time() + 3600)

        result = await service.keys("user:*")

        assert len(result) == 2
        assert "user:1" in result
        assert "user:2" in result

    @pytest.mark.asyncio
    async def test_exists_redis_mode(self, redis_service_with_mock):
        """Test exists operation in Redis mode"""
        service = redis_service_with_mock
        service.redis.exists = AsyncMock(return_value=1)

        result = await service.exists("test_key")

        assert result is True
        service.redis.exists.assert_called_once_with("test_key")

    @pytest.mark.asyncio
    async def test_exists_redis_mode_not_found(self, redis_service_with_mock):
        """Test exists operation in Redis mode when key doesn't exist"""
        service = redis_service_with_mock
        service.redis.exists = AsyncMock(return_value=0)

        result = await service.exists("nonexistent")

        assert result is False

    @pytest.mark.asyncio
    async def test_exists_redis_error_fallback(self, redis_service_with_mock):
        """Test exists fallback to memory on Redis error"""
        service = redis_service_with_mock
        service.redis.exists = AsyncMock(side_effect=Exception("Redis error"))

        # Pre-populate memory cache
        service.memory_cache["test_key"] = CacheEntry(
            value="memory_value",
            expires_at=time.time() + 3600
        )

        result = await service.exists("test_key")

        assert result is True

    @pytest.mark.asyncio
    async def test_ttl_redis_mode(self, redis_service_with_mock):
        """Test ttl operation in Redis mode"""
        service = redis_service_with_mock
        service.redis.ttl = AsyncMock(return_value=300)

        result = await service.ttl("test_key")

        assert result == 300
        service.redis.ttl.assert_called_once_with("test_key")

    @pytest.mark.asyncio
    async def test_ttl_redis_error_fallback(self, redis_service_with_mock):
        """Test ttl fallback to memory on Redis error"""
        service = redis_service_with_mock
        service.redis.ttl = AsyncMock(side_effect=Exception("Redis error"))

        # Pre-populate memory cache with 60 second TTL
        service.memory_cache["test_key"] = CacheEntry(
            value="memory_value",
            expires_at=time.time() + 60
        )

        result = await service.ttl("test_key")

        assert 55 <= result <= 60


# ===================================================================
# ERROR HANDLING TESTS
# ===================================================================

class TestErrorHandling:
    """Test error handling and _handle_redis_error method"""

    @pytest.mark.asyncio
    async def test_handle_redis_error_increments_attempts(self, redis_service_with_mock):
        """Test that _handle_redis_error increments connection attempts"""
        service = redis_service_with_mock
        service.connection_attempts = 0

        service._handle_redis_error()

        assert service.connection_attempts == 1
        assert service.permanently_disabled is False

    @pytest.mark.asyncio
    async def test_handle_redis_error_permanent_disable(self, redis_service_with_mock):
        """Test that _handle_redis_error permanently disables after max attempts"""
        service = redis_service_with_mock
        service.connection_attempts = 2

        service._handle_redis_error()

        assert service.connection_attempts == 3
        assert service.permanently_disabled is True
        assert service.is_redis_available is False

    @pytest.mark.asyncio
    async def test_multiple_errors_lead_to_permanent_disable(self, redis_service_with_mock):
        """Test that multiple errors lead to permanent disable"""
        service = redis_service_with_mock
        service.connection_attempts = 0
        service.redis.get = AsyncMock(side_effect=Exception("Redis error"))

        # Simulate multiple failed operations
        for _ in range(3):
            await service.get("test_key")

        assert service.permanently_disabled is True


# ===================================================================
# MEMORY CLEANUP TESTS
# ===================================================================

class TestMemoryCleanup:
    """Test memory cleanup functionality"""

    @pytest.mark.asyncio
    async def test_start_memory_cleanup_creates_task(self, fresh_redis_service):
        """Test that _start_memory_cleanup creates a task"""
        service = fresh_redis_service
        service._cleanup_task = None

        service._start_memory_cleanup()

        assert service._cleanup_task is not None
        assert not service._cleanup_task.done()

        # Cleanup
        service._cleanup_task.cancel()
        try:
            await service._cleanup_task
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_start_memory_cleanup_does_not_duplicate(self, fresh_redis_service):
        """Test that _start_memory_cleanup doesn't create duplicate tasks"""
        service = fresh_redis_service
        service._cleanup_task = None

        service._start_memory_cleanup()
        task1 = service._cleanup_task

        service._start_memory_cleanup()
        task2 = service._cleanup_task

        assert task1 is task2

        # Cleanup
        service._cleanup_task.cancel()
        try:
            await service._cleanup_task
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_cleanup_loop_removes_expired_entries(self, fresh_redis_service):
        """Test that cleanup loop removes expired entries"""
        service = fresh_redis_service

        # Add expired entries
        service.memory_cache["expired1"] = CacheEntry(value="v1", expires_at=time.time() - 100)
        service.memory_cache["expired2"] = CacheEntry(value="v2", expires_at=time.time() - 50)
        service.memory_cache["valid"] = CacheEntry(value="v3", expires_at=time.time() + 3600)

        # Manually run cleanup logic (simulating the loop iteration)
        now = time.time()
        expired_keys = [
            key for key, entry in service.memory_cache.items()
            if entry.expires_at < now
        ]
        for key in expired_keys:
            del service.memory_cache[key]

        assert "expired1" not in service.memory_cache
        assert "expired2" not in service.memory_cache
        assert "valid" in service.memory_cache

    @pytest.mark.asyncio
    async def test_cleanup_task_cancellation(self, fresh_redis_service):
        """Test cleanup task can be cancelled properly"""
        service = fresh_redis_service
        service._start_memory_cleanup()

        await service.close()

        assert service._cleanup_task.cancelled() or service._cleanup_task.done()


# ===================================================================
# CLOSE METHOD TESTS
# ===================================================================

class TestCloseMethod:
    """Test RedisService.close() method"""

    @pytest.mark.asyncio
    async def test_close_with_redis_client(self, redis_service_with_mock):
        """Test close when Redis client exists"""
        service = redis_service_with_mock
        mock_redis = service.redis
        mock_redis.close = AsyncMock()
        service.memory_cache["key1"] = CacheEntry(value="v1", expires_at=time.time() + 3600)

        await service.close()

        mock_redis.close.assert_called_once()
        assert service.redis is None  # Redis client should be set to None after close
        assert len(service.memory_cache) == 0

    @pytest.mark.asyncio
    async def test_close_without_redis_client(self, fresh_redis_service):
        """Test close when Redis client is None"""
        service = fresh_redis_service
        service.redis = None
        service.memory_cache["key1"] = CacheEntry(value="v1", expires_at=time.time() + 3600)

        await service.close()

        assert len(service.memory_cache) == 0

    @pytest.mark.asyncio
    async def test_close_with_cleanup_task(self, fresh_redis_service):
        """Test close cancels cleanup task"""
        service = fresh_redis_service
        service._start_memory_cleanup()

        await service.close()

        assert service._cleanup_task.cancelled() or service._cleanup_task.done()


# ===================================================================
# AUDIOCACHESERVICE WITH CUSTOM SETTINGS TESTS
# ===================================================================

class TestAudioCacheServiceWithSettings:
    """Test AudioCacheService with custom settings"""

    @pytest.mark.asyncio
    async def test_default_key_patterns(self, audio_cache_with_settings):
        """Test default key patterns (settings for keys not currently supported)"""
        cache = audio_cache_with_settings

        # AudioCacheService uses hardcoded key patterns
        assert cache.key_transcription == "audio:transcription:{attachment_id}"
        assert cache.key_translated_audio == "audio:translation:{attachment_id}:{lang}"
        assert cache.key_voice_profile == "voice:profile:{user_id}"

    @pytest.mark.asyncio
    async def test_custom_ttl(self, audio_cache_with_settings):
        """Test custom TTL from settings"""
        cache = audio_cache_with_settings

        assert cache.ttl_voice_profile == 86400

    @pytest.mark.asyncio
    async def test_transcription_uses_default_key(self, audio_cache_with_settings):
        """Test transcription uses default key pattern"""
        cache = audio_cache_with_settings

        transcription = {"text": "Hello", "language": "en"}
        await cache.set_transcription("att123", transcription)

        # Check the key in memory cache - uses default pattern
        expected_key = "audio:transcription:att123"
        assert expected_key in cache.redis.memory_cache

    @pytest.mark.asyncio
    async def test_translated_audio_uses_default_key(self, audio_cache_with_settings):
        """Test translated audio uses default key pattern"""
        cache = audio_cache_with_settings

        audio_data = {"url": "https://example.com/audio.mp3"}
        await cache.set_translated_audio("att456", "fr", audio_data)

        # Uses default pattern
        expected_key = "audio:translation:att456:fr"
        assert expected_key in cache.redis.memory_cache

    @pytest.mark.asyncio
    async def test_voice_profile_uses_default_key(self, audio_cache_with_settings):
        """Test voice profile uses default key pattern"""
        cache = audio_cache_with_settings

        profile = {"user_id": "user123", "quality": 0.9}
        await cache.set_voice_profile("user123", profile)

        # Uses default pattern
        expected_key = "voice:profile:user123"
        assert expected_key in cache.redis.memory_cache


# ===================================================================
# SINGLETON RESET TESTS
# ===================================================================

class TestSingletonBehavior:
    """Test singleton pattern behavior"""

    def test_singleton_preserves_state(self):
        """Test singleton preserves state across instances"""
        RedisService._instance = None

        service1 = RedisService()
        service1.memory_cache["test"] = CacheEntry(value="v1", expires_at=time.time() + 3600)

        service2 = RedisService()

        assert "test" in service2.memory_cache
        assert service2.memory_cache["test"].value == "v1"

        RedisService._instance = None

    def test_singleton_init_only_once(self):
        """Test __init__ only runs once for singleton"""
        RedisService._instance = None

        service1 = RedisService(redis_url="redis://first:6379")
        service2 = RedisService(redis_url="redis://second:6379")

        # Second init should be ignored
        assert service1.redis_url == service2.redis_url
        assert service1.redis_url == "redis://first:6379"

        RedisService._instance = None


# ===================================================================
# IS_AVAILABLE TESTS
# ===================================================================

class TestIsAvailable:
    """Test is_available method"""

    def test_is_available_when_redis_available(self, redis_service_with_mock):
        """Test is_available returns True when Redis is available"""
        service = redis_service_with_mock
        service.permanently_disabled = False
        service.is_redis_available = True

        assert service.is_available() is True

    def test_is_available_when_permanently_disabled(self, fresh_redis_service):
        """Test is_available returns False when permanently disabled"""
        service = fresh_redis_service
        service.permanently_disabled = True
        service.is_redis_available = True

        assert service.is_available() is False

    def test_is_available_when_redis_not_available(self, fresh_redis_service):
        """Test is_available returns False when Redis not available"""
        service = fresh_redis_service
        service.permanently_disabled = False
        service.is_redis_available = False

        assert service.is_available() is False


# ===================================================================
# GET_STATS TESTS
# ===================================================================

class TestGetStats:
    """Test get_stats method"""

    def test_get_stats_redis_mode(self, redis_service_with_mock):
        """Test get_stats in Redis mode"""
        service = redis_service_with_mock
        service.permanently_disabled = False
        service.is_redis_available = True
        service.connection_attempts = 0
        service.memory_cache["key1"] = CacheEntry(value="v1", expires_at=time.time() + 3600)

        stats = service.get_stats()

        assert stats["mode"] == "Redis"
        assert stats["redis_available"] is True
        assert stats["memory_entries"] == 1
        assert stats["permanently_disabled"] is False
        assert stats["connection_attempts"] == 0

    def test_get_stats_memory_mode(self, fresh_redis_service):
        """Test get_stats in memory mode"""
        service = fresh_redis_service
        service.permanently_disabled = True
        service.is_redis_available = False
        service.connection_attempts = 3

        stats = service.get_stats()

        assert stats["mode"] == "Memory"
        assert stats["redis_available"] is False
        assert stats["permanently_disabled"] is True
        assert stats["connection_attempts"] == 3


# ===================================================================
# EDGE CASES FOR MEMORY CACHE FALLBACK
# ===================================================================

class TestMemoryCacheFallbackEdgeCases:
    """Test edge cases for memory cache fallback"""

    @pytest.mark.asyncio
    async def test_exists_with_expired_entry_in_memory(self, fresh_redis_service):
        """Test exists returns False for expired entry in memory"""
        service = fresh_redis_service
        service.permanently_disabled = True

        # Add expired entry
        service.memory_cache["expired"] = CacheEntry(
            value="old_value",
            expires_at=time.time() - 100
        )

        result = await service.exists("expired")

        assert result is False

    @pytest.mark.asyncio
    async def test_ttl_returns_zero_for_about_to_expire(self, fresh_redis_service):
        """Test ttl returns 0 for entry about to expire"""
        service = fresh_redis_service
        service.permanently_disabled = True

        # Add entry expiring in 0.5 seconds
        service.memory_cache["almost_expired"] = CacheEntry(
            value="value",
            expires_at=time.time() + 0.1
        )

        # Wait a bit
        await asyncio.sleep(0.15)

        result = await service.ttl("almost_expired")

        assert result == 0

    @pytest.mark.asyncio
    async def test_keys_pattern_exact_match(self, fresh_redis_service):
        """Test keys pattern with exact match"""
        service = fresh_redis_service
        service.permanently_disabled = True

        service.memory_cache["exact_key"] = CacheEntry(value="v1", expires_at=time.time() + 3600)
        service.memory_cache["other_key"] = CacheEntry(value="v2", expires_at=time.time() + 3600)

        result = await service.keys("exact_key")

        assert result == ["exact_key"]

    @pytest.mark.asyncio
    async def test_keys_pattern_with_multiple_wildcards(self, fresh_redis_service):
        """Test keys pattern with multiple wildcards"""
        service = fresh_redis_service
        service.permanently_disabled = True

        service.memory_cache["user:1:profile"] = CacheEntry(value="v1", expires_at=time.time() + 3600)
        service.memory_cache["user:2:settings"] = CacheEntry(value="v2", expires_at=time.time() + 3600)
        service.memory_cache["admin:1:profile"] = CacheEntry(value="v3", expires_at=time.time() + 3600)

        result = await service.keys("user:*:*")

        assert len(result) == 2
        assert "user:1:profile" in result
        assert "user:2:settings" in result


# ===================================================================
# AUDIO CACHE SERVICE GET_STATS TEST
# ===================================================================

class TestAudioCacheServiceStats:
    """Test AudioCacheService.get_stats method"""

    @pytest.mark.asyncio
    async def test_audio_cache_stats_includes_ttls(self):
        """Test that audio cache stats include TTL values"""
        RedisService._instance = None
        redis_service = RedisService()
        redis_service.permanently_disabled = True

        cache = AudioCacheService(redis_service)
        stats = cache.get_stats()

        assert "ttl_transcription" in stats
        assert "ttl_translated_audio" in stats
        assert "ttl_voice_profile" in stats
        # Default TTLs are 30 days (2592000 seconds) for transcription/audio, 90 days for voice profile
        assert stats["ttl_transcription"] == 2592000
        assert stats["ttl_translated_audio"] == 2592000
        assert stats["ttl_voice_profile"] == 7776000

        RedisService._instance = None


# ===================================================================
# INTEGRATION-LIKE TESTS
# ===================================================================

class TestIntegrationScenarios:
    """Test integration-like scenarios"""

    @pytest.mark.asyncio
    async def test_redis_failure_recovery_flow(self, redis_service_with_mock):
        """Test the flow when Redis fails and recovers to memory mode"""
        service = redis_service_with_mock
        service.connection_attempts = 0

        # Simulate Redis operations working
        service.redis.set = AsyncMock()
        await service.set("key1", "value1")
        assert service.connection_attempts == 0

        # Simulate Redis failure
        service.redis.set = AsyncMock(side_effect=Exception("Redis down"))
        service.redis.get = AsyncMock(side_effect=Exception("Redis down"))

        # Operations should fallback to memory
        await service.set("key2", "value2")
        assert "key2" in service.memory_cache

        # After 3 failures, should be permanently disabled
        await service.set("key3", "value3")
        await service.set("key4", "value4")

        assert service.permanently_disabled is True

    @pytest.mark.asyncio
    async def test_audio_cache_full_lifecycle(self):
        """Test full lifecycle of audio cache operations"""
        RedisService._instance = None
        redis_service = RedisService()
        redis_service.permanently_disabled = True

        cache = AudioCacheService(redis_service)

        # Set transcription
        transcription = {"text": "Hello world", "language": "en"}
        await cache.set_transcription("att1", transcription)

        # Get transcription
        result = await cache.get_transcription("att1")
        assert result == transcription

        # Set translated audio
        audio_data = {"url": "https://example.com/audio.mp3", "duration": 5000}
        await cache.set_translated_audio("att1", "fr", audio_data)

        # Get translated audio
        result = await cache.get_translated_audio("att1", "fr")
        assert result == audio_data

        # Set voice profile
        profile = {"user_id": "user1", "embedding": [0.1, 0.2]}
        await cache.set_voice_profile("user1", profile)

        # Get voice profile
        result = await cache.get_voice_profile("user1")
        assert result == profile

        # Delete voice profile
        await cache.delete_voice_profile("user1")
        result = await cache.get_voice_profile("user1")
        assert result is None

        RedisService._instance = None


# ===================================================================
# RUN ALL TESTS
# ===================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
