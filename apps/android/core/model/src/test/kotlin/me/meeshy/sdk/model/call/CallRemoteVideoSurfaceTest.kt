package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallRemoteVideoSurfaceTest {
    private fun resolve(hasTrack: Boolean, peerVideoEnabled: Boolean, waitElapsed: Boolean) =
        CallRemoteVideoSurface.resolve(hasTrack, peerVideoEnabled, waitElapsed)

    @Test
    fun `a track with the camera announced on is live`() {
        assertThat(resolve(true, true, false)).isEqualTo(CallRemoteVideoSurface.Live)
    }

    @Test
    fun `a track whose camera is announced off shows the camera-off avatar, never the frozen frame`() {
        assertThat(resolve(true, false, false)).isEqualTo(CallRemoteVideoSurface.CameraOff)
    }

    @Test
    fun `no track yet and a camera announced off is camera off at once`() {
        assertThat(resolve(false, false, false)).isEqualTo(CallRemoteVideoSurface.CameraOff)
    }

    @Test
    fun `no track and no announcement is connecting until the wait elapses`() {
        assertThat(resolve(false, true, false)).isEqualTo(CallRemoteVideoSurface.Connecting)
        assertThat(resolve(false, true, true)).isEqualTo(CallRemoteVideoSurface.CameraOff)
    }

    @Test
    fun `the wait is twelve seconds`() {
        assertThat(CallRemoteVideoSurface.WAIT_SECONDS).isEqualTo(12L)
    }

    @Test
    fun `the elapsed wait only counts for the same call once media is established`() {
        assertThat(CallRemoteVideoSurface.isWaitElapsed(true, "c1", "c1")).isTrue()
        assertThat(CallRemoteVideoSurface.isWaitElapsed(false, "c1", "c1")).isFalse()
        assertThat(CallRemoteVideoSurface.isWaitElapsed(true, "c1", "c2")).isFalse()
        assertThat(CallRemoteVideoSurface.isWaitElapsed(true, null, null)).isFalse()
    }

    @Test
    fun `a peer escalating an audio call to video renders live as soon as its track arrives`() {
        assertThat(resolve(hasTrack = true, peerVideoEnabled = true, waitElapsed = false))
            .isEqualTo(CallRemoteVideoSurface.Live)
    }
}

/** G4.6 : l'image cède la place à l'avatar (et revient) en fondu, plus court sous « Réduire les animations ». */
class CallRemoteVideoFadeTest {

    @Test
    fun `le fondu dure 250 ms, 120 ms sous reduction de mouvement`() {
        assertThat(CallRemoteVideoFade.durationMillis(reduceMotion = false)).isEqualTo(250)
        assertThat(CallRemoteVideoFade.durationMillis(reduceMotion = true)).isEqualTo(120)
    }

    @Test
    fun `le voile de l'avatar n'est transparent que pour une image en direct`() {
        assertThat(CallRemoteVideoFade.veilOpacity(CallRemoteVideoSurface.Live, hasTrack = true)).isEqualTo(0f)
        assertThat(CallRemoteVideoFade.veilOpacity(CallRemoteVideoSurface.CameraOff, hasTrack = true)).isEqualTo(1f)
        assertThat(CallRemoteVideoFade.veilOpacity(CallRemoteVideoSurface.Connecting, hasTrack = false)).isEqualTo(1f)
        assertThat(CallRemoteVideoFade.veilOpacity(CallRemoteVideoSurface.Live, hasTrack = false)).isEqualTo(1f)
    }

    @Test
    fun `l'image reste montee tant que le voile ne l'a pas couverte, puis elle est retiree`() {
        assertThat(CallRemoteVideoFade.keepsLiveImage(hasTrack = true, veil = 0f)).isTrue()
        assertThat(CallRemoteVideoFade.keepsLiveImage(hasTrack = true, veil = 0.6f)).isTrue()
        assertThat(CallRemoteVideoFade.keepsLiveImage(hasTrack = true, veil = 1f)).isFalse()
        assertThat(CallRemoteVideoFade.keepsLiveImage(hasTrack = false, veil = 0f)).isFalse()
    }

    @Test
    fun `l'avatar reste monte tant que le voile n'est pas retombe`() {
        assertThat(CallRemoteVideoFade.showsVeil(veil = 0f)).isFalse()
        assertThat(CallRemoteVideoFade.showsVeil(veil = 0.3f)).isTrue()
    }

