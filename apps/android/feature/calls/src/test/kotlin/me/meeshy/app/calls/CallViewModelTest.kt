package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.CallCue
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallEndedSignal
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallInitiateAck
import me.meeshy.sdk.model.call.CallInitiateResult
import me.meeshy.sdk.model.call.CallJoinResult
import me.meeshy.sdk.model.call.CallMediaTogglePayload
import me.meeshy.sdk.model.call.CallQualityAlertPayload
import me.meeshy.sdk.model.call.CallQualitySample
import me.meeshy.sdk.model.call.CallScreenCaptureAlertPayload
import me.meeshy.sdk.model.call.CallTranslatedSegmentPayload
import me.meeshy.sdk.model.call.CallTranslatedSegmentRef
import me.meeshy.sdk.model.call.CallSound
import me.meeshy.sdk.model.call.ConnectionQuality
import me.meeshy.sdk.model.call.TelecomConnectionState
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.model.call.TelecomDisconnectCause
import me.meeshy.sdk.model.call.WaitingCall
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val events = MutableSharedFlow<CallEvent>(extraBufferCapacity = 64)
    private val incomingOffers = MutableSharedFlow<WaitingCall>(extraBufferCapacity = 16)
    private val endedCalls = MutableSharedFlow<CallEndedSignal>(extraBufferCapacity = 16)
    private val iceServersRefreshed = MutableSharedFlow<List<SocketIceServer>>(extraBufferCapacity = 8)
    private val qualityAlerts = MutableSharedFlow<CallQualityAlertPayload>(extraBufferCapacity = 16)
    private val screenCaptureAlerts = MutableSharedFlow<CallScreenCaptureAlertPayload>(extraBufferCapacity = 16)
    private val translatedSegments = MutableSharedFlow<CallTranslatedSegmentPayload>(extraBufferCapacity = 64)
    private val signalManager: CallSignalManager = mockk(relaxed = true)
    private val coordinator: WebRtcCallCoordinator = mockk(relaxed = true)
    private val sessionRepository: SessionRepository = mockk(relaxed = true)

    /** Test-driven auto-dismiss countdown: emit once to fire the 15 s timeout. */
    private val waitingTimerFlow = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
    private val waitingTimer = object : CallWaitingTimer {
        override fun countdown(): Flow<Unit> = waitingTimerFlow
    }

    /** Test-driven quality-indicator reset: emit once to fire the 15 s silence window. */
    private val qualityResetFlow = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
    private val qualityResetTimer = object : CallQualityResetTimer {
        override fun countdown(): Flow<Unit> = qualityResetFlow
    }

    /** Test-driven 1-Hz clock: emit a `Unit` per second the timer should advance. */
    private val tickerFlow = MutableSharedFlow<Unit>(extraBufferCapacity = 64)
    private val ticker = object : CallSecondsTicker {
        override val seconds: Flow<Unit> = tickerFlow
    }

    /** Test-driven stats source: emit a sample to drive the quality indicator. */
    private val qualityFlow = MutableSharedFlow<CallQualitySample>(extraBufferCapacity = 64)
    private val qualitySampler = object : CallQualitySampler {
        override val samples: Flow<CallQualitySample> = qualityFlow
    }

    /** Test-driven 10 s liveness clock: emit a `Unit` per heartbeat the VM should send. */
    private val heartbeatFlow = MutableSharedFlow<Unit>(extraBufferCapacity = 64)
    private val heartbeatTicker = object : CallHeartbeatTicker {
        override val beats: Flow<Unit> = heartbeatFlow
    }

    /** Test-driven app foreground/background state (null = pas encore connu). */
    private val appForeground = MutableStateFlow<Boolean?>(null)
    private val appStatePresence: me.meeshy.sdk.socket.AppStatePresenceReporter = mockk {
        every { foreground } returns appForeground
    }

    /** Test-driven local screen-recording signal: emit an edge the VM should relay. */
    private val screenRecordingFlow = MutableSharedFlow<Boolean>(extraBufferCapacity = 16)
    private val screenRecordingDetector = object : ScreenRecordingDetector {
        override val states: Flow<Boolean> = screenRecordingFlow
    }

    /** Pinned wall clock: assign [clockNowMs] to move time for the analytics anchors. */
    private var clockNowMs = 0L
    private val clock = object : CallClock {
        override fun nowMs(): Long = clockNowMs
    }

    /** Test-driven peer mute/camera toggles (gateway `call:media-toggled`). */
    private val mediaToggles = MutableSharedFlow<CallMediaTogglePayload>(extraBufferCapacity = 16)

    /** Test-driven per-attempt reconnect window: emit once to expire the armed budget. */
    private val reconnectBudgetFlow = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
    private val reconnectBudget = object : CallReconnectBudget {
        override fun countdown(): Flow<Unit> = reconnectBudgetFlow
    }

    private val outgoingVideo =
        CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = true, conversationId = "conv-1")
    private val incomingAudio =
        CallConfig(peerId = "u2", peerName = "Bob", isVideo = false, isOutgoing = false, callId = "call-9")

    /** Records the exact sequence of loop switches + cues the VM asks of the seam. */
    private class RecordingToneController : CallToneController {
        val loops = mutableListOf<CallSound>()
        val cues = mutableListOf<CallCue>()
        var releaseCount = 0
        override fun setLoop(sound: CallSound) { loops += sound }
        override fun playCue(cue: CallCue) { cues += cue }
        override fun release() { releaseCount += 1 }
    }

    private val tones = RecordingToneController()

    /** Records the exact sequence of telecom connection reports the VM makes. */
    private class RecordingTelecomReporter : TelecomCallReporter {
        val updates = mutableListOf<TelecomConnectionUpdate>()
        var releaseCount = 0
        override fun report(update: TelecomConnectionUpdate) { updates += update }
        override fun release() { releaseCount += 1 }
    }

    private val telecom = RecordingTelecomReporter()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { signalManager.events } returns events
        every { signalManager.incomingOffers } returns incomingOffers
        every { signalManager.endedCalls } returns endedCalls
        every { signalManager.iceServersRefreshed } returns iceServersRefreshed
        every { signalManager.qualityAlerts } returns qualityAlerts
        every { signalManager.screenCaptureAlerts } returns screenCaptureAlerts
        every { signalManager.translatedSegments } returns translatedSegments
        every { signalManager.mediaToggles } returns mediaToggles
        every { sessionRepository.currentUser } returns MutableStateFlow(null)
        coEvery { signalManager.emitInitiate(any(), any()) } returns
            CallInitiateResult.Success(CallInitiateAck(callId = "call-1"))
        coEvery { signalManager.emitJoinAwaitingAck(any()) } returns
            CallJoinResult.Success(emptyList())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun vm() = CallViewModel(
        signalManager, coordinator, sessionRepository, ticker, tones, telecom, qualitySampler, waitingTimer,
        heartbeatTicker, appStatePresence, qualityResetTimer, screenRecordingDetector, clock, reconnectBudget,
    )

    @Test
    fun `starts idle`() {
        assertThat(vm().state.value.status).isEqualTo(CallStatus.IDLE)
    }

    @Test
    fun `starting an outgoing call rings and carries the peer`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.OUTGOING_RINGING)
        assertThat(s.peerName).isEqualTo("Alice")
        assertThat(s.isVideoCall).isTrue()
    }

    @Test
    fun `starting an incoming call alerts`() {
        val vm = vm()
        vm.start(incomingAudio)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.INCOMING)
        assertThat(vm.state.value.showAnswerControls).isTrue()
    }

    @Test
    fun `start is inert once a call is in flight`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.start(incomingAudio)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.OUTGOING_RINGING)
        assertThat(vm.state.value.peerName).isEqualTo("Alice")
    }

    @Test
    fun `accepting an incoming call moves to connecting`() {
        val vm = vm()
        vm.start(incomingAudio)
        vm.accept()

        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTING)
    }

    @Test
    fun `declining an incoming call ends it as rejected`() {
        val vm = vm()
        vm.start(incomingAudio)
        vm.decline()

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isEqualTo(CallEndReason.Rejected)
    }

    @Test
    fun `hanging up ends the call locally`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.hangUp()

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isEqualTo(CallEndReason.Local)
    }

    @Test
    fun `outgoing call negotiates through to connected via signals`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)

        vm.onSignal(CallEvent.ParticipantJoined())
        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTING)

        vm.onSignal(CallEvent.RemoteAnswer)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTING)

        vm.onSignal(CallEvent.MediaConnected)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTED)
    }

    @Test
    fun `a remote hang-up ends the call`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.onSignal(CallEvent.ParticipantJoined())
        vm.onSignal(CallEvent.RemoteAnswer)
        vm.onSignal(CallEvent.MediaConnected)
        vm.onSignal(CallEvent.RemoteHangUp)

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isEqualTo(CallEndReason.Remote)
    }

    @Test
    fun `toggling mute flips the media intent`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        assertThat(vm.state.value.isMuted).isFalse()

        vm.toggleMute()
        assertThat(vm.state.value.isMuted).isTrue()

        vm.toggleMute()
        assertThat(vm.state.value.isMuted).isFalse()
    }

    @Test
    fun `a video call starts with the camera on and can be toggled off`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        assertThat(vm.state.value.isCameraOn).isTrue()

        vm.toggleCamera()
        assertThat(vm.state.value.isCameraOn).isFalse()
    }

    @Test
    fun `an audio call never reports the camera on even after a toggle`() {
        val vm = vm()
        vm.start(incomingAudio)
        vm.toggleCamera()

        assertThat(vm.state.value.isCameraOn).isFalse()
    }

    @Test
    fun `dismissing a terminated call settles back to idle`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.hangUp()
        assertThat(vm.state.value.status).isEqualTo(CallStatus.ENDED)

        vm.dismiss()
        assertThat(vm.state.value.status).isEqualTo(CallStatus.IDLE)
    }

    @Test
    fun `starting again after a settled call is allowed`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.hangUp()
        vm.dismiss()

        vm.start(incomingAudio)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.INCOMING)
        assertThat(vm.state.value.peerName).isEqualTo("Bob")
    }

    // --- The VM-fold: outgoing initiate ------------------------------------

    @Test
    fun `starting an outgoing call emits initiate with the conversation and video type`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)

        coVerify(exactly = 1) { signalManager.emitInitiate("conv-1", true) }
    }

    @Test
    fun `an outgoing call rings immediately even before the ACK decides the id`() = runTest {
        coEvery { signalManager.emitInitiate(any(), any()) } returns
            CallInitiateResult.Success(CallInitiateAck(callId = "call-77"))

        val vm = vm()
        vm.start(outgoingVideo)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.OUTGOING_RINGING)
    }

    @Test
    fun `a server-rejected initiate ends the call as failed with the gateway message`() = runTest {
        coEvery { signalManager.emitInitiate(any(), any()) } returns
            CallInitiateResult.ServerError("Room full")

        val vm = vm()
        vm.start(outgoingVideo)

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isEqualTo(CallEndReason.Failed("Room full"))
    }

    @Test
    fun `a timed-out initiate ends the call as failed`() = runTest {
        coEvery { signalManager.emitInitiate(any(), any()) } returns CallInitiateResult.Timeout

        val vm = vm()
        vm.start(outgoingVideo)

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isInstanceOf(CallEndReason.Failed::class.java)
    }

    @Test
    fun `a malformed initiate ACK ends the call as failed`() = runTest {
        coEvery { signalManager.emitInitiate(any(), any()) } returns CallInitiateResult.Malformed

        val vm = vm()
        vm.start(outgoingVideo)

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isInstanceOf(CallEndReason.Failed::class.java)
    }

    @Test
    fun `an incoming call does not emit initiate`() = runTest {
        val vm = vm()
        vm.start(incomingAudio)

        coVerify(exactly = 0) { signalManager.emitInitiate(any(), any()) }
    }

    // --- The VM-fold: outbound emits keyed by the minted callId ------------

    @Test
    fun `hanging up an outgoing call ends it on the wire keyed by the minted id`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo) // emitInitiate stubbed → mints "call-1"
        vm.hangUp()

        verify(exactly = 1) { signalManager.emitEnd("call-1") }
    }

    @Test
    fun `accepting an incoming call joins the room keyed by the incoming id`() {
        val vm = vm()
        vm.start(incomingAudio) // callId comes from the incoming config
        vm.accept()

        coVerify(exactly = 1) { signalManager.emitJoinAwaitingAck("call-9") }
    }

    @Test
    fun `declining an incoming call ends it on the wire`() {
        val vm = vm()
        vm.start(incomingAudio)
        vm.decline()

        verify(exactly = 1) { signalManager.emitEnd("call-9") }
    }

    @Test
    fun `muting signals the peer that audio is disabled keyed by the id`() {
        val vm = vm()
        vm.start(incomingAudio)
        vm.toggleMute()

        verify(exactly = 1) { signalManager.emitToggleAudio("call-9", enabled = false) }
    }

    @Test
    fun `toggling the camera off signals the peer that video is disabled`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo) // mints "call-1"
        vm.toggleCamera()

        verify(exactly = 1) { signalManager.emitToggleVideo("call-1", enabled = false) }
    }

    @Test
    fun `no outbound emit fires while the call has no id yet`() {
        val vm = vm()
        // An incoming call whose id is not yet known (blank) must not emit.
        vm.start(incomingAudio.copy(callId = ""))
        vm.hangUp()

        verify(exactly = 0) { signalManager.emitEnd(any()) }
    }

    // --- The VM-fold: signalling events folded from the manager ------------

    @Test
    fun `a remote hang-up folded from the signal manager ends the call`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)

        events.emit(CallEvent.RemoteHangUp)

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isEqualTo(CallEndReason.Remote)
    }

    @Test
    fun `a participant-joined event folded from the manager advances an outgoing call`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)

        events.emit(CallEvent.ParticipantJoined())
        events.emit(CallEvent.RemoteAnswer)
        events.emit(CallEvent.MediaConnected)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTED)
    }

    // --- in-call duration timer --------------------------------------------

    /** Drive [incomingAudio] all the way to a connected call (`callId` already known). */
    private fun CallViewModel.connect(): CallViewModel = apply {
        start(incomingAudio)
        accept()
        onSignal(CallEvent.MediaConnected)
    }

    /** Fire [times] one-second ticks; each is delivered to the connected timer collector. */
    private suspend fun tick(times: Int) = repeat(times) { tickerFlow.emit(Unit) }

    // --- Liveness: call:heartbeat + call:backgrounded/foregrounded (audit #5) ---

    private fun connectedIncoming(): CallViewModel {
        val vm = vm()
        vm.start(incomingAudio)
        vm.onSignal(CallEvent.LocalAnswer)
        vm.onSignal(CallEvent.MediaConnected)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTED)
        return vm
    }

    @Test
    fun `heartbeats are emitted while media is connected`() = runTest {
        connectedIncoming()

        heartbeatFlow.emit(Unit)
        heartbeatFlow.emit(Unit)
        heartbeatFlow.emit(Unit)

        verify(exactly = 3) { signalManager.emitHeartbeat("call-9") }
    }

    @Test
    fun `heartbeats stop once the call ends`() = runTest {
        val vm = connectedIncoming()
        heartbeatFlow.emit(Unit)

        vm.hangUp()
        heartbeatFlow.emit(Unit)
        heartbeatFlow.emit(Unit)

        verify(exactly = 1) { signalManager.emitHeartbeat("call-9") }
    }

    @Test
    fun `no heartbeat is emitted while ringing`() = runTest {
        val vm = vm()
        vm.start(incomingAudio)

        heartbeatFlow.emit(Unit)

        verify(exactly = 0) { signalManager.emitHeartbeat(any()) }
    }

    @Test
    fun `backgrounding during a connected call reports call backgrounded`() = runTest {
        every { sessionRepository.currentUser } returns MutableStateFlow(mockk { every { id } returns "me" })
        connectedIncoming()

        appForeground.value = false

        verify(exactly = 1) { signalManager.emitBackgrounded("call-9", "me") }
    }

    @Test
    fun `returning to foreground during a connected call reports call foregrounded`() = runTest {
        every { sessionRepository.currentUser } returns MutableStateFlow(mockk { every { id } returns "me" })
        connectedIncoming()
        appForeground.value = false

        appForeground.value = true

        verify(exactly = 1) { signalManager.emitForegrounded("call-9", "me") }
    }

    @Test
    fun `app-state transitions while idle report nothing`() = runTest {
        vm()

        appForeground.value = false
        appForeground.value = true

        verify(exactly = 0) { signalManager.emitBackgrounded(any(), any()) }
        verify(exactly = 0) { signalManager.emitForegrounded(any(), any()) }
    }

    // --- Local screen-recording relay: call:screen-capture-detected (dette audit) ---

    private fun connectedIncomingAs(userId: String): CallViewModel {
        every { sessionRepository.currentUser } returns MutableStateFlow(mockk { every { id } returns userId })
        return connectedIncoming()
    }

    @Test
    fun `a capture start during a connected call is relayed to the gateway`() = runTest {
        connectedIncomingAs("me")

        screenRecordingFlow.emit(true)

        verify(exactly = 1) { signalManager.emitScreenCaptureDetected("call-9", "me", true) }
    }

    @Test
    fun `the initial not-capturing state is never reported`() = runTest {
        connectedIncomingAs("me")

        screenRecordingFlow.emit(false)

        verify(exactly = 0) { signalManager.emitScreenCaptureDetected(any(), any(), any()) }
    }

    @Test
    fun `a repeated capture state is edge-only and never re-emits`() = runTest {
        connectedIncomingAs("me")

        screenRecordingFlow.emit(true)
        screenRecordingFlow.emit(true)

        verify(exactly = 1) { signalManager.emitScreenCaptureDetected("call-9", "me", true) }
    }

    @Test
    fun `a capture stop after a reported start is relayed`() = runTest {
        connectedIncomingAs("me")
        screenRecordingFlow.emit(true)

        screenRecordingFlow.emit(false)

        verify(exactly = 1) { signalManager.emitScreenCaptureDetected("call-9", "me", false) }
    }

    @Test
    fun `a capture edge while still ringing reports nothing`() = runTest {
        every { sessionRepository.currentUser } returns MutableStateFlow(mockk { every { id } returns "me" })
        val vm = vm()
        vm.start(incomingAudio)

        screenRecordingFlow.emit(true)

        verify(exactly = 0) { signalManager.emitScreenCaptureDetected(any(), any(), any()) }
    }

    @Test
    fun `capture edges stop being relayed once the call ends`() = runTest {
        val vm = connectedIncomingAs("me")
        screenRecordingFlow.emit(true)

        vm.hangUp()
        screenRecordingFlow.emit(false)

        verify(exactly = 1) { signalManager.emitScreenCaptureDetected(any(), any(), any()) }
    }

    @Test
    fun `a capture edge without a signed-in user reports nothing`() = runTest {
        connectedIncoming()

        screenRecordingFlow.emit(true)

        verify(exactly = 0) { signalManager.emitScreenCaptureDetected(any(), any(), any()) }
    }

    // --- call:analytics: one terminal lifecycle report per call (parité iOS) ---

    private fun analyticsFields(): Map<String, Any> {
        val fields = slot<Map<String, Any>>()
        verify(exactly = 1) { signalManager.emitAnalytics("call-9", capture(fields)) }
        return fields.captured
    }

    @Test
    fun `hanging up a connected call reports the lifecycle analytics once`() = runTest {
        clockNowMs = 5_000
        val vm = vm()
        vm.start(incomingAudio)
        vm.onSignal(CallEvent.LocalAnswer)
        clockNowMs = 8_200
        vm.onSignal(CallEvent.MediaConnected)
        tick(3)

        vm.hangUp()

        val fields = analyticsFields()
        assertThat(fields["setupTimeMs"]).isEqualTo(3_200L)
        assertThat(fields["durationSeconds"]).isEqualTo(3L)
        assertThat(fields["endReason"]).isEqualTo("local")
        assertThat(fields["platform"]).isEqualTo("android")
        assertThat(fields["isVideo"]).isEqualTo(false)
    }

    @Test
    fun `a declined call reports analytics with the -1 setup sentinel`() = runTest {
        val vm = vm()
        vm.start(incomingAudio)

        vm.decline()

        val fields = analyticsFields()
        assertThat(fields["setupTimeMs"]).isEqualTo(-1L)
        assertThat(fields["durationSeconds"]).isEqualTo(0L)
        assertThat(fields["endReason"]).isEqualTo("rejected")
    }

    @Test
    fun `reconnect cycles are counted in the terminal report`() = runTest {
        val vm = connectedIncoming()
        vm.onSignal(CallEvent.ConnectionStalled)
        vm.onSignal(CallEvent.MediaConnected)
        vm.onSignal(CallEvent.ConnectionStalled)
        vm.onSignal(CallEvent.ReconnectFailed)

        vm.hangUp()

        assertThat(analyticsFields()["reconnectionCount"]).isEqualTo(3)
    }

    @Test
    fun `quality samples aggregate into the terminal report`() = runTest {
        val vm = connectedIncoming()
        qualityFlow.emit(CallQualitySample(rttMs = 100.0, packetLoss = 0.0))
        qualityFlow.emit(CallQualitySample(rttMs = 300.0, packetLoss = 8.0))

        vm.hangUp()

        val fields = analyticsFields()
        assertThat(fields["averageRtt"]).isEqualTo(200.0)
        assertThat(fields["maxPacketLoss"]).isEqualTo(8.0)
    }

    @Test
    fun `settling the ended screen never re-emits the analytics`() = runTest {
        val vm = connectedIncoming()
        vm.hangUp()

        vm.dismiss()

        verify(exactly = 1) { signalManager.emitAnalytics(any(), any()) }
    }

    @Test
    fun `a call that never minted an id reports nothing`() = runTest {
        coEvery { signalManager.emitInitiate(any(), any()) } returns
            CallInitiateResult.ServerError("busy")
        val vm = vm()

        vm.start(outgoingVideo)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.ENDED)
        verify(exactly = 0) { signalManager.emitAnalytics(any(), any()) }
    }

    // --- Reconnect budget watchdog: ReconnectFailed enfin tiré (parité iOS) ---

    private fun reconnecting(): CallViewModel {
        val vm = connectedIncoming()
        vm.onSignal(CallEvent.ConnectionStalled)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.RECONNECTING)
        return vm
    }

    @Test
    fun `an expired budget escalates to the next attempt and nudges an ICE restart`() = runTest {
        val vm = reconnecting()

        reconnectBudgetFlow.emit(Unit)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.RECONNECTING)
        assertThat(vm.state.value.reconnectAttempt).isEqualTo(2)
        verify(exactly = 1) { coordinator.retryIceRestart() }
        verify(exactly = 0) { signalManager.emitEnd(any()) }
    }

    @Test
    fun `a recovery before expiry disarms the budget`() = runTest {
        val vm = reconnecting()
        vm.onSignal(CallEvent.MediaConnected)

        reconnectBudgetFlow.emit(Unit)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTED)
        verify(exactly = 0) { coordinator.retryIceRestart() }
    }

    @Test
    fun `exhausting every attempt ends the call as connectionLost on the wire too`() = runTest {
        val vm = reconnecting()

        reconnectBudgetFlow.emit(Unit)
        reconnectBudgetFlow.emit(Unit)
        reconnectBudgetFlow.emit(Unit)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.ENDED)
        assertThat(vm.state.value.endReason).isEqualTo(CallEndReason.ConnectionLost)
        verify(exactly = 1) { signalManager.emitEnd("call-9") }
        verify(exactly = 1) { coordinator.end() }
    }

    @Test
    fun `the terminal escalation reports connectionLost analytics`() = runTest {
        reconnecting()

        reconnectBudgetFlow.emit(Unit)
        reconnectBudgetFlow.emit(Unit)
        reconnectBudgetFlow.emit(Unit)

        assertThat(analyticsFields()["endReason"]).isEqualTo("connectionLost")
        assertThat(analyticsFields()["reconnectionCount"]).isEqualTo(3)
    }

    @Test
    fun `no budget is armed outside the reconnecting phase`() = runTest {
        val vm = connectedIncoming()

        reconnectBudgetFlow.emit(Unit)

        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTED)
        verify(exactly = 0) { coordinator.retryIceRestart() }
    }

    // --- Peer mute/camera indicators: call:media-toggled (parité iOS/web) ---

    private fun audioToggle(enabled: Boolean, callId: String = "call-9") =
        CallMediaTogglePayload(callId = callId, mediaType = "audio", enabled = enabled)

    private fun videoToggle(enabled: Boolean, callId: String = "call-9") =
        CallMediaTogglePayload(callId = callId, mediaType = "video", enabled = enabled)

    @Test
    fun `a peer audio mute raises the muted indicator`() = runTest {
        val vm = connectedIncoming()

        mediaToggles.emit(audioToggle(enabled = false))

        assertThat(vm.state.value.isPeerMuted).isTrue()
    }

    @Test
    fun `a peer unmute lowers the muted indicator`() = runTest {
        val vm = connectedIncoming()
        mediaToggles.emit(audioToggle(enabled = false))

        mediaToggles.emit(audioToggle(enabled = true))

        assertThat(vm.state.value.isPeerMuted).isFalse()
    }

    @Test
    fun `a toggle keyed by another call is ignored`() = runTest {
        val vm = connectedIncoming()

        mediaToggles.emit(audioToggle(enabled = false, callId = "other-call"))

        assertThat(vm.state.value.isPeerMuted).isFalse()
    }

    @Test
    fun `an unknown media type is inert rather than a blind flip`() = runTest {
        val vm = connectedIncoming()

        mediaToggles.emit(
            CallMediaTogglePayload(callId = "call-9", mediaType = "hologram", enabled = false),
        )

        assertThat(vm.state.value.isPeerMuted).isFalse()
        assertThat(vm.state.value.isPeerCameraOff).isFalse()
    }

    @Test
    fun `a peer camera-off during a video call raises the camera indicator`() = runTest {
        val vm = vm()
        vm.start(incomingAudio.copy(isVideo = true))
        vm.onSignal(CallEvent.LocalAnswer)
        vm.onSignal(CallEvent.MediaConnected)

        mediaToggles.emit(videoToggle(enabled = false))

        assertThat(vm.state.value.isPeerCameraOff).isTrue()
    }

    @Test
    fun `a peer camera-off during an audio call never raises the camera indicator`() = runTest {
        val vm = connectedIncoming()

        mediaToggles.emit(videoToggle(enabled = false))

        assertThat(vm.state.value.isPeerCameraOff).isFalse()
    }

    @Test
    fun `peer media indicators die with the call`() = runTest {
        val vm = connectedIncoming()
        mediaToggles.emit(audioToggle(enabled = false))

        vm.hangUp()

        assertThat(vm.state.value.isPeerMuted).isFalse()
    }

    @Test
    fun `a fresh call never inherits the previous peer mute state`() = runTest {
        val vm = connectedIncoming()
        mediaToggles.emit(audioToggle(enabled = false))
        vm.hangUp()
        vm.dismiss()

        vm.start(incomingAudio.copy(callId = "call-10"))
        vm.onSignal(CallEvent.LocalAnswer)
        vm.onSignal(CallEvent.MediaConnected)

        assertThat(vm.state.value.isPeerMuted).isFalse()
    }

    @Test
    fun `no duration is shown before the call connects`() {
        val vm = vm()
        vm.start(outgoingVideo)
        assertThat(vm.state.value.durationLabel).isNull()

        vm.onSignal(CallEvent.ParticipantJoined())
        vm.onSignal(CallEvent.RemoteAnswer)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTING)
        assertThat(vm.state.value.durationLabel).isNull()
    }

    @Test
    fun `the timer reads 0 00 the instant the call connects`() {
        val vm = vm().connect()
        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTED)
        assertThat(vm.state.value.durationLabel).isEqualTo("0:00")
    }

    @Test
    fun `the timer ticks up once per second while connected`() = runTest {
        val vm = vm().connect()

        tick(3)

        assertThat(vm.state.value.durationLabel).isEqualTo("0:03")
    }

    @Test
    fun `the timer keeps counting through a reconnect`() = runTest {
        val vm = vm().connect()
        tick(2)
        assertThat(vm.state.value.durationLabel).isEqualTo("0:02")

        vm.onSignal(CallEvent.ConnectionStalled)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.RECONNECTING)

        tick(2)
        assertThat(vm.state.value.durationLabel).isEqualTo("0:04")
    }

    @Test
    fun `ending freezes the final length and stops the timer`() = runTest {
        val vm = vm().connect()
        tick(2)

        vm.onSignal(CallEvent.RemoteHangUp)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.ENDED)
        assertThat(vm.state.value.durationLabel).isEqualTo("0:02")

        tick(5)
        assertThat(vm.state.value.durationLabel).isEqualTo("0:02")
    }

    @Test
    fun `a call that never connected shows no final duration`() {
        val vm = vm()
        vm.start(incomingAudio)
        vm.decline()

        assertThat(vm.state.value.status).isEqualTo(CallStatus.ENDED)
        assertThat(vm.state.value.durationLabel).isNull()
    }

    @Test
    fun `starting a new call resets the duration to zero`() = runTest {
        val first = vm().connect()
        tick(3)
        first.hangUp()
        first.dismiss()
        assertThat(first.state.value.status).isEqualTo(CallStatus.IDLE)

        first.connect()
        assertThat(first.state.value.durationLabel).isEqualTo("0:00")
    }

    // --- live connection-quality indicator ---------------------------------

    /** Emit one quality stats sample to the connected collector. */
    private suspend fun emitQuality(rttMs: Double, loss: Double = 0.0) =
        qualityFlow.emit(CallQualitySample(rttMs = rttMs, packetLoss = loss))

    @Test
    fun `no connection quality is shown before the call connects`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        emitQuality(rttMs = 40.0) // no collector while ringing → ignored
        assertThat(vm.state.value.connectionQuality).isNull()

        vm.onSignal(CallEvent.ParticipantJoined())
        vm.onSignal(CallEvent.RemoteAnswer)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTING)
        assertThat(vm.state.value.connectionQuality).isNull()
    }

    @Test
    fun `a healthy sample lights the indicator once connected`() = runTest {
        val vm = vm().connect()
        emitQuality(rttMs = 150.0) // > excellentRTT(100), <= fair(200) → GOOD

        assertThat(vm.state.value.connectionQuality).isEqualTo(ConnectionQuality.GOOD)
    }

    @Test
    fun `a critical sample collapses onto the poor indicator`() = runTest {
        val vm = vm().connect()
        emitQuality(rttMs = 900.0) // critical tier → indicator POOR

        assertThat(vm.state.value.connectionQuality).isEqualTo(ConnectionQuality.POOR)
    }

    @Test
    fun `the indicator keeps updating through a reconnect`() = runTest {
        val vm = vm().connect()
        emitQuality(rttMs = 50.0)
        assertThat(vm.state.value.connectionQuality).isEqualTo(ConnectionQuality.EXCELLENT)

        vm.onSignal(CallEvent.ConnectionStalled)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.RECONNECTING)

        emitQuality(rttMs = 350.0) // > videoPoorRTT(300) → POOR tier → indicator POOR
        assertThat(vm.state.value.connectionQuality).isEqualTo(ConnectionQuality.POOR)
    }

    @Test
    fun `ending the call clears the connection quality`() = runTest {
        val vm = vm().connect()
        emitQuality(rttMs = 50.0)
        assertThat(vm.state.value.connectionQuality).isEqualTo(ConnectionQuality.EXCELLENT)

        vm.onSignal(CallEvent.RemoteHangUp)
        assertThat(vm.state.value.status).isEqualTo(CallStatus.ENDED)
        assertThat(vm.state.value.connectionQuality).isNull()
    }

    @Test
    fun `starting a new call clears the previous quality`() = runTest {
        val vm = vm().connect()
        emitQuality(rttMs = 50.0)
        assertThat(vm.state.value.connectionQuality).isEqualTo(ConnectionQuality.EXCELLENT)
        vm.hangUp()
        vm.dismiss()

        vm.connect() // fresh call, no sample yet
        assertThat(vm.state.value.connectionQuality).isNull()
    }

    // --- call audio: loops + cues driven from the FSM ----------------------

    @Test
    fun `an outgoing call starts the ringback loop`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)

        assertThat(tones.loops).containsExactly(CallSound.Ringback)
        assertThat(tones.cues).isEmpty()
    }

    @Test
    fun `an incoming call starts the ringtone loop`() {
        val vm = vm()
        vm.start(incomingAudio)

        assertThat(tones.loops).containsExactly(CallSound.Ringtone)
        assertThat(tones.cues).isEmpty()
    }

    @Test
    fun `an outgoing call stops the ringback and cues connected when media flows`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.onSignal(CallEvent.ParticipantJoined()) // → offering: ringback continues
        vm.onSignal(CallEvent.RemoteAnswer)      // → connecting: ringback stops
        vm.onSignal(CallEvent.MediaConnected)    // → connected: connected cue

        assertThat(tones.loops).containsExactly(CallSound.Ringback, CallSound.None).inOrder()
        assertThat(tones.cues).containsExactly(CallCue.Connected)
    }

    @Test
    fun `an inert event never restarts the ringback loop`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.onSignal(CallEvent.MediaConnected) // inert while ringing → no state change

        assertThat(tones.loops).containsExactly(CallSound.Ringback)
    }

    @Test
    fun `accepting an incoming call stops the ringtone and cues connected`() = runTest {
        val vm = vm()
        vm.start(incomingAudio)
        vm.accept()                           // → connecting: ringtone stops
        vm.onSignal(CallEvent.MediaConnected) // → connected: connected cue

        assertThat(tones.loops).containsExactly(CallSound.Ringtone, CallSound.None).inOrder()
        assertThat(tones.cues).containsExactly(CallCue.Connected)
    }

    @Test
    fun `declining an incoming call stops the ringtone and cues the ended tone`() {
        val vm = vm()
        vm.start(incomingAudio)
        vm.decline()

        assertThat(tones.loops).containsExactly(CallSound.Ringtone, CallSound.None).inOrder()
        assertThat(tones.cues).containsExactly(CallCue.Ended)
    }

    @Test
    fun `hanging up a ringing outgoing call cues the ended tone`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.hangUp()

        assertThat(tones.loops).containsExactly(CallSound.Ringback, CallSound.None).inOrder()
        assertThat(tones.cues).containsExactly(CallCue.Ended)
    }

    @Test
    fun `a remote hang-up after connection cues the ended tone`() = runTest {
        val vm = vm().connect()
        vm.onSignal(CallEvent.RemoteHangUp)

        assertThat(tones.cues).containsExactly(CallCue.Connected, CallCue.Ended).inOrder()
    }

    @Test
    fun `a successful reconnect cues connected a second time`() = runTest {
        val vm = vm().connect()
        vm.onSignal(CallEvent.ConnectionStalled) // → reconnecting
        vm.onSignal(CallEvent.MediaConnected)    // → connected again

        assertThat(tones.cues).containsExactly(CallCue.Connected, CallCue.Connected).inOrder()
    }

    // --- OS telecom reporting driven from the FSM --------------------------

    @Test
    fun `an outgoing call registers a dialing telecom connection`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)

        assertThat(telecom.updates)
            .containsExactly(TelecomConnectionUpdate(TelecomConnectionState.Dialing))
    }

    @Test
    fun `an incoming call registers a ringing telecom connection`() {
        val vm = vm()
        vm.start(incomingAudio)

        assertThat(telecom.updates)
            .containsExactly(TelecomConnectionUpdate(TelecomConnectionState.Ringing))
    }

    @Test
    fun `an answered outgoing call goes active once and dedupes the media edges`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.onSignal(CallEvent.ParticipantJoined()) // → offering: still dialing, no report
        vm.onSignal(CallEvent.RemoteAnswer)      // → connecting: active
        vm.onSignal(CallEvent.MediaConnected)    // → connected: already active, no report

        assertThat(telecom.updates).containsExactly(
            TelecomConnectionUpdate(TelecomConnectionState.Dialing),
            TelecomConnectionUpdate(TelecomConnectionState.Active),
        ).inOrder()
    }

    @Test
    fun `an inert event emits no telecom report`() = runTest {
        val vm = vm()
        vm.start(outgoingVideo)
        vm.onSignal(CallEvent.MediaConnected) // inert while ringing → no state change

        assertThat(telecom.updates)
            .containsExactly(TelecomConnectionUpdate(TelecomConnectionState.Dialing))
    }

    @Test
    fun `declining an incoming call disconnects the telecom connection as rejected`() {
        val vm = vm()
        vm.start(incomingAudio)
        vm.decline()

        assertThat(telecom.updates).containsExactly(
            TelecomConnectionUpdate(TelecomConnectionState.Ringing),
            TelecomConnectionUpdate(TelecomConnectionState.Disconnected, TelecomDisconnectCause.Rejected),
        ).inOrder()
    }

    @Test
    fun `hanging up a connected call disconnects the telecom connection locally`() = runTest {
        val vm = vm().connect()
        vm.hangUp()

        assertThat(telecom.updates).containsExactly(
            TelecomConnectionUpdate(TelecomConnectionState.Ringing),
            TelecomConnectionUpdate(TelecomConnectionState.Active),
            TelecomConnectionUpdate(TelecomConnectionState.Disconnected, TelecomDisconnectCause.Local),
        ).inOrder()
    }

    @Test
    fun `a failed outgoing initiate disconnects the dialing telecom connection`() = runTest {
        coEvery { signalManager.emitInitiate(any(), any()) } returns CallInitiateResult.Timeout
        val vm = vm()
        vm.start(outgoingVideo)

        assertThat(telecom.updates).containsExactly(
            TelecomConnectionUpdate(TelecomConnectionState.Dialing),
            TelecomConnectionUpdate(TelecomConnectionState.Disconnected, TelecomDisconnectCause.Error),
        ).inOrder()
    }

    // --- call waiting: a second incoming call while active -----------------

    private fun offer(callId: String = "call-77", name: String = "Carol", video: Boolean = false) =
        WaitingCall(callId = callId, callerId = "u3", callerName = name, isVideo = video)

    @Test
    fun `a second incoming offer while active raises the waiting banner`() = runTest {
        val vm = vm()
        vm.start(incomingAudio) // active call, id call-9

        incomingOffers.emit(offer(name = "Carol", video = true))

        val banner = vm.state.value.waitingBanner
        assertThat(banner).isNotNull()
        assertThat(banner!!.callerName).isEqualTo("Carol")
        assertThat(banner.isVideo).isTrue()
    }

    @Test
    fun `an incoming offer with no active call shows no banner`() = runTest {
        val vm = vm()

        incomingOffers.emit(offer())

        assertThat(vm.state.value.waitingBanner).isNull()
    }

    @Test
    fun `a redelivered offer for the active call is not a waiting banner`() = runTest {
        val vm = vm()
        vm.start(incomingAudio) // id call-9

        incomingOffers.emit(offer(callId = "call-9"))

        assertThat(vm.state.value.waitingBanner).isNull()
    }

    @Test
    fun `a newer waiting offer replaces the previous banner`() = runTest {
        val vm = vm()
        vm.start(incomingAudio)

        incomingOffers.emit(offer(callId = "call-77", name = "Carol"))
        incomingOffers.emit(offer(callId = "call-88", name = "Dan"))

        assertThat(vm.state.value.waitingBanner!!.callerName).isEqualTo("Dan")
    }

    @Test
    fun `rejecting the waiting call ends it on the wire and clears the banner`() = runTest {
        val vm = vm()
        vm.start(incomingAudio) // active call call-9

        incomingOffers.emit(offer(callId = "call-77"))
        vm.rejectWaiting()

        assertThat(vm.state.value.waitingBanner).isNull()
        verify(exactly = 1) { signalManager.emitEnd("call-77") }
        // The active call is untouched by rejecting the waiting one.
        verify(exactly = 0) { signalManager.emitEnd("call-9") }
        assertThat(vm.state.value.status).isEqualTo(CallStatus.INCOMING)
    }

    @Test
    fun `rejecting with no waiting call is inert`() = runTest {
        val vm = vm()
        vm.start(incomingAudio)

        vm.rejectWaiting()

        verify(exactly = 0) { signalManager.emitEnd(any()) }
    }

    @Test
    fun `an ignored banner auto-dismisses as a reject when the timer fires`() = runTest {
        val vm = vm()
        vm.start(incomingAudio) // active call call-9

        incomingOffers.emit(offer(callId = "call-77"))
        assertThat(vm.state.value.waitingBanner).isNotNull()

        waitingTimerFlow.emit(Unit) // 15 s elapsed

        assertThat(vm.state.value.waitingBanner).isNull()
        verify(exactly = 1) { signalManager.emitEnd("call-77") }
    }

    @Test
    fun `answering the waiting call ends the current one and re-presents the waiting call`() = runTest {
        val vm = vm().connect() // active connected call, id call-9

        incomingOffers.emit(offer(callId = "call-77", name = "Carol", video = false))
        vm.acceptWaitingSwap()

        // The current call is ended on the wire...
        verify(exactly = 1) { signalManager.emitEnd("call-9") }
        // ...and the waiting call is now presented as a fresh incoming call.
        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.INCOMING)
        assertThat(s.peerName).isEqualTo("Carol")
        assertThat(s.waitingBanner).isNull()
    }

    @Test
    fun `answering the re-presented waiting call joins its own room`() = runTest {
        val vm = vm().connect() // id call-9

        incomingOffers.emit(offer(callId = "call-77", name = "Carol"))
        vm.acceptWaitingSwap()
        vm.accept()

        coVerify(exactly = 1) { signalManager.emitJoinAwaitingAck("call-77") }
    }

    @Test
    fun `answering with no waiting call is inert`() = runTest {
        val vm = vm().connect()

        vm.acceptWaitingSwap()

        assertThat(vm.state.value.status).isEqualTo(CallStatus.CONNECTED)
    }

    @Test
    fun `the waiting call ending remotely dismisses the banner without ending it on the wire`() = runTest {
        val vm = vm()
        vm.start(incomingAudio) // active call call-9
        incomingOffers.emit(offer(callId = "call-77"))
        assertThat(vm.state.value.waitingBanner).isNotNull()

        endedCalls.emit(CallEndedSignal("call-77", CallEvent.RemoteHangUp)) // the waiting caller hangs up

        assertThat(vm.state.value.waitingBanner).isNull()
        // The caller already ended it — nothing to end on the wire, and the
        // active call is untouched (the bug: it used to be torn down by the
        // waiting call's teardown fanned out to this busy user's rooms).
        verify(exactly = 0) { signalManager.emitEnd(any()) }
        assertThat(vm.state.value.status).isEqualTo(CallStatus.INCOMING)
    }

    @Test
    fun `the active call's own remote end tears it down while a waiting banner stays up`() = runTest {
        val vm = vm().connect() // active connected call, id call-9
        incomingOffers.emit(offer(callId = "call-77"))
        assertThat(vm.state.value.waitingBanner).isNotNull()

        endedCalls.emit(CallEndedSignal("call-9", CallEvent.RemoteHangUp)) // the active call's own end

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isEqualTo(CallEndReason.Remote)
        // The waiting call is untouched — it is a different call.
        assertThat(s.waitingBanner).isNotNull()
    }

    @Test
    fun `the active call's own remote end tears it down when no banner is present`() = runTest {
        val vm = vm().connect() // active connected call, id call-9

        endedCalls.emit(CallEndedSignal("call-9", CallEvent.RemoteHangUp))

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isEqualTo(CallEndReason.Remote)
    }

    @Test
    fun `a missed teardown for the active ringing call ends it as missed`() = runTest {
        val vm = vm()
        vm.start(incomingAudio) // ringing incoming, id call-9

        endedCalls.emit(CallEndedSignal("call-9", CallEvent.RingTimeout))

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.endReason).isEqualTo(CallEndReason.Missed)
    }

    @Test
    fun `an ended id matching neither the active nor a waiting call is inert`() = runTest {
        val vm = vm().connect() // active connected call, id call-9
        incomingOffers.emit(offer(callId = "call-77"))

        endedCalls.emit(CallEndedSignal("call-stranger", CallEvent.RemoteHangUp))

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.CONNECTED)
        assertThat(s.waitingBanner).isNotNull()
        verify(exactly = 0) { signalManager.emitEnd(any()) }
    }

    @Test
    fun `an ended id with no active call and no waiting banner is inert`() = runTest {
        val vm = vm()

        endedCalls.emit(CallEndedSignal("call-77", CallEvent.RemoteHangUp))

        assertThat(vm.state.value.status).isEqualTo(CallStatus.IDLE)
        assertThat(vm.state.value.waitingBanner).isNull()
        verify(exactly = 0) { signalManager.emitEnd(any()) }
    }

    @Test
    fun `a remotely-ended waiting call cancels its auto-dismiss timer`() = runTest {
        val vm = vm()
        vm.start(incomingAudio) // active call call-9
        incomingOffers.emit(offer(callId = "call-77"))

        endedCalls.emit(CallEndedSignal("call-77", CallEvent.RemoteHangUp)) // dismissed by the remote end...
        waitingTimerFlow.emit(Unit) // ...so a later timer fire must not re-end it

        verify(exactly = 0) { signalManager.emitEnd(any()) }
    }

    @Test
    fun `starting a fresh call clears a stale waiting banner`() = runTest {
        val vm = vm()
        vm.start(incomingAudio)
        incomingOffers.emit(offer())
        assertThat(vm.state.value.waitingBanner).isNotNull()

        vm.decline()
        vm.dismiss() // back to idle
        vm.start(outgoingVideo)

        assertThat(vm.state.value.waitingBanner).isNull()
    }

    // --- peer indicators: quality-alert / screen-capture-alert / captions (audit #5) ---

    private fun qualityAlert(callId: String = "call-9") =
        CallQualityAlertPayload(callId = callId, participantId = "p2", metric = "rtt", value = 900.0, threshold = 500.0)

    private fun captureAlert(callId: String = "call-9", capturing: Boolean = true) =
        CallScreenCaptureAlertPayload(callId = callId, participantId = "p2", isCapturing = capturing)

    private fun segment(callId: String = "call-9", text: String = "bonjour", translated: String? = "hello") =
        CallTranslatedSegmentPayload(
            callId = callId,
            segment = CallTranslatedSegmentRef(text = text, translatedText = translated, speakerId = "u2", isFinal = true),
        )

    @Test
    fun `a quality alert for the active call lights the peer-degraded indicator`() = runTest {
        val vm = vm().connect()
        qualityAlerts.emit(qualityAlert())

        assertThat(vm.state.value.isPeerQualityDegraded).isTrue()
    }

    @Test
    fun `a quality alert for another call never lights the indicator`() = runTest {
        val vm = vm().connect()
        qualityAlerts.emit(qualityAlert(callId = "call-77"))

        assertThat(vm.state.value.isPeerQualityDegraded).isFalse()
    }

    @Test
    fun `the peer-degraded indicator auto-clears after the silence window`() = runTest {
        val vm = vm().connect()
        qualityAlerts.emit(qualityAlert())
        assertThat(vm.state.value.isPeerQualityDegraded).isTrue()

        qualityResetFlow.emit(Unit)

        assertThat(vm.state.value.isPeerQualityDegraded).isFalse()
    }

    @Test
    fun `a screen-capture alert flips the privacy banner on and off`() = runTest {
        val vm = vm().connect()
        screenCaptureAlerts.emit(captureAlert(capturing = true))
        assertThat(vm.state.value.isPeerScreenCapturing).isTrue()

        screenCaptureAlerts.emit(captureAlert(capturing = false))
        assertThat(vm.state.value.isPeerScreenCapturing).isFalse()
    }

    @Test
    fun `a screen-capture alert for another call is inert`() = runTest {
        val vm = vm().connect()
        screenCaptureAlerts.emit(captureAlert(callId = "call-77", capturing = true))

        assertThat(vm.state.value.isPeerScreenCapturing).isFalse()
    }

    @Test
    fun `a translated segment surfaces the translation as the live caption`() = runTest {
        val vm = vm().connect()
        translatedSegments.emit(segment(text = "bonjour", translated = "hello"))

        assertThat(vm.state.value.captionText).isEqualTo("hello")
    }

    @Test
    fun `an untranslated segment falls back to the original text`() = runTest {
        val vm = vm().connect()
        translatedSegments.emit(segment(text = "bonjour", translated = null))

        assertThat(vm.state.value.captionText).isEqualTo("bonjour")
    }

    @Test
    fun `a segment for another call never leaks onto the caption`() = runTest {
        val vm = vm().connect()
        translatedSegments.emit(segment(callId = "call-77"))

        assertThat(vm.state.value.captionText).isNull()
    }

    @Test
    fun `ending the call clears every peer indicator`() = runTest {
        val vm = vm().connect()
        qualityAlerts.emit(qualityAlert())
        screenCaptureAlerts.emit(captureAlert(capturing = true))
        translatedSegments.emit(segment())

        vm.onSignal(CallEvent.RemoteHangUp)

        val s = vm.state.value
        assertThat(s.status).isEqualTo(CallStatus.ENDED)
        assertThat(s.isPeerQualityDegraded).isFalse()
        assertThat(s.isPeerScreenCapturing).isFalse()
        assertThat(s.captionText).isNull()
    }

    @Test
    fun `peer indicators never leak into a subsequent call`() = runTest {
        val vm = vm().connect()
        qualityAlerts.emit(qualityAlert())
        screenCaptureAlerts.emit(captureAlert(capturing = true))
        translatedSegments.emit(segment())
        vm.onSignal(CallEvent.RemoteHangUp)
        vm.dismiss()

        vm.start(incomingAudio)
        vm.accept()
        vm.onSignal(CallEvent.MediaConnected)

        val s = vm.state.value
        assertThat(s.isPeerQualityDegraded).isFalse()
        assertThat(s.isPeerScreenCapturing).isFalse()
        assertThat(s.captionText).isNull()
    }
}
