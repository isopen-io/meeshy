package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

private fun bubble(id: String, outgoing: Boolean, at: String? = null) = BubbleContent(
    messageId = id,
    text = "m",
    isOutgoing = outgoing,
    isTranslated = false,
    originalText = null,
    senderName = null,
    showSenderName = false,
    isEdited = false,
    isDeleted = false,
    createdAtIso = at,
)

private fun cursor(
    lastReadCreatedAt: Long? = null,
    lastReadMessageId: String? = null,
    server: Int = 0,
) = UnreadCursor(lastReadMessageId, null, lastReadCreatedAt, null, server)

class UnreadMarkerTest {

    private val t1 = "2026-01-01T10:00:01.000Z"
    private val t2 = "2026-01-01T10:00:02.000Z"
    private val t3 = "2026-01-01T10:00:03.000Z"
    private val at1 = 1767261601000L

    @Test
    fun `no cursor and nothing unread on the server yields no marker`() {
        val bubbles = listOf(bubble("m1", false, t1), bubble("m2", false, t2))
        assertThat(UnreadMarker.firstUnreadId(bubbles, cursor(server = 0), "me")).isNull()
    }

    @Test
    fun `without a cursor the server count places the marker on the last N incoming`() {
        val bubbles = listOf(bubble("m1", false, t1), bubble("m2", false, t2), bubble("m3", false, t3))
        assertThat(UnreadMarker.firstUnreadId(bubbles, cursor(server = 2), "me")).isEqualTo("m2")
    }

    @Test
    fun `a cursor wins over a stale server count`() {
        val bubbles = listOf(bubble("m1", false, t1), bubble("m2", false, t2), bubble("m3", false, t3))
        assertThat(UnreadMarker.firstUnreadId(bubbles, cursor(lastReadCreatedAt = at1, server = 0), "me"))
            .isEqualTo("m2")
    }

    @Test
    fun `the marker never lands on the viewer own message`() {
        val bubbles = listOf(bubble("m1", false, t1), bubble("m2", true, t2), bubble("m3", false, t3))
        assertThat(UnreadMarker.firstUnreadId(bubbles, cursor(lastReadCreatedAt = at1), "me")).isEqualTo("m3")
    }

    @Test
    fun `everything read gives no marker`() {
        val bubbles = listOf(bubble("m1", false, t1))
        assertThat(UnreadMarker.firstUnreadId(bubbles, cursor(lastReadCreatedAt = at1), "me")).isNull()
    }
}
