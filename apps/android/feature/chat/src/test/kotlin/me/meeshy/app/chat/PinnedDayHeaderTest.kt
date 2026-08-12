package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

private fun pinnedBubble(id: String, createdAtIso: String?) = BubbleContent(
    messageId = id,
    text = "m",
    isOutgoing = false,
    isTranslated = false,
    originalText = null,
    senderName = null,
    showSenderName = false,
    isEdited = false,
    isDeleted = false,
    createdAtIso = createdAtIso,
)

class PinnedDayHeaderTest {

    private val zone = ZoneOffset.UTC

    // [DayHeader(d1), m1, DayHeader(d2), m2, m3]
    private val twoDayItems = buildChatListItems(
        listOf(
            pinnedBubble("m1", "2026-06-10T08:00:00Z"),
            pinnedBubble("m2", "2026-06-11T08:00:00Z"),
            pinnedBubble("m3", "2026-06-11T09:00:00Z"),
        ),
        zone,
    )

    private val d1 get() = (twoDayItems[0] as ChatListItem.DayHeader).dayMillis
    private val d2 get() = (twoDayItems[2] as ChatListItem.DayHeader).dayMillis

    @Test
    fun `an empty list has no governing day`() {
        assertThat(PinnedDayHeader.governingDayMillis(emptyList(), 0)).isNull()
    }

    @Test
    fun `a negative top index has no governing day`() {
        assertThat(PinnedDayHeader.governingDayMillis(twoDayItems, -1)).isNull()
    }

    @Test
    fun `a message under its day header pins that header's day`() {
        // index 1 = m1, governed by the header at index 0
        assertThat(PinnedDayHeader.governingDayMillis(twoDayItems, 1)).isEqualTo(d1)
    }

    @Test
    fun `when the day header itself is the topmost row nothing floats`() {
        // index 0 = DayHeader(d1): the inline header is already on screen
        assertThat(PinnedDayHeader.governingDayMillis(twoDayItems, 0)).isNull()
        // index 2 = DayHeader(d2): same rule for a later section
        assertThat(PinnedDayHeader.governingDayMillis(twoDayItems, 2)).isNull()
    }

    @Test
    fun `a message in a later section pins that later day after its header scrolled off`() {
        // index 3 = m2, index 4 = m3, both governed by the header at index 2
        assertThat(PinnedDayHeader.governingDayMillis(twoDayItems, 3)).isEqualTo(d2)
        assertThat(PinnedDayHeader.governingDayMillis(twoDayItems, 4)).isEqualTo(d2)
    }

    @Test
    fun `a top index past the end clamps to the last section's day`() {
        assertThat(PinnedDayHeader.governingDayMillis(twoDayItems, 99)).isEqualTo(d2)
    }

    @Test
    fun `an unread separator is governed by the day header above it`() {
        // [DayHeader, m1, UnreadSeparator, m2]
        val items = buildChatListItems(
            listOf(
                pinnedBubble("m1", "2026-06-11T08:00:00Z"),
                pinnedBubble("m2", "2026-06-11T09:00:00Z"),
            ),
            zone,
            firstUnreadId = "m2",
        )
        val header = (items[0] as ChatListItem.DayHeader).dayMillis
        val separatorIndex = items.indexOfFirst { it is ChatListItem.UnreadSeparator }
        assertThat(PinnedDayHeader.governingDayMillis(items, separatorIndex)).isEqualTo(header)
    }

    @Test
    fun `a row above the first day header has no governing day`() {
        // [EncryptionNotice, DayHeader, m1] — the notice sits above every header
        val items = buildChatListItems(
            listOf(pinnedBubble("m1", "2026-06-11T08:00:00Z")),
            zone,
            showEncryptionNotice = true,
        )
        assertThat(items[0]).isInstanceOf(ChatListItem.EncryptionNotice::class.java)
        assertThat(PinnedDayHeader.governingDayMillis(items, 0)).isNull()
        // ...but a message below still pins its header
        val messageIndex = items.indexOfFirst { it is ChatListItem.Message }
        val header = items.filterIsInstance<ChatListItem.DayHeader>().first().dayMillis
        assertThat(PinnedDayHeader.governingDayMillis(items, messageIndex)).isEqualTo(header)
    }

    @Test
    fun `TopDown is the default orientation, unchanged from the orientation-less overload`() {
        assertThat(PinnedDayHeader.governingDayMillis(twoDayItems, 1, ChatListOrientation.TopDown))
            .isEqualTo(PinnedDayHeader.governingDayMillis(twoDayItems, 1))
    }

    // -- BottomUp (reverseLayout) -----------------------------------------
    //
    // Reversing item order flips a day header from BEFORE its day's messages
    // to AFTER them (`[DayHeader(d1), m1, DayHeader(d2), m2, m3]` reversed is
    // `[m3, m2, DayHeader(d2), m1, DayHeader(d1)]`), so the governing search
    // must scan UP toward the end of the list instead of down toward 0.

    private val reversedTwoDayItems = twoDayItems.asReversed()

    @Test
    fun `BottomUp -- a message pins the day header that now sits after it`() {
        // reversed = [m3@0, m2@1, DayHeader(d2)@2, m1@3, DayHeader(d1)@4]
        assertThat(PinnedDayHeader.governingDayMillis(reversedTwoDayItems, 0, ChatListOrientation.BottomUp))
            .isEqualTo(d2)
        assertThat(PinnedDayHeader.governingDayMillis(reversedTwoDayItems, 1, ChatListOrientation.BottomUp))
            .isEqualTo(d2)
        assertThat(PinnedDayHeader.governingDayMillis(reversedTwoDayItems, 3, ChatListOrientation.BottomUp))
            .isEqualTo(d1)
    }

    @Test
    fun `BottomUp -- the day header itself as the topmost row floats nothing`() {
        assertThat(PinnedDayHeader.governingDayMillis(reversedTwoDayItems, 2, ChatListOrientation.BottomUp))
            .isNull()
        assertThat(PinnedDayHeader.governingDayMillis(reversedTwoDayItems, 4, ChatListOrientation.BottomUp))
            .isNull()
    }

    @Test
    fun `BottomUp -- a top index past the end clamps to the earliest header and floats nothing`() {
        // reversed[4] is DayHeader(d1) — the reversed list's last row is always
        // the earliest section's own inline header, so clamping there behaves
        // like already being scrolled to the very top of history.
        assertThat(PinnedDayHeader.governingDayMillis(reversedTwoDayItems, 99, ChatListOrientation.BottomUp))
            .isNull()
    }

    @Test
    fun `BottomUp -- an empty list or negative index has no governing day`() {
        assertThat(PinnedDayHeader.governingDayMillis(emptyList(), 0, ChatListOrientation.BottomUp)).isNull()
        assertThat(PinnedDayHeader.governingDayMillis(reversedTwoDayItems, -1, ChatListOrientation.BottomUp))
            .isNull()
    }
}
