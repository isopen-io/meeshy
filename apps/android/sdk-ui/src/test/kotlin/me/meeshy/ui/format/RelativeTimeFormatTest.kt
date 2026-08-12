package me.meeshy.ui.format

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import org.junit.Test

class RelativeTimeFormatTest {

    private val zone = ZoneId.of("UTC")
    private val locale = Locale.ENGLISH
    private val now = Instant.parse("2026-07-01T12:00:00Z").toEpochMilli()

    private val strings = RelativeTimeStrings(
        now = "now",
        secondsAgo = "%d s",
        minutesAgo = "%d min",
        hoursAgo = "%d h",
        daysAgo = "%d j",
        weeksAgo = "%d sem",
        monthsAgo = "%d mois",
    )

    private fun label(agoMillis: Long): String =
        RelativeTimeFormat.short(
            epochMillis = now - agoMillis,
            referenceMillis = now,
            zone = zone,
            locale = locale,
            strings = strings,
        )

    private val secondMs = 1_000L
    private val minuteMs = 60 * secondMs
    private val hourMs = 60 * minuteMs
    private val dayMs = 24 * hourMs

    @Test
    fun `under thirty seconds yields the now word`() {
        assertThat(label(10 * secondMs)).isEqualTo("now")
    }

    @Test
    fun `a future or clock-skewed instant collapses to now`() {
        val future = RelativeTimeFormat.short(now + 5 * minuteMs, now, zone, locale, strings)
        assertThat(future).isEqualTo("now")
    }

    @Test
    fun `the thirty-second boundary crosses into the seconds rung`() {
        assertThat(label(30 * secondMs)).isEqualTo("30 s")
    }

    @Test
    fun `a sub-minute age renders the seconds template with the value`() {
        assertThat(label(45 * secondMs)).isEqualTo("45 s")
    }

    @Test
    fun `a sub-hour age renders the minutes template`() {
        assertThat(label(5 * minuteMs)).isEqualTo("5 min")
    }

    @Test
    fun `the last minute before an hour still renders minutes`() {
        assertThat(label(59 * minuteMs)).isEqualTo("59 min")
    }

    @Test
    fun `a same-day age of an hour or more renders the hours template`() {
        assertThat(label(2 * hourMs)).isEqualTo("2 h")
    }

    @Test
    fun `an age of some days renders the days template`() {
        assertThat(label(3 * dayMs)).isEqualTo("3 j")
    }

    @Test
    fun `an age of some weeks renders the weeks template`() {
        assertThat(label(14 * dayMs)).isEqualTo("2 sem")
    }

    @Test
    fun `an age of some months renders the months template`() {
        assertThat(label(60 * dayMs)).isEqualTo("2 mois")
    }

    @Test
    fun `the substitution uses the actual value not a fixed constant`() {
        assertThat(label(7 * minuteMs)).isEqualTo("7 min")
        assertThat(label(11 * minuteMs)).isEqualTo("11 min")
    }

    @Test
    fun `an age past three months in the same year renders the date without a year`() {
        // 100 days before 2026-07-01 is 2026-03-23 — still 2026.
        val label = label(100 * dayMs)
        assertThat(label).contains("Mar")
        assertThat(label).doesNotContain("2026")
    }

    @Test
    fun `an age past three months in a prior year includes the year`() {
        // 200 days before 2026-07-01 falls in December 2025.
        val label = label(200 * dayMs)
        assertThat(label).contains("2025")
    }
}
