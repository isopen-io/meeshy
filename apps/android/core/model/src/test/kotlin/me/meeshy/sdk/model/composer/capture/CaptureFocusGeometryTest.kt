package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CaptureFocusGeometryTest {
    private val full = CaptureRect(0f, 0f, 100f, 200f)

    @Test
    fun `image fills its target without distortion and overflows centered`() {
        val r = CaptureFocusGeometry.filled(400f, 300f, full)
        assertThat(r.height).isEqualTo(200f)
        assertThat(r.width).isWithin(1e-3f).of(266.667f)
        assertThat(r.midX).isWithin(1e-3f).of(50f)
        assertThat(CaptureFocusGeometry.filled(0f, 0f, full)).isEqualTo(full)
    }

    @Test
    fun `back camera maps view to the rotated sensor`() {
        val p = CaptureFocusGeometry.devicePoint(25f, 50f, full, mirrored = false)!!
        assertThat(p.x).isEqualTo(0.25f)
        assertThat(p.y).isEqualTo(0.75f)
    }

    @Test
    fun `front camera mirrors the horizontal axis`() {
        val p = CaptureFocusGeometry.devicePoint(25f, 50f, full, mirrored = true)!!
        assertThat(p.x).isEqualTo(0.25f)
        assertThat(p.y).isEqualTo(0.25f)
    }

    @Test
    fun `a tap outside the displayed image aims nowhere`() {
        assertThat(CaptureFocusGeometry.devicePoint(-1f, 10f, full, false)).isNull()
        assertThat(CaptureFocusGeometry.devicePoint(10f, 201f, full, false)).isNull()
        assertThat(CaptureFocusGeometry.devicePoint(1f, 1f, CaptureRect(0f, 0f, 0f, 0f), false)).isNull()
    }

    @Test
    fun `a framed slot is read in its own rectangle`() {
        val slot = CaptureFocusGeometry.slotInView(CaptureRect(0f, 0f, 540f, 960f), 1080f, 1920f, 540f, 1200f)
        assertThat(slot.width).isEqualTo(270f)
        assertThat(slot.left).isEqualTo(0f)
        assertThat(slot.top).isEqualTo(120f)
        val p = CaptureFocusGeometry.devicePoint(slot.midX, slot.midY, slot, false)!!
        assertThat(p).isEqualTo(CapturePoint(0.5f, 0.5f))
        assertThat(CaptureFocusGeometry.slotInView(slot, 0f, 0f, 1f, 1f)).isEqualTo(slot)
    }
}
