"""
Test 16: Redis Service with Memory Cache Fallback
Tests the RedisService and AudioCacheService with focus on memory cache fallback mode.
"""

import pytest
import asyncio
import time
import json
import sys
import os

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


# ═══════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════

@pytest.fixture
def memory_only_redis_service():
    """Create a RedisService that only uses memory cache"""
    # Reset singleton for testing
    RedisService._instance = None
    service = RedisService()
    service.permanently_disabled = True
    service.is_redis_available = False
    return service


@pytest.fixture
def audio_cache_service(memory_only_redis_service):
    """Create an AudioCacheService with memory-only Redis"""
    return AudioCacheService(memory_only_redis_service)


# ═══════════════════════════════════════════════════════════════
# CacheEntry TESTS
# ═══════════════════════════════════════════════════════════════

class TestCacheEntry:
    """Test CacheEntry dataclass"""

    def test_cache_entry_creation(self):
        """Test creating a cache entry"""
        entry = CacheEntry(value="test_value", expires_at=time.time() + 3600)
        assert entry.value == "test_value"
        assert entry.expires_at > time.time()

    def test_cache_entry_expired(self):
        """Test expired cache entry"""
        entry = CacheEntry(value="old_value", expires_at=time.time() - 100)
        assert entry.expires_at < time.time()


# ═══════════════════════════════════════════════════════════════
# RedisService MEMORY MODE TESTS
# ═══════════════════════════════════════════════════════════════

class TestRedisServiceMemoryMode:
    """Test RedisService in memory-only mode"""

    @pytest.mark.asyncio
    async def test_singleton_pattern(self):
        """Test singleton pattern"""
        RedisService._instance = None
        service1 = RedisService()
        service2 = RedisService()
        assert service1 is service2

    @pytest.mark.asyncio
    async def test_set_and_get(self, memory_only_redis_service):
        """Test basic set and get operations"""
        service = memory_only_redis_service

        # Set a value
        result = await service.set("test_key", "test_value", ex=60)
        assert result is True

        # Get the value
        value = await service.get("test_key")
        assert value == "test_value"

    @pytest.mark.asyncio
    async def test_setex(self, memory_only_redis_service):
        """Test setex operation"""
        service = memory_only_redis_service

        result = await service.setex("expire_key", 60, "expire_value")
        assert result is True

        value = await service.get("expire_key")
        assert value == "expire_value"

    @pytest.mark.asyncio
    async def test_delete(self, memory_only_redis_service):
        """Test delete operation"""
        service = memory_only_redis_service

        await service.set("delete_key", "delete_value")
        value = await service.get("delete_key")
        assert value == "delete_value"

        result = await service.delete("delete_key")
        assert result is True

        value = await service.get("delete_key")
        assert value is None

    @pytest.mark.asyncio
    async def test_exists(self, memory_only_redis_service):
        """Test exists operation"""
        service = memory_only_redis_service

        # Key doesn't exist
        exists = await service.exists("nonexistent")
        assert exists is False

        # Create key
        await service.set("existing_key", "value")
        exists = await service.exists("existing_key")
        assert exists is True

    @pytest.mark.asyncio
    async def test_keys_pattern(self, memory_only_redis_service):
        """Test keys pattern matching"""
        service = memory_only_redis_service

        # Set multiple keys
        await service.set("user:1:name", "Alice")
        await service.set("user:2:name", "Bob")
        await service.set("session:abc", "data")

        # Pattern matching
        user_keys = await service.keys("user:*")
        assert len(user_keys) == 2
        assert "user:1:name" in user_keys
        assert "user:2:name" in user_keys

    @pytest.mark.asyncio
    async def test_ttl(self, memory_only_redis_service):
        """Test TTL operation"""
        service = memory_only_redis_service

        # Set with 60 seconds TTL
        await service.setex("ttl_key", 60, "ttl_value")
        ttl = await service.ttl("ttl_key")
        assert 55 < ttl <= 60

        # Non-existent key
        ttl = await service.ttl("nonexistent")
        assert ttl == -2

    @pytest.mark.asyncio
    async def test_expired_entry_removal(self, memory_only_redis_service):
        """Test that expired entries are removed on get"""
        service = memory_only_redis_service

        # Manually insert expired entry
        service.memory_cache["expired_key"] = CacheEntry(
            value="old_value",
            expires_at=time.time() - 10
        )

        # Getting should return None and remove the entry
        value = await service.get("expired_key")
        assert value is None
        assert "expired_key" not in service.memory_cache

    @pytest.mark.asyncio
    async def test_get_stats(self, memory_only_redis_service):
        """Test get_stats method"""
        service = memory_only_redis_service

        await service.set("stat_key", "stat_value")
        stats = service.get_stats()

        assert stats["mode"] == "Memory"
        assert stats["redis_available"] is False
        assert stats["memory_entries"] >= 1
        assert stats["permanently_disabled"] is True

    @pytest.mark.asyncio
    async def test_is_available(self, memory_only_redis_service):
        """Test is_available method"""
        service = memory_only_redis_service
        assert service.is_available() is False

    @pytest.mark.asyncio
    async def test_close(self, memory_only_redis_service):
        """Test close method"""
        service = memory_only_redis_service
        await service.set("close_key", "close_value")

        await service.close()
        assert len(service.memory_cache) == 0


