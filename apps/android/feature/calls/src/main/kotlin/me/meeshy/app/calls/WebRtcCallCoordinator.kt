package me.meeshy.app.calls

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.plus
import me.meeshy.sdk.call.WebRtcEngine
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
        end()
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
        negotiator.observe(cs)
        iceMonitor.observe(cs, restartIce = ::restartIceAndRenegotiate)
        dataChannel.observe(cs) { reason -> onRemoteBye?.invoke(reason) }
    }

    /** Raccroche in-band : le pair passe à Ended immédiatement. `false` si le canal n'est pas ouvert. */
    fun sendHangupBye(reason: String? = null): Boolean = dataChannel.sendHangupBye(reason)

    /** Rafraîchissement TURN en cours d'appel : appliqué par `setConfiguration`, sans reconnexion. */
    fun updateIceServers(iceServers: List<SocketIceServer>): Boolean = engine.updateIceServers(iceServers)

    /** Caller only: the peer joined the room → create and send the SDP offer. */
    fun onParticipantJoined(joinerId: String? = null) {
        val cs = callScope ?: return
        negotiator.onParticipantJoined(cs, joinerId)
    }

    fun setMuted(muted: Boolean) {
        userMuted = muted
        applyMicrophone()
    }

    /** Le micro porte la voix sauf si l'utilisateur l'a coupé ou si une interruption (GSM, alarme) tient le focus. */
    private fun applyMicrophone() = engine.setAudioEnabled(!userMuted && !interrupted)

    fun setCameraEnabled(enabled: Boolean) = engine.setVideoEnabled(enabled)

    /** Speaker/earpiece toggle — local audio routing only, never signalled to the peer. */
    fun setSpeakerEnabled(enabled: Boolean) = audio.setSpeaker(enabled)

    fun end() {
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
