package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

private fun row(id: String) = ChatListItem.Message(
    BubbleContent(
        messageId = id,
        text = "m",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
    ),
)

class InitialScrollTargetTest {

    @Test
    fun `an empty list has no scroll target`() {
        assertThat(InitialScrollTarget.of(emptyList())).isNull()
    }

    @Test
    fun `with no unread separator the target is the last row (bottom)`() {
        val items = listOf(row("m1"), row("m2"), row("m3"))

        assertThat(InitialScrollTarget.of(items)).isEqualTo(2)
    }

    @Test
    fun `a single message targets its own row`() {
        assertThat(InitialScrollTarget.of(listOf(row("only")))).isEqualTo(0)
    }

    @Test
    fun `the unread separator wins over the bottom`() {
        val items = listOf(
            row("m1"),
            ChatListItem.UnreadSeparator,
            row("m2"),
            row("m3"),
        )

        assertThat(InitialScrollTarget.of(items)).isEqualTo(1)
    }

    @Test
    fun `a separator riding below a day header targets the separator, not the header`() {
        val items = listOf(
            ChatListItem.DayHeader(dayMillis = 1_000L),
            row("m1"),
            ChatListItem.DayHeader(dayMillis = 2_000L),
            ChatListItem.UnreadSeparator,
            row("m2"),
        )

        assertThat(InitialScrollTarget.of(items)).isEqualTo(3)
    }

    @Test
    fun `a leading separator targets the very top`() {
        val items = listOf(
            ChatListItem.UnreadSeparator,
            row("m1"),
            row("m2"),
        )

        assertThat(InitialScrollTarget.of(items)).isEqualTo(0)
    }

    // -- orientation-aware overload ----------------------------------------

    @Test
    fun `TopDown is the default orientation, unchanged from the orientation-less overload`() {
        val items = listOf(row("m1"), row("m2"), row("m3"))

        assertThat(InitialScrollTarget.of(items, ChatListOrientation.TopDown))
            .isEqualTo(InitialScrollTarget.of(items))
    }

    @Test
    fun `BottomUp -- with no unread separator the target is row zero (bottom of a reversed list)`() {
        // caller passes the RENDERED (reversed, newest-first) list
        val items = listOf(row("m3"), row("m2"), row("m1"))

        assertThat(InitialScrollTarget.of(items, ChatListOrientation.BottomUp)).isEqualTo(0)
    }

    @Test
    fun `BottomUp -- the unread separator still wins, found at its own position in the reversed list`() {
        // reversed: [m3, m2, UnreadSeparator, m1]
        val items = listOf(row("m3"), row("m2"), ChatListItem.UnreadSeparator, row("m1"))

        assertThat(InitialScrollTarget.of(items, ChatListOrientation.BottomUp)).isEqualTo(2)
    }

    @Test
    fun `BottomUp -- a single message targets its own row`() {
        assertThat(InitialScrollTarget.of(listOf(row("only")), ChatListOrientation.BottomUp)).isEqualTo(0)
    }

    @Test
    fun `BottomUp -- an empty list has no scroll target`() {
        assertThat(InitialScrollTarget.of(emptyList(), ChatListOrientation.BottomUp)).isNull()
    }
}