# ═══════════════════════════════════════════════════════════════
# AudioCacheService TESTS
# ═══════════════════════════════════════════════════════════════

class TestAudioCacheService:
    """Test AudioCacheService"""

    @pytest.mark.asyncio
    async def test_transcription_cache(self, audio_cache_service):
        """Test transcription caching"""
        cache = audio_cache_service

        transcription = {
            "text": "Hello world",
            "language": "en",
            "segments": [{"start": 0, "end": 1, "text": "Hello world"}]
        }

        # Set transcription
        result = await cache.set_transcription("att_123", transcription)
        assert result is True

        # Get transcription
        cached = await cache.get_transcription("att_123")
        assert cached == transcription
        assert cached["text"] == "Hello world"

    @pytest.mark.asyncio
    async def test_transcription_not_found(self, audio_cache_service):
        """Test getting non-existent transcription"""
        cache = audio_cache_service
        result = await cache.get_transcription("nonexistent_att")
        assert result is None

    @pytest.mark.asyncio
    async def test_translated_audio_cache(self, audio_cache_service):
        """Test translated audio caching"""
        cache = audio_cache_service

        audio_data = {
            "url": "https://example.com/audio.mp3",
            "duration_ms": 5000,
            "format": "mp3"
        }

        # Set translated audio
        result = await cache.set_translated_audio("att_456", "fr", audio_data)
        assert result is True

        # Get translated audio
        cached = await cache.get_translated_audio("att_456", "fr")
        assert cached == audio_data
        assert cached["url"] == "https://example.com/audio.mp3"

        # Different language should not exist
        cached_es = await cache.get_translated_audio("att_456", "es")
        assert cached_es is None

    @pytest.mark.asyncio
    async def test_voice_profile_cache(self, audio_cache_service):
        """Test voice profile caching"""
        cache = audio_cache_service

        profile = {
            "user_id": "user_789",
            "embedding": [0.1, 0.2, 0.3],
            "quality_score": 0.85,
            "created_at": "2024-01-15T10:30:00Z"
        }

        # Set voice profile
        result = await cache.set_voice_profile("user_789", profile)
        assert result is True

        # Get voice profile
        cached = await cache.get_voice_profile("user_789")
        assert cached == profile
        assert cached["quality_score"] == 0.85

    @pytest.mark.asyncio
    async def test_delete_voice_profile(self, audio_cache_service):
        """Test deleting voice profile"""
        cache = audio_cache_service

        profile = {"user_id": "user_delete", "quality_score": 0.5}
        await cache.set_voice_profile("user_delete", profile)

        # Verify it exists
        cached = await cache.get_voice_profile("user_delete")
        assert cached is not None

        # Delete it
        result = await cache.delete_voice_profile("user_delete")
        assert result is True

        # Verify it's gone
        cached = await cache.get_voice_profile("user_delete")
        assert cached is None

    @pytest.mark.asyncio
    async def test_get_stats(self, audio_cache_service):
        """Test get_stats method"""
        cache = audio_cache_service
        stats = cache.get_stats()

        assert "mode" in stats
        assert "ttl_transcription" in stats
        assert "ttl_translated_audio" in stats
        assert "ttl_voice_profile" in stats
        assert stats["ttl_transcription"] == 2592000  # 30 days (updated from 1 hour)
        assert stats["ttl_voice_profile"] == 7776000  # 90 days

    @pytest.mark.asyncio
    async def test_custom_ttl(self, audio_cache_service):
        """Test setting custom TTL"""
        cache = audio_cache_service

        transcription = {"text": "Custom TTL test"}

        # Set with custom TTL
        result = await cache.set_transcription("custom_ttl", transcription, ttl=120)
        assert result is True

        # Verify TTL
        ttl = await cache.redis.ttl("audio:transcription:custom_ttl")
        assert 115 < ttl <= 120


