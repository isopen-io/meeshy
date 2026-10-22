package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioDialGeometryTest {

    private fun at(x: Float, y: Float) = AudioDialGeometry.fraction(x, y, 200f, 200f)

    @Test
    fun `midi vaut 0 et trois heures 0,25`() {
        assertThat(at(100f, 0f)).isWithin(1e-9).of(0.0)
        assertThat(at(200f, 100f)).isWithin(1e-9).of(0.25)
        assertThat(at(100f, 200f)).isWithin(1e-9).of(0.5)
        assertThat(at(0f, 100f)).isWithin(1e-9).of(0.75)
    }

    @Test
    fun `le centre exact vaut 0`() {
        assertThat(at(100f, 100f)).isEqualTo(0.0)
    }

    @Test
    fun `le curseur bute sur la fin plutot que sauter par midi vers le debut`() {
        assertThat(AudioDialGeometry.scrubbed(previous = 0.9, raw = 0.05)).isEqualTo(1.0)
    }

    @Test
    fun `le curseur bute sur le debut plutot que sauter par midi vers la fin`() {
        assertThat(AudioDialGeometry.scrubbed(previous = 0.1, raw = 0.95)).isEqualTo(0.0)
    }

    @Test
    fun `un deplacement normal suit le doigt`() {
        assertThat(AudioDialGeometry.scrubbed(previous = 0.4, raw = 0.45)).isEqualTo(0.45)
        assertThat(AudioDialGeometry.scrubbed(previous = 0.8, raw = 0.9)).isEqualTo(0.9)
    }

    @Test
    fun `l anneau saisit dans la bande et laisse le portrait`() {
        val side = 100f + 2 * AudioDialGeometry.BAND
        assertThat(AudioDialGeometry.isInRing(side / 2, side / 2, side, 100f)).isFalse()
        assertThat(AudioDialGeometry.isInRing(side / 2, 5f, side, 100f)).isTrue()
        assertThat(AudioDialGeometry.isInRing(0f, 0f, side, 100f)).isFalse()
    }

    @Test
    fun `le reechantillonnage prend le pic de chaque paquet`() {
        val samples = List(144) { if (it == 3) 0.9f else 0.1f }
        val bars = AudioDialGeometry.resample(samples)
        assertThat(bars).hasSize(72)
        assertThat(bars[1]).isEqualTo(0.9f)
        assertThat(bars[0]).isEqualTo(0.1f)
    }

    @Test
    fun `moins d echantillons que de barres chaque barre lit celui qui la couvre`() {
        val bars = AudioDialGeometry.resample(listOf(0.2f, 0.8f))
        assertThat(bars).hasSize(72)
        assertThat(bars.first()).isEqualTo(0.2f)
        assertThat(bars.last()).isEqualTo(0.8f)
    }

    @Test
    fun `une onde vide ne rend aucune barre`() {
        assertThat(AudioDialGeometry.resample(emptyList())).isEmpty()
    }

    @Test
    fun `le motif de repli est deterministe et borne`() {
        repeat(72) {
            assertThat(AudioDialGeometry.fallbackHeight(it)).isEqualTo(AudioDialGeometry.fallbackHeight(it))
            assertThat(AudioDialGeometry.fallbackHeight(it)).isAtMost(1f)
            assertThat(AudioDialGeometry.fallbackHeight(it)).isAtLeast(0.2f)
        }
    }

    @Test
    fun `la pulsation vaut 1 a l arret`() {
        assertThat(AudioDialGeometry.pulse(5, 0.5, 3.0, isPlaying = false)).isEqualTo(1f)
    }

    @Test
    fun `la pulsation est plus ample pres du curseur`() {
        val near = (0..40).maxOf { kotlin.math.abs(AudioDialGeometry.pulse(36, 0.5, it * 0.05, true) - 1f) }
        val far = (0..40).maxOf { kotlin.math.abs(AudioDialGeometry.pulse(0, 0.5, it * 0.05, true) - 1f) }
        assertThat(near).isGreaterThan(far)
    }

    @Test
    fun `la longueur d une barre est bornee`() {
        assertThat(AudioDialGeometry.barLength(0f, 1f)).isEqualTo(3f)
        assertThat(AudioDialGeometry.barLength(1f, 5f)).isEqualTo(30f)
    }

    @Test
    fun `un pas TalkBack avance de 5 pour cent et reste borne`() {
        assertThat(AudioDialGeometry.adjusted(0.5, increment = true)).isWithin(1e-9).of(0.55)
        assertThat(AudioDialGeometry.adjusted(0.99, increment = true)).isEqualTo(1.0)
        assertThat(AudioDialGeometry.adjusted(0.02, increment = false)).isEqualTo(0.0)
        assertThat(AudioDialGeometry.percent(0.424)).isEqualTo(42)
    }
}
