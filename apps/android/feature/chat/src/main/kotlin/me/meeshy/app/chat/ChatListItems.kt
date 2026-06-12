package me.meeshy.app.chat

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import me.meeshy.sdk.util.isoToEpochMillis
import me.meeshy.ui.component.bubble.BubbleContent

/** One row of the chat list: a day separator or a message bubble. */
sealed class ChatListItem {
    abstract val key: String

    data class DayHeader(val dayMillis: Long) : ChatListItem() {
        override val key: String get() = "day-$dayMillis"
    }

    data class Message(val bubble: BubbleContent) : ChatListItem() {
        override val key: String get() = bubble.messageId
    }
}

/**
 * Interleaves day separators into an ascending message list — port of the
 * iOS `MessageListItem.dayHeader` datasource rows. A message without a
 * parsable timestamp never opens a new day: it rides with the previous group.
 */
fun buildChatListItems(bubbles: List<BubbleContent>, zone: ZoneId): List<ChatListItem> {
    val items = mutableListOf<ChatListItem>()
    var currentDay: LocalDate? = null
    bubbles.forEach { bubble ->
        val millis = isoToEpochMillis(bubble.createdAtIso)
        if (millis > 0L) {
            val day = Instant.ofEpochMilli(millis).atZone(zone).toLocalDate()
            if (day != currentDay) {
                currentDay = day
                items += ChatListItem.DayHeader(millis)
            }
        }
        items += ChatListItem.Message(bubble)
    }
    return items
}

/**
 * Port of the iOS `MessageDayLabel` (MessageDayLabel.swift): relative labels
 * for the near past, capitalized weekday within the week, full date beyond —
 * with the year only when it differs from the current one.
 */
object MessageDayLabel {

    fun label(
        dayMillis: Long,
        nowMillis: Long,
        zone: ZoneId,
        locale: Locale,
        today: String,
        yesterday: String,
        dayBeforeYesterday: String,
    ): String {
        val target = Instant.ofEpochMilli(dayMillis).atZone(zone).toLocalDate()
        val current = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate()
        val daysDiff = ChronoUnit.DAYS.between(target, current)
        return when {
            daysDiff <= 0L -> today
            daysDiff == 1L -> yesterday
            daysDiff == 2L -> dayBeforeYesterday
            daysDiff <= 6L -> weekday(target, locale)
            else -> fullDate(target, locale, includeYear = target.year != current.year)
        }
    }

    private fun weekday(date: LocalDate, locale: Locale): String =
        DateTimeFormatter.ofPattern("EEEE", locale)
            .format(date)
            .firstLetterUppercased(locale)

    private fun fullDate(date: LocalDate, locale: Locale, includeYear: Boolean): String =
        DateTimeFormatter.ofPattern(if (includeYear) "EEEE d MMMM yyyy" else "EEEE d MMMM", locale)
            .format(date)
            .firstLetterUppercased(locale)

    private fun String.firstLetterUppercased(locale: Locale): String =
        replaceFirstChar { if (it.isLowerCase()) it.titlecase(locale) else it.toString() }
}
