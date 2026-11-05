package me.meeshy.sdk.model

/** The seven rings of the unified dashboard, in display order (parity iOS `statsRingsSection`). */
public enum class DashboardRingKind { MESSAGES, WORDS, PHOTOS, AUDIO, VIDEOS, LINKS, DOCUMENTS }

/** One ring: its absolute [value] and the [maxValue] its progress is measured against. */
public data class DashboardRing(
    val kind: DashboardRingKind,
    val value: Int,
    val maxValue: Int,
) {
    /** Filled fraction of the ring, always within 0..1. */
    val progress: Float
        get() = if (maxValue > 0) (value.toFloat() / maxValue).coerceIn(0f, 1f) else 0f
}

/**
 * Pure derivations of the unified conversation dashboard (Stats + Analysis merged),
 * a port of `ConversationDashboardRules` / the `effective*` stats of iOS's
 * `ConversationDashboardView`. Server numbers always win over the on-device snapshot.
 */
public object ConversationDashboardRules {

    /** The participants the breakdown section lists. */
    public const val TOP_PARTICIPANTS: Int = 10

    /** Server aggregation first; the client-computed snapshot only when the server has not answered. */
    public fun effectiveStats(
        server: ConversationMessageStatsResponse?,
        client: ConversationMessageStatsResponse?,
    ): ConversationMessageStatsResponse? = server ?: client

    /** Largest media count (photos, audio, videos, links, documents), floored at 1 so no ring divides by zero. */
    public fun mediaMax(counts: ContentTypeCounts): Int =
        maxOf(counts.image, counts.audio, counts.video, counts.location, counts.file, 1)

    /**
     * The rings, messages and words against their own value, every media ring against
     * [mediaMax]. The documents ring only exists when there is at least one file.
     */
    public fun rings(totalMessages: Int, totalWords: Int, counts: ContentTypeCounts): List<DashboardRing> {
        val media = mediaMax(counts)
        return buildList {
            add(DashboardRing(DashboardRingKind.MESSAGES, totalMessages, maxOf(totalMessages, 1)))
            add(DashboardRing(DashboardRingKind.WORDS, totalWords, maxOf(totalWords, 1)))
            add(DashboardRing(DashboardRingKind.PHOTOS, counts.image, media))
            add(DashboardRing(DashboardRingKind.AUDIO, counts.audio, media))
            add(DashboardRing(DashboardRingKind.VIDEOS, counts.video, media))
            add(DashboardRing(DashboardRingKind.LINKS, counts.location, media))
            if (counts.file > 0) add(DashboardRing(DashboardRingKind.DOCUMENTS, counts.file, media))
        }
    }

    /** The busiest [limit] participants (the input is already ordered busiest first). */
    public fun topParticipants(
        shares: List<ParticipantShare>,
        limit: Int = TOP_PARTICIPANTS,
    ): List<ParticipantShare> = shares.take(limit.coerceAtLeast(0))
}
