package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FocalMagnificationLawTest {

    private fun armed(already: Boolean = false, startedAt: Double? = null, now: Double = 0.0, velocity: Double = 0.0) =
        FocalMagnificationLaw.isArmed(already, startedAt, now, velocity)

    @Test
    fun `un frolement ne l arme pas`() {
        assertThat(armed(startedAt = 0.0, now = 50.0, velocity = 40.0)).isFalse()
        assertThat(armed()).isFalse()
    }

    @Test
    fun `un defilement franc l arme des le premier evenement dans les deux sens`() {
        assertThat(armed(velocity = 1_200.0)).isTrue()
        assertThat(armed(velocity = -1_500.0)).isTrue()
        assertThat(armed(velocity = 1_199.0)).isFalse()
    }

    @Test
    fun `un defilement lent mais soutenu quatre secondes l arme`() {
        assertThat(armed(startedAt = 1_000.0, now = 4_999.0, velocity = 100.0)).isFalse()
        assertThat(armed(startedAt = 1_000.0, now = 5_000.0, velocity = 100.0)).isTrue()
    }

    @Test
    fun `une fois armee elle le reste meme au repos`() {
        assertThat(armed(already = true, startedAt = null, velocity = 0.0)).isTrue()
    }
}
