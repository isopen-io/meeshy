package me.meeshy.app.calls

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.call.CallScreenMode
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSocialSignalManager
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallLiveFrameOverlayModeTest {
    @get:Rule val rule = createComposeRule()

    private val held = CallLiveFrameRule.frames().first { !CallLiveFrameRule.animates(it) }.id

    private fun heldFrame(): CallLiveFrameController {
        val social = mockk<CallSocialSignalManager> {
            every { frameSelected } returns MutableSharedFlow()
            coEvery { selectCallLiveFrame(any(), any(), any(), any()) } returns Result.success(Unit)
        }
        val session = mockk<SessionRepository> { every { currentUser } returns MutableStateFlow<MeeshyUser?>(null) }
        return CallLiveFrameController(social, session).apply {
            onTransition(CallState.Idle, CallState.Connected, CallSessionInfo("call-1", CallConfig.EMPTY))
            apply(held)
        }
    }

    private fun engine(): WebRtcEngine = mockk(relaxed = true) {
        every { remoteVideoTracks } returns MutableSharedFlow<org.webrtc.VideoTrack>()
        every { localVideoTrack } returns null
    }

    private fun videoCall() = CallUiState(
        status = CallStatus.CONNECTED,
        peerName = "Bob",
        isVideoCall = true,
        isMuted = false,
        isCameraOn = true,
        isSpeakerOn = true,
        endReason = null,
        reconnectAttempt = 0,
        durationLabel = null,
        showsConnectedLayout = true,
    )

    private fun underMode(mode: CallScreenMode) {
        val frame = heldFrame()
        val engine = engine()
        val overlay = CallLiveFrameOverlay(frame, engine, mockk(relaxed = true))
        var shown by mutableStateOf<CallScreenMode?>(mode)
        rule.setContent { MeeshyTheme { overlay.Content(CallOverlayContext(videoCall(), Color.Black, activeMode = shown)) } }
        rule.waitForIdle()

        verify(exactly = 0) { engine.remoteVideoTracks }
        assertThat(frame.state.value.frameId).isEqualTo(held)

        rule.runOnIdle { shown = null }
        rule.waitForIdle()

        verify { engine.remoteVideoTracks }
        assertThat(frame.state.value.frameId).isEqualTo(held)
        frame.onCleared()
    }

    @Test
    fun `sous le Montage, la surface du cadre garde ne lit aucune piste, et revient a la sortie avec le meme cadre`() =
        underMode(CallScreenMode.Montage)

    @Test
    fun `sous les Effets, la surface du cadre garde ne lit aucune piste, et revient a la sortie avec le meme cadre`() =
        underMode(CallScreenMode.Effects)
}
