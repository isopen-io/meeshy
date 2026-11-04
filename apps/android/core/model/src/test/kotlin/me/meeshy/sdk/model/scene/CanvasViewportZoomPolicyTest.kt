package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CanvasViewportZoomPolicyTest {
    @Test fun `l'echelle est bornee entre 0,5 et 4`() {
        assertThat(CanvasViewportZoomPolicy.settledScale(1f, 10f)).isEqualTo(4f)
        assertThat(CanvasViewportZoomPolicy.settledScale(1f, 0.1f)).isEqualTo(0.5f)
        assertThat(CanvasViewportZoomPolicy.settledScale(2f, 1.5f)).isEqualTo(3f)
    }

    @Test fun `sous 0,08 de l'identite l'echelle s'aimante a 1`() {
        assertThat(CanvasViewportZoomPolicy.settledScale(1f, 1.07f)).isEqualTo(1f)
        assertThat(CanvasViewportZoomPolicy.settledScale(1f, 0.93f)).isEqualTo(1f)
        assertThat(CanvasViewportZoomPolicy.settledScale(1f, 1.09f)).isWithin(1e-6f).of(1.09f)
    }

    @Test fun `la scene n'est zoomee qu'a une echelle differente de 1`() {
        assertThat(CanvasViewportZoomPolicy.isZoomed(1f)).isFalse()
        assertThat(CanvasViewportZoomPolicy.isZoomed(1.5f)).isTrue()
    }

    @Test fun `le double-tap reinitialise seulement si zoome et hors objet`() {
        assertThat(CanvasViewportZoomPolicy.doubleTapResetsViewport(true, null)).isTrue()
        assertThat(CanvasViewportZoomPolicy.doubleTapResetsViewport(true, "t1")).isFalse()
        assertThat(CanvasViewportZoomPolicy.doubleTapResetsViewport(false, null)).isFalse()
    }
}
