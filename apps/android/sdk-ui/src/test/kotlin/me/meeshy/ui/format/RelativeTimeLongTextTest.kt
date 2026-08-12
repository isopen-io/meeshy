package me.meeshy.ui.format

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import org.junit.Test

class RelativeTimeLongTextTest {

    private val zone = ZoneId.of("UTC")
    private val locale = Locale.ENGLISH

    // A mid-day reference so a "2 hours ago" lands on the same calendar day and a
    // "23:00 the day before" lands on the previous day (the Yesterday special case).
    private val now = Instant.parse("2026-07-15T12:00:00Z").toEpochMilli()

    private val strings = RelativeTimeLongStrings(
        now = "just now",
        yesterday = "yesterday",
        secondsAgo = "%d s ago",
        minutesAgo = "%d min ago",
        hoursAgo = "%d h ago",
        daysAgo = "%d d ago",
        weeksAgo = "%d w ago",
        monthsAgo = "%d mo ago",
    )

    private fun labelAt(epochMillis: Long): String =
        RelativeTimeLongText.long(
            epochMillis = epochMillis,
            referenceMillis = now,
            zone = zone,
            locale = locale,
            strings = strings,
        )

    private fun labelAt(instant: String): String = labelAt(Instant.parse(instant).toEpochMilli())

    private val secondMs = 1_000L
    private val minuteMs = 60 * secondMs

    @Test
    fun `under thirty seconds yields the now word`() {
        assertThat(labelAt(now - 10 * secondMs)).isEqualTo("just now")
    }

    @Test
    fun `a future or clock-skewed instant collapses to now`() {
        assertThat(labelAt(now + 5 * minuteMs)).isEqualTo("just now")
    }

    @Test
    fun `a sub-minute age renders the seconds template`() {
        assertThat(labelAt(now - 45 * secondMs)).isEqualTo("45 s ago")
    }

    @Test
    fun `a sub-hour age renders the minutes template`() {
        assertThat(labelAt(now - 5 * minuteMs)).isEqualTo("5 min ago")
    }

    @Test
    fun `a same-day age of an hour or more renders the hours template`() {
        // 10:00 the same UTC day — two hours before the noon reference.
        assertThat(labelAt("2026-07-15T10:00:00Z")).isEqualTo("2 h ago")
    }

    @Test
    fun `a late-evening instant seen the next morning renders yesterday not hours`() {
        // 23:00 the previous calendar day: only 13h earlier but a day boundary crossed.
        assertThat(labelAt("2026-07-14T23:00:00Z")).isEqualTo("yesterday")
    }

    @Test
    fun `an age of some days renders the days template`() {
        assertThat(labelAt("2026-07-12T12:00:00Z")).isEqualTo("3 d ago")
    }

    @Test
    fun `an age of some weeks renders the weeks template`() {
        assertThat(labelAt("2026-07-01T12:00:00Z")).isEqualTo("2 w ago")
    }

    @Test
    fun `an age of some months renders the months template`() {
        // 60 calendar days before the reference — two 30-day months.
        assertThat(labelAt("2026-05-16T12:00:00Z")).isEqualTo("2 mo ago")
    }

    @Test
    fun `the substitution uses the actual value not a fixed constant`() {
        assertThat(labelAt(now - 7 * minuteMs)).isEqualTo("7 min ago")
        assertThat(labelAt(now - 11 * minuteMs)).isEqualTo("11 min ago")
    }

    @Test
    fun `an age past three months in the same year renders the date without a year`() {
        // ~100 days before 2026-07-15 falls in April 2026 — still 2026.
        val label = labelAt("2026-04-06T12:00:00Z")
        assertThat(label).contains("Apr")
        assertThat(label).doesNotContain("2026")
    }

    @Test
    fun `an age past three months in a prior year includes the year`() {
        // ~220 days before 2026-07-15 falls in December 2025.
        val label = labelAt("2025-12-07T12:00:00Z")
        assertThat(label).contains("2025")
    }

    @Test
    fun `the absolute-date fallback shares the short formatter's rendering`() {
        // Same instant, same reference/zone/locale must render identically to the
        // short formatter's absolute-date rung — proving one shared date SSOT.
        val epoch = Instant.parse("2025-12-07T12:00:00Z").toEpochMilli()
        val shortLabel = RelativeTimeFormat.short(
            epochMillis = epoch,
            referenceMillis = now,
            zone = zone,
            locale = locale,
            strings = RelativeTimeStrings(
                now = "n", secondsAgo = "%d", minutesAgo = "%d", hoursAgo = "%d",
                daysAgo = "%d", weeksAgo = "%d", monthsAgo = "%d",
            ),
        )
        assertThat(labelAt(epoch)).isEqualTo(shortLabel)
    }
}
