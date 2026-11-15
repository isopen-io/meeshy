package me.meeshy.app.calls

import me.meeshy.sdk.call.CallMeshPeer
import me.meeshy.sdk.call.CallMeshPeerConfig
import me.meeshy.sdk.call.CallMeshPeerListener
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallSignalPayload
import me.meeshy.sdk.model.call.CallVideoBudget
import me.meeshy.sdk.model.call.SocketIceServer
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack

/** Les trois signaux d'une connexion du maillage — le `type` de `call:signal`. */
internal enum class GroupMeshSignalKind(val wire: String) {
    Offer("offer"),
    Answer("answer"),
    Candidate("ice-candidate"),
    ;

    companion object {
        fun fromWire(raw: String): GroupMeshSignalKind? = entries.firstOrNull { it.wire == raw }
    }
}

/** Un signal reçu d'un membre du maillage, ou envoyé à lui — iOS `GroupCallIncomingSignal` / `GroupCallOutgoingSignal`. */
internal data class GroupMeshSignal(
    val kind: GroupMeshSignalKind,
    val sdp: String? = null,
    val candidate: String? = null,
    val sdpMid: String? = null,
    val sdpMLineIndex: Int? = null,
    val negotiationId: Int = 0,
) {
    companion object {
        fun from(payload: CallSignalPayload): GroupMeshSignal? {
            val kind = GroupMeshSignalKind.fromWire(payload.type) ?: return null
            return GroupMeshSignal(kind, payload.sdp, payload.candidate, payload.sdpMid, payload.sdpMLineIndex, payload.negotiationId ?: 0)
        }
    }
}

/** L'état d'une connexion du maillage, tel que libwebrtc le rapporte. */
internal enum class GroupMeshPeerState { New, Connecting, Connected, Disconnected, Failed, Closed }

/** Ce qu'une connexion du maillage rapporte à son lien, sur le fil de l'appel. */
internal interface GroupMeshPeerCallbacks {
    fun onIceCandidate(candidate: IceCandidate)
    fun onState(state: GroupMeshPeerState)
    fun onRemoteVideo(track: VideoTrack)

    /** L'émetteur vidéo a changé de direction (écran partagé d'un appel audio, #13755) : le lien doit offrir. */
    fun onRenegotiationNeeded() = Unit
}

/** UNE connexion WebRTC vers UN membre, sans politique ([CallMeshPeer] en production, un faux en test). */
internal interface GroupMeshPeerPort {
    val isStable: Boolean
    val awaitsAnswer: Boolean
    suspend fun createOffer(iceRestart: Boolean): SessionDescription
    suspend fun createAnswer(): SessionDescription
    suspend fun setLocalDescription(desc: SessionDescription)
    suspend fun rollback()
    suspend fun setRemoteDescription(desc: SessionDescription)
    fun addIceCandidate(candidate: IceCandidate)
    fun setSendsAudio(enabled: Boolean)
    fun setSendsVideo(enabled: Boolean)
    fun updateIceServers(servers: List<SocketIceServer>)
    fun close()

    /** Le niveau sonore reçu de ce membre (0…1), `null` sans mesure — iOS `GroupPeerLinkProviding.audioLevel`. */
    suspend fun audioLevel(): Double? = null

    /** La part du débit montant de ce lien (#13752) — iOS `GroupPeerLinkProviding.applyVideoBudget`. */
    fun applyVideoBudget(budget: CallVideoBudget) = Unit
}

internal fun interface GroupMeshPeerFactory {
    /** `null` quand la fabrique ne rend pas de pair : le membre n'est pas joint, l'appel continue. */
    fun open(config: CallMeshPeerConfig, callbacks: GroupMeshPeerCallbacks): GroupMeshPeerPort?
}

/** La fabrique de production : les connexions naissent du moteur de l'appel et partagent ses sources. */
internal class EngineGroupMeshPeerFactory(private val engine: WebRtcEngine) : GroupMeshPeerFactory {
    override fun open(config: CallMeshPeerConfig, callbacks: GroupMeshPeerCallbacks): GroupMeshPeerPort? {
        val listener = object : CallMeshPeerListener {
            override fun onIceCandidate(candidate: IceCandidate) = callbacks.onIceCandidate(candidate)
            override fun onConnectionChange(state: PeerConnection.PeerConnectionState) = callbacks.onState(state.asMeshState())
            override fun onRemoteVideo(track: VideoTrack) = callbacks.onRemoteVideo(track)
            override fun onRenegotiationNeeded() = callbacks.onRenegotiationNeeded()
        }
        val peer = runCatching { engine.openMeshPeer(config, listener) }.getOrNull() ?: return null
        return CallMeshPeerPort(peer)
    }

    private fun PeerConnection.PeerConnectionState.asMeshState(): GroupMeshPeerState = when (this) {
        PeerConnection.PeerConnectionState.NEW -> GroupMeshPeerState.New
        PeerConnection.PeerConnectionState.CONNECTING -> GroupMeshPeerState.Connecting
        PeerConnection.PeerConnectionState.CONNECTED -> GroupMeshPeerState.Connected
        PeerConnection.PeerConnectionState.DISCONNECTED -> GroupMeshPeerState.Disconnected
        PeerConnection.PeerConnectionState.FAILED -> GroupMeshPeerState.Failed
        PeerConnection.PeerConnectionState.CLOSED -> GroupMeshPeerState.Closed
    }
}

private class CallMeshPeerPort(private val peer: CallMeshPeer) : GroupMeshPeerPort {
    override val isStable: Boolean get() = peer.isStable
    override val awaitsAnswer: Boolean get() = peer.awaitsAnswer
    override suspend fun createOffer(iceRestart: Boolean) = peer.createOffer(iceRestart)
    override suspend fun createAnswer() = peer.createAnswer()
    override suspend fun setLocalDescription(desc: SessionDescription) = peer.setLocalDescription(desc)
    override suspend fun rollback() = peer.rollback()
    override suspend fun setRemoteDescription(desc: SessionDescription) = peer.setRemoteDescription(desc)
    override fun addIceCandidate(candidate: IceCandidate) = peer.addIceCandidate(candidate)
    override fun setSendsAudio(enabled: Boolean) = peer.setSendsAudio(enabled)
    override fun setSendsVideo(enabled: Boolean) = peer.setSendsVideo(enabled)
    override fun updateIceServers(servers: List<SocketIceServer>) {
        peer.updateIceServers(servers)
    }
    override fun close() = peer.close()
    override suspend fun audioLevel(): Double? = peer.inboundAudioLevel()
    override fun applyVideoBudget(budget: CallVideoBudget) = peer.applyVideoBudget(budget)
}
