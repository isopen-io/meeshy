package me.meeshy.sdk.model.time

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import org.junit.Test

/**
 * Behavioural coverage of [RelativeTimeLongFormat.label] — the pure, locale-agnostic framing of
 * the *long* relative-time label (port of iOS `RelativeTimeFormatter.longString`). Asserts every
 * rung, both sides of every boundary, the future-collapses-to-`Now` edge, and — crucially — the
 * two things that distinguish it from the flat [RelativeTime] ladder: from an hour up the rungs
 * follow **calendar-day** boundaries (so 2h across midnight reads `Yesterday`), and those
 * boundaries are the *user's* midnight (so the same instant can read `hier` in one zone and
 * `il y a Nh` in another). Localized wording stays UI-side and is not asserted here.
 */
class RelativeTimeLongLabelTest {

    private val utc: ZoneId = ZoneOffset.UTC

    /** Epoch millis for a UTC wall-clock instant. */
    private fun at(
        year: Int,
        month: Int,
        day: Int,
        hour: Int = 12,
        minute: Int = 0,
        second: Int = 0,
    ): Long = ZonedDateTime.of(year, month, day, hour, minute, second, 0, utc).toInstant().toEpochMilli()

    private val reference = at(2024, 11, 15, hour = 12)

    private fun label(epochMillis: Long, ref: Long = reference, zone: ZoneId = utc) =
        RelativeTimeLongFormat.label(epochMillis, ref, zone)

    // MARK: now / future

    @Test
    fun sameInstantIsNow() {
        assertThat(label(reference)).isEqualTo(RelativeTimeLongLabel.Now)
    }

    @Test
    fun justUnderThirtySecondsIsNow() {
        assertThat(label(reference - 29_000L)).isEqualTo(RelativeTimeLongLabel.Now)
    }

    @Test
    fun futureTimestampCollapsesToNow() {
        assertThat(label(reference + 3_600_000L)).isEqualTo(RelativeTimeLongLabel.Now)
    }

    // MARK: seconds (30..59)

    @Test
    fun exactlyThirtySecondsIsAgoSeconds() {
        assertThat(label(reference - 30_000L)).isEqualTo(RelativeTimeLongLabel.AgoSeconds(30))
    }

    @Test
    fun fiftyNineSecondsIsAgoSeconds() {
        assertThat(label(reference - 59_000L)).isEqualTo(RelativeTimeLongLabel.AgoSeconds(59))
    }

    // MARK: minutes (1..59)

    @Test
    fun exactlySixtySecondsIsAgoMinutesOne() {
        assertThat(label(reference - 60_000L)).isEqualTo(RelativeTimeLongLabel.AgoMinutes(1))
    }

    @Test
    fun fiftyNineMinutesIsAgoMinutes() {
        assertThat(label(reference - 59L * 60_000L)).isEqualTo(RelativeTimeLongLabel.AgoMinutes(59))
    }

    // MARK: hours — same calendar day, one hour or more ago (dayDelta 0)

    @Test
    fun oneHourSameDayIsAgoHours() {
        assertThat(label(at(2024, 11, 15, hour = 11))).isEqualTo(RelativeTimeLongLabel.AgoHours(1))
    }

    @Test
    fun manyHoursWithinSameCalendarDayStaysAgoHours() {
        // 00:30 → 23:30 the same day: 23h elapsed but never crosses midnight → still hours, not "hier".
        val ref = at(2024, 11, 15, hour = 23, minute = 30)
        assertThat(label(at(2024, 11, 15, hour = 0, minute = 30), ref = ref))
            .isEqualTo(RelativeTimeLongLabel.AgoHours(23))
    }

    // MARK: yesterday — the calendar-day special case

    @Test
    fun previousCalendarDayIsYesterday() {
        assertThat(label(at(2024, 11, 14, hour = 12))).isEqualTo(RelativeTimeLongLabel.Yesterday)
    }

    @Test
    fun twoHoursAcrossMidnightIsYesterdayNotHours() {
        // The key divergence from the flat ladder: 23:00 → 01:00 next day is only 2h, yet it
        // crossed the user's midnight, so the long framing reads "hier".
        val ref = at(2024, 11, 15, hour = 1)
        assertThat(label(at(2024, 11, 14, hour = 23), ref = ref))
            .isEqualTo(RelativeTimeLongLabel.Yesterday)
    }

    // MARK: days (2..6)

    @Test
    fun twoDaysAgoIsAgoDays() {
        assertThat(label(at(2024, 11, 13, hour = 12))).isEqualTo(RelativeTimeLongLabel.AgoDays(2))
    }

    @Test
    fun sixDaysAgoIsAgoDays() {
        assertThat(label(at(2024, 11, 9, hour = 12))).isEqualTo(RelativeTimeLongLabel.AgoDays(6))
    }

    // MARK: weeks (7..29 days)

    @Test
    fun exactlySevenDaysIsAgoWeeksOne() {
        assertThat(label(at(2024, 11, 8, hour = 12))).isEqualTo(RelativeTimeLongLabel.AgoWeeks(1))
    }

    @Test
    fun twentyNineDaysIsAgoWeeksFour() {
        assertThat(label(at(2024, 10, 17, hour = 12))).isEqualTo(RelativeTimeLongLabel.AgoWeeks(4))
    }

    // MARK: months (30..89 days)

    @Test
    fun exactlyThirtyDaysIsAgoMonthsOne() {
        assertThat(label(at(2024, 10, 16, hour = 12))).isEqualTo(RelativeTimeLongLabel.AgoMonths(1))
    }

    @Test
    fun eightyNineDaysIsAgoMonthsTwo() {
        assertThat(label(at(2024, 8, 18, hour = 12))).isEqualTo(RelativeTimeLongLabel.AgoMonths(2))
    }

    // MARK: absolute date (90 days or older)

    @Test
    fun ninetyDaysIsAbsoluteDateCarryingTheInstant() {
        val epoch = at(2024, 8, 17, hour = 12)
        assertThat(label(epoch)).isEqualTo(RelativeTimeLongLabel.AbsoluteDate(epoch))
    }

    // MARK: the day boundary is the user's midnight, not UTC's

    @Test
    fun sameInstantReadsDifferentlyAcrossZones() {
        // ref = 2024-11-15T00:30Z, epoch = 2024-11-14T22:30Z (2h earlier).
        val ref = at(2024, 11, 15, hour = 0, minute = 30)
        val epoch = at(2024, 11, 14, hour = 22, minute = 30)

        // In UTC the instant crossed midnight → "hier".
        assertThat(label(epoch, ref = ref, zone = ZoneOffset.UTC))
            .isEqualTo(RelativeTimeLongLabel.Yesterday)

        // Three hours west, both wall-clocks are still 2024-11-14 → same calendar day → hours.
        assertThat(label(epoch, ref = ref, zone = ZoneOffset.ofHours(-3)))
            .isEqualTo(RelativeTimeLongLabel.AgoHours(2))
    }
}
