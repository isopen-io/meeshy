package me.meeshy.app.calls

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjection
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.screenshare.CallScreenSharePhase
import me.meeshy.ui.icons.MeeshyIcons
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * « Partager l'écran » comme iOS `CallScreenShareController` (#13332) : le consentement système, la piste
 * qui part dès que la projection vit, `call:toggle-screen` annoncé au pair, et l'arrêt — bouton,
 * notification, système ou fin d'appel — qui rend la caméra et libère la projection.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallScreenShareControllerTest {

    private class NoopLauncher : MediaProjectionServiceLauncher {
        var stops = 0
        override fun start(purpose: MediaProjectionPurpose, consent: MediaProjectionConsent.Granted) = Unit
        override fun stop() {
            stops++
        }
    }

    private class FakeMedia(private val fails: Boolean = false) : CallScreenShareMedia {
        val calls = mutableListOf<String>()
        override fun begin(projection: MediaProjection) {
            if (fails) throw IllegalStateException("capture refused")
            calls += "begin"
        }

        override fun end() {
            calls += "end"
        }
    }

    private class Rig(fails: Boolean = false) {
        val launcher = NoopLauncher()
        val projections = MediaProjectionSession(launcher)
        val media = FakeMedia(fails)
        val announced = mutableListOf<Pair<String, Boolean>>()
        var failures = 0
        val controller = CallScreenShareController(
            projections = projections,
            media = media,
            announcer = { callId, enabled -> announced += callId to enabled },
            reportFailure = { failures++ },
            scope = CoroutineScope(UnconfinedTestDispatcher()),
        )
        val projection: MediaProjection = mockk(relaxed = true)
        val info = CallSessionInfo(callId = "call-7", config = CallConfig.EMPTY)

        fun connect() = controller.onTransition(CallState.Connecting, CallState.Connected, info)

        fun grantAndAcquire() {
            controller.onConsent(MediaProjectionConsent.fromResult(Activity.RESULT_OK, Intent("grant")))
            projections.onProjectionAcquired(projection)
        }
    }

    private fun connectedState() = CallPresenter.present(
        state = CallState.Connected,
        config = CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = true),
        media = CallMedia(isCameraOn = true),
        mediaEstablished = true,
    )

    @Test
    fun `a tap asks the system consent, then the projection sends the screen and tells the peer`() {
        val rig = Rig().apply { connect() }

        rig.controller.toggle()

        assertThat(rig.controller.state.value.asksConsent).isTrue()
        assertThat(rig.controller.state.value.phase).isEqualTo(CallScreenSharePhase.Requesting)
        rig.grantAndAcquire()
        assertThat(rig.media.calls).containsExactly("begin")
        assertThat(rig.announced).containsExactly("call-7" to true)
        assertThat(rig.controller.state.value.phase).isEqualTo(CallScreenSharePhase.Sharing)
        assertThat(rig.controller.state.value.asksConsent).isFalse()
    }

    @Test
    fun `stopping gives the camera back, tells the peer and releases the projection`() {
        val rig = Rig().apply { connect() }
        rig.controller.toggle()
        rig.grantAndAcquire()

        rig.controller.toggle()

        assertThat(rig.media.calls).containsExactly("begin", "end").inOrder()
        assertThat(rig.announced).containsExactly("call-7" to true, "call-7" to false).inOrder()
        assertThat(rig.launcher.stops).isEqualTo(1)
        assertThat(rig.controller.state.value.phase).isEqualTo(CallScreenSharePhase.Idle)
    }

    @Test
    fun `a stop from the system or the notification ends the share the same way`() {
        val rig = Rig().apply { connect() }
        rig.controller.toggle()
        rig.grantAndAcquire()

        rig.projections.onSystemStop()

        assertThat(rig.media.calls).containsExactly("begin", "end").inOrder()
        assertThat(rig.announced.last()).isEqualTo("call-7" to false)
    }

    @Test
    fun `a declined consent shares nothing and says nothing`() {
        val rig = Rig().apply { connect() }
        rig.controller.toggle()

        rig.controller.onConsent(MediaProjectionConsent.Denied)

        assertThat(rig.media.calls).isEmpty()
        assertThat(rig.failures).isEqualTo(0)
        assertThat(rig.projections.state.value).isEqualTo(MediaProjectionState.Idle)
        assertThat(rig.controller.state.value.phase).isEqualTo(CallScreenSharePhase.Idle)
    }

    @Test
    fun `a capture the engine refuses stops the projection and is reported`() {
        val rig = Rig(fails = true).apply { connect() }
        rig.controller.toggle()

        rig.grantAndAcquire()

        assertThat(rig.failures).isEqualTo(1)
        assertThat(rig.announced).isEmpty()
        assertThat(rig.launcher.stops).isEqualTo(1)
        assertThat(rig.controller.state.value.phase).isEqualTo(CallScreenSharePhase.Idle)
    }

    @Test
    fun `a projection already held by the recording is reported, never shared`() {
        val rig = Rig().apply { connect() }
        rig.projections.request(MediaProjectionPurpose.Recording)

        rig.controller.toggle()

        assertThat(rig.failures).isEqualTo(1)
        assertThat(rig.controller.state.value.phase).isEqualTo(CallScreenSharePhase.Idle)
    }

    @Test
    fun `the end of the call stops the share without announcing it to a peer who is gone`() {
        val rig = Rig().apply { connect() }
        rig.controller.toggle()
        rig.grantAndAcquire()

        rig.controller.onTransition(CallState.Connected, CallState.Ended(CallEndReason.Local), rig.info)

        assertThat(rig.media.calls).containsExactly("begin", "end").inOrder()
        assertThat(rig.announced).containsExactly("call-7" to true)
        assertThat(rig.launcher.stops).isEqualTo(1)
    }

    @Test
    fun `a peer who joins again or a call back from reconnecting learns the share in flight`() {
        val rig = Rig().apply { connect() }
        rig.controller.onRemoteEvent(CallEvent.ParticipantJoined("u1"), rig.info)
        rig.controller.toggle()
        rig.grantAndAcquire()

        rig.controller.onRemoteEvent(CallEvent.ParticipantJoined("u1"), rig.info)
        rig.controller.onTransition(CallState.Reconnecting(attempt = 1), CallState.Connected, rig.info)

        assertThat(rig.announced).containsExactly("call-7" to true, "call-7" to true, "call-7" to true)
    }

    @Test
    fun `before the call is established a tap asks nothing`() {
        val rig = Rig()

        rig.controller.toggle()

        assertThat(rig.projections.state.value).isEqualTo(MediaProjectionState.Idle)
    }

    @Test
    fun `the action offers to share on an established call, then to stop`() {
        val rig = Rig().apply { connect() }
        val handler = CallScreenShareActionHandler(rig.controller)

        val idle = handler.present(connectedState())
        rig.controller.toggle()
        rig.grantAndAcquire()
        val sharing = handler.present(connectedState())

        assertThat(idle).isEqualTo(
            CallActionPresentation(MeeshyIcons.FlipToFront, R.string.call_screen_share_start, false, R.string.call_screen_share_hint),
        )
        assertThat(sharing?.labelRes).isEqualTo(R.string.call_screen_share_stop)
        assertThat(sharing?.isActive).isTrue()
        assertThat(handler.present(connectedState().copy(status = CallStatus.CONNECTING, showsConnectedLayout = false))?.isActive)
            .isTrue()
    }

    @Test
    fun `the action is absent while the call is not established`() {
        val handler = CallScreenShareActionHandler(Rig().controller)

        assertThat(handler.present(connectedState().copy(status = CallStatus.CONNECTING, showsConnectedLayout = false))).isNull()
    }
}
