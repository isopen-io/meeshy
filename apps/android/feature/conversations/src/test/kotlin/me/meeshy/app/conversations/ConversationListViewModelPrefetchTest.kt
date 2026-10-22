package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
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

/** Les trois déclencheurs de la passe de préchargement : chargement, premier plan, reconnexion. */
@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListViewModelPrefetchTest {

    private class RecordingSource : MessagePrefetchPageSource {
        val requested = mutableListOf<String>()
        override suspend fun fetchLatestPage(conversationId: String, limit: Int): List<ApiMessage>? {
            requested += conversationId
            return emptyList()
        }
    }

    private object EmptyStore : MessagePrefetchStore {
        override suspend fun heldWindow(conversationId: String, limit: Int) = HeldMessageWindow.EMPTY
        override suspend fun persist(page: List<ApiMessage>, conversationId: String) = true
    }

    private class Harness(scope: TestScope) {
        val source = RecordingSource()
        val foreground = AppForegroundSignal()
        val connected = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val prefetcher = ConversationListMessagePrefetcher(source, EmptyStore, StandardTestDispatcher(scope.testScheduler))
        val triggers = ConversationListMessagePrefetchTriggers(prefetcher, foreground)
        val session = mockk<SessionRepository> { every { currentUserId } returns "u1" }
        val socket = mockk<SocketManager> { every { connected } returns this@Harness.connected }
        var list = listOf(row("c1"), row("c2"))
    }

    private fun row(id: String) =
        ApiConversation(id = id, lastMessage = ApiConversationLastMessage(id = "m-$id", createdAt = "2026-10-01T10:00:00.000Z"))

    @Test
    fun `le chargement de la liste precharge ses premieres conversations`() = runTest {
        val h = Harness(this)
        h.triggers.onListLoaded(h.session, h.list)
        h.prefetcher.waitUntilIdle()
        assertThat(h.source.requested).containsExactly("c1", "c2")
    }

    @Test
    fun `le retour au premier plan rejoue la passe`() = runTest {
        val h = Harness(this)
        h.triggers.start(backgroundScope, h.session, h.socket) { h.list }
        runCurrent()
        h.foreground.notifyEntered()
        runCurrent()
        h.prefetcher.waitUntilIdle()
        assertThat(h.source.requested).containsExactly("c1", "c2")
    }

    @Test
    fun `la reconnexion socket rejoue la passe et arme le rechargement suivant`() = runTest {
        val h = Harness(this)
        h.triggers.start(backgroundScope, h.session, h.socket) { h.list }
        runCurrent()
        h.connected.emit(Unit)
        runCurrent()
        h.prefetcher.waitUntilIdle()
        assertThat(h.source.requested).containsExactly("c1", "c2")
        assertThat(h.prefetcher.takeReloadArm()).isTrue()
    }

    @Test
    fun `sans compte actif rien n est demande`() = runTest {
        val h = Harness(this)
        val anonymous = mockk<SessionRepository> { every { currentUserId } returns null }
        h.triggers.onListLoaded(anonymous, h.list)
        h.prefetcher.waitUntilIdle()
        assertThat(h.source.requested).isEmpty()
    }
}
