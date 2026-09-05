package me.meeshy.sdk.model

import java.time.LocalDate

/**
 * Pure presentation projections for a conversation's message statistics — the
 * single source of truth the stats dashboard renders. Faithful port of the
 * derivations iOS scatters as computed properties inside
 * `ConversationDashboardView` (`contentTypeStats`, `activityData`), lifted here so
 * every branch is JVM-testable and the Composable stays a thin renderer.
 *
 * SOTA over iOS on two counts:
 *  - **Content types are driven by the server [ContentTypeCounts] SSOT**, not a
 *    client re-count of the loaded page (iOS's `contentTypeStats` walks `messages`
 *    and silently under-counts anything not yet paged in).
 *  - **[activitySeries] takes an explicit `today`** instead of reading the wall
 *    clock inside a view getter, so the window filter is deterministic under test.
 */

/** The six content kinds the gateway tallies, in canonical display order. */
public enum class ContentTypeKind { TEXT, IMAGE, AUDIO, VIDEO, FILE, LOCATION }

/** One content-kind row: its absolute [count] and [fraction] (0..1) of the whole. */
public data class ContentTypeShare(
    val kind: ContentTypeKind,
    val count: Int,
    val fraction: Double,
)

/** The activity-chart windows offered by the period picker (parity iOS `ChartPeriod`). */
public enum class ActivityPeriod(val days: Int?) {
    WEEK(7),
    MONTH(30),
    ALL(null),
}

/** One point on the activity line: the original `yyyy-MM-dd` [date] string and its [count]. */
public data class ActivityPoint(val date: String, val count: Int)

/** One participant's contribution: [messageCount]/[wordCount] and the [fraction] (0..1) of all messages. */
public data class ParticipantShare(
    val userId: String,
    val name: String?,
    val messageCount: Int,
    val wordCount: Int,
    val fraction: Double,
)

/** One language row: its [count] and [fraction] (0..1) of all detected messages. */
public data class LanguageShare(
    val language: String,
    val count: Int,
    val fraction: Double,
)

/** The attachment kinds a client-side fallback can tally (parity iOS `AttachmentType`). */
public enum class ClientAttachmentKind { IMAGE, AUDIO, VIDEO, FILE, LOCATION }

/**
 * One in-memory message, reduced to what the client-side stats fallback needs.
 *
 * [day] is the message's local calendar day — the caller resolves the
 * instant→day in the device zone, keeping [ConversationStatsProjection.clientComputed]
 * a pure, timezone-free grouping (the same "pass the clock in" doctrine
 * [ConversationStatsProjection.activitySeries] already follows for `today`).
 */
public data class ClientStatMessage(
    val senderId: String,
    val senderName: String? = null,
    val content: String = "",
    val attachmentKinds: List<ClientAttachmentKind> = emptyList(),
    val day: LocalDate,
)

public object ConversationStatsProjection {

    /**
     * The non-empty content kinds, each with its share of the total, ordered by
     * count descending (canonical [ContentTypeKind] order breaks ties). Returns an
     * empty list when nothing has been sent — a zero total never divides.
     */
    public fun contentTypeBreakdown(counts: ContentTypeCounts): List<ContentTypeShare> {
        val ordered = listOf(
            ContentTypeKind.TEXT to counts.text,
            ContentTypeKind.IMAGE to counts.image,
            ContentTypeKind.AUDIO to counts.audio,
            ContentTypeKind.VIDEO to counts.video,
            ContentTypeKind.FILE to counts.file,
            ContentTypeKind.LOCATION to counts.location,
        )
        val total = ordered.sumOf { it.second }
        if (total <= 0) return emptyList()
        return ordered
            .filter { it.second > 0 }
            .map { (kind, count) -> ContentTypeShare(kind, count, count.toDouble() / total) }
            .sortedWith(compareByDescending<ContentTypeShare> { it.count }.thenBy { it.kind.ordinal })
    }

    /**
     * A fixed 24-slot histogram of messages per hour-of-day. Keys are the
     * gateway's stringified hours (`"0".."23"`); a non-numeric or out-of-range key
     * is ignored, a negative count is clamped to zero, and repeated keys accumulate.
     */
    public fun hourlyBuckets(distribution: Map<String, Int>): List<Int> {
        val buckets = IntArray(HOURS_PER_DAY)
        for ((key, value) in distribution) {
            val hour = key.trim().toIntOrNull() ?: continue
            if (hour !in 0 until HOURS_PER_DAY) continue
            buckets[hour] += value.coerceAtLeast(0)
        }
        return buckets.toList()
    }

    /**
     * The daily-activity points inside the [period]'s window, oldest first. An
     * unparseable date is dropped; [ActivityPeriod.ALL] keeps every valid point.
     * The window is inclusive of its cutoff (`today - period.days`).
     */
    public fun activitySeries(
        entries: List<DailyActivityEntry>,
        period: ActivityPeriod,
        today: LocalDate,
    ): List<ActivityPoint> {
        val cutoff = period.days?.let { today.minusDays(it.toLong()) }
        return entries
            .mapNotNull { entry ->
                val date = runCatching { LocalDate.parse(entry.date.trim()) }.getOrNull()
                    ?: return@mapNotNull null
                if (cutoff != null && date.isBefore(cutoff)) return@mapNotNull null
                date to ActivityPoint(entry.date, entry.count)
            }
            .sortedBy { it.first }
            .map { it.second }
    }

