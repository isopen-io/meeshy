package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageDetailFichesTest {
    private fun rev(n: Int, at: Long) = EditRevision(n, "v$n", at)

    @Test fun `no revision gives an empty history`() {
        val history = EditHistoryProjection.project("now", 10L, emptyList())
        assertThat(history.isEmpty).isTrue()
        assertThat(history.rows).isEmpty()
    }

    @Test fun `current comes first then versions newest first numbered downwards`() {
        val history = EditHistoryProjection.project("now", 90L, listOf(rev(1, 10), rev(2, 20), rev(3, 30)))
        assertThat(history.previousCount).isEqualTo(3)
        assertThat(history.rows[0]).isEqualTo(EditHistoryRow.Current("now", 90L))
        assertThat(history.rows.drop(1)).containsExactly(
            EditHistoryRow.Version(3, "v3", 30), EditHistoryRow.Version(2, "v2", 20), EditHistoryRow.Version(1, "v1", 10),
        ).inOrder()
    }

    @Test fun `a blank or unchanged previous content is not recorded`() {
        assertThat(EditHistoryProjection.shouldRecord(null, "a")).isFalse()
        assertThat(EditHistoryProjection.shouldRecord("  ", "a")).isFalse()
        assertThat(EditHistoryProjection.shouldRecord("a", "a")).isFalse()
        assertThat(EditHistoryProjection.shouldRecord("a", "b")).isTrue()
    }

    @Test fun `sentiment tiers follow the iOS thresholds`() {
        assertThat(MessageSentimentTier.from(-0.61)).isEqualTo(MessageSentimentTier.VeryNegative)
        assertThat(MessageSentimentTier.from(-0.6)).isEqualTo(MessageSentimentTier.Negative)
        assertThat(MessageSentimentTier.from(-0.2)).isEqualTo(MessageSentimentTier.Neutral)
        assertThat(MessageSentimentTier.from(0.19)).isEqualTo(MessageSentimentTier.Neutral)
        assertThat(MessageSentimentTier.from(0.2)).isEqualTo(MessageSentimentTier.Positive)
        assertThat(MessageSentimentTier.from(0.6)).isEqualTo(MessageSentimentTier.VeryPositive)
    }

    @Test fun `the gauge cursor maps -1 0 1 to 0 half 1`() {
        assertThat(MessageSentimentGauge.fromScore(-1.0).position).isEqualTo(0f)
        assertThat(MessageSentimentGauge.fromScore(0.0).position).isEqualTo(0.5f)
        assertThat(MessageSentimentGauge.fromScore(3.0).position).isEqualTo(1f)
    }

    @Test fun `wordless text is neutral`() {
        assertThat(MessageSentimentGauge.of("").tier).isEqualTo(MessageSentimentTier.Neutral)
        assertThat(MessageSentimentGauge.of("love").tier).isEqualTo(MessageSentimentTier.VeryPositive)
    }

    @Test fun `tab counts come from the served read status`() {
        val data = ReadStatusData(totalMembers = 4, receivedCount = 3, readCount = 1, notSeenBy = listOf(NotSeenByUser("p")))
        assertThat(MessageViewsListing.count(MessageViewsFilter.Sent, data)).isNull()
        assertThat(MessageViewsListing.count(MessageViewsFilter.Delivered, data)).isEqualTo(3)
        assertThat(MessageViewsListing.count(MessageViewsFilter.Read, data)).isEqualTo(1)
        assertThat(MessageViewsListing.count(MessageViewsFilter.NotSeen, data)).isEqualTo(1)
        assertThat(MessageViewsListing.count(MessageViewsFilter.Read, null)).isNull()
        assertThat(MessageViewsListing.isEveryone(4, 4)).isTrue()
        assertThat(MessageViewsListing.isEveryone(3, 4)).isFalse()
    }
}
