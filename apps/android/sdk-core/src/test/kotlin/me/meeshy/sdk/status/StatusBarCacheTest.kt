package me.meeshy.sdk.status

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.StatusEntry
import org.junit.Test

class StatusBarCacheTest {

    private class FakeClock(var now: Long = 0L) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private fun entry(id: String) = StatusEntry(id = id, userId = "u-$id", moodEmoji = "😀")

    private fun cache(clock: CacheClock) = StatusBarCache(clock)

    @Test
    fun `an unsaved mode loads as Empty`() {
        val cache = cache(FakeClock())

        assertThat(cache.load(StatusFeedMode.FRIENDS)).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `a just-saved snapshot loads Fresh with its accumulated age`() {
        val clock = FakeClock(now = 0L)
        val cache = cache(clock)
        cache.save(StatusFeedMode.FRIENDS, listOf(entry("a"), entry("b")))

        clock.now = 30_000L
        val result = cache.load(StatusFeedMode.FRIENDS)

        assertThat(result).isInstanceOf(CacheResult.Fresh::class.java)
        val fresh = result as CacheResult.Fresh
        assertThat(fresh.value.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(fresh.ageMillis).isEqualTo(30_000L)
    }

    @Test
    fun `a snapshot at the fresh boundary is still Fresh`() {
        val clock = FakeClock(now = 0L)
        val cache = cache(clock)
        cache.save(StatusFeedMode.FRIENDS, listOf(entry("a")))

        clock.now = 60_000L
        assertThat(cache.load(StatusFeedMode.FRIENDS)).isInstanceOf(CacheResult.Fresh::class.java)
    }

    @Test
    fun `a snapshot past the fresh window loads Stale`() {
        val clock = FakeClock(now = 0L)
        val cache = cache(clock)
        cache.save(StatusFeedMode.FRIENDS, listOf(entry("a")))

        clock.now = 60_001L
        assertThat(cache.load(StatusFeedMode.FRIENDS)).isInstanceOf(CacheResult.Stale::class.java)
    }

    @Test
    fun `a snapshot past the keep window loads Syncing with the expired value`() {
        val clock = FakeClock(now = 0L)
        val cache = cache(clock)
        cache.save(StatusFeedMode.FRIENDS, listOf(entry("a")))

        clock.now = 24L * 60 * 60_000L + 1L
        val result = cache.load(StatusFeedMode.FRIENDS)

        assertThat(result).isInstanceOf(CacheResult.Syncing::class.java)
        assertThat((result as CacheResult.Syncing).value?.map { it.id }).containsExactly("a")
    }

    @Test
    fun `the two feed modes cache independently`() {
        val cache = cache(FakeClock())
        cache.save(StatusFeedMode.FRIENDS, listOf(entry("friend")))

        assertThat(cache.load(StatusFeedMode.DISCOVER)).isEqualTo(CacheResult.Empty)
        assertThat((cache.load(StatusFeedMode.FRIENDS) as CacheResult.Fresh).value.map { it.id })
            .containsExactly("friend")
    }

    @Test
    fun `invalidate drops the snapshot so the next load is cold`() {
        val cache = cache(FakeClock())
        cache.save(StatusFeedMode.FRIENDS, listOf(entry("a")))

        cache.invalidate(StatusFeedMode.FRIENDS)

        assertThat(cache.load(StatusFeedMode.FRIENDS)).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `invalidate is scoped to its mode and leaves the other feed intact`() {
        val cache = cache(FakeClock())
        cache.save(StatusFeedMode.FRIENDS, listOf(entry("a")))
        cache.save(StatusFeedMode.DISCOVER, listOf(entry("b")))

        cache.invalidate(StatusFeedMode.FRIENDS)

        assertThat(cache.load(StatusFeedMode.FRIENDS)).isEqualTo(CacheResult.Empty)
        assertThat((cache.load(StatusFeedMode.DISCOVER) as CacheResult.Fresh).value.map { it.id })
            .containsExactly("b")
    }

    @Test
    fun `re-saving a mode overwrites the prior snapshot and restamps its age`() {
        val clock = FakeClock(now = 0L)
        val cache = cache(clock)
        cache.save(StatusFeedMode.FRIENDS, listOf(entry("old")))

        clock.now = 100_000L
        cache.save(StatusFeedMode.FRIENDS, listOf(entry("new")))

        clock.now = 130_000L
        val result = cache.load(StatusFeedMode.FRIENDS) as CacheResult.Fresh
        assertThat(result.value.map { it.id }).containsExactly("new")
        assertThat(result.ageMillis).isEqualTo(30_000L)
    }
}
