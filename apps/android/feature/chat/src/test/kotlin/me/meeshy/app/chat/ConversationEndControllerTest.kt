package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationObsoletedSocketEvent
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

/** Le fil ouvert se ferme quand sa conversation est fermée pour tous ou rendue obsolète (#14645). */
class ConversationEndControllerTest {

    private class FakeHost(override val scope: CoroutineScope) : ChatControllerHost {
        override val conversationId: String = "c1"
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(ChatUiState(conversationId = "c1"))
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    private val closed = MutableSharedFlow<ConversationClosedSocketEvent>(extraBufferCapacity = 8)
    private val obsoleted = MutableSharedFlow<ConversationObsoletedSocketEvent>(extraBufferCapacity = 8)
    private val socket = mockk<MessageSocketManager> {
        every { conversationClosed } returns closed
        every { conversationObsoleted } returns obsoleted
    }

    @Test
    fun `another conversation ending leaves the thread open`() = runTest {
        val controller = ConversationEndController(socket).also { it.attach(FakeHost(backgroundScope)) }
        runCurrent()

        closed.emit(ConversationClosedSocketEvent(conversationId = "c2", closedBy = "u"))
        obsoleted.emit(ConversationObsoletedSocketEvent(conversationId = "c2"))
        runCurrent()

        assertThat(controller.ended.value).isFalse()
    }

    @Test
    fun `this conversation closed for everyone ends the thread`() = runTest {
        val controller = ConversationEndController(socket).also { it.attach(FakeHost(backgroundScope)) }
        runCurrent()

        closed.emit(ConversationClosedSocketEvent(conversationId = "c1", closedBy = "u"))
        runCurrent()

        assertThat(controller.ended.value).isTrue()
    }

    @Test
    fun `this conversation made obsolete ends the thread, even without the closed frame`() = runTest {
        val controller = ConversationEndController(socket).also { it.attach(FakeHost(backgroundScope)) }
        runCurrent()

        obsoleted.emit(ConversationObsoletedSocketEvent(conversationId = "c1", obsoletedBy = "admin"))
        runCurrent()

        assertThat(controller.ended.value).isTrue()
    }
}
