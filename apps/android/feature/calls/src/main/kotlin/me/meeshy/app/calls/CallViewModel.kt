package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallEndedSignal
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallInitiateResult
import me.meeshy.sdk.model.call.CallSound
import me.meeshy.sdk.model.call.CallSoundPolicy
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallStateMachine
import me.meeshy.sdk.model.call.CallWaitingEvent
import me.meeshy.sdk.model.call.CallWaitingReducer
import me.meeshy.sdk.model.call.CallWaitingState
import me.meeshy.sdk.model.call.ConnectionQuality
import me.meeshy.sdk.model.call.TelecomCallPolicy
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.WaitingCall
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSignalManager
import javax.inject.Inject

/**
 * UDF ViewModel driving the pure [CallStateMachine], now folded onto the live
 * transport. It owns the current [CallState], the local [CallMedia] intent, and
 * the server [callId] every outbound emit is keyed by, republishing an immutable
 * [CallUiState] via [CallPresenter].
 *
 * Three responsibilities, all thin orchestration over stateless building blocks:
 *  - **Fold in** remote signalling: [CallSignalManager.events] is collected in
 *    [viewModelScope] and each mapped [CallEvent] is reduced through the FSM, so a
 *    peer answer / remote hang-up / stall drives the screen with no manual wiring.
 *  - **Place** an outgoing call: [start] mints the real `callId` via the ACK-based
 *    [CallSignalManager.emitInitiate]; the ring shows instantly (optimistic) and a
 *    rejected / timed-out / malformed ACK settles the call to `Ended(Failed)`.
 *  - **Fan out** local actions: accept/decline/hang-up/mute/camera route to the
 *    matching [CallSignalManager] emit, keyed by the known id (inert until one is).
 *
 * Every *decision* still lives in the FSM, the presenter, and the pure ACK parser
 * behind [CallSignalManager.emitInitiate] — this class only sequences them.
 */
