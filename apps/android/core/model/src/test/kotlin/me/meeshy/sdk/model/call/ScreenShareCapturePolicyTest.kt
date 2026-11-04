package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScreenShareCapturePolicyTest {

    @Test
    fun `l'ecran d'un pair s'ajuste meme en fenetre plein ecran`() {
        assertThat(ScreenShareCapturePolicy.remoteFits(peerScreenSharing = true, resizableWindow = false)).isTrue()
    }

    @Test
    fun `une camera de pair se remplit en fenetre normale`() {
        assertThat(ScreenShareCapturePolicy.remoteFits(peerScreenSharing = false, resizableWindow = false)).isFalse()
    }

    @Test
    fun `une fenetre redimensionnable ajuste toujours`() {
        assertThat(ScreenShareCapturePolicy.remoteFits(peerScreenSharing = false, resizableWindow = true)).isTrue()
    }

    @Test
    fun `la camera revient seulement voulue et emettant`() {
        assertThat(ScreenShareCapturePolicy.restoresCamera(cameraWanted = true, wasEmitting = true)).isTrue()
        assertThat(ScreenShareCapturePolicy.restoresCamera(cameraWanted = true, wasEmitting = false)).isFalse()
        assertThat(ScreenShareCapturePolicy.restoresCamera(cameraWanted = false, wasEmitting = true)).isFalse()
    }
}
