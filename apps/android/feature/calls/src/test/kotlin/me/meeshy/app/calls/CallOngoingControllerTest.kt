package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ongoing.CallActivityLaw
import me.meeshy.sdk.model.ongoing.CallActivityPhase
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallOngoingControllerTest {

    private class FakeLauncher : CallServiceLauncher {
        var starts = 0
        var stops = 0
        override fun start() { starts += 1 }
        override fun stop() { stops += 1 }
    }

    private val wording = object : CallOngoingWording {
        override fun current() = CallActivityLaw.Wording("Ringing", "Connecting", "Audio", "Video", "Hold", "Reconnecting", "Ended")
    }
    private var now = 10_000L
    private val clock = object : CallClock {
        override fun nowMs() = now
    }

    private val holder = ActiveCallSnapshotHolder()
    private val launcher = FakeLauncher()
    private val controller = CallOngoingController(holder, CallServiceController(launcher), wording, clock)
    private var hangUps = 0
    private var mutes = 0

    private fun ui(
        status: CallStatus,
        muted: Boolean = false,
        caption: String? = null,
    ) = CallUiState(
        status = status,
        peerName = "Alice",
        isVideoCall = false,
        isMuted = muted,
        isCameraOn = false,
        isSpeakerOn = false,
        endReason = null,
        reconnectAttempt = 0,
        durationLabel = null,
        captionText = caption,
    )

    private fun TestScope.attach(state: MutableStateFlow<CallUiState>) {
        controller.attach(this, state, onHangUp = { hangUps += 1 }, onToggleMute = { mutes += 1 })
        runCurrent()
    }

    private fun phase(): CallActivityPhase? = holder.snapshot.value?.phase

    @Test
    fun `an incoming ring opens nothing`() = runTest {
        val state = MutableStateFlow(ui(CallStatus.INCOMING))
        attach(state)
        assertThat(holder.snapshot.value).isNull()
        assertThat(launcher.starts).isEqualTo(0)
        controller.detach()
    }

    @Test
    fun `answering opens the notification and starts the service`() = runTest {
        val state = MutableStateFlow(ui(CallStatus.INCOMING))
        attach(state)
        state.value = ui(CallStatus.CONNECTING)
        runCurrent()
        assertThat(phase()).isEqualTo(CallActivityPhase.Connecting)
        assertThat(launcher.starts).isEqualTo(1)
        controller.detach()
    }

    @Test
    fun `placing a call opens the notification straight away`() = runTest {
        val state = MutableStateFlow(ui(CallStatus.OUTGOING_RINGING))
        attach(state)
        assertThat(phase()).isEqualTo(CallActivityPhase.Ringing)
        controller.detach()
    }

    @Test
    fun `the chronometer base is the instant the call connected`() = runTest {
        val state = MutableStateFlow(ui(CallStatus.CONNECTING))
        attach(state)
        state.value = ui(CallStatus.CONNECTED)
        runCurrent()
        advanceTimeBy(CallOngoingController.DEBOUNCE_MS + 1)
        now = 99_000L
        state.value = ui(CallStatus.RECONNECTING)
        advanceTimeBy(CallOngoingController.DEBOUNCE_MS + 1)
        assertThat(holder.snapshot.value?.connectedSinceEpochMs).isEqualTo(10_000L)
        controller.detach()
    }

    @Test
    fun `updates are debounced by 250 ms and only the last one lands`() = runTest {
        val state = MutableStateFlow(ui(CallStatus.CONNECTED))
        attach(state)
        state.value = ui(CallStatus.CONNECTED, muted = true)
        runCurrent()
        assertThat(holder.snapshot.value?.isMuted).isFalse()
        state.value = ui(CallStatus.CONNECTED, muted = false, caption = null)
        state.value = ui(CallStatus.CONNECTED, muted = true)
        advanceTimeBy(CallOngoingController.DEBOUNCE_MS - 1)
        assertThat(holder.snapshot.value?.isMuted).isFalse()
        advanceTimeBy(2)
        assertThat(holder.snapshot.value?.isMuted).isTrue()
        controller.detach()
    }

    @Test
    fun `the end of the call publishes the final state at once`() = runTest {
        val state = MutableStateFlow(ui(CallStatus.CONNECTED))
        attach(state)
        state.value = ui(CallStatus.ENDED)
        runCurrent()
        assertThat(phase()).isEqualTo(CallActivityPhase.Ended)
        assertThat(launcher.stops).isEqualTo(0)
        controller.detach()
    }

    @Test
    fun `captions of a call with unknown encryption never reach the notification`() = runTest {
        val state = MutableStateFlow(ui(CallStatus.CONNECTED, caption = "bonjour"))
        attach(state)
        assertThat(holder.snapshot.value?.caption).isNull()
        controller.detach()
    }

    @Test
    fun `the notification buttons reach the call and detach stops the service`() = runTest {
        val state = MutableStateFlow(ui(CallStatus.CONNECTED))
        attach(state)
        holder.hangUp()
        holder.toggleMute()
        assertThat(hangUps).isEqualTo(1)
        assertThat(mutes).isEqualTo(1)
        controller.detach()
        assertThat(holder.snapshot.value).isNull()
        assertThat(launcher.stops).isEqualTo(1)
        holder.hangUp()
        assertThat(hangUps).isEqualTo(1)
    }
}
