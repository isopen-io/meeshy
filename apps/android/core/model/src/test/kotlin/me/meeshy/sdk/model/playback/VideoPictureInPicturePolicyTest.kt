package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VideoPictureInPicturePolicyTest {
    private fun configures(
        presentation: VideoPresentation = VideoPresentation.FULLSCREEN,
        requestsPip: Boolean = true,
        isProtected: Boolean = false,
    ) = VideoPictureInPicturePolicy.mayConfigure(presentation, requestsPip, isProtected)

    private fun entersOnLeave(
        configured: Boolean = true,
        playing: Boolean = true,
        supported: Boolean = true,
        videoCall: Boolean = false,
    ) = VideoPictureInPicturePolicy.mayEnterOnLeave(configured, playing, supported, videoCall)

    @Test
    fun `une video plein ecran qui demande le PiP le configure`() {
        assertThat(configures()).isTrue()
    }

    @Test
    fun `une video inline ne configure jamais le PiP, meme si elle le demande`() {
        assertThat(configures(presentation = VideoPresentation.INLINE)).isFalse()
    }

    @Test
    fun `une video plein ecran qui ne le demande pas ne le configure pas`() {
        assertThat(configures(requestsPip = false)).isFalse()
    }

    @Test
    fun `une video protegee (vue unique, floutee) ne configure jamais le PiP`() {
        assertThat(configures(isProtected = true)).isFalse()
    }

    @Test
    fun `quitter l'app pendant la lecture d'une surface configuree ouvre la fenetre`() {
        assertThat(entersOnLeave()).isTrue()
    }

    @Test
    fun `quitter l'app sur une video en pause n'ouvre rien`() {
        assertThat(entersOnLeave(playing = false)).isFalse()
    }

    @Test
    fun `sans surface configuree, quitter l'app n'ouvre rien`() {
        assertThat(entersOnLeave(configured = false)).isFalse()
    }

    @Test
    fun `un appareil sans PiP n'ouvre rien`() {
        assertThat(entersOnLeave(supported = false)).isFalse()
    }

    @Test
    fun `un appel video en cours garde la fenetre - la video ne l'ouvre pas`() {
        assertThat(entersOnLeave(videoCall = true)).isFalse()
        assertThat(VideoPictureInPicturePolicy.offersButton(configured = true, deviceSupportsPip = true, videoCallInProgress = true)).isFalse()
    }

    @Test
    fun `le bouton est propose sur une surface configuree, lecture ou pause`() {
        assertThat(VideoPictureInPicturePolicy.offersButton(configured = true, deviceSupportsPip = true, videoCallInProgress = false)).isTrue()
        assertThat(VideoPictureInPicturePolicy.offersButton(configured = false, deviceSupportsPip = true, videoCallInProgress = false)).isFalse()
        assertThat(VideoPictureInPicturePolicy.offersButton(configured = true, deviceSupportsPip = false, videoCallInProgress = false)).isFalse()
    }

    @Test
    fun `la fenetre prend le rapport de la video`() {
        assertThat(VideoPictureInPicturePolicy.aspect(1920, 1080, PipAspect.PORTRAIT)).isEqualTo(PipAspect(1920, 1080))
        assertThat(VideoPictureInPicturePolicy.aspect(720, 1280, PipAspect.LANDSCAPE)).isEqualTo(PipAspect(720, 1280))
    }

    @Test
    fun `un rapport hors des bornes Android est ramene a la borne`() {
        val wide = VideoPictureInPicturePolicy.aspect(3000, 1000, PipAspect.LANDSCAPE)
        val tall = VideoPictureInPicturePolicy.aspect(400, 2000, PipAspect.PORTRAIT)
        assertThat(wide.ratio).isAtMost(2.39f)
        assertThat(wide.ratio).isAtLeast(2.37f)
        assertThat(tall.ratio).isAtLeast(1f / 2.39f)
        assertThat(tall.ratio).isAtMost(1f / 2.37f)
    }

    @Test
    fun `une taille inconnue prend le rapport de repli de la surface`() {
        assertThat(VideoPictureInPicturePolicy.aspect(0, 0, PipAspect.PORTRAIT)).isEqualTo(PipAspect.PORTRAIT)
        assertThat(VideoPictureInPicturePolicy.aspect(1280, 0, PipAspect.LANDSCAPE)).isEqualTo(PipAspect.LANDSCAPE)
    }
}
