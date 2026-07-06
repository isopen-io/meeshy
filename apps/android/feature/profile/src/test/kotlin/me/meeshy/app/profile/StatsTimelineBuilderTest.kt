package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.TimelinePoint
import org.junit.Test

class StatsTimelineBuilderTest {

    private fun point(date: String, messages: Int) = TimelinePoint(date = date, messages = messages)

    @Test
    fun emptySeries_returnsNull_thereIsNothingToChart() {
        assertThat(StatsTimelineBuilder.build(emptyList())).isNull()
    }

    @Test
    fun singlePoint_withActivity_isANormalizedFullHeightBar() {
        val result = StatsTimelineBuilder.build(listOf(point("2026-07-05", 7)))

        assertThat(result).isNotNull()
        val bar = result!!.bars.single()
        assertThat(bar.messages).isEqualTo(7)
        assertThat(bar.normalized).isEqualTo(1f)
        assertThat(result.peak).isEqualTo(7)
        assertThat(result.total).isEqualTo(7)
        assertThat(result.hasActivity).isTrue()
    }

    @Test
    fun peakDay_normalizesToOne_andShorterDaysAreProportional() {
        val result = StatsTimelineBuilder.build(
            listOf(point("2026-07-01", 5), point("2026-07-02", 10), point("2026-07-03", 0)),
        )!!

        assertThat(result.peak).isEqualTo(10)
        assertThat(result.bars.map { it.normalized }).containsExactly(0.5f, 1f, 0f).inOrder()
    }

    @Test
    fun allZeroSeries_isNonNull_flatAndInactive_withoutDivideByZero() {
        val result = StatsTimelineBuilder.build(
            listOf(point("2026-07-01", 0), point("2026-07-02", 0)),
        )!!

        assertThat(result.peak).isEqualTo(0)
        assertThat(result.total).isEqualTo(0)
        assertThat(result.bars.map { it.normalized }).containsExactly(0f, 0f)
        assertThat(result.activeDays).isEqualTo(0)
        assertThat(result.hasActivity).isFalse()
    }

    @Test
    fun negativeCounts_areFloored_soAMalformedPayloadCannotInvertABarOrThePeak() {
        val result = StatsTimelineBuilder.build(
            listOf(point("2026-07-01", -4), point("2026-07-02", 8)),
        )!!

        assertThat(result.peak).isEqualTo(8)
        assertThat(result.total).isEqualTo(8)
        assertThat(result.bars.first().messages).isEqualTo(0)
        assertThat(result.bars.first().normalized).isEqualTo(0f)
    }

    @Test
    fun total_andActiveDays_countOnlyDaysWithMessages() {
        val result = StatsTimelineBuilder.build(
            listOf(point("d1", 3), point("d2", 0), point("d3", 4), point("d4", 0)),
        )!!

        assertThat(result.total).isEqualTo(7)
        assertThat(result.activeDays).isEqualTo(2)
    }

    @Test
    fun averagePerDay_isTheRoundedMeanOverEveryDay_includingSilentOnes() {
        // 10 messages spread over 3 days → 3.33 → rounds to 3.
        val result = StatsTimelineBuilder.build(
            listOf(point("d1", 6), point("d2", 0), point("d3", 4)),
        )!!

        assertThat(result.averagePerDay).isEqualTo(3)
    }

    @Test
    fun averagePerDay_roundsHalfUp() {
        // 5 over 2 days → 2.5 → rounds to 3.
        val result = StatsTimelineBuilder.build(
            listOf(point("d1", 5), point("d2", 0)),
        )!!

        assertThat(result.averagePerDay).isEqualTo(3)
    }

    @Test
    fun inputOrderIsPreserved_soTheSparklineReadsOldestToNewest() {
        val result = StatsTimelineBuilder.build(
            listOf(point("2026-07-01", 1), point("2026-07-02", 2), point("2026-07-03", 3)),
        )!!

        assertThat(result.bars.map { it.date })
            .containsExactly("2026-07-01", "2026-07-02", "2026-07-03").inOrder()
    }

    @Test
    fun isoDate_isShortenedToDayOverMonth() {
        val result = StatsTimelineBuilder.build(listOf(point("2026-07-05", 1)))!!
        assertThat(result.bars.single().label).isEqualTo("05/07")
    }

    @Test
    fun malformedDate_degradesToTheRawStringInTheLabel() {
        val result = StatsTimelineBuilder.build(
            listOf(point("07/2026", 1), point("2026-07", 2)),
        )!!

        assertThat(result.bars.map { it.label }).containsExactly("07/2026", "2026-07").inOrder()
    }
}
