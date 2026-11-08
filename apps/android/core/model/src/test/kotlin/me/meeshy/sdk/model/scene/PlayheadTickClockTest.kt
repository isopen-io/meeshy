package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class PlayheadTickClockTest {

    @Test
    fun `le premier tick avance d'une image nominale`() {
        assertThat(PlayheadTickClock().advance(now = 10.0, nominal = 1.0 / 60)).isWithin(1e-9).of(1.0 / 60)
    }

    @Test
    fun `un ecart normal avance du temps reel ecoule`() {
        val clock = PlayheadTickClock()
        clock.advance(10.0, 1.0 / 60)
        assertThat(clock.advance(10.1, 1.0 / 60)).isWithin(1e-9).of(0.1)
    }

    @Test
    fun `un ecart au-dela de 0,25 s n'avance que d'une image`() {
        val clock = PlayheadTickClock()
        clock.advance(10.0, 1.0 / 60)
        assertThat(clock.advance(12.0, 1.0 / 60)).isWithin(1e-9).of(1.0 / 60)
    }

    @Test
    fun `une horloge qui recule n'avance pas`() {
        val clock = PlayheadTickClock()
        clock.advance(10.0, 0.016)
        assertThat(clock.advance(9.0, 0.016)).isEqualTo(0.0)
    }

    @Test
    fun `la reprise apres reset ne compte pas la pause`() {
        val clock = PlayheadTickClock()
        clock.advance(10.0, 0.016)
        clock.reset()
        assertThat(clock.advance(10.2, 0.016)).isWithin(1e-9).of(0.016)
    }

    @Test
    fun `le controle de derive se declenche toutes les 0,5 s sans declencher au premier appel`() {
        val clock = PlayheadTickClock()
        assertThat(clock.isDriftCheckDue(1.0)).isFalse()
        assertThat(clock.isDriftCheckDue(1.3)).isFalse()
        assertThat(clock.isDriftCheckDue(1.5)).isTrue()
        assertThat(clock.isDriftCheckDue(1.7)).isFalse()
    }
}
