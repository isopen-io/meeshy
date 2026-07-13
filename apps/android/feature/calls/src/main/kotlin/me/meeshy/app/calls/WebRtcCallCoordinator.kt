package me.meeshy.app.calls

import android.content.Context
import android.media.AudioManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.plus
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.socket.CallSignalManager
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection
import org.webrtc.SessionDescription
import javax.inject.Inject

/**
 * App-side orchestration (NOT SDK) that binds the [WebRtcEngine] to the
 * [CallSignalManager] signaling for the lifetime of one call. It drives the P2P
 * offer/answer/ICE exchange so the media path actually establishes — the missing
 * link that left Android calls stuck on "Connecting…".
 *
 * The engine and the signaling are SDK building blocks (opaque, agnostic); the
 * *policy* — who offers, on which event, glare handling — lives here, per the SDK
 * purity rule. One instance per [CallViewModel]; the engine it uses is shared.
 */
class WebRtcCallCoordinator @Inject constructor(
    private val engine: WebRtcEngine,
    private val signals: CallSignalManager,
    @ApplicationContext private val appContext: Context,
) {
    private val audioManager: AudioManager by lazy {
        appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

    private var callScope: CoroutineScope? = null
    private var callId: String = ""
    private var peerId: String = ""
    private var selfId: String = ""
    private var negotiationId: Int = 0
    private var connected: Boolean = false
    private var onMediaConnected: (() -> Unit)? = null

    /** Whether WE placed this call — the initial caller re-offers on an ICE restart (anti-glare). */
    private var isCaller: Boolean = false

    /** `true` between a mid-call ICE stall and its recovery; gates the reconnect signalling. */
    private var stalled: Boolean = false

    /** 1-based count of stall cycles this call, carried on `call:reconnecting`. */
    private var reconnectAttempt: Int = 0

    private var onMediaStalled: (() -> Unit)? = null

    /** The EGL context every [org.webrtc.SurfaceViewRenderer] must init with. */
    val eglBaseContext get() = engine.eglBase.eglBaseContext

    /** The local camera preview track (video calls only), for the self PiP. */
    val localVideoTrack get() = engine.localVideoTrack

    /** The remote video track stream, for the full-screen remote renderer. */
    val remoteVideoTracks get() = engine.remoteVideoTracks

    /** Caller: opens the connection now; the SDP offer is sent on [onParticipantJoined]. */
    fun startOutgoing(
        scope: CoroutineScope,
        callId: String,
        iceServers: List<SocketIceServer>,
        peerId: String,
        selfId: String,
        isVideo: Boolean,
        onMediaConnected: () -> Unit,
        onMediaStalled: () -> Unit = {},
    ) = begin(scope, callId, iceServers, peerId, selfId, isVideo, isCaller = true, onMediaConnected, onMediaStalled)

    /** Callee: opens the connection now; the remote offer arrives via [incomingSignals]. */
    fun startIncoming(
        scope: CoroutineScope,
        callId: String,
        iceServers: List<SocketIceServer>,
        peerId: String,
        selfId: String,
        isVideo: Boolean,
        onMediaConnected: () -> Unit,
        onMediaStalled: () -> Unit = {},
    ) = begin(scope, callId, iceServers, peerId, selfId, isVideo, isCaller = false, onMediaConnected, onMediaStalled)

    private fun begin(
        scope: CoroutineScope,
        callId: String,
        iceServers: List<SocketIceServer>,
        peerId: String,
        selfId: String,
        isVideo: Boolean,
        isCaller: Boolean,
        onMediaConnected: () -> Unit,
        onMediaStalled: () -> Unit,
    ) {
        end()
        this.callId = callId
        this.peerId = peerId
        this.selfId = selfId
        this.connected = false
        this.negotiationId = 0
        this.isCaller = isCaller
        this.stalled = false
        this.reconnectAttempt = 0
        this.onMediaConnected = onMediaConnected
        this.onMediaStalled = onMediaStalled
        val cs = scope + SupervisorJob(scope.coroutineContext[Job])
        callScope = cs
        routeAudioToCall()
        engine.createConnection(iceServers, enableVideo = isVideo)
        observe(cs)
    }

    /** Caller only: the peer joined the room → create and send the SDP offer. */
    fun onParticipantJoined(joinerId: String? = null) {
        val cs = callScope ?: return
        // An outgoing call carries no peerId through the route; the joiner IS the
        // callee we must address, so adopt their id before offering — otherwise the
        // offer's `to` is blank and the gateway rejects it ("to field is required").
        joinerId?.takeIf { it.isNotBlank() }?.let { peerId = it }
        cs.launch {
            val offer = engine.createOffer()
            engine.setLocalDescription(offer)
            signals.emitOffer(callId, offer.description, to = peerId, from = selfId, negotiationId = negotiationId)
        }
    }

    fun setMuted(muted: Boolean) = engine.setAudioEnabled(!muted)

    fun setCameraEnabled(enabled: Boolean) = engine.setVideoEnabled(enabled)

    fun end() {
        callScope?.cancel()
        callScope = null
        engine.close()
        onMediaConnected = null
        onMediaStalled = null
        connected = false
        stalled = false
        reconnectAttempt = 0
        restoreAudio()
    }

    private fun observe(scope: CoroutineScope) {
        signals.incomingSignals
            .filter { it.callId == callId }
            .onEach { onRemoteSignal(it) }
            .launchIn(scope)

        engine.localIceCandidates
            .onEach { candidate ->
                signals.emitIceCandidate(
                    callId = callId,
                    candidate = candidate.sdp,
                    sdpMLineIndex = candidate.sdpMLineIndex,
                    sdpMid = candidate.sdpMid,
                    to = peerId,
                    from = selfId,
                    negotiationId = negotiationId,
                )
            }
            .launchIn(scope)

        engine.iceConnectionState
            .onEach(::onIceState)
            .launchIn(scope)
    }

    /**
     * Réconciliation ICE ↔ FSM/serveur — le maillon résilience qui manquait :
     * avant lui, un handoff réseau (WiFi→LTE) figeait le média Android pour
     * toujours, l'appel restant « actif » côté serveur (les heartbeats de la
     * socket survivent au média mort). Parité iOS `CallManager` :
     *  - `DISCONNECTED` mid-call = stall transitoire (souvent auto-guéri) —
     *    FSM Reconnecting + `call:reconnecting` (le serveur suspend son cleanup),
     *    sans restart : s'il dégénère, `FAILED` suit et restart alors.
     *  - `FAILED` mid-call = restart ICE immédiat + renégociation par
     *    l'APPELANT INITIAL seul (anti-glare), negotiationId incrémenté.
     *  - retour `CONNECTED`/`COMPLETED` après un stall = `call:reconnected`
     *    + MediaConnected (FSM Reconnecting → Connected).
     * L'ICE pré-connexion (checking initial) reste hors sujet : c'est la phase
     * Connecting de la FSM, pas un stall.
     */
    private fun onIceState(state: PeerConnection.IceConnectionState) {
        when (state) {
            PeerConnection.IceConnectionState.CONNECTED,
            PeerConnection.IceConnectionState.COMPLETED,
            -> onIceUp()
            PeerConnection.IceConnectionState.DISCONNECTED -> onIceStalled(restart = false)
            PeerConnection.IceConnectionState.FAILED -> onIceStalled(restart = true)
            else -> Unit
        }
    }

    private fun onIceUp() {
        if (!connected) {
            connected = true
            onMediaConnected?.invoke()
            return
        }
        if (!stalled) return
        stalled = false
        signals.emitReconnected(callId, selfId)
        onMediaConnected?.invoke()
    }

    private fun onIceStalled(restart: Boolean) {
        if (!connected) return
        if (!stalled) {
            stalled = true
            // Clampé à la borne du schéma gateway (attempt ≤ 10, Zod) : au-delà
            // la validation rejetterait le signal en silence (fire-and-forget)
            // et le serveur ne saurait plus que l'appel se reconnecte encore.
            reconnectAttempt = minOf(reconnectAttempt + 1, MAX_WIRE_ATTEMPT)
            signals.emitReconnecting(callId, selfId, attempt = reconnectAttempt)
            onMediaStalled?.invoke()
        }
        if (restart) restartIceAndRenegotiate()
    }

    /**
     * Le budget d'une tentative de reconnexion a expiré (escalade du VM) :
     * force un restart ICE frais — couvre le stall DISCONNECTED qui ne dégénère
     * jamais en FAILED (donc jamais restarté spontanément) et l'offre de
     * restart perdue en route. Inerte hors stall.
     */
    fun retryIceRestart() {
        if (!stalled) return
        restartIceAndRenegotiate()
    }

    private fun restartIceAndRenegotiate() {
        engine.restartIce()
        if (!isCaller) return
        val cs = callScope ?: return
        cs.launch {
            negotiationId += 1
            val offer = engine.createOffer()
            engine.setLocalDescription(offer)
            signals.emitOffer(callId, offer.description, to = peerId, from = selfId, negotiationId = negotiationId)
        }
    }

    private suspend fun onRemoteSignal(envelope: CallSignalEnvelope) {
        val signal = envelope.signal
        when (signal.type) {
            "offer" -> {
                val sdp = signal.sdp ?: return
                // The offer's sender is our reply target. An incoming call carries no
                // peerId through the ring/route (CallConfig.peerId is blank), so the
                // answer + ICE candidates would otherwise be sent with a blank `to`
                // and the gateway rejects the whole signal ("to field is required").
                signal.from?.takeIf { it.isNotBlank() }?.let { peerId = it }
                signal.negotiationId?.let { negotiationId = it }
                engine.setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, sdp))
                val answer = engine.createAnswer()
                engine.setLocalDescription(answer)
                signals.emitAnswer(callId, answer.description, to = peerId, from = selfId, negotiationId = negotiationId)
            }
            "answer" -> {
                val sdp = signal.sdp ?: return
                engine.setRemoteDescription(SessionDescription(SessionDescription.Type.ANSWER, sdp))
            }
            "ice-candidate" -> {
                val candidate = signal.candidate ?: return
                engine.addIceCandidate(IceCandidate(signal.sdpMid, signal.sdpMLineIndex ?: 0, candidate))
            }
        }
    }

    private fun routeAudioToCall() {
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
    }

    private fun restoreAudio() {
        audioManager.mode = AudioManager.MODE_NORMAL
    }

    private companion object {
        /** Borne du schéma gateway `socketReconnectingSchema` (`attempt ≤ 10`). */
        const val MAX_WIRE_ATTEMPT = 10
    }
}
