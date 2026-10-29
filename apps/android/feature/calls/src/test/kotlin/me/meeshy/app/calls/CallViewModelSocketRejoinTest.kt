package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import io.mockk.verifyOrder
import kotlinx.coroutines.CompletableDeferred
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
import me.meeshy.sdk.model.call.CallQualitySample
import me.meeshy.sdk.model.call.CallSignalingRejoinLaw
import me.meeshy.sdk.model.call.CallSound
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.AppStatePresenceReporter
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #13765 — the return of the signalling socket during a call, as the [CallViewModel] sequences it (iOS
 * `CallSignalingRouter.observeSocketReconnect`): `call:join` WITH its ACK, then my camera and my microphone said
 * again, then the fresh TURN set of the ACK handed to the engine. The first connection is not a return.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallViewModelSocketRejoinTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val signalManager: CallSignalManager = mockk(relaxed = true)
    private val coordinator: WebRtcCallCoordinator = mockk(relaxed = true)
    private val sessionRepository: SessionRepository = mockk(relaxed = true)
    private val socket = MutableStateFlow(true)
    private val endedCalls = MutableSharedFlow<me.meeshy.sdk.model.call.CallEndedSignal>()
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
    private val turn = listOf(SocketIceServer(urls = listOf("turn:relay"), username = "u", credential = "p"))
    private val outgoingVideo =
        CallConfig(peerId = "callee", peerName = "Alice", isVideo = true, isOutgoing = true, conversationId = "conv-1")
    private val incomingAudio =
        CallConfig(peerId = "caller", peerName = "Bob", isVideo = false, isOutgoing = false, callId = "call-9")

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { signalManager.events } returns MutableSharedFlow()
        every { signalManager.incomingOffers } returns MutableSharedFlow()
        every { signalManager.endedCalls } returns endedCalls
        every { signalManager.iceServersRefreshed } returns MutableSharedFlow<List<SocketIceServer>>()
        every { signalManager.qualityAlerts } returns MutableSharedFlow()
        every { signalManager.screenCaptureAlerts } returns MutableSharedFlow()
        every { signalManager.translatedSegments } returns MutableSharedFlow()
        every { signalManager.mediaToggles } returns MutableSharedFlow()
        every { signalManager.participantArrivals } returns MutableSharedFlow()
        every { signalManager.participantLeft } returns MutableSharedFlow()
        every { signalManager.socketConnected } returns socket
        every { sessionRepository.currentUser } returns MutableStateFlow(mockk { every { id } returns "me" })
        coEvery { signalManager.emitInitiate(any(), any()) } returns
            CallInitiateResult.Success(CallInitiateAck(callId = "call-1", iceServers = turn))
        coEvery { signalManager.emitJoinAwaitingAck(any()) } returns CallJoinResult.Success(turn)
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
        CallAnalyticsController(signalManager, clock),
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
    )

    private fun socketDropsAndReturns() {
        socket.value = false
        socket.value = true
    }

    private fun connectedOutgoingVideo(): CallViewModel = vm().apply {
        start(outgoingVideo)
        onSignal(CallEvent.ParticipantJoined())
        onSignal(CallEvent.RemoteAnswer)
        onSignal(CallEvent.MediaConnected)
    }

    @Test
    fun `the socket's return rejoins the room with the ACK, says my camera and my microphone, then takes the fresh TURN`() {
        val vm = connectedOutgoingVideo()
        vm.toggleMute()

        socketDropsAndReturns()

        verifyOrder {
            signalManager.emitToggleVideo("call-1", enabled = true)
            signalManager.emitToggleAudio("call-1", enabled = false)
            coordinator.updateIceServers(turn)
        }
        coVerify(exactly = 1) { signalManager.emitJoinAwaitingAck("call-1") }
        verify(exactly = 0) { signalManager.emitRequestIceServers(any()) }
    }

    @Test
    fun `nothing is said before the gateway confirmed the room`() {
        val ack = CompletableDeferred<CallJoinResult>()
        coEvery { signalManager.emitJoinAwaitingAck(any()) } coAnswers { ack.await() }
        connectedOutgoingVideo()

        socketDropsAndReturns()
        verify(exactly = 0) { signalManager.emitToggleAudio(any(), any()) }

        ack.complete(CallJoinResult.Success(emptyList()))
        verify(exactly = 1) { signalManager.emitToggleAudio("call-1", enabled = true) }
    }

    @Test
    fun `the first connection, a ringing callee and an idle screen never rejoin`() {
        val vm = vm()
        socket.value = true
        socketDropsAndReturns()

        vm.start(incomingAudio)
        socketDropsAndReturns()

        coVerify(exactly = 0) { signalManager.emitJoinAwaitingAck(any()) }
        verify(exactly = 0) { signalManager.emitToggleAudio(any(), any()) }
    }

    @Test
    fun `a call the gateway ended while the socket was down settles, keeping « Réessayer » for a lost connection`() {
        coEvery { signalManager.emitJoinAwaitingAck(any()) } returns CallJoinResult.Failure(
            "cet appel est terminé", code = CallSignalingRejoinLaw.CALL_ENDED, endReason = "connectionLost",
        )
        val vm = connectedOutgoingVideo()

        socketDropsAndReturns()

        assertThat(vm.state.value.status).isEqualTo(CallStatus.ENDED)
        assertThat(vm.state.value.endReason).isInstanceOf(CallEndReason.Failed::class.java)
        verify(exactly = 1) { coordinator.end() }
        verify(exactly = 0) { signalManager.emitToggleAudio(any(), any()) }
    }
}
