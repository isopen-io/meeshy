package me.meeshy.app.chat

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import me.meeshy.sdk.util.isoToEpochMillis
import me.meeshy.ui.component.bubble.BubbleContent

/** One row of the chat list: a day separator, the unread boundary, or a message bubble. */
sealed class ChatListItem {
    abstract val key: String

    /**
     * Le type de composition de la rangée : `LazyColumn` ne réutilise une composition que d'un item
     * de MÊME type, donc une bulle ne recompose jamais en séparateur de jour (ni l'inverse).
     */
    abstract val contentType: String

    data class DayHeader(val dayMillis: Long) : ChatListItem() {
        override val contentType: String get() = "day"
        override val key: String get() = "day-$dayMillis"
    }

    /**
     * The "new messages" boundary, drawn directly above the first unread message. [count] is the
     * number of messages received from that boundary on — iOS reads « N messages non lus »
     * (`UnreadCountLabel.messages`); 0 falls back to the plain label.
     */
    data class UnreadSeparator(val count: Int = 0) : ChatListItem() {
        override val contentType: String get() = "unread"
        override val key: String get() = "unread-separator"
    }

    /** The end-to-end-encryption notice, pinned at the very top once the reader
     * has reached the start of an encrypted conversation's history. */
    data object EncryptionNotice : ChatListItem() {
        override val contentType: String get() = "encryption-notice"
        override val key: String get() = "encryption-notice"
    }

    /**
     * « Début de la conversation avec <nom> » (iOS `FocalConversationStartRow`) : le marqueur posé
     * en tête du fil quand l'historique est entièrement chargé. [firstMessageDayMillis] est le jour
     * du premier message chargé, nul si son horodatage est illisible.
     */
    data class ConversationStart(val conversationName: String, val firstMessageDayMillis: Long?) : ChatListItem() {
        override val contentType: String get() = "conversation-start"
        override val key: String get() = "conversation-start"
    }

    data class Message(val bubble: BubbleContent) : ChatListItem() {
        override val contentType: String get() = "bubble"
        override val key: String get() = bubble.messageId
    }
}

/**
 * Interleaves day separators into an ascending message list — port of the
 * iOS `MessageListItem.dayHeader` datasource rows. A message without a
 * parsable timestamp never opens a new day: it rides with the previous group.
 *
 * When [firstUnreadId] names a loaded message, a single [ChatListItem.UnreadSeparator]
 * is inserted directly above it (below that message's day header, if any). An id
 * absent from [bubbles] inserts nothing.
 *
 * [serverUnreadCount] is the count the separator announces (the server's, #7525); the window count only
 * stands in when the server count is unknown or zero.
 *
 * When [showEncryptionNotice] is true, a single [ChatListItem.EncryptionNotice]
 * is prepended above everything (including the first day header) — the reader is at
 * the start of an encrypted conversation's history.
 */
fun buildChatListItems(
    bubbles: List<BubbleContent>,
    zone: ZoneId,
    firstUnreadId: String? = null,
    showEncryptionNotice: Boolean = false,
    conversationStartName: String? = null,
    serverUnreadCount: Int? = null,
): List<ChatListItem> {
    val items = mutableListOf<ChatListItem>()
    if (showEncryptionNotice) {
        items += ChatListItem.EncryptionNotice
    }
    if (conversationStartName != null && bubbles.isNotEmpty()) {
        val firstMillis = isoToEpochMillis(bubbles.first().createdAtIso)
        items += ChatListItem.ConversationStart(
            conversationName = conversationStartName,
            firstMessageDayMillis = firstMillis.takeIf { it > 0L },
        )
    }
    var currentDay: LocalDate? = null
    val unreadIndex = firstUnreadId?.let { id -> bubbles.indexOfFirst { it.messageId == id } } ?: -1
    val windowUnreadCount = if (unreadIndex < 0) 0 else bubbles.subList(unreadIndex, bubbles.size).count { !it.isOutgoing }
    val unreadCount = serverUnreadCount?.takeIf { it > 0 } ?: windowUnreadCount
    bubbles.forEach { bubble ->
        val millis = isoToEpochMillis(bubble.createdAtIso)
        if (millis > 0L) {
            val day = Instant.ofEpochMilli(millis).atZone(zone).toLocalDate()
            if (day != currentDay) {
                currentDay = day
                items += ChatListItem.DayHeader(millis)
            }
        }
        if (firstUnreadId != null && bubble.messageId == firstUnreadId) {
            items += ChatListItem.UnreadSeparator(unreadCount)
        }
        items += ChatListItem.Message(bubble)
    }
    return items
}

/**
 * Le nom que porte la rangée de début de conversation : seulement quand tout l'historique est
 * chargé ([hasMoreOlder] faux), hors squelette de démarrage à froid, et que la conversation a un
 * titre. Sinon `null` : aucune rangée.
 */
internal object ConversationStartName {
    fun of(title: String?, hasMoreOlder: Boolean, isLoadingInitial: Boolean): String? =
        title?.trim()?.takeIf { it.isNotEmpty() && !hasMoreOlder && !isLoadingInitial }
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

/**
 * Les clés de MISE EN PAGE de la liste, une par ligne : celles que `LazyColumn` suit pour animer
 * l'arrivée et le déplacement des bulles. Une bulle envoyée est RECLÉE à l'accusé (`cid_…` → id
 * serveur) : suivie par `messageId`, elle se retirerait puis se réinsérerait, donc clignoterait à
 * chaque envoi. Son `clientMessageId` ne change jamais, il la désigne donc tout au long. Les
 * recherches par `messageId` (saut, focale) gardent [ChatListItem.key]. Une clé répétée ferait
 * planter la liste : la répétition reprend un suffixe.
 */
internal fun layoutKeys(items: List<ChatListItem>): List<String> {
    val seen = HashSet<String>(items.size)
    return items.map { item ->
        val base = when (item) {
            is ChatListItem.Message -> "m-" + (item.bubble.clientMessageId ?: item.bubble.messageId)
            else -> item.key
        }
        var candidate = base
        var n = 1
        while (!seen.add(candidate)) candidate = "$base#${n++}"
        candidate
    }
}

/** Le type de composition du spinner « historique plus ancien » posé au-dessus du fil. */
internal const val LOADING_OLDER_CONTENT_TYPE = "loading-older"
