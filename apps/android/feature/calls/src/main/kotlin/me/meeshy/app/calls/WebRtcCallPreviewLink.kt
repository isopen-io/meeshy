package me.meeshy.app.calls

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.call.CallPreviewPeer
import me.meeshy.sdk.call.CallPreviewPeerConfig
import me.meeshy.sdk.call.CallPreviewPeerListener
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallSignalPayload
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.WebRtcError
import me.meeshy.sdk.model.call.group.GroupPeerLinkRestart
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection.PeerConnectionState
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack
import javax.inject.Inject

/**
 * La négociation d'UN lien d'aperçu sur le [CallPreviewPeer] du SDK — jumelle de la part
 * « négociation » d'iOS `WebRTCGroupPeerLink` :
 *
 * - l'appelant seul offre (l'appelé, en réception seule, ne fait que répondre) : pas de collision
 *   d'offres possible, donc ni politesse ni retour arrière ;
 * - époque `negotiationId` : l'offre de l'appelant ouvre l'époque 1, la réponse reprend celle de
 *   l'offre, un signal plus ancien que l'époque vue est écarté (sauf un candidat) ;
 * - les opérations passent l'une après l'autre ([Mutex]) : un candidat ne double pas l'offre qui le
 *   précède ; elles vivent dans la portée du lien, que [close] annule avant de disposer le pair ;
 * - un lien coupé est relancé comme iOS `WebRTCGroupPeerLink` ([GroupPeerLinkRestart], #13817) :
 *   `disconnected` attend 3 s, `failed` relance tout de suite, puis 2 → 16 s entre deux reprises,
 *   cinq au plus. L'appelant relance par une offre de reprise ICE dans une nouvelle époque ;
 *   l'appelé, qui n'offre jamais, attend la sienne au même rythme. Le budget épuisé, le lien
 *   rend `Failed` : l'aperçu retombe sur l'avatar, l'appel sonne toujours.
 *
 * Les rappels de libwebrtc reviennent sur le fil principal avant d'atteindre le coordinateur.
 */
