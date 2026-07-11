package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallAnalytics
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallEndedSignal
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallInitiateResult
import me.meeshy.sdk.model.call.CallJoinResult
import me.meeshy.sdk.model.call.CallMediaTogglePayload
import me.meeshy.sdk.model.call.CallQualityAlertPayload
import me.meeshy.sdk.model.call.CallScreenCaptureAlertPayload
import me.meeshy.sdk.model.call.CallTranslatedSegmentPayload
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
import me.meeshy.sdk.socket.AppStatePresenceReporter
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
    private val heartbeatTicker: CallHeartbeatTicker,
    private val appStatePresence: AppStatePresenceReporter,
    private val qualityResetTimer: CallQualityResetTimer,
    private val screenRecordingDetector: ScreenRecordingDetector,
    private val clock: CallClock,
    private val reconnectBudget: CallReconnectBudget,
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

    /** Emits `call:heartbeat` each [CallHeartbeatTicker] beat; alive only while media is flowing. */
    private var heartbeatJob: Job? = null

    /** Relays local screen-recording edges to the gateway; alive only while media is flowing. */
    private var screenCaptureReportJob: Job? = null

    /** The armed per-attempt reconnection window; escalates ReconnectFailed on expiry. */
    private var reconnectBudgetJob: Job? = null

    /** The exact Reconnecting state the window was armed for — an attempt bump re-arms. */
    private var reconnectBudgetArmedFor: CallState? = null

    /**
     * The last capture state actually SENT this call, or `null` when none was.
     * Dedupes the detector's re-emissions AND keeps the initial "not capturing"
     * silent — the peer assumes no capture by default, only edges are news.
     */
    private var lastReportedCapture: Boolean? = null

    /** At most one second incoming call awaiting an accept-swap / reject decision. */
    private var waiting: CallWaitingState = CallWaitingState.EMPTY

    /** The 15 s auto-dismiss timer for the current banner; cancelled on any resolution. */
    private var waitingTimerJob: Job? = null

    /** The REMOTE peer's sustained-bad-network flag (`call:quality-alert`). */
    private var peerQualityDegraded: Boolean = false

    /** The 15 s silence window that auto-clears [peerQualityDegraded]; restarted per alert. */
    private var qualityResetJob: Job? = null

    /** The remote peer's live screen-capture flag (`call:screen-capture-alert`). */
    private var peerScreenCapturing: Boolean = false

    /** The latest live caption from the remote speaker (`call:translated-segment`). */
    private var caption: String? = null

    /** The remote peer's mic state (`call:media-toggled` audio); `true` until told otherwise. */
    private var peerAudioEnabled: Boolean = true

    /** The remote peer's camera state (`call:media-toggled` video); `true` until told otherwise. */
    private var peerVideoEnabled: Boolean = true

    /**
     * The pure once-per-call telemetry accumulator behind `call:analytics`,
     * created by [start] and folded on FSM edges + quality samples; `null`
     * after the terminal report so a settle can never re-emit.
     */
    private var analytics: CallAnalytics? = null

    private val _state = MutableStateFlow(CallPresenter.present(callState, config, media, elapsedSeconds))
    val state: StateFlow<CallUiState> = _state.asStateFlow()

    /**
     * The immutable inputs of the call currently in flight. Read by the app shell
     * ([MeeshyApp]) to rebuild the call route when the floating pill re-opens a
     * minimised call — the Activity-scoped instance is reused on arrival, so the
     * screen's re-entrant [start] is inert and the live call is left untouched.
     * Reflects the last [start] config, or [CallConfig.EMPTY] while idle.
     */
    val activeConfig: CallConfig get() = config

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
        viewModelScope.launch {
            appStatePresence.foreground.collect(::onAppStateChanged)
        }
        viewModelScope.launch {
            signalManager.qualityAlerts.collect(::onQualityAlert)
        }
        viewModelScope.launch {
            signalManager.screenCaptureAlerts.collect(::onScreenCaptureAlert)
        }
        viewModelScope.launch {
            signalManager.translatedSegments.collect(::onTranslatedSegment)
        }
        viewModelScope.launch {
            signalManager.mediaToggles.collect(::onMediaToggle)
        }
    }

    // --- Peer indicators: quality / screen-capture / captions (audit #5) ----

    /**
     * The gateway flags the REMOTE peer's sustained bad network. Gated on the
     * active call's id (a fan-out for another call is inert); each fresh alert
     * restarts the 15 s silence window, so the indicator stays up exactly as
     * long as alerts keep arriving — iOS `isRemoteQualityDegraded` parity.
     */
    private fun onQualityAlert(alert: CallQualityAlertPayload) {
        if (callId.isBlank() || alert.callId != callId) return
        peerQualityDegraded = true
        publish()
        restartQualityResetWindow()
    }

    /** The remote peer started/stopped capturing the call — flip the privacy banner. */
    private fun onScreenCaptureAlert(alert: CallScreenCaptureAlertPayload) {
        if (callId.isBlank() || alert.callId != callId) return
        peerScreenCapturing = alert.isCapturing
        publish()
    }

    /** A live caption landed — prefer the server-side translation over the original. */
    private fun onTranslatedSegment(segment: CallTranslatedSegmentPayload) {
        if (callId.isBlank() || segment.callId != callId) return
        caption = segment.segment.translatedText ?: segment.segment.text
        publish()
    }

    /**
     * The remote peer muted/unmuted the mic or toggled the camera — flip the
     * matching indicator (iOS `isRemoteAudioEnabled`/`isRemoteVideoEnabled`
     * parity). Gated on the active call's id; an unknown `mediaType` is inert
     * (never a blind flip).
     */
    private fun onMediaToggle(toggle: CallMediaTogglePayload) {
        if (callId.isBlank() || toggle.callId != callId) return
        when (toggle.mediaType) {
            "audio" -> peerAudioEnabled = toggle.enabled
            "video" -> peerVideoEnabled = toggle.enabled
            else -> return
        }
        publish()
    }

    private fun restartQualityResetWindow() {
        qualityResetJob?.cancel()
        qualityResetJob = viewModelScope.launch {
            qualityResetTimer.countdown().collect {
                qualityResetJob = null
                peerQualityDegraded = false
                publish()
            }
        }
    }

    private fun clearPeerIndicators() {
        qualityResetJob?.cancel()
        qualityResetJob = null
        peerQualityDegraded = false
        peerScreenCapturing = false
        caption = null
        peerAudioEnabled = true
        peerVideoEnabled = true
    }

    /**
     * Transition foreground/background du process pendant un appel actif —
     * relaie `call:backgrounded`/`foregrounded` pour que le gateway étende la
     * tolérance heartbeat (grâce 5 min) au lieu de couper l'appel quand
     * l'utilisateur met l'app en arrière-plan (audit appels 2026-07-11 #5).
     * Inerte hors appel, avant identification, ou sans session (le schéma
     * gateway exige un participantId non vide ; le serveur résout le vrai).
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
     * Fold a remote FSM event, then drive the WebRTC media: the caller sends its
     * SDP offer only once the peer has actually joined the room ([CallEvent
     * .ParticipantJoined]) — offering earlier races the callee's connection.
     */
    private fun onRemoteEvent(event: CallEvent) {
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
        this.analytics = CallAnalytics(startedAtMs = clock.nowMs())
        stopTicker()
        stopQuality()
        stopWaitingTimer()
        stopReconnectBudget()
        clearPeerIndicators()
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
                        config.isVideo, ::onMediaConnected, ::onMediaStalled,
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
        if (callId.isBlank()) return
        // Join WITH the ACK (parity with iOS emitCallJoinWithAck): the ACK confirms
        // this socket is in the call room AND carries the callee's ICE servers, so
        // media opens straight away. The prior fire-and-forget join + immediate
        // call:request-ice-servers raced the not-yet-joined room -> NOT_A_PARTICIPANT
        // ("Not in call room") the instant the user answered.
        viewModelScope.launch {
            when (val result = signalManager.emitJoinAwaitingAck(callId)) {
                is CallJoinResult.Success -> coordinator.startIncoming(
                    viewModelScope, callId, result.iceServers, config.peerId, selfId, config.isVideo,
                    ::onMediaConnected, ::onMediaStalled,
                )
                is CallJoinResult.Failure -> dispatch(CallEvent.ConnectionFailed(result.message))
            }
        }
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
        foldAnalytics(previous, callState)
        syncTicker()
        syncQuality()
        syncHeartbeat()
        syncScreenCaptureReport()
        syncReconnectBudget()
        syncPeerIndicators()
        publish()
    }

    /**
     * Folds the FSM edge into the pure [CallAnalytics] accumulator and fires the
     * ONE terminal `call:analytics` on entry into Ended (iOS parity:
     * `emitCallAnalyticsSnapshot` at teardown). A settle (Ended → Idle) can never
     * re-emit — the accumulator is consumed by the report.
     */
    private fun foldAnalytics(previous: CallState, next: CallState) {
        if (previous !is CallState.Connected && next is CallState.Connected) {
            analytics = analytics?.connected(clock.nowMs())
        }
        if (next is CallState.Reconnecting && previous != next) {
            analytics = analytics?.reconnecting()
        }
        if (previous !is CallState.Ended && next is CallState.Ended) {
            reportAnalytics(next.reason)
        }
    }

    /**
     * Inert without a minted [callId] (an initiate rejected before the ACK has
     * nothing the gateway could attach the telemetry to). Fire-and-forget.
     */
    private fun reportAnalytics(reason: CallEndReason) {
        val report = analytics ?: return
        analytics = null
        if (callId.isBlank()) return
        signalManager.emitAnalytics(
            callId,
            report.fields(
                durationSeconds = elapsedSeconds,
                isVideo = config.isVideo,
                endReason = reason,
                deviceModel = deviceModel(),
            ),
        )
    }

    /** `Build.MODEL` is null on plain-JVM unit tests — "unknown" beats a crash. */
    private fun deviceModel(): String =
        runCatching { android.os.Build.MODEL }.getOrNull() ?: "unknown"

    /**
     * Peer indicators (quality/capture/caption) die with the call: a terminal or
     * idle phase drops them and the pending reset window, so a banner from one
     * call can never leak onto the ended screen or a subsequent call (parity with
     * iOS, which resets `isRemoteScreenCapturing` on call end).
     */
    private fun syncPeerIndicators() {
        if (callState is CallState.Ended || callState is CallState.Idle) clearPeerIndicators()
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
                analytics = analytics?.plusSample(sample)
                publish()
            }
        }
    }

    private fun stopQuality() {
        qualityJob?.cancel()
        qualityJob = null
        connectionQuality = null
    }

    /**
     * Emits the gateway liveness heartbeat exactly while media is (or is being
     * re-)established — same window as the ticker/quality jobs. Without it a
     * dead device is indistinguishable from a live one server-side and zombie
     * calls linger until the 2 h GC.
     */
    private fun syncHeartbeat() {
        val clockRunning = callState is CallState.Connected || callState is CallState.Reconnecting
        if (clockRunning) startHeartbeatIfNeeded() else stopHeartbeat()
    }

    private fun startHeartbeatIfNeeded() {
        if (heartbeatJob != null) return
        heartbeatJob = viewModelScope.launch {
            heartbeatTicker.beats.collect {
                emitIfIdentified(signalManager::emitHeartbeat)
            }
        }
    }

    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    /**
     * Relays the OS "this app's screen is being recorded" signal to the gateway
     * (`call:screen-capture-detected` → privacy alert on the peer) exactly while
     * media is (or is being re-)established — the same window as the heartbeat.
     * iOS parity: `UIScreen.capturedDidChangeNotification` relay.
     */
    private fun syncScreenCaptureReport() {
        val clockRunning = callState is CallState.Connected || callState is CallState.Reconnecting
        if (clockRunning) startScreenCaptureReportIfNeeded() else stopScreenCaptureReport()
    }

    private fun startScreenCaptureReportIfNeeded() {
        if (screenCaptureReportJob != null) return
        screenCaptureReportJob = viewModelScope.launch {
            screenRecordingDetector.states.collect(::reportScreenCapture)
        }
    }

    /**
     * Edge-only relay: the initial "not capturing" is the peer's default
     * assumption (nothing to say), a repeat changes nothing, and a stop is only
     * news after a reported start. Inert before identification or without a
     * session — the gateway schema requires a non-empty participantId (it
     * resolves the real one server-side, anti-spoofing).
     */
    private fun reportScreenCapture(isCapturing: Boolean) {
        if (isCapturing == lastReportedCapture) return
        if (!isCapturing && lastReportedCapture == null) return
        if (callId.isBlank()) return
        val self = selfId
        if (self.isBlank()) return
        lastReportedCapture = isCapturing
        signalManager.emitScreenCaptureDetected(callId, self, isCapturing)
    }

    private fun stopScreenCaptureReport() {
        screenCaptureReportJob?.cancel()
        screenCaptureReportJob = null
        lastReportedCapture = null
    }

    /**
     * Arms one [CallReconnectBudget] window per DISTINCT Reconnecting state —
     * an attempt bump is a fresh window — and tears it down on any other phase.
     * Without this watchdog nothing ever fired [CallEvent.ReconnectFailed]: a
     * stall that never recovered left the user on « Reconnexion… » forever,
     * the server never cleaning up because the socket heartbeats survive the
     * dead media (iOS parity: the `.reconnecting` watchdog, 10 s × 3 attempts
     * ≈ 30 s bounded before `connectionLost`).
     */
    private fun syncReconnectBudget() {
        val state = callState
        if (state !is CallState.Reconnecting) {
            stopReconnectBudget()
            return
        }
        if (state == reconnectBudgetArmedFor) return
        reconnectBudgetArmedFor = state
        reconnectBudgetJob?.cancel()
        reconnectBudgetJob = viewModelScope.launch {
            reconnectBudget.countdown().collect {
                onReconnectBudgetExpired()
            }
        }
    }

    /**
     * Escalate: the FSM either bumps to the next attempt — nudged by a fresh
     * ICE restart, covering the DISCONNECTED-forever stall that never turns
     * FAILED — or ends the call `connectionLost`, which must ALSO reach the
     * wire and tear the media down (the peer would otherwise stay in a
     * zombie call; same duty as [hangUp]).
     */
    private fun onReconnectBudgetExpired() {
        dispatch(CallEvent.ReconnectFailed)
        if (callState is CallState.Ended) {
            emitIfIdentified(signalManager::emitEnd)
            coordinator.end()
        } else {
            coordinator.retryIceRestart()
        }
    }

    private fun stopReconnectBudget() {
        reconnectBudgetJob?.cancel()
        reconnectBudgetJob = null
        reconnectBudgetArmedFor = null
    }

    private fun publish() {
        _state.value = CallPresenter.present(
            callState, config, media, elapsedSeconds, connectionQuality, waiting,
            peerQualityDegraded, peerScreenCapturing, caption,
            peerAudioEnabled, peerVideoEnabled,
        )
    }

    private companion object {
        const val INITIATE_TIMED_OUT = "call:initiate timed out"
        const val INITIATE_MALFORMED = "malformed call:initiate ack"
    }
}