    /**
     * Per-participant contribution shares, busiest first (name then id break ties
     * for a stable order). [totalMessages] drives the fraction; a non-positive
     * total yields zero fractions rather than dividing by zero.
     */
    public fun participantShares(
        entries: List<ParticipantStatEntry>,
        totalMessages: Int,
    ): List<ParticipantShare> =
        entries
            .map { entry ->
                ParticipantShare(
                    userId = entry.userId,
                    name = entry.name,
                    messageCount = entry.messageCount,
                    wordCount = entry.wordCount,
                    fraction = if (totalMessages > 0) entry.messageCount.toDouble() / totalMessages else 0.0,
                )
            }
            .sortedWith(
                compareByDescending<ParticipantShare> { it.messageCount }
                    .thenBy { it.name ?: "" }
                    .thenBy { it.userId },
            )

    /**
     * Language shares, most-used first (language code breaks ties). Returns empty
     * when nothing was detected — a zero total never divides.
     */
    public fun languageShares(entries: List<LanguageEntry>): List<LanguageShare> {
        val total = entries.sumOf { it.count }
        if (total <= 0) return emptyList()
        return entries
            .filter { it.count > 0 }
            .map { LanguageShare(it.language, it.count, it.count.toDouble() / total) }
            .sortedWith(compareByDescending<LanguageShare> { it.count }.thenBy { it.language })
    }

    /**
     * Compute a [ConversationMessageStatsResponse] from the messages already loaded
     * in memory — the client-side fallback the stats sheet shows before, or instead
     * of, the server aggregation (offline, or a failed/lagging fetch). A faithful
     * port of iOS's `clientComputed*` computed properties in `ConversationDashboardView`,
     * lifted here so the same [ConversationStatsProjection] path renders either source.
     *
     * Semantics kept identical to iOS:
     *  - a word is a maximal run of non-whitespace (empty and blank content ⇒ 0 words);
     *  - a message with NO attachments and non-empty content counts as one TEXT item
     *    (a caption alongside an attachment does not — the attachments win);
     *  - participants accumulate by [ClientStatMessage.senderId] (SOTA over iOS, which
     *    groups by display name and so merges distinct users who share one).
     *
     * The daily series is emitted oldest-first as `yyyy-MM-dd` strings so
     * [activitySeries] windows it unchanged. `hourlyDistribution` and
     * `languageDistribution` stay empty — neither is derivable from the reduced
     * message shape without the wall clock / a detector, matching iOS's own fallback.
     */
    public fun clientComputed(
        conversationId: String,
        messages: List<ClientStatMessage>,
    ): ConversationMessageStatsResponse {
        var text = 0
        var image = 0
        var audio = 0
        var video = 0
        var file = 0
        var location = 0
        var totalWords = 0
        var totalCharacters = 0

        val byUser = LinkedHashMap<String, ParticipantAccumulator>()
        val byDay = HashMap<LocalDate, Int>()

        for (message in messages) {
            val words = wordCount(message.content)
            totalWords += words
            totalCharacters += message.content.length

            if (message.attachmentKinds.isEmpty()) {
                if (message.content.isNotEmpty()) text += 1
            } else {
                for (kind in message.attachmentKinds) {
                    when (kind) {
                        ClientAttachmentKind.IMAGE -> image += 1
                        ClientAttachmentKind.AUDIO -> audio += 1
                        ClientAttachmentKind.VIDEO -> video += 1
                        ClientAttachmentKind.FILE -> file += 1
                        ClientAttachmentKind.LOCATION -> location += 1
                    }
                }
            }

            val accumulator = byUser.getOrPut(message.senderId) { ParticipantAccumulator(message.senderName) }
            accumulator.messageCount += 1
            accumulator.wordCount += words
            if (accumulator.name == null) accumulator.name = message.senderName

            byDay[message.day] = (byDay[message.day] ?: 0) + 1
        }

        return ConversationMessageStatsResponse(
            conversationId = conversationId,
            totalMessages = messages.size,
            totalWords = totalWords,
            totalCharacters = totalCharacters,
            contentTypes = ContentTypeCounts(
                text = text,
                image = image,
                audio = audio,
                video = video,
                file = file,
                location = location,
            ),
            participantStats = byUser.map { (id, accumulator) ->
                ParticipantStatEntry(
                    userId = id,
                    name = accumulator.name,
                    messageCount = accumulator.messageCount,
                    wordCount = accumulator.wordCount,
                )
            },
            dailyActivity = byDay.entries
                .sortedBy { it.key }
                .map { DailyActivityEntry(date = it.key.toString(), count = it.value) },
        )
    }

    private class ParticipantAccumulator(var name: String?) {
        var messageCount = 0
        var wordCount = 0
    }

    private fun wordCount(content: String): Int =
        content.split(WHITESPACE).count { it.isNotEmpty() }

    private val WHITESPACE = Regex("\\s+")

    private const val HOURS_PER_DAY = 24
}