internal class WebRtcCallPreviewLink(
    engine: WebRtcEngine,
    config: CallPreviewLinkConfig,
    private val onEvent: (CallPreviewLinkEvent) -> Unit,
    main: CoroutineDispatcher = Dispatchers.Main.immediate,
) : CallPreviewLink {

    override val remoteUserId: String = config.remoteUserId

    private val scope = CoroutineScope(SupervisorJob() + main)
    private val turns = Mutex()
    private var epoch = 0
    private val receiveOnly = config.receiveOnly
    private var lastState: PeerConnectionState? = null
    private var restartJob: Job? = null
    private var restartAttempts = 0

    private val listener = object : CallPreviewPeerListener {
        override fun onIceCandidate(candidate: IceCandidate) = post {
            CallPreviewLinkEvent.Signal(
                type = ICE_CANDIDATE,
                negotiationId = epoch,
                fields = mapOf(
                    "candidate" to candidate.sdp,
                    "sdpMid" to candidate.sdpMid,
                    "sdpMLineIndex" to candidate.sdpMLineIndex,
                ),
            )
        }

        override fun onConnectionChange(state: PeerConnectionState) {
            scope.launch { connectionChanged(state) }
        }

        override fun onRemoteVideo(track: VideoTrack) = post { CallPreviewLinkEvent.RemoteVideo(track) }

        override fun onControlOpened() = post { CallPreviewLinkEvent.ControlOpened }

        override fun onControlMessage(bytes: ByteArray) = post { CallPreviewLinkEvent.Control(bytes) }
    }

    private val peer: CallPreviewPeer? = try {
        engine.openPreviewPeer(
            CallPreviewPeerConfig(config.iceServers, config.receiveOnly, config.sendsAudio, config.sendsVideo),
            listener,
        )
    } catch (_: WebRtcError) {
        post { CallPreviewLinkEvent.Failed }
        null
    }

    override suspend fun offer() = turn { current ->
        epoch += 1
        val offer = current.createOffer()
        current.setLocalDescription(offer)
        emit(OFFER, offer)
    }

    override suspend fun receive(signal: CallSignalPayload) {
        val generation = signal.negotiationId ?: 0
        if (signal.type != ICE_CANDIDATE && generation < epoch) return
        turn { current ->
            when (signal.type) {
                OFFER -> {
                    val sdp = signal.sdp ?: return@turn
                    epoch = maxOf(epoch, generation)
                    current.setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, sdp))
                    val answer = current.createAnswer()
                    current.setLocalDescription(answer)
                    emit(ANSWER, answer)
                }
                ANSWER -> {
                    val sdp = signal.sdp ?: return@turn
                    current.setRemoteDescription(SessionDescription(SessionDescription.Type.ANSWER, sdp))
                }
                ICE_CANDIDATE -> {
                    val line = signal.candidate ?: return@turn
                    current.addIceCandidate(IceCandidate(signal.sdpMid, signal.sdpMLineIndex ?: 0, line))
                }
            }
        }
    }

    override fun setSendsAudio(enabled: Boolean) {
        peer?.setSendsAudio(enabled)
    }

    override fun setSendsVideo(enabled: Boolean) {
        peer?.setSendsVideo(enabled)
    }

    override fun setRemoteAudible(audible: Boolean) {
        peer?.setRemoteAudible(audible)
    }

    override fun updateIceServers(servers: List<SocketIceServer>) {
        peer?.updateIceServers(servers)
    }

    override fun sendControl(bytes: ByteArray) {
        peer?.sendControl(bytes)
    }

    override fun close() {
        scope.cancel()
        peer?.close()
    }

    private fun connectionChanged(state: PeerConnectionState) {
        lastState = state
        when (state) {
            PeerConnectionState.CONNECTED -> {
                restartJob?.cancel()
                restartJob = null
                restartAttempts = 0
                onEvent(CallPreviewLinkEvent.Connection(connected = true))
            }
            PeerConnectionState.DISCONNECTED -> {
                onEvent(CallPreviewLinkEvent.Connection(connected = false))
                scheduleRestart(GroupPeerLinkRestart.DISCONNECT_GRACE_MS)
            }
            PeerConnectionState.FAILED -> scheduleRestart(0)
            else -> Unit
        }
    }

    /** Une reprise à la fois ; chaque tentative laisse à la précédente le délai de grâce pour revenir. */
    private fun scheduleRestart(graceMs: Long) {
        if (restartJob != null) return
        restartJob = scope.launch {
            delay(graceMs)
            if (!isBroken()) {
                restartJob = null
                return@launch
            }
            restartAttempts += 1
            if (GroupPeerLinkRestart.isExhausted(restartAttempts)) {
                onEvent(CallPreviewLinkEvent.Failed)
                return@launch
            }
            delay(GroupPeerLinkRestart.backoffMs(restartAttempts))
            restartJob = null
            if (!receiveOnly) restartOffer()
            if (isBroken()) scheduleRestart(GroupPeerLinkRestart.DISCONNECT_GRACE_MS)
        }
    }

    private fun isBroken(): Boolean =
        lastState == PeerConnectionState.DISCONNECTED || lastState == PeerConnectionState.FAILED

    private suspend fun restartOffer() {
        val current = peer ?: return
        turns.withLock {
            try {
                epoch += 1
                val offer = current.createOffer(iceRestart = true)
                current.setLocalDescription(offer)
                emit(OFFER, offer)
            } catch (_: WebRtcError) {
                // La reprise est refusée : la tentative suivante, ou la fin du budget, décidera.
            }
        }
    }

    private fun emit(type: String, description: SessionDescription) =
        onEvent(CallPreviewLinkEvent.Signal(type, epoch, mapOf("sdp" to description.description)))

    /** Une opération à la fois, dans la portée du lien ; un SDP refusé n'est qu'un aperçu en moins. */
    private suspend fun turn(work: suspend (CallPreviewPeer) -> Unit) {
        val current = peer ?: return
        scope.launch {
            turns.withLock {
                try {
                    work(current)
                } catch (_: WebRtcError) {
                    // Refusé par libwebrtc ou pair déjà fermé : l'appel sonne toujours.
                }
            }
        }.join()
    }

    private fun post(event: () -> CallPreviewLinkEvent) {
        scope.launch { onEvent(event()) }
    }

    private companion object {
        const val OFFER = "offer"
        const val ANSWER = "answer"
        const val ICE_CANDIDATE = "ice-candidate"
    }
}

/** La fabrique de production : chaque lien naît du moteur de l'appel (sa fabrique, son contexte EGL). */
class WebRtcCallPreviewLinkFactory @Inject constructor(
    private val engine: WebRtcEngine,
) : CallPreviewLinkFactory {
    override fun open(config: CallPreviewLinkConfig, onEvent: (CallPreviewLinkEvent) -> Unit): CallPreviewLink =
        WebRtcCallPreviewLink(engine, config, onEvent)
}
