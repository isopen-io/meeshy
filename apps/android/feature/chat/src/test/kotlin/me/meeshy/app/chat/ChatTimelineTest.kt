package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneOffset

private fun bubble(id: String, createdAtIso: String?) = BubbleContent(
    messageId = id,
    text = "hi",
    isOutgoing = false,
    isTranslated = false,
    originalText = null,
    senderName = null,
    showSenderName = false,
    isEdited = false,
    isDeleted = false,
    createdAtIso = createdAtIso,
)

class ChatTimelineTest {

    private val utc = ZoneOffset.UTC

    @Test
    fun `messages of the same day share one header`() {
        val items = buildTimeline(
            listOf(
                bubble("m1", "2026-06-10T08:00:00Z"),
                bubble("m2", "2026-06-10T21:30:00Z"),
            ),
            utc,
        )

        assertThat(items).hasSize(3)
        assertThat((items[0] as ChatTimelineItem.DayHeader).date)
            .isEqualTo(LocalDate.of(2026, 6, 10))
        assertThat((items[1] as ChatTimelineItem.Message).bubble.messageId).isEqualTo("m1")
        assertThat((items[2] as ChatTimelineItem.Message).bubble.messageId).isEqualTo("m2")
    }

    @Test
    fun `a new day starts a new header`() {
        val items = buildTimeline(
            listOf(
                bubble("m1", "2026-06-10T23:59:00Z"),
                bubble("m2", "2026-06-11T00:01:00Z"),
            ),
            utc,
        )

        val headers = items.filterIsInstance<ChatTimelineItem.DayHeader>()
        assertThat(headers.map { it.date })
            .containsExactly(LocalDate.of(2026, 6, 10), LocalDate.of(2026, 6, 11))
            .inOrder()
        assertThat(items.last()).isInstanceOf(ChatTimelineItem.Message::class.java)
    }

    @Test
    fun `the day boundary respects the zone not UTC`() {
        val paris = java.time.ZoneId.of("Europe/Paris")

        val items = buildTimeline(listOf(bubble("m1", "2026-06-10T22:30:00Z")), paris)

        assertThat((items.first() as ChatTimelineItem.DayHeader).date)
            .isEqualTo(LocalDate.of(2026, 6, 11))
    }

    @Test
    fun `unparseable timestamps ride along without their own header`() {
        val items = buildTimeline(
            listOf(
                bubble("m1", "2026-06-10T08:00:00Z"),
                bubble("m2", null),
            ),
            utc,
        )

        assertThat(items.filterIsInstance<ChatTimelineItem.DayHeader>()).hasSize(1)
        assertThat(items).hasSize(3)
    }

    @Test
    fun `an empty list yields an empty timeline`() {
        assertThat(buildTimeline(emptyList(), utc)).isEmpty()
    }
}
