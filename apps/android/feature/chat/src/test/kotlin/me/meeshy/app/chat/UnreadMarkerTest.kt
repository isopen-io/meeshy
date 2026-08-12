package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

private fun bubble(id: String, outgoing: Boolean) = BubbleContent(
    messageId = id,
    text = "m",
    isOutgoing = outgoing,
    isTranslated = false,
    originalText = null,
    senderName = null,
    showSenderName = false,
    isEdited = false,
    isDeleted = false,
    createdAtIso = null,
)

class UnreadMarkerTest {

    @Test
    fun `no unread count yields no marker`() {
        val bubbles = listOf(bubble("m1", outgoing = false), bubble("m2", outgoing = false))
        assertThat(UnreadMarker.firstUnreadId(bubbles, unreadCount = 0)).isNull()
    }

    @Test
    fun `a negative unread count yields no marker`() {
        val bubbles = listOf(bubble("m1", outgoing = false))
        assertThat(UnreadMarker.firstUnreadId(bubbles, unreadCount = -3)).isNull()
    }

    @Test
    fun `an empty list yields no marker`() {
        assertThat(UnreadMarker.firstUnreadId(emptyList(), unreadCount = 2)).isNull()
    }

    @Test
    fun `an unread count larger than the loaded window yields no marker`() {
        val bubbles = listOf(bubble("m1", outgoing = false), bubble("m2", outgoing = false))
        assertThat(UnreadMarker.firstUnreadId(bubbles, unreadCount = 3)).isNull()
    }

    @Test
    fun `the marker sits count-from-the-end`() {
        val bubbles = listOf(
            bubble("m1", outgoing = false),
            bubble("m2", outgoing = false),
            bubble("m3", outgoing = false),
            bubble("m4", outgoing = false),
        )
        // 2 unread → boundary is the message at index size-2 = m3.
        assertThat(UnreadMarker.firstUnreadId(bubbles, unreadCount = 2)).isEqualTo("m3")
    }

    @Test
    fun `an unread count equal to the window marks the first message`() {
        val bubbles = listOf(bubble("m1", outgoing = false), bubble("m2", outgoing = false))
        assertThat(UnreadMarker.firstUnreadId(bubbles, unreadCount = 2)).isEqualTo("m1")
    }

    @Test
    fun `a single incoming unread message is its own marker`() {
        val bubbles = listOf(bubble("only", outgoing = false))
        assertThat(UnreadMarker.firstUnreadId(bubbles, unreadCount = 1)).isEqualTo("only")
    }

    @Test
    fun `an own message at the boundary is never marked unread`() {
        val bubbles = listOf(
            bubble("m1", outgoing = false),
            bubble("m2", outgoing = true),
            bubble("m3", outgoing = false),
        )
        // boundary index size-2 = m2, which is outgoing → no marker (you never
        // "unread" your own send, matching iOS's `!candidate.isMe` guard).
        assertThat(UnreadMarker.firstUnreadId(bubbles, unreadCount = 2)).isNull()
    }
}
