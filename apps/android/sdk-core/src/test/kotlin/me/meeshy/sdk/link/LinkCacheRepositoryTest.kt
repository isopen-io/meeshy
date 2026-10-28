package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ShareLinkArrivalStats
import me.meeshy.sdk.net.api.LinkDetailApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
class LinkCacheRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()
    private val api = mockk<LinkDetailApi>()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun cache() = KeyedJsonCache(db.keyedJsonCacheDao(), clock)

    private fun repository() = LinkCacheRepository(api, cache(), clock)

    @Test fun `a froid les statistiques sont Empty puis servies`() = runTest {
        coEvery { api.linkStats("l1") } returns ApiResponse(success = true, data = ShareLinkArrivalStats(visits = 7))

        val results = repository().stats("l1").take(2).toList()

        assertThat(results[0]).isEqualTo(CacheResult.Empty)
        assertThat((results[1] as CacheResult.Fresh).value.visits).isEqualTo(7)
    }

    @Test fun `sur cache non vide aucune attente, meme hors ligne`() = runTest {
        cache().put("link:stats", "l1", ShareLinkArrivalStats(visits = 3), ShareLinkArrivalStats.serializer(), null)
        clock.now += 60 * 60_000
        coEvery { api.linkStats("l1") } throws IOException("hors ligne")

        val first = repository().stats("l1").first()

        assertThat(first).isInstanceOf(CacheResult.Stale::class.java)
        assertThat((first as CacheResult.Stale).value.visits).isEqualTo(3)
    }

    @Test fun `une page d arrivees se demande avec son curseur`() = runTest {
        coEvery { api.arrivals("l1", 30, "c1") } returns ApiResponse(
            success = true,
            data = me.meeshy.sdk.model.ShareLinkArrivalsPage(listOf(me.meeshy.sdk.model.ShareLinkArrivalEntry(displayName = "Ana")), "c2"),
        )

        val result = repository().arrivalsPage("l1", cursor = "c1", limit = 30)

        assertThat((result as me.meeshy.sdk.net.NetworkResult.Success).data.cursorOrNull).isEqualTo("c2")
    }

    @Test fun `la deconnexion efface tout ce que les liens avaient garde`() = runTest {
        cache().put("link:stats", "l1", ShareLinkArrivalStats(visits = 3), ShareLinkArrivalStats.serializer(), null)

        repository().clear()

        assertThat(cache().get("link:stats", "l1", ShareLinkArrivalStats.serializer())).isNull()
    }
}
