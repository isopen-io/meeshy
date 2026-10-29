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
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.call.CallCue
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallInitiateAck
import me.meeshy.sdk.model.call.CallInitiateResult
import me.meeshy.sdk.model.call.CallJoinResult
import me.meeshy.sdk.model.call.CallPreviewRequested
import me.meeshy.sdk.model.call.CallQualitySample
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.CallSignalPayload
import me.meeshy.sdk.model.call.CallSound
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.AppStatePresenceReporter
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.webrtc.VideoTrack

/**
 * L'aperçu avant décroché tel que le [CallViewModel] le séquence : la sonnerie entrante le demande,
 * « Activer l'audio » fait taire la sonnerie et ouvre la route, le décroché le tient jusqu'à la
 * connexion du vrai lien, le refus le ferme ; l'appelant répond avec les relais de son ACK.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallViewModelPreviewTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val signalManager: CallSignalManager = mockk(relaxed = true)
    private val coordinator: WebRtcCallCoordinator = mockk(relaxed = true)
    private val sessionRepository: SessionRepository = mockk(relaxed = true)
    private val appStatePresence: AppStatePresenceReporter = mockk {
        every { foreground } returns MutableStateFlow<Boolean?>(null)
    }
    private val links = RecordingPreviewLinks()
    private val signaling = RecordingPreviewSignaling()

    private val silentTimer = object : CallWaitingTimer, CallQualityResetTimer, CallReconnectBudget, CallConnectingWatchdog {
        override fun countdown(): Flow<Unit> = emptyFlow()
    }
    private val clock = object : CallClock {
        override fun nowMs(): Long = 0L
    }

    private class RecordingTones : CallToneController {
        val loops = mutableListOf<CallSound>()
        override fun setLoop(sound: CallSound) { loops += sound }
        override fun playCue(cue: CallCue) = Unit
        override fun release() = Unit
    }

    private val tones = RecordingTones()

    private val incomingVideo =
        CallConfig(peerId = "caller", peerName = "Bob", isVideo = true, isOutgoing = false, callId = "call-9")
    private val outgoingVideo =
        CallConfig(peerId = "callee", peerName = "Alice", isVideo = true, isOutgoing = true, conversationId = "conv-1")
    private val turn = listOf(SocketIceServer(urls = listOf("turn:relay"), username = "u", credential = "p"))

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { signalManager.events } returns MutableSharedFlow()
        every { signalManager.incomingOffers } returns MutableSharedFlow()
        every { signalManager.endedCalls } returns MutableSharedFlow()
        every { signalManager.iceServersRefreshed } returns MutableSharedFlow<List<SocketIceServer>>()
        every { signalManager.qualityAlerts } returns MutableSharedFlow()
        every { signalManager.screenCaptureAlerts } returns MutableSharedFlow()
        every { signalManager.translatedSegments } returns MutableSharedFlow()
        every { signalManager.mediaToggles } returns MutableSharedFlow()
        every { sessionRepository.currentUser } returns MutableStateFlow(mockk { every { id } returns "me" })
        coEvery { signalManager.emitInitiate(any(), any()) } returns
            CallInitiateResult.Success(CallInitiateAck(callId = "call-1", iceServers = turn))
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
        recordingCallPreview(links, signaling),
    )

    private fun offer() = CallSignalEnvelope("call-9", CallSignalPayload(type = "offer", sdp = "v=0", from = "caller", to = "me", negotiationId = 1))

    private fun ringingWithAudiblePreview(): CallViewModel {
        val vm = vm()
        vm.start(incomingVideo)
        signaling.signals.tryEmit(offer())
        links.last.onEvent(CallPreviewLinkEvent.Connection(connected = true))
        vm.togglePreviewSound()
        return vm
    }

    @Test
    fun `l'appel entrant qui sonne demande l'apercu et ouvre en reception seule sur l'offre de l'appelant`() {
        val vm = vm()
        vm.start(incomingVideo)

        signaling.signals.tryEmit(offer())

        assertThat(signaling.requests).containsExactly("call-9")
        assertThat(links.last.config.receiveOnly).isTrue()
        assertThat(vm.previewUi.value.offersSound).isTrue()
    }

    @Test
    fun `la video de l'appelant atteint l'ecran entrant`() {
        val vm = vm()
        vm.start(incomingVideo)
        signaling.signals.tryEmit(offer())
        val track = mockk<VideoTrack>(relaxed = true)

        links.last.onEvent(CallPreviewLinkEvent.RemoteVideo(track))

        assertThat(vm.previewUi.value.video).isSameInstanceAs(track)
    }

    @Test
    fun `activer l'audio fait taire la sonnerie et ouvre la route sur le haut-parleur`() {
        val vm = ringingWithAudiblePreview()

        assertThat(vm.previewUi.value.isAudible).isTrue()
        assertThat(tones.loops).containsExactly(CallSound.Ringtone, CallSound.None).inOrder()
        verify(exactly = 1) { coordinator.routePreviewAudio(true, isVideo = true) }
        assertThat(links.last.audible.last()).isTrue()
    }

    @Test
    fun `refuser ferme l'apercu et rend la route audio`() {
        val vm = ringingWithAudiblePreview()

        vm.decline()

        assertThat(links.last.closed).isTrue()
        verify(exactly = 1) { coordinator.routePreviewAudio(false, isVideo = true) }
        assertThat(vm.previewUi.value).isEqualTo(CallPreviewUi())
    }

    @Test
    fun `au decroche l'apercu tient jusqu'a la connexion du vrai lien, puis se ferme sans couper le son de l'appel`() {
        val vm = ringingWithAudiblePreview()

        vm.accept()
        assertThat(links.last.closed).isFalse()

        vm.onSignal(CallEvent.MediaConnected)
        assertThat(links.last.closed).isTrue()
        verify(exactly = 0) { coordinator.routePreviewAudio(false, any()) }
    }

    @Test
    fun `l'appelant repond a la demande de son appel avec les relais de son ACK, camera activee micro coupe`() {
        val vm = vm()
        vm.start(outgoingVideo)

        signaling.requested.tryEmit(CallPreviewRequested("call-1", "callee"))

        val link = links.last
        assertThat(link.config.receiveOnly).isFalse()
        assertThat(link.config.iceServers).isEqualTo(turn)
        assertThat(link.config.sendsVideo).isTrue()
        assertThat(link.config.sendsAudio).isFalse()
        assertThat(link.offers).isEqualTo(1)
        assertThat(vm.previewUi.value.offersOutgoingControls).isTrue()
    }

    @Test
    fun `l'ecran detruit libere l'apercu`() {
        val vm = ringingWithAudiblePreview()
        val clear = CallViewModel::class.java.getDeclaredMethod("onCleared").apply { isAccessible = true }

        clear.invoke(vm)

        assertThat(links.last.closed).isTrue()
    }
}
