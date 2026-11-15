package me.meeshy.sdk.model.analytics.v2

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SteppedFractionTest {
    private val viewport = MeasuredRect(0.0, 0.0, 100.0, 1_000.0)

    private fun frameVisible(percent: Int): MeasuredRect {
        val height = 200.0
        val hidden = height * (100 - percent) / 100
        return MeasuredRect(0.0, -hidden, 100.0, height - hidden)
    }

    @Test
    fun `la fraction visible est le recouvrement sur la surface du cadre`() {
        assertThat(ViewabilityMeter.visibleFraction(frameVisible(50), viewport)).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `un cadre hors fenetre ou sans surface vaut zero`() {
        assertThat(ViewabilityMeter.visibleFraction(MeasuredRect(0.0, 2_000.0, 100.0, 2_200.0), viewport)).isEqualTo(0.0)
        assertThat(ViewabilityMeter.visibleFraction(MeasuredRect(0.0, 0.0, 0.0, 10.0), viewport)).isEqualTo(0.0)
    }

    @Test
    fun `les paliers sont de 5 pour cent et arrondissent vers le bas`() {
        assertThat(ViewabilityMeter.steppedFraction(frameVisible(47), viewport)).isEqualTo(0.45)
        assertThat(ViewabilityMeter.steppedFraction(frameVisible(99), viewport)).isEqualTo(0.95)
        assertThat(ViewabilityMeter.steppedFraction(frameVisible(100), viewport)).isEqualTo(1.0)
    }

    @Test
    fun `les seuils 0 et 50 pour cent tombent exactement sur un palier`() {
        assertThat(ViewabilityMeter.steppedFraction(frameVisible(50), viewport)).isEqualTo(0.5)
        assertThat(ViewabilityMeter.steppedFraction(frameVisible(0), viewport)).isEqualTo(0.0)
        assertThat(ViewabilityMeter.steppedFraction(frameVisible(4), viewport)).isEqualTo(0.0)
    }
}
