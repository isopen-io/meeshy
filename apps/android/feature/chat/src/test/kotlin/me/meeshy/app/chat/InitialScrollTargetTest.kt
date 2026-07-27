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
}
