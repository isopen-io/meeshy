package me.meeshy.sdk.search

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.store.CacheStoreRegistry
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.UserApi
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class UserSearchCacheSourceTest {
    private val db = inMemoryDatabase()
    private val clock = FakeClock()
    private val registry = CacheStoreRegistry(Dispatchers.Unconfined)
    private val source = UserSearchCacheSource(
        registry.roomStore(
            db.cacheEntryDao(), UserSearchCacheSource.NAMESPACE, CachePolicy.UserSearch,
            UserSearchResult.serializer(), { it.id }, clock = clock,
        ),
    )

    @After fun tearDown() = db.close()

    private fun found(id: String, online: Boolean? = null) =
        UserSearchResult(id = id, username = "u$id", isOnline = online, lastActiveAt = online?.let { "2026-11-04T10:00:00Z" })

    @Test
    fun `la meme requete se rejoue sans tenir compte de la casse ni des espaces`() = runTest {
        source.remember("  Bel ", listOf(found("1"), found("2")), null)

        assertThat(source.cached("bel")!!.map { it.id }).containsExactly("1", "2").inOrder()
        assertThat(source.cached("autre")).isNull()
    }

    @Test
    fun `la presence servie n est ni rangee ni restituee`() = runTest {
        source.remember("bel", listOf(found("1", online = true)), null)

        val row = source.cached("bel")!!.single()
        assertThat(row.isOnline).isNull()
        assertThat(row.lastActiveAt).isNull()
    }

    @Test
    fun `une requete vide ne laisse aucune ligne`() = runTest {
        source.remember("   ", listOf(found("1")), null)

        assertThat(source.cached("   ")).isNull()
    }

    @Test
    fun `hors ligne la recherche rejoue les utilisateurs deja trouves`() = runTest {
        source.remember("bel", listOf(found("1")), null)
        val api = Api()
        val repository = api.repository(source, InMemoryNetworkMonitor(initialOnline = false))

        val snapshots = repository.search("bel").toList()

        assertThat(snapshots.single().users.items.map { it.id }).containsExactly("1")
        assertThat(snapshots.single().users.failure).isNull()
    }

    @Test
    fun `en ligne la reponse du serveur est rangee pour la prochaine fois`() = runTest {
        val api = Api().apply { serving(listOf(found("7"))) }
        api.repository(source, InMemoryNetworkMonitor(initialOnline = true)).search("bel").toList()

        assertThat(source.cached("bel")!!.map { it.id }).containsExactly("7")
    }

    @Test
    fun `une panne reseau garde la liste rejouee au lieu d un faux echec`() = runTest {
        source.remember("bel", listOf(found("1")), null)
        val api = Api().apply { failing() }

        val last = api.repository(source, InMemoryNetworkMonitor(initialOnline = true)).search("bel").toList().last()

        assertThat(last.users.items.map { it.id }).containsExactly("1")
        assertThat(last.users.failure).isNull()
    }

    private class Api {
        val conversationApi = mockk<ConversationApi>()
        val userApi = mockk<UserApi>()
        val messageApi = mockk<MessageApi>()
        private val local = object : LocalSearchSource {
            override suspend fun conversations(query: String) = emptyList<ApiConversation>()
            override suspend fun users(query: String) = emptyList<UserSearchResult>()
            override suspend fun messages(query: String) = emptyList<MessageSearchHit>()
        }

        fun serving(users: List<UserSearchResult>) {
            coEvery { conversationApi.search(any()) } returns ApiResponse(success = true, data = emptyList())
            coEvery { userApi.search(any(), any(), any()) } returns ApiResponse(success = true, data = users)
        }

        fun failing() {
            coEvery { conversationApi.search(any()) } throws java.io.IOException("down")
            coEvery { userApi.search(any(), any(), any()) } throws java.io.IOException("down")
        }

        fun repository(cache: UserSearchCacheSource, monitor: InMemoryNetworkMonitor) =
            GlobalSearchRepository(conversationApi, userApi, messageApi, local, monitor, userSearchCache = cache)
    }
}
