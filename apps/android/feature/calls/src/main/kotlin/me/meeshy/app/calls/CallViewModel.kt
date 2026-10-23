package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallEndedSignal
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallInitiateResult
import me.meeshy.sdk.model.call.CallJoinResult
import me.meeshy.sdk.model.call.CallRetryPolicy
import me.meeshy.sdk.model.call.CallSound
import me.meeshy.sdk.model.call.CallSoundPolicy
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallStateMachine
import me.meeshy.sdk.model.call.ConnectionQuality
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.TelecomCallPolicy
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.AppStatePresenceReporter
import me.meeshy.sdk.socket.CallSignalManager
import javax.inject.Inject

/**
 * UDF ViewModel driving the pure [CallStateMachine], folded onto the live
 * transport. It owns the current [CallState], the local [CallMedia] intent and the
 * server [callId] every outbound emit is keyed by, republishing an immutable
 * [CallUiState] via [CallPresenter]: it **folds in** remote signalling, **places**
 * an outgoing call (the ring shows instantly, the ACK mints the real id) and
 * **fans out** local actions. Every *decision* lives in the FSM and the presenter;
 * the other slices of the call have an owner this class only sequences
 * ([CallPeerIndicatorsController], [CallWaitingController],
 * [CallWatchdogsController], [CallAnalyticsController]), and capabilities beyond
 * the core call plug into [extensions].
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
    private val appStatePresence: AppStatePresenceReporter,
    private val peers: CallPeerIndicatorsController,
    private val waiting: CallWaitingController,
    private val watchdogs: CallWatchdogsController,
    private val analytics: CallAnalyticsController,
    /** The seams capabilities plug into; the call screen reads the UI ones from here. */
    val extensions: CallExtensionPoints,
    private val ongoing: CallOngoingController,
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
    private var mediaEstablished = false

    /** The 1-Hz timer job; alive only while media is (or was) flowing this call. */
    private var tickerJob: Job? = null

    /** The latest connection-quality indicator tier, or `null` until a sample arrives. */
    private var connectionQuality: ConnectionQuality? = null

    /** Collects [CallQualitySampler.samples]; alive only while media is flowing. */
    private var qualityJob: Job? = null

    /** `true` while the app itself froze the outgoing video ([CallVideoHealth]). */
    private var videoAutoPaused: Boolean = false

    /** What the collaborators may read of this session, and the one door back into it. */
    private val host = object : CallSessionHost {
        override val scope: CoroutineScope get() = viewModelScope
        override val config: CallConfig get() = this@CallViewModel.config
        override val callId: String get() = this@CallViewModel.callId
        override val selfId: String get() = this@CallViewModel.selfId
        override val callState: CallState get() = this@CallViewModel.callState
        override val elapsedSeconds: Long get() = this@CallViewModel.elapsedSeconds
        override fun dispatch(event: CallEvent) = this@CallViewModel.dispatch(event)
        override fun endMedia() = coordinator.end()
        override fun restartMediaIce() = coordinator.retryIceRestart()
        override fun publish() = this@CallViewModel.publish()
    }

    private val _state = MutableStateFlow(CallPresenter.present(callState, config, media, elapsedSeconds))
    val state: StateFlow<CallUiState> = _state.asStateFlow()

    /**
     * The inputs of the call in flight — read by the app shell to rebuild the call
     * route when the floating pill re-opens a minimised call (the Activity-scoped
     * instance is reused, so the screen's re-entrant [start] is inert).
     * [CallConfig.EMPTY] while idle.
     */
    val activeConfig: CallConfig get() = config

    init {
        peers.attach(host)
        waiting.attach(host)
        watchdogs.attach(host)
        analytics.attach(host)
        ongoing.attach(viewModelScope, state, onHangUp = ::hangUp, onToggleMute = ::toggleMute)
        viewModelScope.launch {
            signalManager.events.collect(::onRemoteEvent)
        }
        viewModelScope.launch {
            signalManager.endedCalls.collect(::onRemoteEnded)
        }
        viewModelScope.launch {
            signalManager.iceServersRefreshed.collect(::onIceServersRefreshed)
        }
        viewModelScope.launch {
            appStatePresence.foreground.collect(::onAppStateChanged)
        }
        viewModelScope.launch {
            extensions.videoHealth.isVideoAutoPaused.collect(::onVideoHealthChanged)
        }
    }

    /** The app froze (or released) the outgoing video — only the UI state changes. */
    private fun onVideoHealthChanged(paused: Boolean) {
        if (paused == videoAutoPaused) return
        videoAutoPaused = paused
        publish()
    }

    /**
     * App foreground/background during an active call: relays `call:backgrounded`
     * / `foregrounded` so the gateway extends the heartbeat grace (5 min) instead
     * of cutting the call. Inert off-call, before identification or without a session.
     */
    private fun onAppStateChanged(foreground: Boolean?) {
        if (foreground == null) return
        if (!callState.isActive || callId.isBlank()) return
        val self = selfId
        if (self.isBlank()) return
        if (foreground) signalManager.emitForegrounded(callId, self)
        else signalManager.emitBackgrounded(callId, self)
    }

    /**
     * Capabilities hear a remote event first (the cause), then it is folded into
     * the FSM. The caller sends its SDP offer only once the peer has joined the
     * room ([CallEvent.ParticipantJoined]) — offering earlier races the callee.
     */
    private fun onRemoteEvent(event: CallEvent) {
        extensions.controllers.notifyRemoteEvent(event, session())
        dispatch(event)
        if (event is CallEvent.ParticipantJoined) coordinator.onParticipantJoined(event.peerId)
    }

    /** A fresh TURN set landed (refresh) → hand it to the engine mid-call. */
    private fun onIceServersRefreshed(iceServers: List<SocketIceServer>) {
        if (!awaitingIncomingIce) return
        awaitingIncomingIce = false
        coordinator.startIncoming(
            viewModelScope, callId, iceServers, config.peerId, selfId, config.isVideo,
            ::onMediaConnected, ::onMediaStalled,
        )
    }

    /** WebRTC reports the media path is up → advance the FSM to Connected. */
    private fun onMediaConnected() = dispatch(CallEvent.MediaConnected)

    /** WebRTC reports a mid-call ICE stall → FSM Reconnecting (« Reconnexion… »). */
    private fun onMediaStalled() = dispatch(CallEvent.ConnectionStalled)

    /**
     * Begin a call for [config]. Inert unless the FSM is idle, so a re-entrant
     * `start` (a recomposition re-firing the launch effect) never resets a call in
     * flight. Resets the media intent to the call's kind and adopts the config's
     * [CallConfig.callId] (blank for an outgoing call, which mints its own).
     */
    fun start(config: CallConfig) {
        if (!callState.canStart) return
        this.config = config
        // iOS parity (`isSpeaker = isVideo`): video defaults to the loudspeaker.
        this.media = CallMedia(isCameraOn = config.isVideo, isSpeakerOn = config.isVideo)
        this.callId = config.callId
        this.elapsedSeconds = 0L
        this.mediaEstablished = false
        this.connectionQuality = null
        waiting.reset()
        analytics.begin()
        stopTicker()
        stopQuality()
        watchdogs.reset()
        peers.clear()
        if (config.isOutgoing) startOutgoing(config) else dispatch(CallEvent.ReceiveIncoming)
    }

    /**
     * Ring immediately, then place the call over the wire: the initiate ACK mints
     * the real [callId]; a rejection / timeout / bad ACK settles to `Ended(Failed)`.
     */
    private fun startOutgoing(config: CallConfig) {
        dispatch(CallEvent.StartOutgoing)
        viewModelScope.launch {
            when (val result = signalManager.emitInitiate(config.conversationId, config.isVideo)) {
                is CallInitiateResult.Success -> {
                    callId = result.ack.callId
                    coordinator.startOutgoing(
                        viewModelScope, callId, result.ack.iceServers, config.peerId, selfId,
                        config.isVideo, ::onMediaConnected, ::onMediaStalled,
                    )
                }
                is CallInitiateResult.ServerError -> dispatch(CallEvent.ConnectionFailed(result.message))
                CallInitiateResult.Timeout -> dispatch(CallEvent.ConnectionFailed(INITIATE_TIMED_OUT))
                CallInitiateResult.Malformed -> dispatch(CallEvent.ConnectionFailed(INITIATE_MALFORMED))
            }
        }
    }

    /** Local user accepts an incoming call — answer the FSM, join the room, open the media. */
    fun accept() {
        dispatch(CallEvent.LocalAnswer)
        if (callId.isBlank()) return
        // Join WITH the ACK (iOS emitCallJoinWithAck parity): it confirms this socket
        // is in the room AND carries the ICE servers, so media opens straight away.
        // A fire-and-forget join raced the room -> NOT_A_PARTICIPANT on answer.
        viewModelScope.launch {
            when (val result = signalManager.emitJoinAwaitingAck(callId)) {
                is CallJoinResult.Success -> coordinator.startIncoming(
                    viewModelScope, callId, result.iceServers, config.peerId, selfId, config.isVideo,
                    ::onMediaConnected, ::onMediaStalled, speakerOn = media.isSpeakerOn,
                )
                is CallJoinResult.Failure -> dispatch(CallEvent.ConnectionFailed(result.message))
            }
        }
    }

    /** Local user declines an incoming call — reject the FSM and end it on the wire. */
    fun decline() {
        dispatch(CallEvent.Reject)
        // reason=rejected: else the server resolves this pre-answer end as missed.
        emitIfIdentified { signalManager.emitEnd(it, reason = END_REASON_REJECTED) }
        coordinator.end()
    }

    /** Local user hangs up an active call — end the FSM and the call on the wire. */
    fun hangUp() {
        dispatch(CallEvent.LocalHangUp)
        emitIfIdentified { signalManager.emitEnd(it) }
        coordinator.end()
    }

    /** Feed a signalling event directly (peer joined, answer, stall, remote end…). */
    fun onSignal(event: CallEvent) = dispatch(event)

    /** Toggle the local microphone mute and signal the peer. */
    fun toggleMute() {
        media = media.copy(isMuted = !media.isMuted)
        publish()
        coordinator.setMuted(media.isMuted)
        emitIfIdentified { signalManager.emitToggleAudio(it, enabled = !media.isMuted) }
    }

    /** Toggle the speaker/earpiece route — purely local, the peer is never told. */
    fun toggleSpeaker() {
        media = media.copy(isSpeakerOn = !media.isSpeakerOn)
        publish()
        coordinator.setSpeakerEnabled(media.isSpeakerOn)
    }

    /** Video tracks + EGL context for [CallScreen]'s renderers (video calls only). */
    val eglBaseContext get() = coordinator.eglBaseContext

    /** Le serveur-id de l'appel en cours (vide avant que l'ACK ne le donne) : la clé par appel des surfaces. */
    val activeCallId: String get() = callId
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

    /**
     * « Réessayer » a transiently-failed call: settle the ended screen, then
     * re-initiate a FRESH outgoing call (blank callId → the ACK mints a new one).
     * Inert unless the ended reason is retryable — a hangup never re-dials.
     */
    fun retry() {
        val ended = callState as? CallState.Ended ?: return
        if (!CallRetryPolicy.isRetryable(ended.reason)) return
        val previous = config
        dispatch(CallEvent.Settle)
        start(previous.copy(callId = "", isOutgoing = true))
    }

    /** Reject the waiting call (also the resolution of the banner's 15 s auto-dismiss). */
    fun rejectWaiting() = waiting.reject()

    /**
     * End-this-and-answer (iOS `endCurrentAndAnswerPending`): dismiss the banner,
     * hang up and settle the active call, then re-present the waiting call as a
     * fresh incoming call the user answers normally.
     */
    fun acceptWaitingSwap() {
        val pending = waiting.accept() ?: return
        hangUp()
        dispatch(CallEvent.Settle)
        start(
            CallConfig(
                peerId = pending.callerId,
                peerName = pending.callerName,
                isVideo = pending.isVideo,
                isOutgoing = false,
                conversationId = pending.conversationId,
                callId = pending.callId,
            ),
        )
    }

    /**
     * A call ended remotely (`call:ended` / `call:missed`), gated on identity: the
     * **active** call's id reduces the FSM; the **waiting** call's id is
     * [waiting]'s to dismiss (the gateway fans every teardown out to every member
     * room); any other id is inert.
     */
    private fun onRemoteEnded(signal: CallEndedSignal) {
        if (callId.isNotBlank() && signal.callId == callId) {
            extensions.controllers.notifyRemoteEvent(signal.event, session())
            dispatch(signal.event)
            coordinator.end()
            return
        }
        waiting.onRemotelyEnded(signal.callId)
    }

    /** Runs [emit] with the current [callId] only once one is known — inert otherwise. */
    private inline fun emitIfIdentified(emit: (String) -> Unit) {
        if (callId.isNotBlank()) emit(callId)
    }

    private fun session(): CallSessionInfo = CallSessionInfo(callId, config)

    private fun dispatch(event: CallEvent) {
        val previous = callState
        callState = CallStateMachine.reduce(previous, event)
        if (callState is CallState.Connected) mediaEstablished = true
        driveTone(previous, callState)
        driveTelecom(previous, callState)
        analytics.onTransition(previous, callState)
        syncTicker()
        syncQuality()
        watchdogs.onTransition(callState)
        peers.onTransition(callState)
        if (callState != previous) extensions.controllers.notifyTransition(previous, callState, session())
        publish()
    }

    /** Report each genuine FSM edge to the OS telecom layer; [TelecomCallPolicy] drops inert edges. */
    private fun driveTelecom(previous: CallState, next: CallState) {
        TelecomCallPolicy.plan(previous, next)?.let(telecomReporter::report)
    }

    /** Turn each FSM edge into call audio: switch the loop only when it changes, fire the edge's cue. */
    private fun driveTone(previous: CallState, next: CallState) {
        val plan = CallSoundPolicy.plan(previous, next)
        if (plan.loop != activeLoop) {
            activeLoop = plan.loop
            toneController.setLoop(plan.loop)
        }
        plan.cue?.let(toneController::playCue)
    }

    override fun onCleared() {
        ongoing.detach()
        toneController.release()
        telecomReporter.release()
        extensions.controllers.notifyCleared()
    }

    /** The 1-Hz timer runs exactly while media flows, so the count freezes at the final length. */
    private fun syncTicker() {
        if (callState.carriesMedia) startTickerIfNeeded() else stopTicker()
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

    /** Quality samples are collected while media flows; the last reading is cleared when it stops. */
    private fun syncQuality() {
        if (callState.carriesMedia) startQualityIfNeeded() else stopQuality()
    }

    private fun startQualityIfNeeded() {
        if (qualityJob != null) return
        qualityJob = viewModelScope.launch {
            qualitySampler.samples.collect { sample ->
                connectionQuality = ConnectionQuality.from(sample.level())
                analytics.onSample(sample)
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
        val peer = peers.indicators
        _state.value = CallPresenter.present(
            callState, config, media, elapsedSeconds, connectionQuality, waiting.state,
            peer.qualityDegraded, peer.screenCapturing, peer.caption,
            peer.audioEnabled, peer.videoEnabled, videoAutoPaused, mediaEstablished,
        )
    }

    private companion object {
        const val INITIATE_TIMED_OUT = "call:initiate timed out"
        const val INITIATE_MALFORMED = "malformed call:initiate ack"
    }
}
