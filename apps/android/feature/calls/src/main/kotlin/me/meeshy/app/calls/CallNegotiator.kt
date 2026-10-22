package me.meeshy.app.calls

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.socket.CallSignalManager
import org.webrtc.IceCandidate
import org.webrtc.SessionDescription

/**
 * The SDP / ICE-candidate conversation of ONE call: who offers, on which event,
 * and what happens to each signal that comes back. The engine and the signalling
 * are opaque building blocks; the *policy* — glare handling, negotiation epochs,
 * reply targets — lives here.
 */
internal class CallNegotiator(
    private val engine: WebRtcEngine,
    private val signals: CallSignalManager,
) {
    private var callId: String = ""
    private var peerId: String = ""
    private var selfId: String = ""
    private var negotiationId: Int = 0

    /** Whether WE placed this call — the initial caller re-offers on an ICE restart (anti-glare). */
    private var isCaller: Boolean = false

    /** A call opens: forget the previous one's epoch and addressees. */
    fun begin(callId: String, peerId: String, selfId: String, isCaller: Boolean) {
        this.callId = callId
        this.peerId = peerId
        this.selfId = selfId
        this.negotiationId = 0
        this.isCaller = isCaller
    }

    /** Relay the remote signals into the engine and the local ICE candidates to the peer, in [scope]. */
    fun observe(scope: CoroutineScope) {
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
    }

    /** Caller only: the peer joined the room → create and send the SDP offer. */
    fun onParticipantJoined(scope: CoroutineScope, joinerId: String?) {
        // An outgoing call carries no peerId through the route; the joiner IS the
        // callee we must address, so adopt their id before offering — otherwise the
        // offer's `to` is blank and the gateway rejects it ("to field is required").
        joinerId?.takeIf { it.isNotBlank() }?.let { peerId = it }
        scope.launch { sendOffer() }
    }

    /**
     * ICE restart: the engine always restarts its own gathering, but only the
     * INITIAL caller renegotiates — with a fresh offer of the next epoch — so two
     * sides never re-offer at once (anti-glare).
     */
    fun restartIce(scope: CoroutineScope?) {
        engine.restartIce()
        if (!isCaller) return
        val cs = scope ?: return
        cs.launch {
            negotiationId += 1
            sendOffer()
        }
    }

    private suspend fun sendOffer() {
        val offer = engine.createOffer()
        engine.setLocalDescription(offer)
        signals.emitOffer(callId, offer.description, to = peerId, from = selfId, negotiationId = negotiationId)
    }

    private suspend fun onRemoteSignal(envelope: CallSignalEnvelope) {
        val signal = envelope.signal
        // §3.5 (mirrors iOS `CallManager.acceptIncomingNegotiation`) — drop a signal
        // from an older negotiation epoch before touching the engine. Checked first,
        // exactly like iOS's ordering, so a stale offer/answer/candidate cannot even
        // adopt its sender's `peerId` on its way to being ignored.
        if (!acceptIncomingNegotiation(signal.negotiationId)) return
        when (signal.type) {
            "offer" -> {
                val sdp = signal.sdp ?: return
                // The offer's sender is our reply target. An incoming call carries no
                // peerId through the ring/route (CallConfig.peerId is blank), so the
                // answer + ICE candidates would otherwise be sent with a blank `to`
                // and the gateway rejects the whole signal ("to field is required").
                signal.from?.takeIf { it.isNotBlank() }?.let { peerId = it }
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

    /**
     * §3.5 — accept an incoming signal's generation unless it is STALE (older than
     * the highest generation this negotiator has sent or seen). Advances the
     * high-water mark on accept, exactly mirroring iOS's
     * `CallManager.acceptIncomingNegotiation`/`isStaleNegotiation`. A missing
     * generation (`null` — a legacy or malformed signal) is treated as `0`, same as
     * iOS's `event.signal.negotiationId ?? 0` at the decode boundary: never stale,
     * always accepted.
     *
     * Without this guard every incoming `negotiationId` was adopted (offer branch)
     * or applied unconditionally (answer / ice-candidate branches) regardless of
     * arrival order — the gateway's §4.6 buffered-offer replay and an overlapping
     * ICE-restart racing a peer's in-flight answer could both deliver a signal from
     * an OLDER negotiation after a newer one was already sent, corrupting the SDP
     * state with no error surfaced.
     */
    private fun acceptIncomingNegotiation(generation: Int?): Boolean {
        val incoming = generation ?: 0
        if (incoming < negotiationId) return false
        negotiationId = maxOf(negotiationId, incoming)
        return true
    }
}
