package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.LocalDate
import org.junit.Test

/**
 * Behavioural spec for [ConversationStatsProjection] — the pure derivations the
 * stats dashboard renders. Every branch of the five projections is exercised:
 * empty/zero-total, filtering, ordering, tie-breaks, and the time-window cutoff.
 */
class ConversationStatsProjectionTest {

    // ── contentTypeBreakdown ───────────────────────────────────────────────

    @Test
    fun `content breakdown drops zero-count kinds and keeps the rest`() {
        val shares = ConversationStatsProjection.contentTypeBreakdown(
            ContentTypeCounts(text = 6, image = 4, audio = 0, video = 0, file = 0, location = 0),
        )

        assertThat(shares.map { it.kind }).containsExactly(ContentTypeKind.TEXT, ContentTypeKind.IMAGE).inOrder()
        assertThat(shares.map { it.count }).containsExactly(6, 4).inOrder()
    }

    @Test
    fun `content breakdown fractions sum over the true total`() {
        val shares = ConversationStatsProjection.contentTypeBreakdown(
            ContentTypeCounts(text = 3, image = 1),
        )

        assertThat(shares.first { it.kind == ContentTypeKind.TEXT }.fraction).isWithin(1e-9).of(0.75)
        assertThat(shares.first { it.kind == ContentTypeKind.IMAGE }.fraction).isWithin(1e-9).of(0.25)
    }

    @Test
    fun `content breakdown orders by count descending`() {
        val shares = ConversationStatsProjection.contentTypeBreakdown(
            ContentTypeCounts(text = 1, image = 9, audio = 5),
        )

        assertThat(shares.map { it.kind })
            .containsExactly(ContentTypeKind.IMAGE, ContentTypeKind.AUDIO, ContentTypeKind.TEXT).inOrder()
    }

    @Test
    fun `content breakdown breaks count ties by canonical kind order`() {
        val shares = ConversationStatsProjection.contentTypeBreakdown(
            ContentTypeCounts(text = 0, image = 0, audio = 2, video = 2, file = 2, location = 0),
        )

        assertThat(shares.map { it.kind })
            .containsExactly(ContentTypeKind.AUDIO, ContentTypeKind.VIDEO, ContentTypeKind.FILE).inOrder()
    }

    @Test
    fun `content breakdown is empty when nothing was sent`() {
        assertThat(ConversationStatsProjection.contentTypeBreakdown(ContentTypeCounts())).isEmpty()
    }

    // ── hourlyBuckets ──────────────────────────────────────────────────────

    @Test
    fun `hourly buckets always span the full 24 hours`() {
        val buckets = ConversationStatsProjection.hourlyBuckets(mapOf("9" to 3))

        assertThat(buckets).hasSize(24)
        assertThat(buckets[9]).isEqualTo(3)
        assertThat(buckets[0]).isEqualTo(0)
    }

    @Test
    fun `hourly buckets ignore non-numeric and out-of-range keys`() {
        val buckets = ConversationStatsProjection.hourlyBuckets(
            mapOf("morning" to 5, "24" to 7, "-1" to 9, "23" to 2),
        )

        assertThat(buckets[23]).isEqualTo(2)
        assertThat(buckets.sum()).isEqualTo(2)
    }

    @Test
    fun `hourly buckets clamp negative counts to zero`() {
        val buckets = ConversationStatsProjection.hourlyBuckets(mapOf("3" to -4))

        assertThat(buckets[3]).isEqualTo(0)
    }

    @Test
    fun `hourly buckets tolerate padded numeric keys`() {
        val buckets = ConversationStatsProjection.hourlyBuckets(mapOf(" 7 " to 1))

        assertThat(buckets[7]).isEqualTo(1)
    }

    // ── activitySeries ─────────────────────────────────────────────────────

    private val today = LocalDate.of(2026, 8, 21)

    private fun daily(vararg pairs: Pair<String, Int>) =
        pairs.map { DailyActivityEntry(date = it.first, count = it.second) }

    @Test
    fun `activity week keeps only points within the trailing window`() {
        val points = ConversationStatsProjection.activitySeries(
            daily("2026-08-20" to 4, "2026-08-01" to 9),
            ActivityPeriod.WEEK,
            today,
        )

        assertThat(points.map { it.date }).containsExactly("2026-08-20")
    }

