package me.meeshy.sdk.model.composer.timeline

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** La tête de lecture de la frise suit l'horloge, pas le nombre d'images rendues (#14293). */
class FrisePlayClockTest {

    private val second = 1_000_000_000L

    @Test
    fun `a N secondes d'horloge la tete vaut N, a 30 comme a 120 images par seconde`() {
        listOf(30, 60, 120, 7).forEach { fps ->
            val clock = FrisePlayClock(originHead = 0f, originNanos = 5 * second)
            val frames = (1..8 * fps).map { 5 * second + it * second / fps }
            assertThat(clock.headAt(frames.last(), duration = 10f)).isWithin(1e-3f).of(8f)
        }
    }

    @Test
    fun `la lecture repart de la tete d'origine et s'arrete a la fin`() {
        val clock = FrisePlayClock(originHead = 2f, originNanos = 0L)
        assertThat(clock.headAt(3 * second, duration = 10f)).isWithin(1e-3f).of(5f)
        assertThat(clock.headAt(60 * second, duration = 10f)).isEqualTo(10f)
        assertThat(clock.headAt(-second, duration = 10f)).isEqualTo(2f)
    }
}
