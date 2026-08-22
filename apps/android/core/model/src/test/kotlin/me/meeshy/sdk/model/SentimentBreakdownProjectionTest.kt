package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SentimentBreakdownProjectionTest {

    // region toneOf — collapsing the seven-bucket SentimentLevel SSOT into three tones

    @Test
    fun `toneOf reads a zero score as neutral`() {
        assertThat(SentimentBreakdownProjection.toneOf(0.0)).isEqualTo(SentimentTone.NEUTRAL)
    }

    @Test
    fun `toneOf keeps the upper neutral boundary neutral`() {
        assertThat(SentimentBreakdownProjection.toneOf(0.1)).isEqualTo(SentimentTone.NEUTRAL)
    }

    @Test
    fun `toneOf keeps the lower neutral boundary neutral`() {
        assertThat(SentimentBreakdownProjection.toneOf(-0.1)).isEqualTo(SentimentTone.NEUTRAL)
    }

    @Test
    fun `toneOf reads just above the neutral band as positive`() {
        assertThat(SentimentBreakdownProjection.toneOf(0.11)).isEqualTo(SentimentTone.POSITIVE)
    }

    @Test
    fun `toneOf reads just below the neutral band as negative`() {
        assertThat(SentimentBreakdownProjection.toneOf(-0.2)).isEqualTo(SentimentTone.NEGATIVE)
    }

    @Test
    fun `toneOf reads a strong positive as positive`() {
        assertThat(SentimentBreakdownProjection.toneOf(0.7)).isEqualTo(SentimentTone.POSITIVE)
    }

    @Test
    fun `toneOf reads a strong negative as negative`() {
        assertThat(SentimentBreakdownProjection.toneOf(-0.7)).isEqualTo(SentimentTone.NEGATIVE)
    }

    // endregion

    // region sample — deterministic stride replacing iOS's shuffled().prefix(200)

    @Test
    fun `sample returns the whole list when it fits under the cap`() {
        val list = listOf("a", "b", "c")
        assertThat(SentimentBreakdownProjection.sample(list, 5)).isEqualTo(list)
    }

    @Test
    fun `sample returns the whole list at exactly the cap`() {
        val list = listOf("a", "b", "c")
        assertThat(SentimentBreakdownProjection.sample(list, 3)).isEqualTo(list)
    }

    @Test
    fun `sample strides evenly across an oversized list spanning head to tail`() {
        val list = (0 until 10).toList()
        assertThat(SentimentBreakdownProjection.sample(list, 5)).containsExactly(0, 2, 4, 6, 8).inOrder()
    }

    @Test
    fun `sample keeps the first element and never rolls past the last`() {
        val list = (0 until 10).toList()
        val sampled = SentimentBreakdownProjection.sample(list, 3)
        assertThat(sampled.first()).isEqualTo(0)
        assertThat(sampled.max()).isLessThan(list.size)
    }

    @Test
    fun `sample yields nothing for a non-positive cap`() {
        assertThat(SentimentBreakdownProjection.sample(listOf("a", "b"), 0)).isEmpty()
    }

    // endregion

    // region breakdown — scoring message contents through SentimentAnalyzer

    @Test
    fun `breakdown scores a mixed conversation into the three tones`() {
        val result = SentimentBreakdownProjection.breakdown(listOf("love", "hate", "table"))

        assertThat(result.positive).isEqualTo(1)
        assertThat(result.negative).isEqualTo(1)
        assertThat(result.neutral).isEqualTo(1)
        assertThat(result.total).isEqualTo(3)
    }

    @Test
    fun `breakdown drops blank and whitespace-only messages`() {
        val result = SentimentBreakdownProjection.breakdown(listOf("", "   ", "\n"))

        assertThat(result.total).isEqualTo(0)
        assertThat(result.hasContent).isFalse()
    }

    @Test
    fun `breakdown trims surrounding whitespace before scoring`() {
        val result = SentimentBreakdownProjection.breakdown(listOf("   love   "))

        assertThat(result.positive).isEqualTo(1)
        assertThat(result.total).isEqualTo(1)
    }

    @Test
    fun `breakdown caps the scan at MAX_SAMPLE`() {
        val many = List(SentimentBreakdownProjection.MAX_SAMPLE + 50) { "love" }

        val result = SentimentBreakdownProjection.breakdown(many)

        assertThat(result.total).isEqualTo(SentimentBreakdownProjection.MAX_SAMPLE)
        assertThat(result.positive).isEqualTo(SentimentBreakdownProjection.MAX_SAMPLE)
    }

    @Test
    fun `breakdown of an empty list is empty`() {
        assertThat(SentimentBreakdownProjection.breakdown(emptyList()).total).isEqualTo(0)
    }

    // endregion

    // region SentimentBreakdown — derived shares, segments, dominant tone

    @Test
    fun `count returns the per-tone tally`() {
        val b = SentimentBreakdown(positive = 3, neutral = 2, negative = 1)
        assertThat(b.count(SentimentTone.POSITIVE)).isEqualTo(3)
        assertThat(b.count(SentimentTone.NEUTRAL)).isEqualTo(2)
        assertThat(b.count(SentimentTone.NEGATIVE)).isEqualTo(1)
    }

    @Test
    fun `fraction divides each tone by the total`() {
        val b = SentimentBreakdown(positive = 1, neutral = 0, negative = 3)
        assertThat(b.fraction(SentimentTone.POSITIVE)).isWithin(1e-9).of(0.25)
        assertThat(b.fraction(SentimentTone.NEGATIVE)).isWithin(1e-9).of(0.75)
    }

    @Test
    fun `fraction is zero when nothing was scored`() {
        val b = SentimentBreakdown(0, 0, 0)
        assertThat(b.fraction(SentimentTone.POSITIVE)).isEqualTo(0.0)
    }

    @Test
    fun `percent truncates toward zero for iOS parity`() {
        val b = SentimentBreakdown(positive = 1, neutral = 0, negative = 2)
        assertThat(b.percent(SentimentTone.POSITIVE)).isEqualTo(33)
        assertThat(b.percent(SentimentTone.NEGATIVE)).isEqualTo(66)
    }

    @Test
    fun `percent is zero when nothing was scored`() {
        assertThat(SentimentBreakdown(0, 0, 0).percent(SentimentTone.NEUTRAL)).isEqualTo(0)
    }

    @Test
    fun `segments keep positive-neutral-negative order and drop zero tones`() {
        val b = SentimentBreakdown(positive = 2, neutral = 0, negative = 1)

        assertThat(b.segments().map { it.tone })
            .containsExactly(SentimentTone.POSITIVE, SentimentTone.NEGATIVE).inOrder()
    }

    @Test
    fun `segments carry each tone's count and fraction`() {
        val b = SentimentBreakdown(positive = 3, neutral = 1, negative = 0)
        val positive = b.segments().first { it.tone == SentimentTone.POSITIVE }

        assertThat(positive.count).isEqualTo(3)
        assertThat(positive.fraction).isWithin(1e-9).of(0.75)
    }

    @Test
    fun `segments is empty when nothing was scored`() {
        assertThat(SentimentBreakdown(0, 0, 0).segments()).isEmpty()
    }

    @Test
    fun `dominant is null when nothing was scored`() {
        assertThat(SentimentBreakdown(0, 0, 0).dominant).isNull()
    }

    @Test
    fun `dominant is the plurality tone`() {
        assertThat(SentimentBreakdown(positive = 5, neutral = 2, negative = 1).dominant)
            .isEqualTo(SentimentTone.POSITIVE)
        assertThat(SentimentBreakdown(positive = 1, neutral = 5, negative = 2).dominant)
            .isEqualTo(SentimentTone.NEUTRAL)
        assertThat(SentimentBreakdown(positive = 1, neutral = 2, negative = 5).dominant)
            .isEqualTo(SentimentTone.NEGATIVE)
    }

    @Test
    fun `dominant tie resolves positive before neutral before negative`() {
        // All equal → positive wins the first arm of the cascade.
        assertThat(SentimentBreakdown(positive = 2, neutral = 2, negative = 2).dominant)
            .isEqualTo(SentimentTone.POSITIVE)
        // Neutral ties negative above positive → neutral wins the second arm.
        assertThat(SentimentBreakdown(positive = 1, neutral = 3, negative = 3).dominant)
            .isEqualTo(SentimentTone.NEUTRAL)
    }

    // endregion
}
