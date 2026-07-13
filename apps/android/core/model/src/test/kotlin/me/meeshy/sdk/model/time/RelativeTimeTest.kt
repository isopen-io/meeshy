package me.meeshy.sdk.model.time

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [RelativeTime.classify] — the pure, locale-agnostic ladder that
 * classifies how long ago a timestamp occurred (port of iOS `RelativeTime.classify`, the
 * single source of truth for the thresholds; localized rendering stays UI-side). Asserts
 * every rung, both sides of every threshold boundary, and the edges iOS leaves implicit:
 * a future/skewed timestamp collapsing to [RelativeTimeUnit.Now] and a decades-old timestamp
 * classifying without integer overflow.
 */
class RelativeTimeTest {

    private val reference = 1_700_000_000_000L // fixed "now" in epoch millis

    private fun secondsAgo(seconds: Long): Long = reference - seconds * 1_000L
    private fun daysAgo(days: Long): Long = reference - days * 86_400L * 1_000L

    // MARK: now (< 30 s)

    @Test
    fun sameInstantIsNow() {
        assertThat(RelativeTime.classify(reference, reference)).isEqualTo(RelativeTimeUnit.Now)
    }

    @Test
    fun justUnderThirtySecondsIsNow() {
        assertThat(RelativeTime.classify(secondsAgo(29), reference)).isEqualTo(RelativeTimeUnit.Now)
    }

    @Test
    fun subSecondElapsedIsNow() {
        assertThat(RelativeTime.classify(reference - 900L, reference)).isEqualTo(RelativeTimeUnit.Now)
    }

    // MARK: seconds (30..59)

    @Test
    fun exactlyThirtySecondsBecomesSeconds() {
        assertThat(RelativeTime.classify(secondsAgo(30), reference))
            .isEqualTo(RelativeTimeUnit.Seconds(30))
    }

    @Test
    fun fiftyNineSecondsIsSeconds() {
        assertThat(RelativeTime.classify(secondsAgo(59), reference))
            .isEqualTo(RelativeTimeUnit.Seconds(59))
    }

    // MARK: minutes (60 s .. < 1 h)

    @Test
    fun exactlyOneMinuteBecomesMinutes() {
        assertThat(RelativeTime.classify(secondsAgo(60), reference))
            .isEqualTo(RelativeTimeUnit.Minutes(1))
    }

    @Test
    fun minutesFloorTowardTheLowerBound() {
        // 119 s = 1 min 59 s → floors to 1 minute
        assertThat(RelativeTime.classify(secondsAgo(119), reference))
            .isEqualTo(RelativeTimeUnit.Minutes(1))
    }

    @Test
    fun fiftyNineMinutesIsMinutes() {
        assertThat(RelativeTime.classify(secondsAgo(3_599), reference))
            .isEqualTo(RelativeTimeUnit.Minutes(59))
    }

    // MARK: hours (1 h .. < 1 day)

    @Test
    fun exactlyOneHourBecomesHours() {
        assertThat(RelativeTime.classify(secondsAgo(3_600), reference))
            .isEqualTo(RelativeTimeUnit.Hours(1))
    }

    @Test
    fun twentyThreeHoursIsHours() {
        assertThat(RelativeTime.classify(secondsAgo(86_399), reference))
            .isEqualTo(RelativeTimeUnit.Hours(23))
    }

    // MARK: days (1 day .. < 1 week)

    @Test
    fun exactlyOneDayBecomesDays() {
        assertThat(RelativeTime.classify(daysAgo(1), reference))
            .isEqualTo(RelativeTimeUnit.Days(1))
    }

    @Test
    fun sixDaysIsDays() {
        assertThat(RelativeTime.classify(daysAgo(6), reference))
            .isEqualTo(RelativeTimeUnit.Days(6))
    }

    // MARK: weeks (7 days .. < 30 days)

    @Test
    fun exactlySevenDaysBecomesWeeks() {
        assertThat(RelativeTime.classify(daysAgo(7), reference))
            .isEqualTo(RelativeTimeUnit.Weeks(1))
    }

    @Test
    fun weeksFloorFromTrailingDays() {
        // 13 days → 1 week (integer floor), not 2
        assertThat(RelativeTime.classify(daysAgo(13), reference))
            .isEqualTo(RelativeTimeUnit.Weeks(1))
    }

    @Test
    fun twentyNineDaysIsFourWeeks() {
        assertThat(RelativeTime.classify(daysAgo(29), reference))
            .isEqualTo(RelativeTimeUnit.Weeks(4))
    }

    // MARK: months (30 days .. < 90 days)

    @Test
    fun exactlyThirtyDaysBecomesMonths() {
        assertThat(RelativeTime.classify(daysAgo(30), reference))
            .isEqualTo(RelativeTimeUnit.Months(1))
    }

    @Test
    fun eightyNineDaysIsTwoMonths() {
        assertThat(RelativeTime.classify(daysAgo(89), reference))
            .isEqualTo(RelativeTimeUnit.Months(2))
    }

    // MARK: absolute date (>= 90 days)

    @Test
    fun exactlyNinetyDaysBecomesAbsoluteDate() {
        val instant = daysAgo(90)
        assertThat(RelativeTime.classify(instant, reference))
            .isEqualTo(RelativeTimeUnit.AbsoluteDate(instant))
    }

    @Test
    fun aYearAgoIsAbsoluteDate() {
        val instant = daysAgo(365)
        assertThat(RelativeTime.classify(instant, reference))
            .isEqualTo(RelativeTimeUnit.AbsoluteDate(instant))
    }

    // MARK: edges iOS leaves implicit

    @Test
    fun futureTimestampCollapsesToNow() {
        assertThat(RelativeTime.classify(reference + 60_000L, reference))
            .isEqualTo(RelativeTimeUnit.Now)
    }

    @Test
    fun farFutureTimestampCollapsesToNow() {
        assertThat(RelativeTime.classify(reference + 5L * 365 * 86_400 * 1_000L, reference))
            .isEqualTo(RelativeTimeUnit.Now)
    }

    @Test
    fun decadesOldTimestampClassifiesWithoutOverflow() {
        // ~30 years of seconds overflows a 32-bit Int; the Long ladder must still
        // reach the absolute-date rung rather than wrapping to a spurious near rung.
        val instant = daysAgo(30L * 365)
        assertThat(RelativeTime.classify(instant, reference))
            .isEqualTo(RelativeTimeUnit.AbsoluteDate(instant))
    }

    @Test
    fun theUnixEpochAgainstAModernReferenceIsAbsoluteDate() {
        assertThat(RelativeTime.classify(0L, reference))
            .isEqualTo(RelativeTimeUnit.AbsoluteDate(0L))
    }
}
