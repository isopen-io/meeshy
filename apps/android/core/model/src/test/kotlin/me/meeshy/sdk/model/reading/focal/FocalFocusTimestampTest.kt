package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Locale
import org.junit.Test

class FocalFocusTimestampTest {

    private val utc = ZoneId.of("UTC")
    private val fr = Locale.FRENCH
    private val frWords = FocalFocusTimestamp.Words("Aujourd'hui", "Hier", "Avant-hier")

    private fun at(y: Int, m: Int, d: Int, h: Int = 12, min: Int = 0): Instant =
        LocalDateTime.of(y, m, d, h, min).atZone(utc).toInstant()

    /** Vendredi 21 aout 2026, 15:00 UTC. */
    private val now = at(2026, 8, 21, 15, 0)

    private fun label(sentAt: Instant, time: String = "12:45") =
        FocalFocusTimestamp.label(sentAt, time, now, utc, fr, frWords)

    private fun listLabel(sentAt: Instant, time: String) =
        FocalFocusTimestamp.listLabel(sentAt, time, now, utc, fr, frWords, atWord = "à")

    @Test
    fun `aujourd hui hier et avant-hier portent le mot localise et l heure`() {
        assertThat(label(at(2026, 8, 21, 9, 30))).isEqualTo("Aujourd'hui 12:45")
        assertThat(label(at(2026, 8, 20, 18, 45), "18:45")).isEqualTo("Hier 18:45")
        assertThat(label(at(2026, 8, 19))).isEqualTo("Avant-hier 12:45")
    }

    @Test
    fun `dans la semaine c est le nom du jour dans le fuseau du calendrier`() {
        assertThat(label(at(2026, 8, 18, 23, 40), "23:40")).isEqualTo("Mardi 23:40")
        assertThat(label(at(2026, 8, 15))).isEqualTo("Samedi 12:45")
    }

    @Test
    fun `au-dela de la semaine c est la date abregee sans l annee en cours`() {
        assertThat(label(at(2026, 8, 14, 14, 41), "14:41")).isEqualTo("Ven. 14 août · 14:41")
    }

    @Test
    fun `une annee precedente ajoute l annee`() {
        assertThat(label(at(2025, 10, 3, 14, 41), "14:41")).isEqualTo("Ven. 3 oct. 2025 · 14:41")
    }

    @Test
    fun `les mots localises sont injectes jamais ecrits en dur`() {
        val en = FocalFocusTimestamp.label(
            at(2026, 8, 21), "12:45", now, utc, Locale.US, FocalFocusTimestamp.Words("Today", "Yesterday", "2 days ago"),
        )
        assertThat(en).isEqualTo("Today 12:45")
    }

    @Test
    fun `la liste joint par le mot a sur chaque branche`() {
        assertThat(listLabel(at(2026, 8, 21, 5, 49), "5:49")).isEqualTo("Aujourd'hui à 5:49")
        assertThat(listLabel(at(2026, 8, 20, 22, 12), "22:12")).isEqualTo("Hier à 22:12")
        assertThat(listLabel(at(2026, 8, 18, 23, 50), "23:50")).isEqualTo("Mardi à 23:50")
        assertThat(listLabel(at(2025, 10, 3, 14, 41), "14:41")).isEqualTo("Ven. 3 oct. 2025 à 14:41")
    }

    @Test
    fun `le fuseau decide du jour compte et le futur retombe sur aujourd hui`() {
        val paris = ZoneId.of("Europe/Paris")
        val lateMondayUtc = at(2026, 8, 17, 23, 40)
        val parisLabel = FocalFocusTimestamp.label(lateMondayUtc, "01:40", now, paris, fr, frWords)
        assertThat(parisLabel).isEqualTo("Mardi 01:40")
        assertThat(label(at(2026, 8, 25))).isEqualTo("Aujourd'hui 12:45")
    }
}
