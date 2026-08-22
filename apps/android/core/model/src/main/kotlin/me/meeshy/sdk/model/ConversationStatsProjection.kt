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

    private const val HOURS_PER_DAY = 24
}
