package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.chat.InMemoryComposerFoldStore
import me.meeshy.sdk.conversation.LocalMessage
import org.junit.Test

/** La barre de composition rouvre une conversation dans l'état où on l'a laissée (#16341). */
class ComposerFoldControllerTest {

    private class FakeHost(override val scope: CoroutineScope, override val conversationId: String) : ChatControllerHost {
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(ChatUiState(conversationId = conversationId))
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    private fun CoroutineScope.open(store: InMemoryComposerFoldStore, conversationId: String) =
        ComposerFoldController(store).also { it.attach(FakeHost(this, conversationId)) }

    @Test
    fun `une conversation jamais touchee s ouvre barre depliee`() = runTest {
        assertThat(backgroundScope.open(InMemoryComposerFoldStore(), "c1").minimized.value).isFalse()
    }

    @Test
    fun `une barre repliee se retrouve repliee a la reouverture`() = runTest {
        val store = InMemoryComposerFoldStore()
        backgroundScope.open(store, "c1").setMinimized(true)
        assertThat(backgroundScope.open(store, "c1").minimized.value).isTrue()
    }

    @Test
    fun `replier une conversation laisse les autres depliees`() = runTest {
        val store = InMemoryComposerFoldStore()
        backgroundScope.open(store, "c1").setMinimized(true)
        assertThat(backgroundScope.open(store, "c2").minimized.value).isFalse()
    }

    @Test
    fun `deplier publie aussitot le nouvel etat et le retient`() = runTest {
        val store = InMemoryComposerFoldStore().apply { setMinimized("c1", true) }
        val controller = backgroundScope.open(store, "c1")
        controller.setMinimized(false)
        assertThat(controller.minimized.value).isFalse()
        assertThat(store.isMinimized("c1")).isFalse()
    }

    @Test
    fun `avant l ouverture rien n est ecrit`() {
        val store = InMemoryComposerFoldStore()
        ComposerFoldController(store).setMinimized(true)
        assertThat(store.isMinimized("")).isFalse()
    }
}
