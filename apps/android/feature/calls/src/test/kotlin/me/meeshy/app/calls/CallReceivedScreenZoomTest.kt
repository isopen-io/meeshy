package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallReceivedScreenZoomTest {
    @Test
    fun `un ecran recu commence a 1x, sans zoom acquis`() {
        val zoom = CallReceivedScreenZoom()
        assertThat(zoom.scale(isReceivingScreen = true)).isEqualTo(1f)
        assertThat(zoom.isZoomed).isFalse()
    }

    @Test
    fun `le pincement en cours s'applique, puis s'acquiert jusqu'a 4x au plus`() {
        val zoom = CallReceivedScreenZoom()
        zoom.update(2f)
        assertThat(zoom.scale(isReceivingScreen = true)).isEqualTo(2f)
        zoom.commit()
        assertThat(zoom.isZoomed).isTrue()
        zoom.update(5f)
        assertThat(zoom.scale(isReceivingScreen = true)).isEqualTo(4f)
        zoom.commit()
        assertThat(zoom.committed).isEqualTo(4f)
    }

    @Test
    fun `sans ecran recu le zoom est rendu a 1x`() {
        val zoom = CallReceivedScreenZoom()
        zoom.update(3f)
        zoom.commit()
        assertThat(zoom.scale(isReceivingScreen = false)).isEqualTo(1f)
    }

    @Test
    fun `le retour a 1x rend l'image entiere`() {
        val zoom = CallReceivedScreenZoom()
        zoom.update(3f)
        zoom.commit()
        zoom.set(1f)
        assertThat(zoom.isZoomed).isFalse()
    }
}
