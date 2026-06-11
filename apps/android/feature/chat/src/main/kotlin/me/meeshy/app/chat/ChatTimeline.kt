package me.meeshy.app.chat

import me.meeshy.ui.component.bubble.BubbleContent
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId

sealed interface ChatTimelineItem {
    val key: String

    data class DayHeader(val date: LocalDate) : ChatTimelineItem {
        override val key: String get() = "day-$date"
    }

    data class Message(val bubble: BubbleContent) : ChatTimelineItem {
        override val key: String get() = bubble.messageId
    }
}

/**
 * Folds the chronological bubble list into a renderable timeline: a day header
 * opens each new local day. Bubbles without a parseable timestamp stay in the
 * current day group — never alone under a missing header.
 */
fun buildTimeline(bubbles: List<BubbleContent>, zone: ZoneId): List<ChatTimelineItem> {
    val items = mutableListOf<ChatTimelineItem>()
    var currentDay: LocalDate? = null
    for (bubble in bubbles) {
        val day = bubble.createdAtIso?.let { parseLocalDate(it, zone) }
        if (day != null && day != currentDay) {
            currentDay = day
            items += ChatTimelineItem.DayHeader(day)
        }
        items += ChatTimelineItem.Message(bubble)
    }
    return items
}

private fun parseLocalDate(iso: String, zone: ZoneId): LocalDate? =
    runCatching { Instant.parse(iso).atZone(zone).toLocalDate() }
        .recoverCatching { OffsetDateTime.parse(iso).atZoneSameInstant(zone).toLocalDate() }
        .getOrNull()
