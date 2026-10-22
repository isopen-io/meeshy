package me.meeshy.sdk.model.time

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Test

class NotificationDateFormatterTest {
    private val paris = ZoneId.of("Europe/Paris")
    private val now = ZonedDateTime.of(2026, 6, 23, 15, 0, 0, 0, paris).toInstant().toEpochMilli()
    private fun ago(seconds: Long) = NotificationDateFormatter.label(now - seconds * 1000, now, paris)

    @Test fun `a l instant sous une minute et dans le futur`() {
        assertThat(ago(59)).isEqualTo(NotificationDateLabel.Now)
        assertThat(ago(-120)).isEqualTo(NotificationDateLabel.Now)
    }

    @Test fun `minutes puis heures`() {
        assertThat(ago(360)).isEqualTo(NotificationDateLabel.MinutesAgo(6))
        assertThat(ago(3 * 3600L)).isEqualTo(NotificationDateLabel.HoursAgo(3))
    }

    @Test fun `hier suit le jour calendaire du fuseau`() {
        val yesterday = ZonedDateTime.of(2026, 6, 22, 14, 30, 0, 0, paris).toInstant().toEpochMilli()
        assertThat(NotificationDateFormatter.label(yesterday, now, paris)).isEqualTo(NotificationDateLabel.YesterdayAt(yesterday))
        val lateNight = ZonedDateTime.of(2026, 6, 22, 23, 30, 0, 0, paris).toInstant().toEpochMilli()
        val earlyNow = ZonedDateTime.of(2026, 6, 23, 0, 30, 0, 0, paris).toInstant().toEpochMilli()
        assertThat(NotificationDateFormatter.label(lateNight, earlyNow, paris)).isInstanceOf(NotificationDateLabel.HoursAgo::class.java)
        assertThat(NotificationDateFormatter.label(lateNight - 3_600_000, earlyNow, paris)).isInstanceOf(NotificationDateLabel.YesterdayAt::class.java)
    }

    @Test fun `le fuseau decide du jour`() {
        val instant = ZonedDateTime.of(2026, 6, 22, 23, 30, 0, 0, ZoneId.of("UTC")).toInstant().toEpochMilli()
        val reference = ZonedDateTime.of(2026, 6, 23, 0, 30, 0, 0, ZoneId.of("UTC")).toInstant().toEpochMilli()
        assertThat(NotificationDateFormatter.label(instant - 3_600_000, reference, ZoneId.of("UTC")))
            .isInstanceOf(NotificationDateLabel.YesterdayAt::class.java)
        assertThat(NotificationDateFormatter.label(instant - 3_600_000, reference, ZoneId.of("Pacific/Auckland")))
            .isInstanceOf(NotificationDateLabel.HoursAgo::class.java)
    }

    @Test fun `au dela de la veille date et heure`() {
        val old = ZonedDateTime.of(2026, 6, 20, 9, 0, 0, 0, paris).toInstant().toEpochMilli()
        assertThat(NotificationDateFormatter.label(old, now, paris)).isEqualTo(NotificationDateLabel.AbsoluteDateTime(old))
    }
}
