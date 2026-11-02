package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
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
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.call.CallCue
import me.meeshy.sdk.model.call.CallEndedSignal
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallInitiateAck
import me.meeshy.sdk.model.call.CallInitiateResult
import me.meeshy.sdk.model.call.CallJoinResult
import me.meeshy.sdk.model.call.CallQualitySample
import me.meeshy.sdk.model.call.CallSound
import me.meeshy.sdk.model.call.IceServersRefreshedPayload
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.model.call.group.GroupCallTitle
import me.meeshy.sdk.model.ongoing.CallActivityLaw
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.AppStatePresenceReporter
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Ce que le [CallViewModel] sert d'un appel de groupe et d'un long appel :
 * - #13768 — le principal parti, le nom servi (en-tête, pilule, notification d'appel en cours) suit le titre du
 *   groupe, comme iOS `groupCallTitleDidChange` réécrit `remoteUsername` ;
 * - #13773 — les identifiants TURN se renouvellent : l'échéance s'arme sur le TTL de l'ACK, le jeu reçu est posé
 *   par `setConfiguration` puis relance ICE sur un appel établi, et le retour du socket réarme l'échéance.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallViewModelGroupTitleAndTurnTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val signalManager: CallSignalManager = mockk(relaxed = true)
    private val coordinator: WebRtcCallCoordinator = mockk(relaxed = true)
    private val sessionRepository: SessionRepository = mockk(relaxed = true)
    private val socket = MutableStateFlow(true)
    private val refreshes = MutableSharedFlow<IceServersRefreshedPayload>(extraBufferCapacity = 8)
    private val mesh = MutableStateFlow(GroupCallMeshUi())
    private val timer = ManualTurnTimer()
    private val holder = ActiveCallSnapshotHolder()
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
    private val wording = object : CallOngoingWording {
        override fun current() = CallActivityLaw.Wording("Ringing", "Connecting", "Audio", "Video", "Hold", "Reconnecting", "Ended")
    }
    private val launcher = object : CallServiceLauncher {
        override fun start() = Unit
        override fun stop() = Unit
    }
    private val turn = listOf(SocketIceServer(urls = listOf("turn:relay"), username = "u", credential = "p"))
    private val fresh = listOf(SocketIceServer(urls = listOf("turn:relay"), username = "u2", credential = "p2"))
    private val outgoing =
        CallConfig(peerId = "ada", peerName = "Ada", isVideo = false, isOutgoing = true, conversationId = "conv-1")

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { signalManager.events } returns MutableSharedFlow()
        every { signalManager.incomingOffers } returns MutableSharedFlow()
        every { signalManager.endedCalls } returns MutableSharedFlow<CallEndedSignal>()
        every { signalManager.iceServersRefreshed } returns refreshes
        every { signalManager.qualityAlerts } returns MutableSharedFlow()
        every { signalManager.screenCaptureAlerts } returns MutableSharedFlow()
        every { signalManager.translatedSegments } returns MutableSharedFlow()
        every { signalManager.mediaToggles } returns MutableSharedFlow()
        every { signalManager.participantArrivals } returns MutableSharedFlow()
        every { signalManager.participantLeft } returns MutableSharedFlow()
        every { signalManager.socketConnected } returns socket
        every { coordinator.groupMesh } returns mesh
        every { sessionRepository.currentUser } returns MutableStateFlow(mockk { every { id } returns "me" })
        coEvery { signalManager.emitInitiate(any(), any()) } returns
            CallInitiateResult.Success(CallInitiateAck(callId = "call-1", iceServers = turn, ttlSeconds = 3_600))
        coEvery { signalManager.emitJoinAwaitingAck(any()) } returns CallJoinResult.Success(fresh)
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
        CallOngoingController(holder, CallServiceController(launcher), wording, clock),
        CallPeerVisualSource { emptyFlow() },
        recordingCallPreview(),
        CallTurnCredentialsController(signalManager, timer),
        testGroupTitleWording,
    )

    private fun connected(): CallViewModel = vm().apply {
        start(outgoing)
        onSignal(CallEvent.ParticipantJoined())
        onSignal(CallEvent.RemoteAnswer)
        onSignal(CallEvent.MediaConnected)
    }

    @Test
    fun `once the primary leaves, the ongoing-call notification takes the group's name, as the header does`() = runTest(dispatcher) {
        val vm = connected()
        advanceTimeBy(CallOngoingController.DEBOUNCE_MS + 1)
        assertThat(holder.snapshot.value?.title).isEqualTo("Ada")

        mesh.value = GroupCallMeshUi(isPrimaryVacated = true, title = GroupCallTitle.Members(listOf("Bruno", ""), more = 2))
        advanceTimeBy(CallOngoingController.DEBOUNCE_MS + 1)

        assertThat(vm.state.value.peerName).isEqualTo("Bruno, Participant +2")
        assertThat(holder.snapshot.value?.title).isEqualTo("Bruno, Participant +2")

        mesh.value = GroupCallMeshUi()
        assertThat(vm.state.value.peerName).isEqualTo("Bruno, Participant +2")
    }

    @Test
    fun `the next call keeps its own name`() {
        val vm = connected()
        mesh.value = GroupCallMeshUi(isPrimaryVacated = true, title = GroupCallTitle.Group("Famille"))
        assertThat(vm.state.value.peerName).isEqualTo("Famille")

        vm.hangUp()
        vm.dismiss()
        mesh.value = GroupCallMeshUi()
        vm.start(outgoing.copy(peerName = "Chloé"))

        assertThat(vm.state.value.peerName).isEqualTo("Chloé")
    }

    @Test
    fun `the initiate ACK's lifetime arms the refresh, and the call's end disarms it`() {
        val vm = connected()
        assertThat(timer.live).containsExactly(2_880_000L)

        timer.fire(2_880_000L)
        verify(exactly = 1) { signalManager.emitRequestIceServers("call-1") }

        vm.hangUp()
        assertThat(timer.live).isEmpty()
    }

    @Test
    fun `a fresh set is applied to the live call, restarts ICE discreetly and re-arms on its lifetime`() {
        connected()
        refreshes.tryEmit(IceServersRefreshedPayload(callId = "call-1", iceServers = fresh, ttl = 600))

        verify(exactly = 1) { coordinator.updateIceServers(fresh) }
        verify(exactly = 1) { coordinator.restartIceOnFreshCredentials() }
        assertThat(timer.live).containsExactly(480_000L)
    }

    @Test
    fun `a set for another call is not this call's`() {
        connected()
        refreshes.tryEmit(IceServersRefreshedPayload(callId = "call-other", iceServers = fresh, ttl = 600))

        verify(exactly = 0) { coordinator.updateIceServers(any()) }
        verify(exactly = 0) { coordinator.restartIceOnFreshCredentials() }
        assertThat(timer.live).containsExactly(2_880_000L)
    }

    @Test
    fun `the socket's return re-arms the refresh on the join ACK's fresh set`() {
        connected()
        socket.value = false
        socket.value = true

        verify(exactly = 1) { coordinator.updateIceServers(fresh) }
        assertThat(timer.live).containsExactly(69_120_000L)
        verify(exactly = 0) { signalManager.emitRequestIceServers(any()) }
    }
}
