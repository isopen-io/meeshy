package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import org.junit.Test

/**
 * L'échelle du temps sur un fuseau RÉEL : changement d'heure (Paris, 25 octobre et 29 mars 2026) et
 * décalage d'une demi-heure (Calcutta). Une graduation tombe sur une frontière LOCALE, avance
 * toujours, et ne se perd ni ne se dédouble là où l'heure murale saute.
 */
class RiverTimeScaleZoneTest {

    private val paris = ZoneId.of("Europe/Paris")
    private val french = Locale.FRANCE
    private val hour = RiverTimeScale.HOUR_MS

    private fun ms(iso: String): Double = Instant.parse(iso).toEpochMilli().toDouble()

    private fun scale(zone: ZoneId, vararg instants: Double) =
        RiverTimeScale.resolve(instants.mapIndexed { rank, at -> RiverTimeScale.RankTime(rank, at) }, zone, french)!!

    @Test
    fun `au retour a l heure d hiver chaque heure reelle a sa graduation, 02 00 compris deux fois`() {
        val result = scale(paris, ms("2026-10-24T22:30:00Z"), ms("2026-10-25T03:30:00Z"))

        assertThat(result.unit).isEqualTo(RiverTimeScale.Grain.HOUR)
        assertThat(result.ticks.map { it.label }).containsExactly("01:00", "02:00", "02:00", "03:00", "04:00").inOrder()
        val instants = result.ticks.map { result.startMs + it.fraction * (result.endMs - result.startMs) }
        assertThat(instants.zipWithNext { a, b -> b - a }.distinct()).containsExactly(hour)
    }

    @Test
    fun `au passage a l heure d ete l heure qui n existe pas n a pas de graduation`() {
        val result = scale(paris, ms("2026-03-28T23:30:00Z"), ms("2026-03-29T03:30:00Z"))

        assertThat(result.ticks.map { it.label }).containsExactly("01:00", "03:00", "04:00", "05:00").inOrder()
    }

    @Test
    fun `les graduations de jour tombent a minuit local sur une journee de 25 heures`() {
        val result = scale(paris, ms("2026-10-23T12:00:00Z"), ms("2026-10-27T12:00:00Z"))

        assertThat(result.unit).isEqualTo(RiverTimeScale.Grain.DAY)
        assertThat(result.ticks.map { it.label }).containsExactly("24 oct.", "25 oct.", "26 oct.", "27 oct.").inOrder()
        val midnights = listOf("2026-10-23T22:00:00Z", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z", "2026-10-26T23:00:00Z").map(::ms)
        val instants = result.ticks.map { result.startMs + it.fraction * (result.endMs - result.startMs) }
        instants.zip(midnights).forEach { (actual, expected) -> assertThat(actual).isWithin(1.0).of(expected) }
    }

    @Test
    fun `un fuseau a demi-heure gradue aux heures locales pleines`() {
        val result = scale(ZoneId.of("Asia/Kolkata"), ms("2026-08-01T00:00:00Z"), ms("2026-08-01T03:00:00Z"))

        assertThat(result.ticks.map { it.label }).containsExactly("06:00", "07:00", "08:00").inOrder()
    }

    @Test
    fun `chaque graduation porte le premier rang tombe dans sa periode`() {
        val result = scale(paris, ms("2026-10-24T22:30:00Z"), ms("2026-10-24T23:10:00Z"), ms("2026-10-25T01:30:00Z"))

        assertThat(result.ticks.map { it.rank }).containsExactly(1, 2, 2).inOrder()
        assertThat(result.rank(1.0)).isEqualTo(2)
        assertThat(result.rank(0.0)).isEqualTo(0)
    }
}
