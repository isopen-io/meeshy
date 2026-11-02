package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.selection.MessageSelection
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MessageSelectionControllerTest {

    private fun bubble(id: String) = BubbleContent(
        messageId = id, text = id, isOutgoing = false, isTranslated = false, originalText = null,
        senderName = null, showSenderName = false, isEdited = false, isDeleted = false, createdAtIso = null,
    )

    private class FakeHost(override val scope: CoroutineScope, ui: MutableStateFlow<ChatUiState>) : ChatControllerHost {
        override val conversationId = "c1"
        override val uiState: StateFlow<ChatUiState> = ui
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    private class Rig(scope: TestScope, initial: List<String>) {
        val ui = MutableStateFlow(ChatUiState(conversationId = "c1", messages = initial.map { id -> id.asBubble() }))
        val controller = MessageSelectionController().also {
            it.attach(FakeHost(scope.backgroundScope, ui))
            scope.runCurrent()
        }

        companion object {
            private fun String.asBubble() = BubbleContent(
                messageId = this, text = this, isOutgoing = false, isTranslated = false, originalText = null,
                senderName = null, showSenderName = false, isEdited = false, isDeleted = false, createdAtIso = null,
            )
        }
    }

    @Test
    fun `the mode starts closed, opens on a seed and closes empty`() = runTest {
        val rig = Rig(this, listOf("m1", "m2"))
        assertThat(rig.controller.selection.value.isActive).isFalse()
        rig.controller.begin("m1")
        assertThat(rig.controller.selection.value.ids).containsExactly("m1")
        rig.controller.end()
        assertThat(rig.controller.selection.value).isEqualTo(MessageSelection.Inactive)
    }

    @Test
    fun `a toggle reports its verdict and an inactive mode ignores it`() = runTest {
        val rig = Rig(this, listOf("m1", "m2"))
        assertThat(rig.controller.toggle("m1")).isEqualTo(MessageSelection.Toggle.Ignored)
        rig.controller.begin("m1")
        assertThat(rig.controller.toggle("m2")).isInstanceOf(MessageSelection.Toggle.Changed::class.java)
        assertThat(rig.controller.selection.value.ids).containsExactly("m1", "m2")
    }

    @Test
    fun `a message that disappears from the thread leaves the selection`() = runTest {
        val rig = Rig(this, listOf("m1", "m2"))
        rig.controller.begin("m1")
        rig.controller.toggle("m2")
        rig.ui.value = rig.ui.value.copy(messages = listOf(bubble("m2")))
        runCurrent()
        assertThat(rig.controller.selection.value.ids).containsExactly("m2")
        assertThat(rig.controller.selection.value.isActive).isTrue()
    }
}
