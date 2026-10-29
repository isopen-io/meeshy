package me.meeshy.app.calls

import kotlinx.coroutines.CoroutineScope
import me.meeshy.sdk.call.CallMeshPeerConfig
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.CallSignalPayload
import me.meeshy.sdk.model.call.SocketIceServer
import org.webrtc.IceCandidate
import org.webrtc.SessionDescription

internal const val CALL = "call-1"
internal const val CONVERSATION = "conv-1"

internal class FakePort : GroupMeshPeerPort {
    var stable = true
    var waitingAnswer = false
    val calls = mutableListOf<String>()
    var sendsAudio: Boolean? = null
    var closed = false
    var level: Double? = null
    var levelReads = 0
    lateinit var callbacks: GroupMeshPeerCallbacks

    override val isStable: Boolean get() = stable
    override val awaitsAnswer: Boolean get() = waitingAnswer
    override suspend fun createOffer(iceRestart: Boolean): SessionDescription {
        calls += if (iceRestart) "offer-restart" else "offer"
        return SessionDescription(SessionDescription.Type.OFFER, "v=0 offer")
    }
    override suspend fun createAnswer(): SessionDescription {
        calls += "answer"
        return SessionDescription(SessionDescription.Type.ANSWER, "v=0 answer")
    }
    override suspend fun setLocalDescription(desc: SessionDescription) {
        calls += "local-${desc.type.canonicalForm()}"
        if (desc.type == SessionDescription.Type.OFFER) waitingAnswer = true
    }
    override suspend fun rollback() {
        calls += "rollback"
    }
    override suspend fun setRemoteDescription(desc: SessionDescription) {
        calls += "remote-${desc.type.canonicalForm()}"
        if (desc.type == SessionDescription.Type.ANSWER) waitingAnswer = false
    }
    override fun addIceCandidate(candidate: IceCandidate) {
        calls += "candidate"
    }
    override fun setSendsAudio(enabled: Boolean) {
        sendsAudio = enabled
    }
    override fun setSendsVideo(enabled: Boolean) = Unit
    override fun updateIceServers(servers: List<SocketIceServer>) = Unit
    override fun close() {
        closed = true
    }
    override suspend fun audioLevel(): Double? {
        levelReads += 1
        return level
    }
}

internal data class Sent(val to: String, val from: String, val signal: GroupMeshSignal)

/** Sans [samplingMillis], le détecteur de parole ne relève rien : `advanceUntilIdle` reste atteignable. */
internal class Harness(
    clock: () -> Long = { 0L },
    samplingMillis: Long = Long.MAX_VALUE,
    names: GroupCallNameSource = GroupCallNameSource.NONE,
) {
    val opened = mutableListOf<FakePort>()
    val sent = mutableListOf<Sent>()
    var primaryLevel: Double? = null
    val mesh = GroupCallMesh(
        factory = { _: CallMeshPeerConfig, callbacks ->
            FakePort().also {
                it.callbacks = callbacks
                opened += it
            }
        },
        sender = { _, to, from, signal -> sent += Sent(to, from, signal) },
        names = names,
        primaryAudioLevel = { primaryLevel },
        samplingIntervalMillis = samplingMillis,
        clock = clock,
    )

    fun bind(scope: CoroutineScope, isOutgoing: Boolean, self: String = "m") = mesh.bind(
        scope, CALL, self, isOutgoing, primaryUserId = "", iceServers = emptyList(), sendsAudio = true, sendsVideo = false,
        conversationId = CONVERSATION,
    )

    fun signal(type: String, from: String, negotiationId: Int = 1, sdp: String? = "v=0 x") =
        mesh.claims(CallSignalEnvelope(CALL, CallSignalPayload(type = type, sdp = sdp, from = from, to = "m", negotiationId = negotiationId)))
}
