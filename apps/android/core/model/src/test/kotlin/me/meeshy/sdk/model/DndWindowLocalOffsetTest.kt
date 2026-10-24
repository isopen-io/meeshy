package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.LocalDateTime
import java.time.ZoneOffset
import org.junit.Test

class DndWindowLocalOffsetTest {

    private val prefs = UserNotificationPreferences(dndEnabled = true, dndStartTime = "22:00", dndEndTime = "08:00")

    private fun utc(year: Int, month: Int, day: Int, hour: Int, minute: Int = 0): Long =
        LocalDateTime.of(year, month, day, hour, minute).toInstant(ZoneOffset.UTC).toEpochMilli()

    @Test
    fun `la fenetre est lue dans l heure locale et non en UTC`() {
        // 14:00 UTC = 23:00 a Tokyo (+540) : dans la fenetre localement, hors fenetre en UTC.
        assertThat(DndWindow.isActiveAt(prefs, utc(2026, 8, 17, 14), utcOffsetMinutes = 540)).isTrue()
        assertThat(DndWindow.isActiveAt(prefs, utc(2026, 8, 17, 14), utcOffsetMinutes = 0)).isFalse()
    }

    @Test
    fun `un decalage negatif traverse minuit`() {
        // 03:00 UTC = 23:00 la veille a New York ete (-240).
        assertThat(DndWindow.isActiveAt(prefs, utc(2026, 8, 18, 3), utcOffsetMinutes = -240)).isTrue()
        // 13:00 UTC = 09:00 a New York : apres la fin de fenetre.
        assertThat(DndWindow.isActiveAt(prefs, utc(2026, 8, 18, 13), utcOffsetMinutes = -240)).isFalse()
    }

    @Test
    fun `le filtre de jours suit le jour local`() {
        // 2026-08-16 est un dimanche : 20:00 UTC = 05:00 lundi 17 a Tokyo (jour local = lundi),
        // 23:00 UTC reste dimanche 23:00 en UTC (dans l'horaire, mais pas un lundi).
        val mondayOnly = prefs.copy(dndDays = listOf(DndDay.MON))

        assertThat(DndWindow.isActiveAt(mondayOnly, utc(2026, 8, 16, 20), utcOffsetMinutes = 540)).isTrue()
        assertThat(DndWindow.isActiveAt(mondayOnly, utc(2026, 8, 16, 23), utcOffsetMinutes = 0)).isFalse()
    }

    @Test
    fun `le decalage enregistre est borne a la plage de la passerelle`() {
        assertThat(DndWindow.withRecordedOffset(prefs, 540).dndUtcOffsetMinutes).isEqualTo(540)
        assertThat(DndWindow.withRecordedOffset(prefs, 2000).dndUtcOffsetMinutes).isEqualTo(840)
        assertThat(DndWindow.withRecordedOffset(prefs, -2000).dndUtcOffsetMinutes).isEqualTo(-720)
    }
}