    @Test
    fun `activity keeps a point exactly on the cutoff`() {
        val points = ConversationStatsProjection.activitySeries(
            daily("2026-08-14" to 1),
            ActivityPeriod.WEEK,
            today,
        )

        assertThat(points.map { it.date }).containsExactly("2026-08-14")
    }

    @Test
    fun `activity all keeps every valid point regardless of age`() {
        val points = ConversationStatsProjection.activitySeries(
            daily("2020-01-01" to 2, "2026-08-20" to 5),
            ActivityPeriod.ALL,
            today,
        )

        assertThat(points).hasSize(2)
    }

    @Test
    fun `activity sorts points oldest first`() {
        val points = ConversationStatsProjection.activitySeries(
            daily("2026-08-20" to 5, "2026-08-18" to 3, "2026-08-19" to 4),
            ActivityPeriod.MONTH,
            today,
        )

        assertThat(points.map { it.date })
            .containsExactly("2026-08-18", "2026-08-19", "2026-08-20").inOrder()
    }

    @Test
    fun `activity drops unparseable dates`() {
        val points = ConversationStatsProjection.activitySeries(
            daily("not-a-date" to 7, "2026-08-20" to 1),
            ActivityPeriod.ALL,
            today,
        )

        assertThat(points.map { it.date }).containsExactly("2026-08-20")
    }

    @Test
    fun `activity is empty when there is no data`() {
        assertThat(
            ConversationStatsProjection.activitySeries(emptyList(), ActivityPeriod.WEEK, today),
        ).isEmpty()
    }

    // ── participantShares ──────────────────────────────────────────────────

    private fun participant(id: String, name: String? = null, messages: Int = 0, words: Int = 0) =
        ParticipantStatEntry(userId = id, name = name, messageCount = messages, wordCount = words)

    @Test
    fun `participant shares divide by the total message count`() {
        val shares = ConversationStatsProjection.participantShares(
            listOf(participant("a", messages = 3)),
            totalMessages = 4,
        )

        assertThat(shares.single().fraction).isWithin(1e-9).of(0.75)
    }

    @Test
    fun `participant shares are zero when the total is non-positive`() {
        val shares = ConversationStatsProjection.participantShares(
            listOf(participant("a", messages = 3)),
            totalMessages = 0,
        )

        assertThat(shares.single().fraction).isEqualTo(0.0)
    }

    @Test
    fun `participant shares order busiest first`() {
        val shares = ConversationStatsProjection.participantShares(
            listOf(participant("a", messages = 1), participant("b", messages = 9)),
            totalMessages = 10,
        )

        assertThat(shares.map { it.userId }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `participant shares break message ties by name then id`() {
        val shares = ConversationStatsProjection.participantShares(
            listOf(
                participant("z", name = "Bea", messages = 2),
                participant("a", name = "Ada", messages = 2),
                participant("m", name = null, messages = 2),
            ),
            totalMessages = 6,
        )

        // Null name sorts as empty string (first), then Ada, then Bea.
        assertThat(shares.map { it.userId }).containsExactly("m", "a", "z").inOrder()
    }

    @Test
    fun `participant shares are empty for no participants`() {
        assertThat(ConversationStatsProjection.participantShares(emptyList(), 5)).isEmpty()
    }

    // ── languageShares ─────────────────────────────────────────────────────

    @Test
    fun `language shares divide by the detected total`() {
        val shares = ConversationStatsProjection.languageShares(
            listOf(LanguageEntry("fr", 3), LanguageEntry("en", 1)),
        )

        assertThat(shares.first { it.language == "fr" }.fraction).isWithin(1e-9).of(0.75)
    }

    @Test
    fun `language shares order most-used first and break ties by code`() {
        val shares = ConversationStatsProjection.languageShares(
            listOf(LanguageEntry("es", 2), LanguageEntry("de", 2), LanguageEntry("fr", 5)),
        )

        assertThat(shares.map { it.language }).containsExactly("fr", "de", "es").inOrder()
    }

    @Test
    fun `language shares drop zero-count rows`() {
        val shares = ConversationStatsProjection.languageShares(
            listOf(LanguageEntry("fr", 4), LanguageEntry("en", 0)),
        )

        assertThat(shares.map { it.language }).containsExactly("fr")
    }

    @Test
    fun `language shares are empty when nothing was detected`() {
        assertThat(ConversationStatsProjection.languageShares(emptyList())).isEmpty()
    }
}
