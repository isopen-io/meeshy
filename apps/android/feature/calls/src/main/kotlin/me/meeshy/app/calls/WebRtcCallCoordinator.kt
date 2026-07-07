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
    ) = begin(scope, callId, iceServers, peerId, selfId, isVideo, onMediaConnected)

    /** Callee: opens the connection now; the remote offer arrives via [incomingSignals]. */
    fun startIncoming(
        scope: CoroutineScope,
        callId: String,
        iceServers: List<SocketIceServer>,
        peerId: String,
        selfId: String,
        isVideo: Boolean,
        onMediaConnected: () -> Unit,
    ) = begin(scope, callId, iceServers, peerId, selfId, isVideo, onMediaConnected)

    private fun begin(
        scope: CoroutineScope,
        callId: String,
        iceServers: List<SocketIceServer>,
        peerId: String,
        selfId: String,
        isVideo: Boolean,
        onMediaConnected: () -> Unit,
    ) {
        end()
        this.callId = callId
        this.peerId = peerId
        this.selfId = selfId
        this.connected = false
        this.negotiationId = 0
        this.onMediaConnected = onMediaConnected
        val cs = scope + SupervisorJob(scope.coroutineContext[Job])
        callScope = cs
        routeAudioToCall()
        engine.createConnection(iceServers, enableVideo = isVideo)
        observe(cs)
    }

    /** Caller only: the peer joined the room → create and send the SDP offer. */
    fun onParticipantJoined() {
        val cs = callScope ?: return
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
        connected = false
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
            .onEach { state ->
                if (!connected && (state == PeerConnection.IceConnectionState.CONNECTED ||
                        state == PeerConnection.IceConnectionState.COMPLETED)) {
                    connected = true
                    onMediaConnected?.invoke()
                }
            }
            .launchIn(scope)
    }

    private suspend fun onRemoteSignal(envelope: CallSignalEnvelope) {
        val signal = envelope.signal
        when (signal.type) {
            "offer" -> {
                val sdp = signal.sdp ?: return
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
}
