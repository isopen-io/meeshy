package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.chat.ChatRouterBus
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.navigation.ReplyContextRequest
import org.junit.Test

class ChatRouterControllerTest {

    private class FakeHost(override val scope: CoroutineScope, override val conversationId: String = "c1") : ChatControllerHost {
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(ChatUiState(conversationId = conversationId))
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    @Test
    fun `une demande posee avant l'ouverture est appliquee une fois`() = runTest {
        val bus = ChatRouterBus().apply { requestHighlight("m1", "c1"); requestSearch("c1") }
        val controller = ChatRouterController(bus).also { it.attach(FakeHost(backgroundScope)) }
        runCurrent()

        assertThat(controller.events.first()).isEqualTo(ChatRouterEvent.Highlight("m1"))
        assertThat(controller.events.first()).isEqualTo(ChatRouterEvent.OpenSearch)
        assertThat(bus.consume("c1").isEmpty).isTrue()
    }

    @Test
    fun `une demande a chaud est appliquee sans reouvrir le fil`() = runTest {
        val bus = ChatRouterBus()
        val controller = ChatRouterController(bus).also { it.attach(FakeHost(backgroundScope)) }
        runCurrent()

        bus.requestHighlight("m9", "c1")
        runCurrent()

        assertThat(controller.events.first()).isEqualTo(ChatRouterEvent.Highlight("m9"))
    }

    @Test
    fun `la demande d'une autre conversation reste intacte`() = runTest {
        val bus = ChatRouterBus().apply { requestHighlight("m2", "c2"); requestSearch("c2") }
        ChatRouterController(bus).attach(FakeHost(backgroundScope))
        runCurrent()

        val other = bus.consume("c2")
        assertThat(other.highlightMessageId).isEqualTo("m2")
        assertThat(other.openSearch).isTrue()
    }

    @Test
    fun `le contexte de reponse n'est tenu que pour sa conversation`() = runTest {
        val bus = ChatRouterBus().apply { requestReply(ReplyContextRequest("c1", "s1", "story")) }
        val controller = ChatRouterController(bus).also { it.attach(FakeHost(backgroundScope)) }
        runCurrent()

        assertThat(controller.replyContext.value?.targetId).isEqualTo("s1")
        controller.replyContextTaken()
        assertThat(controller.replyContext.value).isNull()
    }
}
