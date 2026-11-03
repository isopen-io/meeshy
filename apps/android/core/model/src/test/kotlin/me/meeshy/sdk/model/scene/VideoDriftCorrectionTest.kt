package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class VideoDriftCorrectionTest {

    @Test
    fun `une video alignee n'est pas recalee`() {
        assertThat(VideoDriftCorrection.driftCorrectionMs(2.0, 2.0)).isNull()
    }

    @Test
    fun `une derive sous le seuil ou egale au seuil ne recale pas`() {
        assertThat(VideoDriftCorrection.driftCorrectionMs(2.0, 2.4)).isNull()
        assertThat(VideoDriftCorrection.driftCorrectionMs(2.0, 2.5)).isNull()
    }

    @Test
    fun `une derive au-dela du seuil recale sur la cible de la timeline`() {
        assertThat(VideoDriftCorrection.driftCorrectionMs(2.0, 1.2)).isEqualTo(2000L)
        assertThat(VideoDriftCorrection.driftCorrectionMs(2.0, 3.0)).isEqualTo(2000L)
    }

    @Test
    fun `un clip hors fenetre est ignore`() {
        assertThat(VideoDriftCorrection.driftCorrectionMs(2.0, 9.0, inWindow = false)).isNull()
    }

    @Test
    fun `des valeurs non finies ne recalent pas`() {
        assertThat(VideoDriftCorrection.driftCorrectionMs(Double.NaN, 1.0)).isNull()
        assertThat(VideoDriftCorrection.driftCorrectionMs(1.0, Double.POSITIVE_INFINITY)).isNull()
    }

    @Test
    fun `une cible negative est ramenee a zero`() {
        assertThat(VideoDriftCorrection.driftCorrectionMs(-1.0, 5.0)).isEqualTo(0L)
    }

    @Test
    fun `un seul recalage en vol a la fois`() {
        val gate = DriftSeekGate()
        assertThat(gate.claim()).isTrue()
        assertThat(gate.claim()).isFalse()
        gate.release()
        assertThat(gate.claim()).isTrue()
    }
}
