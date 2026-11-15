package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus
import org.junit.Test

private fun incoming(showSenderName: Boolean = true) = BubbleContent(
    messageId = "m1",
    text = "Salut",
    isOutgoing = false,
    isTranslated = false,
    originalText = null,
    senderName = "Zoé",
    showSenderName = showSenderName,
    isEdited = false,
    isDeleted = false,
    createdAtIso = null,
    deliveryStatus = DeliveryStatus.Sent,
)

class ChatSenderNameTest {

    @Test
    fun `in a one to one conversation the peer name never repeats above their messages`() {
        assertThat(incoming().inConversation(isGroup = false).showSenderName).isFalse()
    }

    @Test
    fun `in a group the first message of a series keeps its sender name`() {
        assertThat(incoming().inConversation(isGroup = true).showSenderName).isTrue()
    }

    @Test
    fun `a bubble that already hides its name is returned untouched`() {
        val bubble = incoming(showSenderName = false)

        assertThat(bubble.inConversation(isGroup = false)).isSameInstanceAs(bubble)
    }
}
