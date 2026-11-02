package me.meeshy.sdk.model.call.camera

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CameraZoomCropTest {
    @Test
    fun `sans zoom l'image reste entiere`() {
        assertThat(CameraZoomCrop.rect(1280, 720, 1f)).isEqualTo(CameraCropRect(0, 0, 1280, 720))
        assertThat(CameraZoomCrop.rect(1280, 720, 0.4f).isWhole).isTrue()
    }

    @Test
    fun `deux fois recadre le centre, aux dimensions paires`() {
        assertThat(CameraZoomCrop.rect(1280, 720, 2f)).isEqualTo(CameraCropRect(320, 180, 640, 360))
    }

    @Test
    fun `un facteur impair reste pair et dans l'image`() {
        val r = CameraZoomCrop.rect(1280, 720, 3f)
        assertThat(r.width % 2).isEqualTo(0)
        assertThat(r.height % 2).isEqualTo(0)
        assertThat(r.x + r.width).isAtMost(1280)
        assertThat(r.y + r.height).isAtMost(720)
    }
}
