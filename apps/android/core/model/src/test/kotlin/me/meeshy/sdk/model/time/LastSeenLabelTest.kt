package me.meeshy.sdk.model.time

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Test

class LastSeenLabelTest {
    private val zone = ZoneId.of("Europe/Paris")
    private val now = ZonedDateTime.of(2026, 6, 30, 12, 0, 0, 0, zone).toInstant().toEpochMilli()
    private fun at(days: Long, hours: Long = 0, seconds: Long = 0) =
        LastSeenFormat.label(now - ((days * 24 + hours) * 3600 + seconds) * 1000, now, zone)

    @Test fun `en ligne sous une minute`() {
        assertThat(at(0, seconds = 59)).isEqualTo(LastSeenLabel.Online)
    }

    @Test fun `relatif sans heure sous 24 h`() {
        assertThat(at(0, seconds = 300)).isEqualTo(LastSeenLabel.MinutesAgo(5))
        assertThat(at(0, hours = 3)).isEqualTo(LastSeenLabel.HoursAgo(3))
    }

    @Test fun `l heure est ajoutee au dela de 24 h`() {
        assertThat(at(1)).isInstanceOf(LastSeenLabel.YesterdayAt::class.java)
        assertThat(at(2)).isInstanceOf(LastSeenLabel.BeforeYesterdayAt::class.java)
        assertThat(at(5)).isInstanceOf(LastSeenLabel.DateAt::class.java)
    }
}
