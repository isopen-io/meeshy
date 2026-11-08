package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ConversationEncryptionChangedSocketEvent
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

/**
 * #13794 — le fil OUVERT annonce le passage au bout en bout fait sous ses yeux, avec le libellé d'iOS
 * (`EncryptionSwitchAnnouncement`) ; une bascule vers un mode lisible par le serveur repeint sans s'annoncer, comme iOS,
 * et une même époque ne s'annonce qu'une fois.
 */
class EncryptionSwitchAnnouncementControllerTest {

    private class FakeHost(override val scope: CoroutineScope) : ChatControllerHost {
        override val conversationId: String = "c1"
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(ChatUiState(conversationId = "c1"))
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    private val changed = MutableSharedFlow<ConversationEncryptionChangedSocketEvent>(extraBufferCapacity = 8)
    private val socket = mockk<MessageSocketManager> { every { encryptionChanged } returns changed }

    private fun event(conversationId: String = "c1", mode: String? = "e2ee", epoch: Int? = 2) =
        ConversationEncryptionChangedSocketEvent(conversationId = conversationId, mode = mode, epoch = epoch)

    @Test
    fun `le passage au bout en bout du fil ouvert s annonce une fois par epoque`() = runTest {
        val controller = EncryptionSwitchAnnouncementController(socket).also { it.attach(FakeHost(backgroundScope)) }
        val heard = mutableListOf<Unit>()
        backgroundScope.launch { controller.announcements.collect { heard += it } }
        runCurrent()

        changed.emit(event())
        changed.emit(event())
        runCurrent()

        assertThat(heard).hasSize(1)
    }

    @Test
    fun `une autre conversation ou un mode lisible par le serveur ne s annonce pas`() = runTest {
        val controller = EncryptionSwitchAnnouncementController(socket).also { it.attach(FakeHost(backgroundScope)) }
        val heard = mutableListOf<Unit>()
        backgroundScope.launch { controller.announcements.collect { heard += it } }
        runCurrent()

        changed.emit(event(conversationId = "c2"))
        changed.emit(event(mode = "hybrid", epoch = 3))
        changed.emit(event(mode = "server", epoch = 4))
        changed.emit(event(mode = null, epoch = 5))
        runCurrent()

        assertThat(heard).isEmpty()
    }
}
