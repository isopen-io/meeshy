package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.call.CallCue
import me.meeshy.sdk.model.call.CallEndedSignal
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallInitiateAck
import me.meeshy.sdk.model.call.CallInitiateResult
import me.meeshy.sdk.model.call.CallJoinResult
import me.meeshy.sdk.model.call.CallQualitySample
import me.meeshy.sdk.model.call.CallSound
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.AppStatePresenceReporter
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * The extension points as the [CallViewModel] drives them: a controller registered
 * in the registry is told of every genuine transition and every remote event of a
 * real call, and the video-health seam reaches the screen state. The core call is
 * proven by [CallViewModelTest]; this is only the seam.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallExtensionPointsWiringTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val events = MutableSharedFlow<CallEvent>(extraBufferCapacity = 16)
    private val endedCalls = MutableSharedFlow<CallEndedSignal>(extraBufferCapacity = 16)
    private val signalManager: CallSignalManager = mockk(relaxed = true)
    private val coordinator: WebRtcCallCoordinator = mockk(relaxed = true)
    private val sessionRepository: SessionRepository = mockk(relaxed = true)
    private val appStatePresence: AppStatePresenceReporter = mockk {
        every { foreground } returns MutableStateFlow<Boolean?>(null)
    }

    private val clock = object : CallClock {
        override fun nowMs(): Long = 0L
    }
    private val silentTimer = object : CallWaitingTimer, CallQualityResetTimer, CallReconnectBudget, CallConnectingWatchdog {
        override fun countdown(): Flow<Unit> = emptyFlow()
    }
    private val silentSeconds = object : CallSecondsTicker {
        override val seconds: Flow<Unit> = emptyFlow()
    }
    private val silentBeats = object : CallHeartbeatTicker {
        override val beats: Flow<Unit> = emptyFlow()
    }
    private val silentSamples = object : CallQualitySampler {
        override val samples: Flow<CallQualitySample> = emptyFlow()
    }
    private val silentRecording = object : ScreenRecordingDetector {
        override val states: Flow<Boolean> = emptyFlow()
    }
    private val silentTones = object : CallToneController {
        override fun setLoop(sound: CallSound) = Unit
        override fun playCue(cue: CallCue) = Unit
        override fun release() = Unit
    }
    private val silentTelecom = object : TelecomCallReporter {
        override fun report(update: TelecomConnectionUpdate) = Unit
        override fun release() = Unit
    }

    private class MutableVideoHealth : CallVideoHealth {
        private val paused = MutableStateFlow(false)
        override val isVideoAutoPaused: StateFlow<Boolean> = paused
        fun pause(value: Boolean) {
            paused.value = value
        }
    }

    private class RecordingController : CallFeatureController {
        val transitions = mutableListOf<Triple<CallState, CallState, String>>()
        val remoteEvents = mutableListOf<CallEvent>()
        var cleared = 0

        override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
            transitions += Triple(previous, next, session.callId)
        }

        override fun onRemoteEvent(event: CallEvent, session: CallSessionInfo) {
            remoteEvents += event
        }

        override fun onCleared() {
            cleared += 1
        }
    }

    private val incomingAudio =
        CallConfig(peerId = "u2", peerName = "Bob", isVideo = false, isOutgoing = false, callId = "call-9")
    private val outgoingVideo =
        CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = true, conversationId = "conv-1")

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { signalManager.events } returns events
        every { signalManager.incomingOffers } returns MutableSharedFlow()
        every { signalManager.endedCalls } returns endedCalls
        every { signalManager.iceServersRefreshed } returns MutableSharedFlow<List<SocketIceServer>>()
        every { signalManager.qualityAlerts } returns MutableSharedFlow()
        every { signalManager.screenCaptureAlerts } returns MutableSharedFlow()
        every { signalManager.translatedSegments } returns MutableSharedFlow()
        every { signalManager.mediaToggles } returns MutableSharedFlow()
        every { sessionRepository.currentUser } returns MutableStateFlow(null)
        coEvery { signalManager.emitInitiate(any(), any()) } returns
            CallInitiateResult.Success(CallInitiateAck(callId = "call-1"))
        coEvery { signalManager.emitJoinAwaitingAck(any()) } returns CallJoinResult.Success(emptyList())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun vm(
        controller: CallFeatureController? = null,
        videoHealth: CallVideoHealth = NoopCallVideoHealth(),
    ) = CallViewModel(
        signalManager, coordinator, sessionRepository, silentSeconds, silentTones, silentTelecom, silentSamples,
        appStatePresence,
        CallPeerIndicatorsController(signalManager, silentTimer, silentRecording),
        CallWaitingController(signalManager, silentTimer),
        CallWatchdogsController(signalManager, silentBeats, silentTimer, silentTimer),
        CallAnalyticsController(signalManager, clock),
        CallExtensionPoints(
            controllers = CallFeatureControllerRegistry(setOfNotNull(controller)),
            overlays = CallOverlayRegistry(emptySet()),
            actions = CallActionDispatcher(emptyMap()),
            toasts = CallToastBus(clock),
            videoHealth = videoHealth,
        ),
        io.mockk.mockk(relaxed = true),
    )

    @Test
    fun `a registered controller receives every transition of the call, with the call id`() {
        val controller = RecordingController()
        val vm = vm(controller)

        vm.start(incomingAudio)
        vm.accept()

        assertThat(controller.transitions).containsExactly(
            Triple(CallState.Idle, CallState.Ringing(isOutgoing = false), "call-9"),
            Triple(CallState.Ringing(isOutgoing = false), CallState.Connecting, "call-9"),
        ).inOrder()
    }

    @Test
    fun `an event that changes nothing is not a transition`() {
        val controller = RecordingController()
        val vm = vm(controller)
        vm.start(incomingAudio)
        controller.transitions.clear()

        vm.onSignal(CallEvent.MediaConnected)

        assertThat(controller.transitions).isEmpty()
    }

    @Test
    fun `a registered controller receives every remote event before it is folded into the FSM`() {
        val controller = RecordingController()
        val vm = vm(controller)
        vm.start(outgoingVideo)

        events.tryEmit(CallEvent.ParticipantJoined("u1"))
        events.tryEmit(CallEvent.RemoteAnswer)

        assertThat(controller.remoteEvents).containsExactly(CallEvent.ParticipantJoined("u1"), CallEvent.RemoteAnswer)
            .inOrder()
        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTING)
    }

    @Test
    fun `the teardown of the active call reaches the controllers as a remote event`() {
        val controller = RecordingController()
        val vm = vm(controller)
        vm.start(incomingAudio)

        endedCalls.tryEmit(CallEndedSignal(callId = "call-9", event = CallEvent.RemoteHangUp))

        assertThat(controller.remoteEvents).containsExactly(CallEvent.RemoteHangUp)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.ENDED)
    }

    @Test
    fun `the teardown of another call is not news to the controllers`() {
        val controller = RecordingController()
        val vm = vm(controller)
        vm.start(incomingAudio)

        endedCalls.tryEmit(CallEndedSignal(callId = "call-other", event = CallEvent.RemoteHangUp))

        assertThat(controller.remoteEvents).isEmpty()
        assertThat(vm.state.value.status).isEqualTo(CallStatus.INCOMING)
    }

    @Test
    fun `a controller that throws never disturbs the call`() {
        val broken = object : CallFeatureController {
            override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) =
                error("boom")

            override fun onRemoteEvent(event: CallEvent, session: CallSessionInfo) = error("boom")
        }
        val vm = vm(broken)

        vm.start(outgoingVideo)
        events.tryEmit(CallEvent.ParticipantJoined("u1"))

        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTING)
    }

    @Test
    fun `no controller registered is the plain call`() {
        val vm = vm(controller = null)

        vm.start(incomingAudio)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.INCOMING)
    }

    @Test
    fun `the video health seam reaches the screen state on a connected video call`() {
        val health = MutableVideoHealth()
        val vm = vm(videoHealth = health)
        vm.start(outgoingVideo)
        vm.onSignal(CallEvent.ParticipantJoined("u1"))
        vm.onSignal(CallEvent.RemoteAnswer)
        vm.onSignal(CallEvent.MediaConnected)
        assertThat(vm.state.value.isVideoAutoPaused).isFalse()

        health.pause(true)
        assertThat(vm.state.value.isVideoAutoPaused).isTrue()

        health.pause(false)
        assertThat(vm.state.value.isVideoAutoPaused).isFalse()
    }

    @Test
    fun `video paused by the app is not shown before the media flows nor on an audio call`() {
        val health = MutableVideoHealth()
        val vm = vm(videoHealth = health)
        health.pause(true)

        vm.start(outgoingVideo)
        assertThat(vm.state.value.isVideoAutoPaused).isFalse()

        val audioVm = vm(videoHealth = health)
        audioVm.start(incomingAudio)
        audioVm.accept()
        audioVm.onSignal(CallEvent.MediaConnected)
        assertThat(audioVm.state.value.status).isEqualTo(CallStatus.CONNECTED)
        assertThat(audioVm.state.value.isVideoAutoPaused).isFalse()
    }

    @Test
    fun `the default video health is never paused`() {
        assertThat(NoopCallVideoHealth().isVideoAutoPaused.value).isFalse()
    }
}