    @Test
    fun `camera coupee sur fond noir opaque, l'attente seulement voilee`() {
        assertThat(CallRemoteVideoFade.backdropOpacity(CallRemoteVideoSurface.CameraOff)).isEqualTo(1f)
        assertThat(CallRemoteVideoFade.backdropOpacity(CallRemoteVideoSurface.Connecting)).isEqualTo(0.4f)
    }

    @Test
    fun `le fondu croise mene l'image gelee a zero avant qu'elle soit retiree, sans residu`() {
        assertThat(CallRemoteVideoFade.imageShare(veil = 1f, veiled = CallRemoteVideoSurface.CameraOff)).isEqualTo(0f)
        assertThat(CallRemoteVideoFade.imageShare(veil = 0.5f, veiled = CallRemoteVideoSurface.CameraOff)).isEqualTo(0.5f)
        assertThat(CallRemoteVideoFade.imageShare(veil = 0f, veiled = CallRemoteVideoSurface.CameraOff)).isEqualTo(1f)
    }

    /** Loi 17.12 — une vignette (de groupe, ou la mienne) dont la caméra se coupe : la piste retirée ne retire pas l'image d'un coup. */
    @Test
    fun `une vignette garde son image, gelee si la piste est partie, tant que le voile ne l'a pas couverte`() {
        assertThat(CallRemoteVideoFade.keepsTileImage(isLive = true, veil = 0f)).isTrue()
        assertThat(CallRemoteVideoFade.keepsTileImage(isLive = true, veil = 1f)).isTrue()
        assertThat(CallRemoteVideoFade.keepsTileImage(isLive = false, veil = 0.4f)).isTrue()
        assertThat(CallRemoteVideoFade.keepsTileImage(isLive = false, veil = 1f)).isFalse()
    }

    /** Loi 17.1 — ma vignette paraît et repart en fondu, sans jamais montrer d'un coup l'image qu'elle porte. */
    @Test
    fun `ma vignette parait cadre d'abord, voile pose, puis le voile se leve sur ce qu'elle montre`() {
        listOf(false, true).forEach { reduce ->
            val fade = CallRemoteVideoFade.durationMillis(reduce)
            assertThat(CallRemoteVideoFade.presenceVeilDelayMillis(reduce, appearing = true)).isEqualTo(fade)
            assertThat(CallRemoteVideoFade.presenceFrameDelayMillis(reduce, appearing = true)).isEqualTo(0)
        }
    }

    @Test
    fun `ma vignette repart par le chemin inverse, le voile retombe avant que le cadre fonde`() {
        listOf(false, true).forEach { reduce ->
            val fade = CallRemoteVideoFade.durationMillis(reduce)
            assertThat(CallRemoteVideoFade.presenceVeilDelayMillis(reduce, appearing = false)).isEqualTo(0)
            assertThat(CallRemoteVideoFade.presenceFrameDelayMillis(reduce, appearing = false)).isEqualTo(fade)
        }
    }

    @Test
    fun `ce que montre ma vignette n'est monte que sous un voile qui n'est plus plein`() {
        assertThat(CallRemoteVideoFade.mountsTileContent(veil = 1f)).isFalse()
        assertThat(CallRemoteVideoFade.mountsTileContent(veil = 0.99f)).isTrue()
        assertThat(CallRemoteVideoFade.mountsTileContent(veil = 0f)).isTrue()
    }

    @Test
    fun `le voile garde ce qu'il montrait pendant que l'image revient, et suit l'etat sinon`() {
        assertThat(CallRemoteVideoFade.veiled(CallRemoteVideoSurface.Live, previous = CallRemoteVideoSurface.Connecting))
            .isEqualTo(CallRemoteVideoSurface.Connecting)
        assertThat(CallRemoteVideoFade.veiled(CallRemoteVideoSurface.CameraOff, previous = CallRemoteVideoSurface.Connecting))
            .isEqualTo(CallRemoteVideoSurface.CameraOff)
        assertThat(CallRemoteVideoFade.veiled(CallRemoteVideoSurface.Connecting, previous = CallRemoteVideoSurface.CameraOff))
            .isEqualTo(CallRemoteVideoSurface.Connecting)
    }
}
