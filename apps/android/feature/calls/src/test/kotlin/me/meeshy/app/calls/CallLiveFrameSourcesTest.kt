package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import me.meeshy.sdk.model.call.frames.CallFramePerson
import org.junit.Test
import org.webrtc.VideoTrack

class CallLiveFrameSourcesTest {
    private val me = CallFramePerson("me", "Ana", null, isSelf = true)
    private val peer = CallFramePerson("peer", "Bob", null, isSelf = false)
    private val local = mockk<VideoTrack>()
    private val remote = mockk<VideoTrack>()

    @Test
    fun `chacun recoit sa piste, la mienne en miroir quand la camera avant filme`() {
        val sources = CallLiveFrameSources.of(listOf(me, peer), local, remote, isCameraOn = true, isFrontCamera = true, isPeerCameraOff = false)
        assertThat(sources["me"]).isEqualTo(CallLiveFrameVideoSource(local, isMirrored = true))
        assertThat(sources["peer"]).isEqualTo(CallLiveFrameVideoSource(remote, isMirrored = false))
        val back = CallLiveFrameSources.of(listOf(me, peer), local, remote, isCameraOn = true, isFrontCamera = false, isPeerCameraOff = false)
        assertThat(back["me"]?.isMirrored).isFalse()
    }

    @Test
    fun `une camera coupee garde sa case, sans piste, pour son visage de repli`() {
        val sources = CallLiveFrameSources.of(listOf(me, peer), local, remote, isCameraOn = false, isFrontCamera = true, isPeerCameraOff = true)
        assertThat(sources).isEmpty()
        assertThat(CallLiveFrameSources.of(listOf(me, peer), null, null, isCameraOn = true, isFrontCamera = true, isPeerCameraOff = false)).isEmpty()
    }
}
