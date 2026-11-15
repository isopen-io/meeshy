package me.meeshy.sdk.call.capture

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** L'horloge commune du film : images et son sur la même horloge hôte, départ publié pour l'anneau. */
class CallMontageClockTest {

    @Test
    fun `l'horloge hote se lit en microsecondes`() {
        val clock = CallMontageClock(monotonicNanos = { 2_500_000L })
        assertThat(clock.nowUs()).isEqualTo(2_500L)
    }

    @Test
    fun `le depart est publie puis efface a la fin`() {
        val clock = CallMontageClock(wallMillis = { 1_700_000L })
        assertThat(clock.startedAtMillis.value).isNull()
        assertThat(clock.markStart()).isEqualTo(1_700_000L)
        assertThat(clock.startedAtMillis.value).isEqualTo(1_700_000L)
        clock.markEnd()
        assertThat(clock.startedAtMillis.value).isNull()
    }

    @Test
    fun `le premier tampon commence a son arrivee moins sa duree`() {
        val stamper = CallMontageAudioStamper()
        assertThat(stamper.stamp(frames = 4_410, sampleRate = 44_100, arrivalUs = 1_000_000L)).isEqualTo(900_000L)
    }

    @Test
    fun `les tampons suivants se datent au compte des echantillons sans gigue d'arrivee`() {
        val stamper = CallMontageAudioStamper()
        stamper.stamp(4_410, 44_100, 1_000_000L)
        assertThat(stamper.stamp(4_410, 44_100, 1_130_000L)).isEqualTo(1_000_000L)
        assertThat(stamper.stamp(4_410, 44_100, 1_190_000L)).isEqualTo(1_100_000L)
    }

    @Test
    fun `un trou de plus de 150 ms recale sur l'horloge`() {
        val stamper = CallMontageAudioStamper()
        stamper.stamp(4_410, 44_100, 1_000_000L)
        assertThat(stamper.stamp(4_410, 44_100, 2_000_000L)).isEqualTo(1_900_000L)
    }

    @Test
    fun `un tampon vide ou un debit invalide n'est pas date`() {
        val stamper = CallMontageAudioStamper()
        assertThat(stamper.stamp(0, 44_100, 0L)).isNull()
        assertThat(stamper.stamp(10, 0, 0L)).isNull()
    }
}