# ═══════════════════════════════════════════════════════════════
# SINGLETON HELPER TESTS
# ═══════════════════════════════════════════════════════════════

class TestSingletonHelpers:
    """Test singleton helper functions"""

    def test_get_redis_service(self):
        """Test get_redis_service helper"""
        # Reset singleton
        import services.redis_service as redis_module
        redis_module._redis_service = None
        RedisService._instance = None

        service1 = get_redis_service()
        service2 = get_redis_service()
        assert service1 is service2

    def test_get_audio_cache_service(self):
        """Test get_audio_cache_service helper"""
        import services.redis_service as redis_module
        redis_module._audio_cache = None
        redis_module._redis_service = None
        RedisService._instance = None

        cache1 = get_audio_cache_service()
        cache2 = get_audio_cache_service()
        assert cache1 is cache2


# ═══════════════════════════════════════════════════════════════
# EDGE CASES
# ═══════════════════════════════════════════════════════════════

class TestEdgeCases:
    """Test edge cases"""

    @pytest.mark.asyncio
    async def test_set_without_expiration(self, memory_only_redis_service):
        """Test set without explicit expiration (should default to 1 hour)"""
        service = memory_only_redis_service

        await service.set("no_expire", "value")

        entry = service.memory_cache.get("no_expire")
        assert entry is not None
        # Should expire in approximately 1 hour
        remaining = entry.expires_at - time.time()
        assert 3500 < remaining <= 3600

    @pytest.mark.asyncio
    async def test_special_characters_in_key(self, memory_only_redis_service):
        """Test keys with special characters"""
        service = memory_only_redis_service

        await service.set("user:123:profile", "data")
        value = await service.get("user:123:profile")
        assert value == "data"

    @pytest.mark.asyncio
    async def test_json_value(self, memory_only_redis_service):
        """Test storing JSON serialized data"""
        service = memory_only_redis_service

        data = {"name": "Test", "count": 42, "nested": {"a": 1}}
        await service.set("json_key", json.dumps(data))

        retrieved = await service.get("json_key")
        parsed = json.loads(retrieved)
        assert parsed == data

    @pytest.mark.asyncio
    async def test_empty_pattern(self, memory_only_redis_service):
        """Test keys with pattern that matches nothing"""
        service = memory_only_redis_service

        keys = await service.keys("nonexistent:*")
        assert keys == []

    @pytest.mark.asyncio
    async def test_delete_nonexistent_key(self, memory_only_redis_service):
        """Test deleting a key that doesn't exist"""
        service = memory_only_redis_service

        result = await service.delete("does_not_exist")
        assert result is True  # Should return True even if key doesn't exist

    @pytest.mark.asyncio
    async def test_concurrent_access(self, memory_only_redis_service):
        """Test concurrent access to cache"""
        service = memory_only_redis_service

        async def set_value(i):
            await service.set(f"concurrent_{i}", f"value_{i}")
            return await service.get(f"concurrent_{i}")

        # Run 10 concurrent operations
        tasks = [set_value(i) for i in range(10)]
        results = await asyncio.gather(*tasks)

        assert all(results[i] == f"value_{i}" for i in range(10))


# ═══════════════════════════════════════════════════════════════
# RUN ALL TESTS
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
