package me.meeshy.app.calls

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.call.WebRtcError
import me.meeshy.sdk.model.call.group.GroupCallLinkState
import me.meeshy.sdk.model.call.group.GroupPeerLinkRestart
import org.webrtc.IceCandidate
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack

/** Ce qu'un lien du maillage rapporte au maillage — iOS `GroupPeerLinkEvent`. */
internal sealed interface GroupPeerLinkEvent {
    data class Signal(val signal: GroupMeshSignal) : GroupPeerLinkEvent
    data class State(val state: GroupCallLinkState) : GroupPeerLinkEvent

    /** Reprises épuisées : le membre est perdu pour cet appareil, l'appel continue. */
    data object Failed : GroupPeerLinkEvent
    data class RemoteVideo(val track: VideoTrack) : GroupPeerLinkEvent
}

/**
 * La politique de UNE connexion du maillage vers UN membre — la jumelle Android de iOS `WebRTCGroupPeerLink` et
 * du web `peer-link.ts`, pour que les trois clients négocient pareil :
 *
 * - négociation parfaite : le plus petit identifiant est poli et cède en cas de collision d'offres ;
 * - époque `negotiationId` : chaque offre l'incrémente, une offre reçue l'adopte, un signal plus ancien est écarté ;
 * - les opérations passent l'une après l'autre : un candidat ne double pas l'offre qui le précède ;
 * - reprise : `disconnected` attend 3 s, `failed` relance tout de suite, puis 2 → 16 s, cinq fois au plus.
 */
