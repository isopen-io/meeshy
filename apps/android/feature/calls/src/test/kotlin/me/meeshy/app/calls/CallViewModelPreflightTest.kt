package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.call.CallCue
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallInitiateAck
import me.meeshy.sdk.model.call.CallInitiateResult
import me.meeshy.sdk.model.call.CallJoinResult
import me.meeshy.sdk.model.call.CallPreflightDecision
import me.meeshy.sdk.model.call.CallQualitySample
import me.meeshy.sdk.model.call.CallSound
import me.meeshy.sdk.model.call.CallVideoFallback
import me.meeshy.sdk.model.call.IceServersRefreshedPayload
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.AppStatePresenceReporter
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Le départ d'un appel vu du [CallViewModel] : permissions, appel déjà en cours, état résiduel, sonnerie sans réponse, « Réessayer ». */
@OptIn(ExperimentalCoroutinesApi::class)
class CallViewModelPreflightTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val signalManager: CallSignalManager = mockk(relaxed = true)
    private val coordinator: WebRtcCallCoordinator = mockk(relaxed = true)
    private val sessionRepository: SessionRepository = mockk(relaxed = true)
    private val appStatePresence: AppStatePresenceReporter = mockk {
        every { foreground } returns MutableStateFlow<Boolean?>(null)
    }
    private val silentTimer = object : CallWaitingTimer, CallQualityResetTimer, CallReconnectBudget, CallConnectingWatchdog {
        override fun countdown(): Flow<Unit> = emptyFlow()
    }
    private val clock = object : CallClock {
        override fun nowMs(): Long = 0L
    }
    private val tones = object : CallToneController {
        override fun setLoop(sound: CallSound) = Unit
        override fun playCue(cue: CallCue) = Unit
        override fun release() = Unit
    }

    private class RecordingPreflightAnnouncer : CallPreflightAnnouncer {
        var busy = 0
        var microphoneDenied = 0
        override fun busy() { busy += 1 }
        override fun microphoneDenied() { microphoneDenied += 1 }
    }

    private val announcer = RecordingPreflightAnnouncer()
    private val fallbacks = mutableListOf<CallVideoFallback>()
    private val fallbackAnnouncer = object : CallVideoFallbackAnnouncer {
        override fun announce(fallback: CallVideoFallback) { fallbacks += fallback }
    }

    private val outgoing = CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = true, conversationId = "conv-1")
    private val otherOutgoing = CallConfig(peerId = "u2", peerName = "Bob", isVideo = false, isOutgoing = true, conversationId = "conv-2")
    private val incoming = CallConfig(peerId = "u3", peerName = "Carol", isVideo = false, isOutgoing = false, callId = "call-9")
    private val incomingVideo = incoming.copy(isVideo = true)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { signalManager.events } returns MutableSharedFlow()
        every { signalManager.incomingOffers } returns MutableSharedFlow()
        every { signalManager.endedCalls } returns MutableSharedFlow()
        every { signalManager.iceServersRefreshed } returns MutableSharedFlow<IceServersRefreshedPayload>()
        every { signalManager.callErrors } returns MutableSharedFlow<me.meeshy.sdk.model.call.CallErrorSignal>()
        every { signalManager.qualityAlerts } returns MutableSharedFlow()
        every { signalManager.screenCaptureAlerts } returns MutableSharedFlow()
        every { signalManager.translatedSegments } returns MutableSharedFlow()
        every { signalManager.mediaToggles } returns MutableSharedFlow()
        every { signalManager.participantArrivals } returns MutableSharedFlow()
        every { signalManager.participantLeft } returns MutableSharedFlow()
        every { signalManager.socketConnected } returns MutableStateFlow(true)
        every { sessionRepository.currentUser } returns MutableStateFlow(mockk { every { id } returns "me" })
        coEvery { signalManager.emitInitiate(any(), any()) } returns CallInitiateResult.Success(CallInitiateAck(callId = "call-1"))
        coEvery { signalManager.emitJoinAwaitingAck(any()) } returns CallJoinResult.Success(emptyList())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun vm() = CallViewModel(
        signalManager, coordinator, sessionRepository,
        object : CallSecondsTicker { override val seconds: Flow<Unit> = emptyFlow() },
        tones,
        object : TelecomCallReporter {
            override fun report(update: TelecomConnectionUpdate) = Unit
            override fun release() = Unit
        },
        object : CallQualitySampler { override val samples: Flow<CallQualitySample> = emptyFlow() },
        appStatePresence,
        CallPeerIndicatorsController(signalManager, silentTimer, object : ScreenRecordingDetector {
            override val states: Flow<Boolean> = emptyFlow()
        }),
        CallWaitingController(signalManager, silentTimer, mockk(relaxed = true)),
        CallWatchdogsController(signalManager, object : CallHeartbeatTicker { override val beats: Flow<Unit> = emptyFlow() }, silentTimer, silentTimer),
        CallAnalyticsController(signalManager, clock, InMemoryCallQualitySummaryStore(), silentAnalyticsSnapshots),
        CallExtensionPoints(
            controllers = CallFeatureControllerRegistry(emptySet()),
            overlays = CallOverlayRegistry(emptySet()),
            actions = CallActionDispatcher(emptyMap()),
            toasts = CallToastBus(clock),
            videoHealth = NoopCallVideoHealth(),
        ),
        mockk(relaxed = true),
        CallPeerVisualSource { emptyFlow() },
        recordingCallPreview(),
        silentTurnCredentials(signalManager),
        testGroupTitleWording,
        CallEndReconciler(signalManager),
        CallTeardownController(emptySet()),
        videoFallbackAnnouncer = fallbackAnnouncer,
        preflightAnnouncer = announcer,
        ringGuard = CallRingGuardController(signalManager),
    )

    @Test
    fun `dialling during a live call says so and leaves the call alone`() {
        val vm = vm()
        vm.start(outgoing)

        vm.start(otherOutgoing)

        assertThat(announcer.busy).isEqualTo(1)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.OUTGOING_RINGING)
        coVerify(exactly = 1) { signalManager.emitInitiate(any(), any()) }
    }

    @Test
    fun `replaying the same request is inert and silent`() {
        val vm = vm()
        vm.start(outgoing)

        vm.start(outgoing)

        assertThat(announcer.busy).isEqualTo(0)
        coVerify(exactly = 1) { signalManager.emitInitiate(any(), any()) }
    }

    @Test
    fun `a new call during the settle window resets the residual ended state`() {
        val vm = vm()
        vm.start(outgoing)
        vm.onSignal(CallEvent.RemoteHangUp)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.ENDED)

        vm.start(otherOutgoing)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.OUTGOING_RINGING)
        assertThat(announcer.busy).isEqualTo(0)
        coVerify { signalManager.emitInitiate("conv-2", false) }
    }

    @Test
    fun `a refused microphone sends nothing and says so`() {
        val vm = vm()

        vm.startAfterPreflight(outgoing, CallPreflightDecision.MicrophoneDenied)

        assertThat(announcer.microphoneDenied).isEqualTo(1)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.IDLE)
        coVerify(exactly = 0) { signalManager.emitInitiate(any(), any()) }
    }

    @Test
    fun `a refused camera dials audio and announces the fallback`() {
        val vm = vm()

        vm.startAfterPreflight(
            outgoing,
            CallPreflightDecision.Proceed(isVideo = false, fallback = CallVideoFallback.CameraPermissionDenied),
        )

        coVerify { signalManager.emitInitiate("conv-1", false) }
        assertThat(fallbacks).containsExactly(CallVideoFallback.CameraPermissionDenied)
    }

    @Test
    fun `retry replays the whole outgoing context after a transient failure`() {
        val vm = vm()
        vm.startAfterPreflight(outgoing, CallPreflightDecision.Proceed(isVideo = false))
        vm.onSignal(CallEvent.ConnectionFailed("connect timed out"))

        vm.retry()

        coVerify(exactly = 2) { signalManager.emitInitiate("conv-1", false) }
        assertThat(vm.state.value.status).isEqualTo(CallStatus.OUTGOING_RINGING)
    }

    @Test
    fun `retry never turns a failed incoming call into an outgoing one`() {
        val vm = vm()
        vm.start(incoming)
        vm.onSignal(CallEvent.ConnectionFailed("x"))

        vm.retry()

        coVerify(exactly = 0) { signalManager.emitInitiate(any(), any()) }
    }

    @Test
    fun `an outgoing call nobody answers ends as missed when call ended is lost`() {
        val vm = vm()
        vm.start(outgoing)

        dispatcher.scheduler.advanceTimeBy(45_000)
        dispatcher.scheduler.runCurrent()

        assertThat(vm.state.value.status).isEqualTo(CallStatus.ENDED)
        assertThat(vm.state.value.endReason).isEqualTo(CallEndReason.Missed)
        verify { signalManager.emitEnd("call-1") }
    }

    @Test
    fun `answering a video call without video opens no camera, keeps the video screen and tells the peer`() {
        val vm = vm()
        vm.start(incomingVideo)

        vm.acceptWithoutVideo()

        verify { coordinator.startIncoming(any(), "call-9", any(), "u3", "me", false, any(), any(), any(), any()) }
        verify(exactly = 0) { coordinator.startIncoming(any(), any(), any(), any(), any(), true, any(), any(), any(), any()) }
        verify { signalManager.emitToggleVideo("call-9", enabled = false) }
        assertThat(vm.state.value.isCameraOn).isFalse()
        assertThat(vm.state.value.isVideoCall).isTrue()
    }

    @Test
    fun `answering a video call normally opens the camera`() {
        val vm = vm()
        vm.start(incomingVideo)

        vm.accept()

        verify { coordinator.startIncoming(any(), "call-9", any(), "u3", "me", true, any(), any(), any(), any()) }
        verify(exactly = 0) { signalManager.emitToggleVideo(any(), any()) }
    }

    @Test
    fun `without video on an audio call is a plain answer`() {
        val vm = vm()
        vm.start(incoming)

        vm.acceptWithoutVideo()

        verify { coordinator.startIncoming(any(), "call-9", any(), "u3", "me", false, any(), any(), any(), any()) }
        verify(exactly = 0) { signalManager.emitToggleVideo(any(), any()) }
    }
}