@HiltViewModel
class CallViewModel @Inject constructor(
    private val signalManager: CallSignalManager,
    private val coordinator: WebRtcCallCoordinator,
    private val sessionRepository: SessionRepository,
    private val ticker: CallSecondsTicker,
    private val toneController: CallToneController,
    private val telecomReporter: TelecomCallReporter,
    private val qualitySampler: CallQualitySampler,
    private val waitingTimer: CallWaitingTimer,
) : ViewModel() {

    /** The local user id used as the `from` on every outbound WebRTC signal. */
    private val selfId: String get() = sessionRepository.currentUser.value?.id.orEmpty()

    /** Set on accept; the callee starts its media once fresh ICE servers land. */
    private var awaitingIncomingIce: Boolean = false

    private var config: CallConfig = CallConfig.EMPTY
    private var media: CallMedia = CallMedia()
    private var callState: CallState = CallState.Idle

    /** The loop currently asked of [toneController]; dedups redundant `setLoop` calls. */
    private var activeLoop: CallSound = CallSound.None

    /** The id every outbound emit is keyed by: from the incoming config, or minted by [start]. */
    private var callId: String = ""

    /** Seconds of connected media, ticked once the call reaches [CallState.Connected]. */
    private var elapsedSeconds: Long = 0L

    /** The 1-Hz timer job; alive only while media is (or was) flowing this call. */
    private var tickerJob: Job? = null

    /** The latest connection-quality indicator tier, or `null` until a sample arrives. */
    private var connectionQuality: ConnectionQuality? = null

    /** Collects [CallQualitySampler.samples]; alive only while media is flowing. */
    private var qualityJob: Job? = null

    /** At most one second incoming call awaiting an accept-swap / reject decision. */
    private var waiting: CallWaitingState = CallWaitingState.EMPTY

    /** The 15 s auto-dismiss timer for the current banner; cancelled on any resolution. */
    private var waitingTimerJob: Job? = null

    private val _state = MutableStateFlow(CallPresenter.present(callState, config, media, elapsedSeconds))
    val state: StateFlow<CallUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            signalManager.events.collect(::onRemoteEvent)
        }
        viewModelScope.launch {
            signalManager.incomingOffers.collect(::onIncomingOffer)
        }
        viewModelScope.launch {
            signalManager.endedCalls.collect(::onRemoteEnded)
        }
        viewModelScope.launch {
            signalManager.iceServersRefreshed.collect(::onIceServersRefreshed)
        }
    }

    /**
     * Fold a remote FSM event, then drive the WebRTC media: the caller sends its
     * SDP offer only once the peer has actually joined the room ([CallEvent
     * .ParticipantJoined]) — offering earlier races the callee's connection.
     */
    private fun onRemoteEvent(event: CallEvent) {
        dispatch(event)
        if (event is CallEvent.ParticipantJoined) coordinator.onParticipantJoined()
    }

    /** The callee's requested ICE servers landed → open its media connection. */
    private fun onIceServersRefreshed(iceServers: List<SocketIceServer>) {
        if (!awaitingIncomingIce) return
        awaitingIncomingIce = false
        coordinator.startIncoming(
            viewModelScope, callId, iceServers, config.peerId, selfId, config.isVideo, ::onMediaConnected,
        )
    }

    /** WebRTC reports the media path is up → advance the FSM to Connected. */
    private fun onMediaConnected() = dispatch(CallEvent.MediaConnected)

    /**
     * Begin a call for [config]. Inert unless the FSM is idle, so a re-entrant
     * `start` (e.g. a recomposition re-firing the launch effect) never resets a
     * call already in flight. Resets the local media intent to the call's kind and
     * adopts the config's [CallConfig.callId] (blank for an outgoing call, which
     * mints its own via the ACK).
     */
    fun start(config: CallConfig) {
        if (!callState.canStart) return
        this.config = config
        this.media = CallMedia(isCameraOn = config.isVideo)
        this.callId = config.callId
        this.elapsedSeconds = 0L
        this.connectionQuality = null
        this.waiting = CallWaitingState.EMPTY
        stopTicker()
        stopQuality()
        stopWaitingTimer()
        if (config.isOutgoing) startOutgoing(config) else dispatch(CallEvent.ReceiveIncoming)
    }

    /**
     * Ring immediately (instant feedback), then place the call over the wire. The
     * initiate ACK mints the real [callId]; a gateway rejection / timeout / bad ACK
     * settles the ringing call to `Ended(Failed)` via the FSM's terminal path.
     */
    private fun startOutgoing(config: CallConfig) {
        dispatch(CallEvent.StartOutgoing)
        viewModelScope.launch {
            when (val result = signalManager.emitInitiate(config.conversationId, config.isVideo)) {
                is CallInitiateResult.Success -> {
                    callId = result.ack.callId
                    coordinator.startOutgoing(
                        viewModelScope, callId, result.ack.iceServers, config.peerId, selfId,
                        config.isVideo, ::onMediaConnected,
                    )
                }
                is CallInitiateResult.ServerError -> dispatch(CallEvent.ConnectionFailed(result.message))
                CallInitiateResult.Timeout -> dispatch(CallEvent.ConnectionFailed(INITIATE_TIMED_OUT))
                CallInitiateResult.Malformed -> dispatch(CallEvent.ConnectionFailed(INITIATE_MALFORMED))
            }
        }
    }

    /**
     * Local user accepts an incoming call — answer the FSM, join the room, and
     * request fresh ICE servers (absent from the `call:initiated` frame); the media
     * connection opens in [onIceServersRefreshed] once they arrive.
     */
    fun accept() {
        dispatch(CallEvent.LocalAnswer)
        emitIfIdentified(signalManager::emitJoin)
        awaitingIncomingIce = true
        emitIfIdentified(signalManager::emitRequestIceServers)
    }

    /** Local user declines an incoming call — reject the FSM and end it on the wire. */
    fun decline() {
        dispatch(CallEvent.Reject)
        emitIfIdentified(signalManager::emitEnd)
        coordinator.end()
    }

    /** Local user hangs up an active call — end the FSM and the call on the wire. */
    fun hangUp() {
        dispatch(CallEvent.LocalHangUp)
        emitIfIdentified(signalManager::emitEnd)
        coordinator.end()
    }

    /** Feed a signalling/remote event directly (peer joined, answer, stall, remote end…). */
    fun onSignal(event: CallEvent) = dispatch(event)

    /** Toggle the local microphone mute and signal the peer. */
    fun toggleMute() {
        media = media.copy(isMuted = !media.isMuted)
        publish()
        coordinator.setMuted(media.isMuted)
        emitIfIdentified { signalManager.emitToggleAudio(it, enabled = !media.isMuted) }
    }

    /** Video tracks + EGL context for [CallScreen]'s renderers (video calls only). */
    val eglBaseContext get() = coordinator.eglBaseContext
    val localVideoTrack get() = coordinator.localVideoTrack
    val remoteVideoTracks get() = coordinator.remoteVideoTracks

    /** Toggle the local camera (only meaningful on a video call) and signal the peer. */
    fun toggleCamera() {
        media = media.copy(isCameraOn = !media.isCameraOn)
        publish()
        coordinator.setCameraEnabled(media.isCameraOn)
        emitIfIdentified { signalManager.emitToggleVideo(it, enabled = media.isCameraOn) }
    }

    /** Settle a terminal call back to idle (dismissing the ended screen). */
    fun dismiss() = dispatch(CallEvent.Settle)

    // --- Call waiting: a second incoming call while this one is active ------

    /**
     * A second incoming offer arrived on the socket. It becomes a call-waiting
     * banner **only** while a call is already active (parity with iOS busy-path)
     * and only for a *different* call than the one in progress — a redelivery of
     * the active call's own offer is ignored. A newer offer replaces an older
     * pending one and restarts the auto-dismiss window.
     */
    private fun onIncomingOffer(call: WaitingCall) {
        if (!callState.isActive) return
        if (call.callId == callId) return
        waitingReduce(CallWaitingEvent.Offered(call))
        startWaitingTimer(call.callId)
    }

    /**
     * Reject the waiting call: end it on the wire (keyed by its own id, leaving
     * the active call untouched) and dismiss the banner. Also the resolution the
     * 15 s auto-dismiss reuses — an ignored banner must free the caller, not leave
     * them ringing.
     */
    fun rejectWaiting() {
        val pending = waiting.pending ?: return
        stopWaitingTimer()
        endWaiting(pending)
    }

    /**
     * End-this-and-answer: dismiss the banner, hang up the active call, settle it,
     * and re-present the waiting call as a fresh incoming call the user answers
     * normally (parity with iOS `endCurrentAndAnswerPending`, which re-reports the
     * pending call after tearing down the active one).
     */
    fun acceptWaitingSwap() {
        val pending = waiting.pending ?: return
        stopWaitingTimer()
        waitingReduce(CallWaitingEvent.Accepted)
        hangUp()
        dispatch(CallEvent.Settle)
        start(
            CallConfig(
                peerId = pending.callerId,
                peerName = pending.callerName,
                isVideo = pending.isVideo,
                isOutgoing = false,
                callId = pending.callId,
            ),
        )
    }

    /**
     * A call ended remotely (`call:ended` / `call:missed`). This is the **sole**
     * teardown path, gated on identity so only the *right* call is torn down:
     *  - the ended id is the **active** call's → reduce the FSM by the carried
     *    event (`RemoteHangUp` / `RingTimeout`), ending the call the user is on.
     *  - the ended id is the **waiting** call's → its caller hung up (or the ring
     *    timed out) before the user chose, so the banner is dismissed and its
     *    auto-reject timer cancelled **without** an `emitEnd` (nothing is left to
     *    end once the caller has gone), leaving the active call untouched.
     *  - neither → inert. Crucially, the gateway fans a `call:ended` out to every
     *    member room, so a busy user also receives the *waiting* call's teardown;
     *    because teardown never rides the identity-less [CallSignalManager.events],
     *    that fan-out can no longer blindly reduce the active call's FSM.
     */
    private fun onRemoteEnded(signal: CallEndedSignal) {
        if (callId.isNotBlank() && signal.callId == callId) {
            dispatch(signal.event)
            coordinator.end()
            return
        }
        val pending = waiting.pending ?: return
        if (pending.callId != signal.callId) return
        stopWaitingTimer()
        waitingReduce(CallWaitingEvent.RemotelyEnded(signal.callId))
    }

    private fun endWaiting(pending: WaitingCall) {
        signalManager.emitEnd(pending.callId)
        waitingReduce(CallWaitingEvent.Rejected)
    }

    private fun startWaitingTimer(offeredId: String) {
        waitingTimerJob?.cancel()
        waitingTimerJob = viewModelScope.launch {
            waitingTimer.countdown().collect {
                val pending = waiting.pending ?: return@collect
                if (pending.callId != offeredId) return@collect
                // The single-shot countdown completes right after this — mark the
                // job done so `endWaiting` never cancels the coroutine it runs in.
                waitingTimerJob = null
                endWaiting(pending)
            }
        }
    }

    private fun stopWaitingTimer() {
        waitingTimerJob?.cancel()
        waitingTimerJob = null
    }

    private fun waitingReduce(event: CallWaitingEvent) {
        waiting = CallWaitingReducer.reduce(waiting, event)
        publish()
    }

    /** Runs [emit] with the current [callId] only once one is known — inert otherwise. */
    private inline fun emitIfIdentified(emit: (String) -> Unit) {
        if (callId.isNotBlank()) emit(callId)
    }

    private fun dispatch(event: CallEvent) {
        val previous = callState
        callState = CallStateMachine.reduce(previous, event)
        driveTone(previous, callState)
        driveTelecom(previous, callState)
        syncTicker()
        syncQuality()
        publish()
    }

    /**
     * Report each genuine FSM edge to the OS telecom layer via the pure
     * [TelecomCallPolicy]: the policy dedupes inert edges (an already-active call,
     * a phantom disconnect, a settle back to idle) to `null`, so the reporter only
     * ever sees a real connection transition.
     */
    private fun driveTelecom(previous: CallState, next: CallState) {
        TelecomCallPolicy.plan(previous, next)?.let(telecomReporter::report)
    }

    /**
     * Turn each FSM edge into call audio via the pure [CallSoundPolicy]: switch the
     * loop only when it genuinely changes (so an inert event never restarts the
     * ringback) and fire the one-shot cue the edge carries.
     */
    private fun driveTone(previous: CallState, next: CallState) {
        val plan = CallSoundPolicy.plan(previous, next)
        if (plan.loop != activeLoop) {
            activeLoop = plan.loop
            toneController.setLoop(plan.loop)
        }
        plan.cue?.let(toneController::playCue)
    }

    override fun onCleared() {
        toneController.release()
        telecomReporter.release()
    }

    /**
     * Runs the 1-Hz timer exactly while media is (or is being re-)established
     * ([CallState.Connected]/[CallState.Reconnecting]) and stops it on any other
     * phase — so the elapsed count freezes at the call's final length once ended.
     */
    private fun syncTicker() {
        val clockRunning = callState is CallState.Connected || callState is CallState.Reconnecting
        if (clockRunning) startTickerIfNeeded() else stopTicker()
    }

    private fun startTickerIfNeeded() {
        if (tickerJob != null) return
        tickerJob = viewModelScope.launch {
            ticker.seconds.collect {
                elapsedSeconds += 1
                publish()
            }
        }
    }

    private fun stopTicker() {
        tickerJob?.cancel()
        tickerJob = null
    }

    /**
     * Collects live quality samples exactly while media is (or is being
     * re-)established, mapping each through the pure [ConnectionQuality] SSOT; on
     * any other phase the collection stops and the last reading is cleared so a
     * stale bar count never lingers past the connected window.
     */
    private fun syncQuality() {
        val clockRunning = callState is CallState.Connected || callState is CallState.Reconnecting
        if (clockRunning) startQualityIfNeeded() else stopQuality()
    }

    private fun startQualityIfNeeded() {
        if (qualityJob != null) return
        qualityJob = viewModelScope.launch {
            qualitySampler.samples.collect { sample ->
                connectionQuality = ConnectionQuality.from(sample.level())
                publish()
            }
        }
    }

    private fun stopQuality() {
        qualityJob?.cancel()
        qualityJob = null
        connectionQuality = null
    }

    private fun publish() {
        _state.value = CallPresenter.present(callState, config, media, elapsedSeconds, connectionQuality, waiting)
    }

    private companion object {
        const val INITIATE_TIMED_OUT = "call:initiate timed out"
        const val INITIATE_MALFORMED = "malformed call:initiate ack"
    }
}
