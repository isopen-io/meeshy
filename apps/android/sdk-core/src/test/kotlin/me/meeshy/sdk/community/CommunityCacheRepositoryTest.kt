package me.meeshy.sdk.community

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.builtins.ListSerializer
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.CommunityApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
class CommunityCacheRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()
    private val api = mockk<CommunityApi>()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun cache() = KeyedJsonCache(db.keyedJsonCacheDao(), clock)

    private fun repository() = CommunityCacheRepository(CommunityRepository(api), cache(), clock)

    private fun community(id: String) = ApiCommunity(id = id, name = "Com $id")

    private fun listResponse(vararg ids: String) =
        ApiResponse(success = true, data = ids.map(::community))

    @Test fun `a froid la liste est Empty puis la valeur reseau`() = runTest {
        coEvery { api.list(any(), any(), any()) } returns listResponse("a")

        val results = repository().list().take(2).toList()

        assertThat(results[0]).isEqualTo(CacheResult.Empty)
        assertThat((results[1] as CacheResult.Fresh).value.map { it.id }).containsExactly("a")
    }

    @Test fun `un cache frais est servi sans reseau`() = runTest {
        cache().put("community:list", "page0", listOf(community("a")), ListSerializer(ApiCommunity.serializer()))

        val first = repository().list().first()

        assertThat(first).isInstanceOf(CacheResult.Fresh::class.java)
        coVerify(exactly = 0) { api.list(any(), any(), any()) }
    }

    @Test fun `un cache perime est servi Stale puis revalide`() = runTest {
        cache().put("community:list", "page0", listOf(community("old")), ListSerializer(ApiCommunity.serializer()))
        clock.now += 10 * 60_000
        coEvery { api.list(any(), any(), any()) } returns listResponse("new")

        val results = repository().list().take(2).toList()

        assertThat(results[0]).isInstanceOf(CacheResult.Stale::class.java)
        assertThat((results[0] as CacheResult.Stale).value.map { it.id }).containsExactly("old")
        assertThat((results[1] as CacheResult.Fresh).value.map { it.id }).containsExactly("new")
    }

    @Test fun `un cache expire est Syncing avec ses donnees`() = runTest {
        cache().put("community:list", "page0", listOf(community("old")), ListSerializer(ApiCommunity.serializer()))
        clock.now += 3 * 24 * 60 * 60_000L
        coEvery { api.list(any(), any(), any()) } throws IOException("hors ligne")

        val first = repository().list().first()

        assertThat(first).isInstanceOf(CacheResult.Syncing::class.java)
    }

    @Test fun `un echec reseau conserve le cache`() = runTest {
        cache().put("community:list", "page0", listOf(community("old")), ListSerializer(ApiCommunity.serializer()))
        clock.now += 10 * 60_000
        coEvery { api.list(any(), any(), any()) } throws IOException("hors ligne")

        val results = repository().list().take(1).toList()

        assertThat((results.single() as CacheResult.Stale).value.map { it.id }).containsExactly("old")
        assertThat(cache().get("community:list", "page0", ListSerializer(ApiCommunity.serializer()))?.value).hasSize(1)
    }

    @Test fun `la fiche, les membres et les channels ont chacun leur ressource`() = runTest {
        coEvery { api.get("c1") } returns ApiResponse(success = true, data = community("c1"))
        coEvery { api.getMembers("c1", any(), any()) } returns
            ApiResponse(success = true, data = listOf(ApiCommunityMember(id = "m1", userId = "u1")))
        coEvery { api.getConversations("c1") } returns ApiResponse(success = true, data = emptyList())
        val repository = repository()

        val detail = repository.detail("c1").take(2).toList().last()
        val members = repository.members("c1").take(2).toList().last()
        val channels = repository.channels("c1").take(2).toList().last()

        assertThat((detail as CacheResult.Fresh).value.id).isEqualTo("c1")
        assertThat((members as CacheResult.Fresh).value.single().userId).isEqualTo("u1")
        assertThat((channels as CacheResult.Fresh).value).isEmpty()
    }

    @Test fun `forget n'efface que la communaute visee`() = runTest {
        val c = cache()
        c.put("community:detail", "c1", community("c1"), ApiCommunity.serializer())
        c.put("community:detail", "c2", community("c2"), ApiCommunity.serializer())

        repository().forget("c1")

        assertThat(c.get("community:detail", "c1", ApiCommunity.serializer())).isNull()
        assertThat(c.get("community:detail", "c2", ApiCommunity.serializer())).isNotNull()
    }
}
