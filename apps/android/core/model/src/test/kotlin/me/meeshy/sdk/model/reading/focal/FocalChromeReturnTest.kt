package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FocalChromeReturnTest {

    @Test
    fun `le doigt posé garde le chrome retiré`() {
        assertThat(FocalChromeReturn.isHidden(isTracking = true, isDecelerating = false, remainingDistance = null))
            .isTrue()
    }

    @Test
    fun `en décélération le chrome revient quand il reste 160 ou moins`() {
        assertThat(FocalChromeReturn.isHidden(false, true, 160f)).isFalse()
        assertThat(FocalChromeReturn.isHidden(false, true, -160f)).isFalse()
        assertThat(FocalChromeReturn.isHidden(false, true, 160.5f)).isTrue()
        assertThat(FocalChromeReturn.isHidden(false, true, -900f)).isTrue()
    }

    @Test
    fun `à l'arrêt ou sans distance connue le chrome revient`() {
        assertThat(FocalChromeReturn.isHidden(false, false, 900f)).isFalse()
        assertThat(FocalChromeReturn.isHidden(false, true, null)).isFalse()
    }
}
