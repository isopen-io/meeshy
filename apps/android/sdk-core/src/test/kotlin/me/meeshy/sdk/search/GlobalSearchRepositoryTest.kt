package me.meeshy.sdk.search

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.search.SearchPaneFailure
import me.meeshy.sdk.model.search.SearchPaneKind
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.UserApi
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import org.junit.Test
import java.io.IOException

class GlobalSearchRepositoryTest {

    private class FakeLocal(
        val conversations: List<ApiConversation> = emptyList(),
        val users: List<UserSearchResult> = emptyList(),
        val messages: List<MessageSearchHit> = emptyList(),
    ) : LocalSearchSource {
        override suspend fun conversations(query: String) = conversations
        override suspend fun users(query: String) = users
        override suspend fun messages(query: String) = messages
    }

    private fun hit(id: String, conversationId: String = "c1", createdAt: String = "2026-01-01T00:00:00Z") =
        MessageSearchHit(ApiMessage(id = id, conversationId = conversationId, createdAt = createdAt), "t")

    private fun conversation(id: String) = ApiConversation(id = id, title = id)

    private class Remote {
        val conversationApi = mockk<ConversationApi>()
        val userApi = mockk<UserApi>()
        val messageApi = mockk<MessageApi>()
    }

    private fun repository(
        remote: Remote,
        local: LocalSearchSource = FakeLocal(),
        monitor: InMemoryNetworkMonitor = InMemoryNetworkMonitor(initialOnline = true),
    ) = GlobalSearchRepository(remote.conversationApi, remote.userApi, remote.messageApi, local, monitor)

    private fun Remote.serving(
        conversations: List<ApiConversation> = emptyList(),
        users: List<UserSearchResult> = emptyList(),
        messages: List<ApiMessage> = emptyList(),
    ) {
        coEvery { conversationApi.search(any()) } returns ApiResponse(success = true, data = conversations)
        coEvery { userApi.search(any(), any(), any()) } returns ApiResponse(success = true, data = users)
        coEvery { messageApi.search(any(), any(), any(), any()) } returns ApiResponse(success = true, data = messages)
    }

    @Test
    fun `local results are emitted before the network answer`() = runTest {
        val remote = Remote().apply { serving(conversations = listOf(conversation("net"))) }
        val emissions = repository(remote, FakeLocal(conversations = listOf(conversation("loc")))).search("bel").toList()

        assertThat(emissions).hasSize(2)
        assertThat(emissions[0].remoteSettled).isFalse()
        assertThat(emissions[0].conversations.items.map { it.id }).containsExactly("loc")
        assertThat(emissions[1].remoteSettled).isTrue()
        assertThat(emissions[1].conversations.items.map { it.id }).containsExactly("net", "loc")
    }

    @Test
    fun `offline the search answers from the local index alone without any failure`() = runTest {
        val remote = Remote()
        val monitor = InMemoryNetworkMonitor(initialOnline = false)
        val emissions = repository(remote, FakeLocal(messages = listOf(hit("m1"))), monitor).search("bel").toList()

        assertThat(emissions).hasSize(1)
        assertThat(emissions.single().offline).isTrue()
        assertThat(emissions.single().messages.items.map { it.message.id }).containsExactly("m1")
        assertThat(emissions.single().firstFailure).isNull()
        coVerify(exactly = 0) { remote.conversationApi.search(any()) }
    }

    @Test
    fun `a failed network pane is reported with its failure instead of an empty list`() = runTest {
        val remote = Remote().apply {
            serving()
            coEvery { userApi.search(any(), any(), any()) } throws IOException("down")
        }
        val settled = repository(remote).search("bel").toList().last()

        assertThat(settled.users.failure).isEqualTo(SearchPaneFailure.Unreachable)
        assertThat(settled.conversations.failure).isNull()
        assertThat(settled.firstFailure).isEqualTo(SearchPaneKind.PEOPLE)
    }

    @Test
    fun `a pane failure does not erase the local results of that pane`() = runTest {
        val remote = Remote().apply {
            serving()
            coEvery { conversationApi.search(any()) } throws IOException("down")
        }
        val settled = repository(remote, FakeLocal(conversations = listOf(conversation("loc")))).search("bel").toList().last()

        assertThat(settled.conversations.items.map { it.id }).containsExactly("loc")
        assertThat(settled.conversations.failure).isEqualTo(SearchPaneFailure.Unreachable)
    }

    @Test
    fun `messages merge the local index with the per-conversation network fan-out newest first`() = runTest {
        val remote = Remote().apply {
            serving(conversations = listOf(conversation("c1")))
            coEvery { messageApi.search("c1", any(), any(), any()) } returns ApiResponse(
                success = true,
                data = listOf(
                    ApiMessage(id = "m1", conversationId = "c1", createdAt = "2026-01-01T00:00:00Z"),
                    ApiMessage(id = "m3", conversationId = "c1", createdAt = "2026-03-01T00:00:00Z"),
                ),
            )
        }
        val settled = repository(
            remote,
            FakeLocal(messages = listOf(hit("m1"), hit("m2", createdAt = "2026-02-01T00:00:00Z"))),
        ).search("bel").toList().last()

        assertThat(settled.messages.items.map { it.message.id }).containsExactly("m3", "m2", "m1").inOrder()
    }

    @Test
    fun `a message found on the network carries the conversation it was found in`() = runTest {
        val found = conversation("c1").copy(avatar = "2026/09/c1/photo.png")
        val remote = Remote().apply {
            serving(conversations = listOf(found))
            coEvery { messageApi.search("c1", any(), any(), any()) } returns ApiResponse(
                success = true,
                data = listOf(ApiMessage(id = "m1", conversationId = "c1")),
            )
        }
        val settled = repository(remote).search("bel").toList().last()

        assertThat(settled.messages.items.single().conversation).isEqualTo(found)
    }

    @Test
    fun `when every message leg fails and nothing is local the messages pane reports the failure`() = runTest {
        val remote = Remote().apply {
            serving(conversations = listOf(conversation("c1")))
            coEvery { messageApi.search(any(), any(), any(), any()) } throws IOException("down")
        }
        val settled = repository(remote).search("bel").toList().last()

        assertThat(settled.messages.failure).isEqualTo(SearchPaneFailure.Unreachable)
    }

    @Test
    fun `the fan-out is capped to the configured number of conversations`() = runTest {
        val remote = Remote().apply { serving(conversations = (1..4).map { conversation("c$it") }) }
        repository(remote).search("bel", maxMessageConversations = 2, messagesPerConversation = 5).toList()

        coVerify(exactly = 2) { remote.messageApi.search(any(), any(), 5, any()) }
    }
}