internal class GroupPeerLink(
    val remoteUserId: String,
    private val isPolite: Boolean,
    private val scope: CoroutineScope,
    private val onEvent: (GroupPeerLinkEvent) -> Unit,
    openPeer: (GroupMeshPeerCallbacks) -> GroupMeshPeerPort?,
) {
    private val lock = Mutex()
    private var epoch = 0
    private var makingOffer = false
    private var everConnected = false
    private var lastState = GroupMeshPeerState.New
    private var restartJob: Job? = null
    private var restartAttempts = 0
    private var closed = false

    var remoteVideoTrack: VideoTrack? = null
        private set

    private val callbacks = object : GroupMeshPeerCallbacks {
        override fun onIceCandidate(candidate: IceCandidate) {
            scope.launch {
                if (closed) return@launch
                onEvent(
                    GroupPeerLinkEvent.Signal(
                        GroupMeshSignal(
                            GroupMeshSignalKind.Candidate,
                            candidate = candidate.sdp,
                            sdpMid = candidate.sdpMid,
                            sdpMLineIndex = candidate.sdpMLineIndex,
                            negotiationId = epoch,
                        ),
                    ),
                )
            }
        }

        override fun onState(state: GroupMeshPeerState) {
            scope.launch { if (!closed) connectionChanged(state) }
        }

        override fun onRemoteVideo(track: VideoTrack) {
            scope.launch {
                if (closed || remoteVideoTrack === track) return@launch
                remoteVideoTrack = track
                onEvent(GroupPeerLinkEvent.RemoteVideo(track))
            }
        }
    }

    private val peer: GroupMeshPeerPort? = openPeer(callbacks)

    /** `false` quand la fabrique n'a rendu aucun pair : le maillage retire le membre. */
    val isOpen: Boolean get() = peer != null && !closed

    /** L'offre initiale — le membre déjà dans l'appel l'envoie au nouveau venu. */
    fun offer(iceRestart: Boolean = false): Job = scope.launch { lock.withLock { makeOffer(iceRestart) } }

    fun receive(signal: GroupMeshSignal): Job? {
        if (signal.kind != GroupMeshSignalKind.Candidate && signal.negotiationId < epoch) return null
        return scope.launch { lock.withLock { apply(signal) } }
    }

    fun setSendsAudio(enabled: Boolean) = peer?.setSendsAudio(enabled)

    fun setSendsVideo(enabled: Boolean) = peer?.setSendsVideo(enabled)

    fun updateIceServers(servers: List<me.meeshy.sdk.model.call.SocketIceServer>) = peer?.updateIceServers(servers)

    /** Le niveau sonore reçu du membre, lu par le détecteur de parole du maillage. */
    suspend fun audioLevel(): Double? = peer?.takeIf { !closed }?.audioLevel()

    fun close() {
        if (closed) return
        closed = true
        restartJob?.cancel()
        restartJob = null
        remoteVideoTrack = null
        peer?.close()
    }

    private suspend fun makeOffer(iceRestart: Boolean) {
        val pc = peer?.takeIf { !closed } ?: return
        makingOffer = true
        try {
            epoch += 1
            val offer = pc.createOffer(iceRestart)
            pc.setLocalDescription(offer)
            if (!closed) onEvent(GroupPeerLinkEvent.Signal(GroupMeshSignal(GroupMeshSignalKind.Offer, sdp = offer.description, negotiationId = epoch)))
        } catch (_: WebRtcError) {
            // Offre impossible (pair fermé entre-temps) : la reprise ou le départ du membre tranchent.
        } finally {
            makingOffer = false
        }
    }

    private suspend fun apply(signal: GroupMeshSignal) {
        val pc = peer?.takeIf { !closed } ?: return
        try {
            when (signal.kind) {
                GroupMeshSignalKind.Offer -> applyOffer(signal, pc)
                GroupMeshSignalKind.Answer -> {
                    val sdp = signal.sdp ?: return
                    if (!pc.awaitsAnswer) return
                    pc.setRemoteDescription(SessionDescription(SessionDescription.Type.ANSWER, sdp))
                }
                GroupMeshSignalKind.Candidate -> {
                    val line = signal.candidate ?: return
                    pc.addIceCandidate(IceCandidate(signal.sdpMid, signal.sdpMLineIndex ?: 0, line))
                }
            }
        } catch (_: WebRtcError) {
            // Un SDP refusé n'emporte ni le lien ni l'appel : le signal est écarté.
        }
    }

    private suspend fun applyOffer(signal: GroupMeshSignal, pc: GroupMeshPeerPort) {
        val sdp = signal.sdp ?: return
        val collision = makingOffer || !pc.isStable
        if (collision && !isPolite) return
        if (collision) pc.rollback()
        epoch = maxOf(epoch, signal.negotiationId)
        pc.setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, sdp))
        val answer = pc.createAnswer()
        pc.setLocalDescription(answer)
        if (!closed) onEvent(GroupPeerLinkEvent.Signal(GroupMeshSignal(GroupMeshSignalKind.Answer, sdp = answer.description, negotiationId = epoch)))
    }

    private fun connectionChanged(state: GroupMeshPeerState) {
        lastState = state
        when (state) {
            GroupMeshPeerState.Connected -> {
                restartJob?.cancel()
                restartJob = null
                restartAttempts = 0
                everConnected = true
                onEvent(GroupPeerLinkEvent.State(GroupCallLinkState.Connected))
            }
            GroupMeshPeerState.Disconnected -> {
                onEvent(GroupPeerLinkEvent.State(waitingState()))
                scheduleRestart(GroupPeerLinkRestart.DISCONNECT_GRACE_MS)
            }
            GroupMeshPeerState.Failed -> scheduleRestart(0)
            GroupMeshPeerState.New, GroupMeshPeerState.Connecting -> onEvent(GroupPeerLinkEvent.State(waitingState()))
            GroupMeshPeerState.Closed -> Unit
        }
    }

    private fun waitingState(): GroupCallLinkState =
        if (everConnected) GroupCallLinkState.Reconnecting else GroupCallLinkState.Connecting

    private fun scheduleRestart(graceMs: Long) {
        if (restartJob != null) return
        restartJob = scope.launch {
            delay(graceMs)
            if (closed || !isBroken()) {
                restartJob = null
                return@launch
            }
            restartAttempts += 1
            if (GroupPeerLinkRestart.isExhausted(restartAttempts)) {
                onEvent(GroupPeerLinkEvent.Failed)
                return@launch
            }
            onEvent(GroupPeerLinkEvent.State(GroupCallLinkState.Reconnecting))
            delay(GroupPeerLinkRestart.backoffMs(restartAttempts))
            restartJob = null
            lock.withLock { makeOffer(iceRestart = true) }
        }
    }

    private fun isBroken(): Boolean = lastState == GroupMeshPeerState.Disconnected || lastState == GroupMeshPeerState.Failed
}
