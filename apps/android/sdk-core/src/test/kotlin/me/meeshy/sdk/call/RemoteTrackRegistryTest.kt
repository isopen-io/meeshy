package me.meeshy.sdk.call

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.webrtc.AudioTrack
import org.webrtc.MediaStreamTrack
import org.webrtc.VideoTrack

/**
 * Reproduces the cross-call replay leak: [WebRtcEngine] is a `@Singleton`,
 * so the SAME registry — and the same replay=1 remote-video flow — serves
 * every call in the process. Without [RemoteTrackRegistry.reset] on
 * [WebRtcEngine.close], a fresh subscriber at the start of the NEXT call
 * (e.g. `CallScreen` recomposing) is handed the disposed [VideoTrack] from
 * the call that just ended, before that call's own track (if any) arrives.
 */
class RemoteTrackRegistryTest {

    private val registry = RemoteTrackRegistry()

    @Test
    fun `replays the current call's remote video track to a late subscriber`() = runTest {
        val track = mockk<VideoTrack>()

        registry.onAddTrack(track)

        registry.video.test {
            assertThat(awaitItem()).isSameInstanceAs(track)
        }
    }

    @Test
    fun `reset forgets the ended call's track — a fresh subscriber sees no replay`() = runTest {
        registry.onAddTrack(mockk<VideoTrack>())

        registry.reset()

        registry.video.test {
            expectNoEvents()
        }
    }

    @Test
    fun `does not replay remote audio (unbuffered by design)`() = runTest {
        registry.onAddTrack(mockk<AudioTrack>())

        registry.audio.test {
            expectNoEvents()
        }
    }

    @Test
    fun `ignores a track that is neither audio nor video`() = runTest {
        registry.onAddTrack(mockk<MediaStreamTrack>())

        registry.video.test { expectNoEvents() }
        registry.audio.test { expectNoEvents() }
    }
}
