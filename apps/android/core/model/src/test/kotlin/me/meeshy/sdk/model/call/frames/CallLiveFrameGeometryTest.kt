package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallLiveFrameGeometryTest {

    @Test
    fun `la toile remplit l ecran sans deformation, centree`() {
        val fit = CallLiveFrameGeometry.fit(500.0, 1000.0, 1000.0, 2200.0)
        assertThat(fit.scale).isWithin(1e-9).of(2.2)
        assertThat(fit.offsetX).isWithin(1e-9).of(-50.0)
        assertThat(fit.offsetY).isWithin(1e-9).of(0.0)
        assertThat(CallLiveFrameGeometry.fit(0.0, 10.0, 10.0, 10.0)).isEqualTo(CallLiveFrameFit.IDENTITY)
    }

    @Test
    fun `la video se pose dans le visage de la case, portee a l ecran`() {
        val box = CallFrameSlotBox(CallFrameRect(100.0, 200.0, 300.0, 400.0), CallFrameSlotShape.CIRCLE, 6.0, 1)
        val fit = CallLiveFrameFit(2.0, 10.0, 20.0)
        val placement = CallLiveFrameGeometry.placements(listOf(box), null, fit).single()
        assertThat(placement.personIndex).isEqualTo(1)
        assertThat(placement.photo).isEqualTo(CallFrameRect(210.0, 420.0, 600.0, 800.0))
        assertThat(placement.rotation).isEqualTo(6.0)
        assertThat(placement.pivotX).isWithin(1e-9).of(0.5)
        assertThat(placement.pivotY).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `sur une carte a pied, le visage est l interieur de la carte et tourne autour du centre de la case`() {
        val box = CallFrameSlotBox(CallFrameRect(0.0, 0.0, 100.0, 120.0), CallFrameSlotShape.RECT, -4.0, 0)
        val placement = CallLiveFrameGeometry.placements(listOf(box), CallFrameCard("#FFFFFF", 0.05, 0.2), CallLiveFrameFit.IDENTITY).single()
        assertThat(placement.photo).isEqualTo(CallFrameRenderKit.photoRect(box.rect, CallFrameCard("#FFFFFF", 0.05, 0.2)))
        assertThat(placement.pivotY).isGreaterThan(0.5)
    }

    @Test
    fun `une case sans surface ne recoit aucune video`() {
        val flat = CallFrameSlotBox(CallFrameRect(0.0, 0.0, 0.0, 10.0), CallFrameSlotShape.RECT, 0.0, 0)
        assertThat(CallLiveFrameGeometry.placements(listOf(flat), null, CallLiveFrameFit.IDENTITY)).isEmpty()
    }
}
