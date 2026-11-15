package me.meeshy.sdk.model.call.montage

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallFrameRect
import org.junit.Test

/** Portage de la section « Recadrage d'un visage » de `CallMontageLayoutTests.swift`. */
class CallFaceCropTest {

    @Test
    fun `une boite normalisee a origine basse devient un rectangle en pixels a origine haute`() {
        val rect = CallFaceCrop.pixelRect(CallFrameRect(0.25, 0.5, 0.5, 0.25), CallMontageCanvas(400.0, 800.0))
        assertThat(rect).isEqualTo(CallFrameRect(100.0, 200.0, 200.0, 200.0))
    }

    @Test
    fun `sans visage, le plus grand carre centre`() {
        assertThat(CallFaceCrop.square(null, CallMontageCanvas(720.0, 1280.0), margin = 0.4))
            .isEqualTo(CallFrameRect(0.0, 280.0, 720.0, 720.0))
    }

    @Test
    fun `autour d un visage, la marge s ajoute et le cadre reste carre`() {
        val face = CallFrameRect(300.0, 500.0, 200.0, 260.0)
        val crop = CallFaceCrop.square(face, CallMontageCanvas(1080.0, 1920.0), margin = 0.4)
        assertThat(crop.width).isEqualTo(crop.height)
        assertThat(crop.width).isWithin(0.001).of(260 * 1.8)
        assertThat(crop.contains(face)).isTrue()
    }

    @Test
    fun `un visage au bord reste dans l image, un visage enorme est plafonne a l image`() {
        val size = CallMontageCanvas(720.0, 1280.0)
        val edge = CallFaceCrop.square(CallFrameRect(650.0, 10.0, 60.0, 80.0), size, margin = 0.5)
        assertThat(size.bounds.contains(edge)).isTrue()
        val huge = CallFaceCrop.square(CallFrameRect(0.0, 0.0, 700.0, 900.0), size, margin = 0.5)
        assertThat(huge.width).isEqualTo(720.0)
        assertThat(size.bounds.contains(huge)).isTrue()
    }
}
