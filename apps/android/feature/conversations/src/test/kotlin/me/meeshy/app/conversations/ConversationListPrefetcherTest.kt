package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.AppForegroundSignal
import me.meeshy.sdk.conversation.ConversationListMessagePrefetcher
import me.meeshy.sdk.conversation.MessagePrefetchPageSource
import me.meeshy.sdk.conversation.MessagePrefetchStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.chat.HeldMessageWindow
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocketManager
import org.junit.Test

/** Cibles du haut de liste (20), relance après reconnexion, garde du propriétaire de session et déclenchement des stories. */
@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListPrefetcherTest {

    private class Source(val onFetch: () -> Unit = {}) : MessagePrefetchPageSource {
        val requested = mutableListOf<String>()
        override suspend fun fetchLatestPage(conversationId: String, limit: Int): List<ApiMessage>? {
            requested += conversationId
            onFetch()
            return emptyList()
        }
    }

    private object EmptyStore : MessagePrefetchStore {
        override suspend fun heldWindow(conversationId: String, limit: Int) = HeldMessageWindow.EMPTY
        override suspend fun persist(page: List<ApiMessage>, conversationId: String) = true
    }

    private fun row(id: String) =
        ApiConversation(id = id, lastMessage = ApiConversationLastMessage(id = "m-$id", createdAt = "2026-10-01T10:00:00.000Z"))

    private fun session(owner: () -> String?) = mockk<SessionRepository> { every { currentUserId } answers { owner() } }

    @Test
    fun `seules les vingt premieres conversations sont prechargees`() = runTest {
        val source = Source()
        val prefetcher = ConversationListMessagePrefetcher(source, EmptyStore, StandardTestDispatcher(testScheduler))
        val triggers = ConversationListMessagePrefetchTriggers(prefetcher, AppForegroundSignal())

        triggers.onListLoaded(session { "u1" }, (1..25).map { row("c$it") })
        prefetcher.waitUntilIdle()

        assertThat(source.requested).hasSize(20)
        assertThat(source.requested).doesNotContain("c21")
    }

    @Test
    fun `la reconnexion rejoue la passe puis arme le rechargement suivant`() = runTest {
        val source = Source()
        val connected = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val socket = mockk<SocketManager> { every { this@mockk.connected } returns connected }
        val prefetcher = ConversationListMessagePrefetcher(source, EmptyStore, StandardTestDispatcher(testScheduler))
        val triggers = ConversationListMessagePrefetchTriggers(prefetcher, AppForegroundSignal())
        triggers.start(backgroundScope, session { "u1" }, socket) { listOf(row("c1")) }
        runCurrent()

        connected.emit(Unit)
        runCurrent()
        prefetcher.waitUntilIdle()

        assertThat(source.requested).containsExactly("c1")
        triggers.onListLoaded(session { "u1" }, listOf(row("c1")))
        assertThat(prefetcher.takeReloadArm()).isFalse()
    }

    @Test
    fun `un changement de proprietaire de session arrete la passe`() = runTest {
        var owner: String? = "u1"
        val source = Source(onFetch = { owner = "u2" })
        val prefetcher = ConversationListMessagePrefetcher(source, EmptyStore, StandardTestDispatcher(testScheduler))
        val triggers = ConversationListMessagePrefetchTriggers(prefetcher, AppForegroundSignal())

        triggers.onListLoaded(session { owner }, (1..20).map { row("c$it") })
        prefetcher.waitUntilIdle()

        assertThat(source.requested.size).isAtMost(4)
    }

    @Test
    fun `le chargement de la liste lance aussi le prechargement des stories`() = runTest {
        var started = 0
        val stories = ConversationStoryPrefetch(
            source = object : StoryPrefetchSource {
                override suspend fun isTrayCached(): Boolean { started += 1; return true }
                override suspend fun fetchGroups(limit: Int) = null
                override suspend fun saveTray() = Unit
            },
            media = object : StoryMediaPrefetcher {
                override suspend fun image(url: String) = Unit
                override suspend fun video(url: String) = Unit
            },
            gate = { StoryPrefetchGate.Open },
            dispatcher = StandardTestDispatcher(testScheduler),
        )
        val prefetcher = ConversationListMessagePrefetcher(Source(), EmptyStore, StandardTestDispatcher(testScheduler))
        val triggers = ConversationListMessagePrefetchTriggers(prefetcher, AppForegroundSignal(), stories)

        triggers.onListLoaded(session { "u1" }, listOf(row("c1")))
        runCurrent()

        assertThat(started).isEqualTo(1)
    }
}
