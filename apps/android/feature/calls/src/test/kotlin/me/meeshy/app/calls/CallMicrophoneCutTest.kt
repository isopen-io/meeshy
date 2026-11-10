package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
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
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.call.CallCue
import me.meeshy.sdk.model.call.CallEndedSignal
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallInitiateAck
import me.meeshy.sdk.model.call.CallInitiateResult
import me.meeshy.sdk.model.call.CallJoinResult
import me.meeshy.sdk.model.call.CallParticipantLeftPayload
import me.meeshy.sdk.model.call.CallQualitySample
import me.meeshy.sdk.model.call.CallSound
import me.meeshy.sdk.model.call.CallTranscriptionActive
import me.meeshy.sdk.model.call.CallTranslatedSegmentPayload
import me.meeshy.sdk.model.call.OwnSpeechReadiness
import me.meeshy.sdk.model.call.OwnSpeechSupport
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.model.ongoing.CallActivityLaw
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.AppStatePresenceReporter
import me.meeshy.sdk.socket.CallSignalManager
import me.meeshy.sdk.socket.CallSocialSignalManager
import me.meeshy.sdk.speech.CallSpeechCapture
import me.meeshy.sdk.speech.CallSpeechEvent
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * P7.2 / #17361 — « micro coupé = ma parole n'est plus transcrite » (#8475), de bout en bout : le geste
 * (`CallViewModel.toggleMute`), la notification « appel en cours » réelle et sa temporisation de 250 ms,
 * le contrôleur de ma parole réel. Aucune horloge n'avance : si la coupure attendait la notification, la
 * capture tournerait encore et des segments partiraient vers le pair et la passerelle.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallMicrophoneCutTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val signalManager: CallSignalManager = mockk(relaxed = true)
    private val coordinator: WebRtcCallCoordinator = mockk(relaxed = true)
    private val sessionRepository: SessionRepository = mockk(relaxed = true)
    private val engine: WebRtcEngine = mockk(relaxed = true)
    private val social: CallSocialSignalManager = mockk(relaxed = true)
    private val ledger: EndToEndRegimeLedger = mockk(relaxed = true)
    private val capture: CallSpeechCapture = mockk()
    private val heard = MutableSharedFlow<CallSpeechEvent>(extraBufferCapacity = 16)
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
    private val listening = MutableSharedFlow<CallTranscriptionActive>(extraBufferCapacity = 8)
    private val outgoing =
        CallConfig(peerId = "ada", peerName = "Ada", isVideo = false, isOutgoing = true, conversationId = "conv-1")

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { signalManager.events } returns MutableSharedFlow()
        every { signalManager.incomingOffers } returns MutableSharedFlow()
        every { signalManager.endedCalls } returns MutableSharedFlow<CallEndedSignal>()
        every { signalManager.iceServersRefreshed } returns MutableSharedFlow()
        every { signalManager.callErrors } returns MutableSharedFlow<me.meeshy.sdk.model.call.CallErrorSignal>()
        every { signalManager.qualityAlerts } returns MutableSharedFlow()
        every { signalManager.screenCaptureAlerts } returns MutableSharedFlow()
        every { signalManager.translatedSegments } returns MutableSharedFlow()
        every { signalManager.mediaToggles } returns MutableSharedFlow()
        every { signalManager.participantArrivals } returns MutableSharedFlow()
        every { signalManager.participantLeft } returns MutableSharedFlow()
        every { signalManager.socketConnected } returns MutableStateFlow(true)
        every { coordinator.groupMesh } returns MutableStateFlow(GroupCallMeshUi())
        every { sessionRepository.currentUser } returns MutableStateFlow<MeeshyUser?>(
            MeeshyUser(id = "me", username = "me", displayName = "Moi", systemLanguage = "fr"),
        )
        val turn = listOf(SocketIceServer(urls = listOf("turn:relay"), username = "u", credential = "p"))
        coEvery { signalManager.emitInitiate(any(), any()) } returns
            CallInitiateResult.Success(CallInitiateAck(callId = "call-1", iceServers = turn, ttlSeconds = 3_600))
        coEvery { signalManager.emitJoinAwaitingAck(any()) } returns CallJoinResult.Success(turn)
        coEvery { capture.readiness(any()) } returns OwnSpeechReadiness(OwnSpeechSupport.Available, "fr-FR")
        every { capture.capture(any()) } returns heard
        every { engine.sendDataChannelMessage(any()) } returns true
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun captions() = CallCaptionsController(
        wires = CallCaptionsWires(
            relayed = MutableSharedFlow<CallTranslatedSegmentPayload>(),
            dataChannel = MutableSharedFlow(),
            listeningPeers = listening,
            participantsLeft = MutableSharedFlow<CallParticipantLeftPayload>(),
        ) { _, _ -> },
        session = sessionRepository,
        regime = CallConversationRegime { false },
        notice = CallCaptionsRefusalNotice { },
        clock = { 5_000L },
        scope = CoroutineScope(dispatcher),
    )

    private fun vm(captions: CallCaptionsController): CallViewModel {
        val own = CallOwnSpeechController(holder, capture, engine, social, ledger, captions, sessionRepository)
        return CallViewModel(
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
                controllers = CallFeatureControllerRegistry(setOf<CallFeatureController>(captions, own)),
                overlays = CallOverlayRegistry(emptySet()),
                actions = CallActionDispatcher(emptyMap()),
                toasts = CallToastBus(clock),
                videoHealth = NoopCallVideoHealth(),
            ),
            CallOngoingController(holder, CallServiceController(launcher), wording, clock),
            CallPeerVisualSource { emptyFlow() },
            recordingCallPreview(),
            silentTurnCredentials(signalManager),
            testGroupTitleWording,
            CallEndReconciler(signalManager),
            CallTeardownController(emptySet()),
        )
    }

    private val isCapturing: Boolean get() = heard.subscriptionCount.value > 0

    private fun connected(captions: CallCaptionsController): CallViewModel = vm(captions).apply {
        start(outgoing)
        onSignal(CallEvent.ParticipantJoined())
        onSignal(CallEvent.RemoteAnswer)
        onSignal(CallEvent.MediaConnected)
    }

    @Test
    fun `muting the microphone stops the capture in the same turn, without waiting for the 250 ms notification debounce`() = runTest(dispatcher) {
        val captions = captions()
        val vm = connected(captions)
        captions.advance()
        assertThat(isCapturing).isTrue()

        vm.toggleMute()

        assertThat(isCapturing).isFalse()
    }

    @Test
    fun `no segment reaches the peer or the gateway once the microphone is muted`() = runTest(dispatcher) {
        val captions = captions()
        val vm = connected(captions)
        captions.advance()
        heard.tryEmit(CallSpeechEvent.Partial("Bon"))
        verify(exactly = 1) { engine.sendDataChannelMessage(any()) }

        vm.toggleMute()
        heard.tryEmit(CallSpeechEvent.Partial("Bonjour"))
        heard.tryEmit(CallSpeechEvent.Final("Bonjour à tous", 0.9))

        verify(exactly = 1) { engine.sendDataChannelMessage(any()) }
        verify(exactly = 0) { social.emitTranscriptionSegment(any(), any()) }
        assertThat(captions.state.value.journal.segments).isEmpty()
    }

    @Test
    fun `unmuting resumes the capture and the next words are sent again`() = runTest(dispatcher) {
        val captions = captions()
        val vm = connected(captions)
        captions.advance()
        vm.toggleMute()
        assertThat(isCapturing).isFalse()

        vm.toggleMute()
        assertThat(isCapturing).isTrue()
        heard.tryEmit(CallSpeechEvent.Partial("Re"))

        verify(exactly = 1) { engine.sendDataChannelMessage(any()) }
    }

    @Test
    fun `the notification still shows the muted state after its debounce`() = runTest(dispatcher) {
        val captions = captions()
        val vm = connected(captions)
        advanceTimeBy(CallOngoingController.DEBOUNCE_MS + 1)

        vm.toggleMute()
        advanceTimeBy(CallOngoingController.DEBOUNCE_MS + 1)

        assertThat(holder.snapshot.value?.isMuted).isTrue()
    }
}
