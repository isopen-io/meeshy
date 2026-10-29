package me.meeshy.app.calls

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.plus
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallMediaTogglePayload
import me.meeshy.sdk.model.call.CallParticipantArrival
import me.meeshy.sdk.model.call.CallParticipantLeftPayload
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.WebRtcError
import me.meeshy.sdk.socket.CallSignalManager
import javax.inject.Inject

/**
 * App-side orchestration (NOT SDK) that binds the [WebRtcEngine] to the
 * [CallSignalManager] signaling for the lifetime of one call. It drives the P2P
 * offer/answer/ICE exchange so the media path actually establishes — the missing
 * link that left Android calls stuck on "Connecting…".
 *
 * The engine and the signaling are SDK building blocks (opaque, agnostic); the
 * *policy* lives here, per the SDK purity rule, split by concern: the SDP / ICE
 * conversation is the [CallNegotiator]'s, the reconciliation of ICE state with
 * the FSM and the server is the [CallIceStateMonitor]'s, the platform audio route
 * is the [CallAudioSession]'s. This class keeps the call's lifetime and the
 * public surface the [CallViewModel] drives. One instance per [CallViewModel];
 * the engine it uses is shared.
 */
class WebRtcCallCoordinator @Inject constructor(
    private val engine: WebRtcEngine,
    signals: CallSignalManager,
    @ApplicationContext appContext: Context,
) {
    private val negotiator = CallNegotiator(engine, signals)
    private val iceMonitor = CallIceStateMonitor(engine, signals)
    private val audio = CallAudioSession(appContext) { hasFocus ->
        interrupted = !hasFocus
        applyMicrophone()
    }

    private var userMuted = false
    private var interrupted = false

    private var callScope: CoroutineScope? = null

    /**
     * Le maillage d'un appel de groupe (#13740) : une connexion par membre AUTRE que le principal. Il ne prend un
     * signal ou une arrivée qu'une fois le groupe prouvé ; un duo ne le traverse jamais.
     */
    private val mesh = GroupCallMesh(EngineGroupMeshPeerFactory(engine)) { callId, to, from, signal ->
        when (signal.kind) {
            GroupMeshSignalKind.Offer -> signals.emitOffer(callId, signal.sdp.orEmpty(), to = to, from = from, negotiationId = signal.negotiationId)
            GroupMeshSignalKind.Answer -> signals.emitAnswer(callId, signal.sdp.orEmpty(), to = to, from = from, negotiationId = signal.negotiationId)
            GroupMeshSignalKind.Candidate -> signals.emitIceCandidate(
                callId = callId,
                candidate = signal.candidate.orEmpty(),
                sdpMLineIndex = signal.sdpMLineIndex ?: 0,
                sdpMid = signal.sdpMid,
                to = to,
                from = from,
                negotiationId = signal.negotiationId,
            )
        }
    }

    init {
        negotiator.router = mesh::claims
    }

    /** Ce que la scène d'un appel de groupe lit : registre, principal, vidéo de chaque membre du maillage. */
    val groupMesh: StateFlow<GroupCallMeshUi> get() = mesh.ui

    /** Le principal a quitté un groupe qui continue : sa connexion n'est plus surveillée, l'appel tient par le maillage. */
    var onPrimaryVacated: (() -> Unit)? = null

    private val dataChannel = CallDataChannelController(engine)

    /** Le pair a raccroché in-band (`bye`) : coupure immédiate, le `call:ended` qui suit est dédupliqué. */
    var onRemoteBye: ((reason: String?) -> Unit)? = null

    /** L'installation du pair a échoué (fabrique sans pair) : message précis, l'appel est abandonné. */
    var onSetupFailed: ((message: String) -> Unit)? = null

    /** Les entrées de sous-titres reçues du pair sur le canal de données. */
    val peerCaptions get() = dataChannel.captions

    /** The EGL context every [org.webrtc.SurfaceViewRenderer] must init with. */
    val eglBaseContext get() = engine.eglBase.eglBaseContext

    /** The local camera preview track (video calls only), for the self PiP. */
    val localVideoTrack get() = engine.localVideoTrack

    /** The remote video track stream, for the full-screen remote renderer. */
    val remoteVideoTracks get() = engine.remoteVideoTracks

    /**
     * Callee, BEFORE the join: start keeping [callId]'s signals. The gateway relays the
     * caller's offer right after the join ACK, while the connection is still opening, and
     * the incoming flow replays nothing — without this hold the offer was lost and the
     * answered call stayed on « Connexion… » until the caller gave up.
     */
    fun holdIncomingSignals(scope: CoroutineScope, callId: String) = negotiator.hold(scope, callId)

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
        speakerOn: Boolean = isVideo,
    ) = begin(
        scope, callId, iceServers, peerId, selfId, isVideo, isCaller = true,
        onMediaConnected, onMediaStalled, speakerOn,
    )

    /** Callee: opens the connection now; the remote offer arrives via the incoming signals. */
    fun startIncoming(
        scope: CoroutineScope,
        callId: String,
        iceServers: List<SocketIceServer>,
        peerId: String,
        selfId: String,
        isVideo: Boolean,
        onMediaConnected: () -> Unit,
        onMediaStalled: () -> Unit = {},
        speakerOn: Boolean = isVideo,
    ) = begin(
        scope, callId, iceServers, peerId, selfId, isVideo, isCaller = false,
        onMediaConnected, onMediaStalled, speakerOn,
    )

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
        speakerOn: Boolean,
    ) {
        teardown()
        negotiator.begin(callId, peerId, selfId, isCaller)
        iceMonitor.begin(callId, selfId, onMediaConnected, onMediaStalled)
        val cs = scope + SupervisorJob(scope.coroutineContext[Job])
        callScope = cs
        // Parity iOS `CallManager` (`isSpeaker = isVideo`): a video call defaults to
        // the loudspeaker (the phone is held away from the ear), an audio call to
        // the earpiece — but the CALLER'S current intent wins over that default when
        // it is already known (e.g. the user toggled the speaker button while
        // `accept()` was still awaiting the join ACK, before this ran).
        audio.route(speakerOn = speakerOn, isVideo = isVideo)
        try {
            engine.createConnection(iceServers, enableVideo = isVideo)
        } catch (error: WebRtcError) {
            end()
            onSetupFailed?.invoke(error.message ?: "WebRTC setup failed")
            return
        }
        mesh.bind(cs, callId, selfId, isOutgoing = isCaller, primaryUserId = peerId, iceServers = iceServers,
            sendsAudio = !userMuted && !interrupted, sendsVideo = isVideo)
        negotiator.observe(cs)
        iceMonitor.observe(cs, restartIce = ::restartIceAndRenegotiate)
        dataChannel.observe(cs) { reason ->
            if (mesh.primaryDidLeave()) vacatePrimary() else onRemoteBye?.invoke(reason)
        }
    }

    /** Raccroche in-band : le pair passe à Ended immédiatement. `false` si le canal n'est pas ouvert. */
    fun sendHangupBye(reason: String? = null): Boolean = dataChannel.sendHangupBye(reason)

    /** Rafraîchissement TURN en cours d'appel : appliqué par `setConfiguration`, sans reconnexion. */
    fun updateIceServers(iceServers: List<SocketIceServer>): Boolean {
        mesh.updateIceServers(iceServers)
        return engine.updateIceServers(iceServers)
    }

    /** Caller only: the peer joined the room → create and send the SDP offer. */
    fun onParticipantJoined(joinerId: String? = null) {
        val cs = callScope ?: return
        // Un membre d'un appel de groupe autre que le principal : le maillage lui offre, la connexion de l'appel
        // ne change ni de destinataire ni d'offre.
        if (mesh.claimsArrival(joinerId)) return
        negotiator.onParticipantJoined(cs, joinerId)
    }

    /** Le nom, l'avatar et les médias d'un arrivant (`call:participant-joined`, charge complète). */
    fun onParticipantArrival(arrival: CallParticipantArrival) = mesh.onArrivalDetails(arrival.callId, arrival.arrival)

    /** `call:participant-left` : un membre du maillage s'en va, ou le principal laisse son siège à un groupe qui continue. */
    fun onParticipantLeft(left: CallParticipantLeftPayload) {
        val wasVacated = mesh.isPrimaryVacated
        mesh.onParticipantLeft(left.callId, left.userId)
        if (!wasVacated && mesh.isPrimaryVacated) vacatePrimary()
    }

    /** `true` quand la bascule vient d'un membre du maillage : les indicateurs du principal ne la lisent pas. */
    fun routesGroupMediaToggle(toggle: CallMediaTogglePayload): Boolean =
        mesh.onMediaToggled(toggle.callId, toggle.userId, toggle.mediaType, toggle.enabled)

    private fun vacatePrimary() {
        iceMonitor.end()
        onPrimaryVacated?.invoke()
    }

    fun setMuted(muted: Boolean) {
        userMuted = muted
        applyMicrophone()
    }

    /** Le micro porte la voix sauf si l'utilisateur l'a coupé ou si une interruption (GSM, alarme) tient le focus. */
    private fun applyMicrophone() {
        val sends = !userMuted && !interrupted
        engine.setAudioEnabled(sends)
        mesh.setSendsAudio(sends)
    }

    fun setCameraEnabled(enabled: Boolean) {
        engine.setVideoEnabled(enabled)
        mesh.setSendsVideo(enabled)
    }

    /** Le zoom de ma caméra (pincement, objectifs, retour à 1×). */
    val cameraZoom get() = engine.cameraZoom

    /** Caméra avant ⇄ arrière : local, jamais signalé au pair ; [onSwitched] dit la face active, `null` si rien n'a basculé. */
    fun switchCamera(onSwitched: (isFront: Boolean?) -> Unit) = engine.switchCamera(onSwitched)

    /** Speaker/earpiece toggle — local audio routing only, never signalled to the peer. */
    fun setSpeakerEnabled(enabled: Boolean) = audio.setSpeaker(enabled)

    /**
     * L'aperçu avant décroché devient audible (ou se tait) : la route s'ouvre sur le haut-parleur,
     * et ne se rend que si l'appel lui-même n'a pas encore pris l'audio (au décroché, [begin] la reprend).
     */
    fun routePreviewAudio(audible: Boolean, isVideo: Boolean) {
        if (audible) {
            audio.route(speakerOn = true, isVideo = isVideo)
            return
        }
        if (callScope == null) audio.restore()
    }

    fun end() {
        teardown()
        negotiator.release()
    }

    private fun teardown() {
        mesh.teardown()
        callScope?.cancel()
        callScope = null
        interrupted = false
        userMuted = false
        engine.close()
        iceMonitor.end()
        audio.restore()
    }

    /**
     * Le budget d'une tentative de reconnexion a expiré (escalade du VM) :
     * force un restart ICE frais — couvre le stall DISCONNECTED qui ne dégénère
     * jamais en FAILED (donc jamais restarté spontanément) et l'offre de
     * restart perdue en route. Inerte hors stall.
     */
    fun retryIceRestart() {
        if (!iceMonitor.stalled) return
        restartIceAndRenegotiate()
    }

    private fun restartIceAndRenegotiate() = negotiator.restartIce(callScope)
}
