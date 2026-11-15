package me.meeshy.ui.format

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Locale
import org.junit.Test

class NotificationDateTextTest {
    private val zone = ZoneId.of("Europe/Paris")
    private val locale = Locale.FRANCE
    private val now = ZonedDateTime.of(2026, 6, 23, 15, 0, 0, 0, zone).toInstant().toEpochMilli()
    private val notif = NotificationDateStrings("à l’instant", "%d min", "%d h", "il y a %s", "hier %s")
    private val seen = LastSeenStrings("En ligne", "Vu %s", "Vu hier à %s", "Vu avant-hier à %s", "Vu le %1\$s à %2\$s", "%d min", "%d h", "il y a %s")

    private fun notification(secondsAgo: Long) =
        NotificationDateText.text(now - secondsAgo * 1000, now, zone, locale, notif)

    private fun lastSeen(secondsAgo: Long) =
        LastSeenText.text(now - secondsAgo * 1000, now, zone, locale, seen)

    @Test fun `sous titre de notification`() {
        assertThat(notification(10)).isEqualTo("à l’instant")
        assertThat(notification(360)).isEqualTo("il y a 6 min")
        assertThat(notification(3 * 3600)).isEqualTo("il y a 3 h")
    }

    @Test fun `hier avec l heure du fuseau`() {
        val at = ZonedDateTime.of(2026, 6, 22, 14, 30, 0, 0, zone).toInstant().toEpochMilli()
        assertThat(NotificationDateText.text(at, now, zone, locale, notif)).isEqualTo("hier 14:30")
    }

    @Test fun `derniere connexion`() {
        assertThat(lastSeen(30)).isEqualTo("En ligne")
        assertThat(lastSeen(300)).isEqualTo("Vu il y a 5 min")
        assertThat(lastSeen(26 * 3600)).startsWith("Vu hier à ")
        assertThat(lastSeen(5 * 24 * 3600)).contains(":")
    }
}
