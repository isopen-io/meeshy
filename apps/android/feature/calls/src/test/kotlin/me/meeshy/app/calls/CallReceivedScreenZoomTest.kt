package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.group.GroupCallScreenPan
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

    /** #17961 point 2 · #17753 — zoomé, l'écran reçu se déplace au doigt, borné à son cadre. */
    @Test
    fun `a 1x screen does not move under the finger`() {
        val zoom = CallReceivedScreenZoom()
        zoom.drag(dx = 80f, dy = 40f, width = 400f, height = 200f)
        assertThat(zoom.isPannable).isFalse()
        assertThat(zoom.panIn(width = 400f, height = 200f, isReceivingScreen = true)).isEqualTo(GroupCallScreenPan(0f, 0f))
    }

    @Test
    fun `zoomed, a drag moves the image and stops at its edge`() {
        val zoom = CallReceivedScreenZoom()
        zoom.update(2f)
        zoom.commit()
        assertThat(zoom.isPannable).isTrue()
        zoom.drag(dx = 30f, dy = -10f, width = 400f, height = 200f)
        assertThat(zoom.panIn(width = 400f, height = 200f, isReceivingScreen = true)).isEqualTo(GroupCallScreenPan(30f, -10f))
        zoom.drag(dx = 999f, dy = -999f, width = 400f, height = 200f)
        assertThat(zoom.panIn(width = 400f, height = 200f, isReceivingScreen = true)).isEqualTo(GroupCallScreenPan(200f, -100f))
    }

    @Test
    fun `a drag back from the edge moves at once, the acquired pan is never beyond the bound`() {
        val zoom = CallReceivedScreenZoom()
        zoom.update(4f)
        zoom.commit()
        zoom.drag(dx = 600f, dy = 0f, width = 400f, height = 200f)
        zoom.update(0.5f)
        zoom.commit()
        zoom.drag(dx = -50f, dy = 0f, width = 400f, height = 200f)
        assertThat(zoom.panIn(width = 400f, height = 200f, isReceivingScreen = true)).isEqualTo(GroupCallScreenPan(150f, 0f))
    }

    @Test
    fun `back to 1x recentres the image, and without a received screen nothing is moved`() {
        val zoom = CallReceivedScreenZoom()
        zoom.update(3f)
        zoom.commit()
        zoom.drag(dx = 100f, dy = 50f, width = 400f, height = 200f)
        assertThat(zoom.panIn(width = 400f, height = 200f, isReceivingScreen = false)).isEqualTo(GroupCallScreenPan(0f, 0f))
        zoom.set(1f)
        assertThat(zoom.pan).isEqualTo(GroupCallScreenPan(0f, 0f))
        assertThat(zoom.panIn(width = 400f, height = 200f, isReceivingScreen = true)).isEqualTo(GroupCallScreenPan(0f, 0f))
    }

    @Test
    fun `a pinch in progress past 1x already lets the remaining finger move the image`() {
        val zoom = CallReceivedScreenZoom()
        zoom.update(2f)
        assertThat(zoom.isPannable).isTrue()
    }
}
