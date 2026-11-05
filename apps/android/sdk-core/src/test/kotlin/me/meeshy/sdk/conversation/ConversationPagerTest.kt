package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CursorPagination
import me.meeshy.sdk.model.conversationlist.PaginationState
import me.meeshy.sdk.net.api.ConversationApi
import org.junit.Test

class ConversationPagerTest {

    private val oldest = "6512f2a0e1b4c3d2a1908877"
    private val cursor2 = "6512f2a0e1b4c3d2a1908800"

    private class Fixture(
        val api: ConversationApi = mockk(),
        val repository: ConversationRepository = mockk(),
        val store: InMemoryConversationPaginationStore = InMemoryConversationPaginationStore(),
    ) {
        val pager = ConversationPager(api, repository, store)
    }

    private fun page(ids: List<String>, nextCursor: String?, hasMore: Boolean) = ApiResponse(
        success = true,
        data = ids.map { ApiConversation(id = it) },
        cursorPagination = CursorPagination(nextCursor = nextCursor, hasMore = hasMore, limit = 100),
    )

    private fun fixture(newIds: Int = 2, reply: ApiResponse<List<ApiConversation>>): Fixture {
        val f = Fixture()
        coEvery { f.repository.oldestCachedId() } returns oldest
        coEvery { f.repository.rememberPage(any()) } returns newIds
        coEvery { f.api.listBefore(any(), any()) } returns reply
        return f
    }

    @Test
    fun `la première extension part de la plus ancienne conversation locale`() = runTest {
        val f = fixture(reply = page(listOf("a", "b"), cursor2, true))
        f.pager.loadMore()
        coVerify { f.api.listBefore(oldest, 100) }
        assertThat(f.pager.state.value).isEqualTo(PaginationState.Idle)
        assertThat(f.pager.hasMore.value).isTrue()
    }

    @Test
    fun `la page suivante part du curseur servi`() = runTest {
        val f = fixture(reply = page(listOf("a", "b"), cursor2, true))
        f.pager.loadMore()
        f.pager.loadMore()
        coVerify { f.api.listBefore(cursor2, 100) }
    }

    @Test
    fun `un curseur qui n'avance pas épuise et se persiste`() = runTest {
        val f = fixture(reply = page(listOf("a"), oldest, true))
        f.pager.loadMore()
        assertThat(f.pager.state.value).isEqualTo(PaginationState.Exhausted)
        assertThat(f.pager.hasMore.value).isFalse()
        assertThat(f.store.load()).isEqualTo(ConversationPaginationSnapshot(oldest, false))
    }

    @Test
    fun `une page sans nouvel identifiant épuise`() = runTest {
        val f = fixture(newIds = 0, reply = page(listOf("a"), cursor2, true))
        f.pager.loadMore()
        assertThat(f.pager.state.value).isEqualTo(PaginationState.Exhausted)
    }

    @Test
    fun `épuisé, plus aucune requête ne part`() = runTest {
        val f = fixture(reply = page(listOf("a"), null, false))
        f.pager.loadMore()
        f.pager.loadMore()
        coVerify(exactly = 1) { f.api.listBefore(any(), any()) }
    }

    @Test
    fun `une erreur réseau porte le message puis la reprise réussit`() = runTest {
        val f = fixture(reply = page(listOf("a"), cursor2, true))
        coEvery { f.api.listBefore(any(), any()) } throws IOException("hors ligne") andThen page(listOf("a"), cursor2, true)
        f.pager.loadMore()
        assertThat(f.pager.state.value).isEqualTo(PaginationState.Failed("hors ligne"))
        assertThat(f.pager.hasMore.value).isTrue()
        f.pager.loadMore()
        assertThat(f.pager.state.value).isEqualTo(PaginationState.Idle)
    }

    @Test
    fun `l'épuisement persisté est relu au redémarrage sans requête`() = runTest {
        val f = Fixture(store = InMemoryConversationPaginationStore(ConversationPaginationSnapshot(oldest, false)))
        f.pager.loadMore()
        assertThat(f.pager.state.value).isEqualTo(PaginationState.Exhausted)
        coVerify(exactly = 0) { f.api.listBefore(any(), any()) }
    }

    @Test
    fun `reset rouvre la pagination et oublie le curseur`() = runTest {
        val f = fixture(reply = page(listOf("a"), null, false))
        f.pager.loadMore()
        f.pager.reset()
        assertThat(f.pager.hasMore.value).isTrue()
        assertThat(f.pager.state.value).isEqualTo(PaginationState.Idle)
        assertThat(f.store.load()).isNull()
    }
}
