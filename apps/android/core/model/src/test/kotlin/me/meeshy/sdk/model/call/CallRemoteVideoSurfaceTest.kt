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
}
