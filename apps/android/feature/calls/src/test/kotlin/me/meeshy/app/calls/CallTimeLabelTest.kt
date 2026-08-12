package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import org.junit.Test

class CallTimeLabelTest {

    private val zone = ZoneId.of("UTC")
    private val locale = Locale.ENGLISH

    // 2026-07-01 12:00 UTC is a Wednesday.
    private val now = Instant.parse("2026-07-01T12:00:00Z").toEpochMilli()

    private fun label(iso: String?) =
        CallTimeLabel.label(iso, now, zone, locale, yesterday = "Yesterday")

    @Test
    fun `a null timestamp yields an empty label`() {
        assertThat(label(null)).isEmpty()
    }

    @Test
    fun `an unparsable timestamp yields an empty label`() {
        assertThat(label("not-a-date")).isEmpty()
    }

    @Test
    fun `same day yields the 24-hour time`() {
        assertThat(label("2026-07-01T09:30:00Z")).isEqualTo("09:30")
    }

    @Test
    fun `a later time on the same day still yields the time`() {
        assertThat(label("2026-07-01T15:05:00Z")).isEqualTo("15:05")
    }

    @Test
    fun `the previous day yields the yesterday label`() {
        assertThat(label("2026-06-30T09:30:00Z")).isEqualTo("Yesterday")
    }

    @Test
    fun `within the week yields the weekday name`() {
        // 2026-06-28 is a Sunday, 3 days before the Wednesday "now".
        assertThat(label("2026-06-28T09:30:00Z")).isEqualTo("Sunday")
    }

    @Test
    fun `beyond a week in the same year yields the date without year`() {
        assertThat(label("2026-06-10T09:30:00Z")).isEqualTo("10 Jun")
    }

    @Test
    fun `a previous year yields the date with the year`() {
        assertThat(label("2025-06-10T09:30:00Z")).isEqualTo("10 Jun 2025")
    }
}
