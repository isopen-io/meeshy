package me.meeshy.sdk.cache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ClassifyCacheTest {

    private val policy = CachePolicy(freshForMillis = 1_000L, keepForMillis = 10_000L)

    @Test
    fun `a null value is Empty regardless of age`() {
        assertThat(classifyCache<String>(value = null, ageMillis = 0L, policy = policy))
            .isEqualTo(CacheResult.Empty)
        assertThat(classifyCache<String>(value = null, ageMillis = Long.MAX_VALUE, policy = policy))
            .isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `a brand-new value is Fresh carrying its age`() {
        assertThat(classifyCache(value = "x", ageMillis = 0L, policy = policy))
            .isEqualTo(CacheResult.Fresh("x", 0L))
    }

    @Test
    fun `a value at the fresh boundary is still Fresh`() {
        assertThat(classifyCache(value = "x", ageMillis = 1_000L, policy = policy))
            .isEqualTo(CacheResult.Fresh("x", 1_000L))
    }

    @Test
    fun `a value one past the fresh boundary is Stale`() {
        assertThat(classifyCache(value = "x", ageMillis = 1_001L, policy = policy))
            .isEqualTo(CacheResult.Stale("x", 1_001L))
    }

    @Test
    fun `a value at the keep boundary is still Stale`() {
        assertThat(classifyCache(value = "x", ageMillis = 10_000L, policy = policy))
            .isEqualTo(CacheResult.Stale("x", 10_000L))
    }

    @Test
    fun `a value one past the keep boundary is Syncing carrying the expired value`() {
        assertThat(classifyCache(value = "x", ageMillis = 10_001L, policy = policy))
            .isEqualTo(CacheResult.Syncing("x"))
    }
}
