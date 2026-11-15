package me.meeshy.sdk.sharelink

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.model.MyShareLink
import org.junit.Test

/** « Mes liens » se rouvre depuis le disque après un redémarrage, et la déconnexion le vide. */
@OptIn(ExperimentalCoroutinesApi::class)
class ShareLinksCachePersistenceTest {

    private class MemoryDisk(var saved: PersistedShareLinks? = null) : ShareLinksDiskStore {
        override suspend fun read() = saved
        override suspend fun write(snapshot: PersistedShareLinks) { saved = snapshot }
        override suspend fun clear() { saved = null }
    }

    private class Clock(var now: Long = 100_000_000L) : CacheClock {
        override fun nowMillis() = now
    }

    private val clock = Clock()

    private fun link(id: String) = MyShareLink(id = id, linkId = "mshy_$id")

    private fun TestScope.newCache(disk: ShareLinksDiskStore) =
        ShareLinksCache(clock, CachePolicy.Default, disk, StandardTestDispatcher(testScheduler))

    @Test
    fun `une liste ecrite survit au redemarrage`() = runTest {
        val disk = MemoryDisk()
        newCache(disk).put(listOf(link("1")))
        advanceUntilIdle()

        val restarted = newCache(disk)
        advanceUntilIdle()

        assertThat(restarted.read()!!.links.map { it.id }).containsExactly("1")
    }

    @Test
    fun `une liste plus vieille que la retention n est pas rejouee`() = runTest {
        val disk = MemoryDisk(PersistedShareLinks(listOf(link("1")), clock.now - 25 * 60 * 60 * 1000L))

        val restarted = newCache(disk)
        advanceUntilIdle()

        assertThat(restarted.read()).isNull()
    }

    @Test
    fun `le disque ne regresse pas une liste deja lue du reseau`() = runTest {
        val disk = MemoryDisk(PersistedShareLinks(listOf(link("old")), clock.now - 1_000))
        val cache = newCache(disk)
        cache.put(listOf(link("net")))
        advanceUntilIdle()

        assertThat(cache.read()!!.links.map { it.id }).containsExactly("net")
    }

    @Test
    fun `clear vide la memoire et le disque`() = runTest {
        val disk = MemoryDisk()
        val cache = newCache(disk)
        cache.put(listOf(link("1")))
        advanceUntilIdle()

        cache.clear()

        assertThat(cache.read()).isNull()
        assertThat(disk.saved).isNull()
    }

    @Test
    fun `une suppression optimiste est ecrite sur disque`() = runTest {
        val disk = MemoryDisk()
        val cache = newCache(disk)
        cache.put(listOf(link("1"), link("2")))
        cache.remove("mshy_1")
        advanceUntilIdle()

        assertThat(disk.saved!!.links.map { it.id }).containsExactly("2")
    }
}
