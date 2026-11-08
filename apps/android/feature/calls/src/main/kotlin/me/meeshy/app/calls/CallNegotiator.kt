package me.meeshy.app.calls

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.AnsweredRemoteOffer
import me.meeshy.sdk.model.call.CallNegotiationRole
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.GlareVerdict
import me.meeshy.sdk.model.call.NegotiationEpoch
import me.meeshy.sdk.model.call.WebRtcError
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
    private val epoch = NegotiationEpoch()
    private val negotiationId: Int get() = epoch.highWaterMark

    /** Négociation parfaite : le plus petit identifiant est poli (rollback), l'autre ignore l'offre en collision. */
    private var polite: Boolean = false

    /** Mon offre est posée en local et sa réponse n'est pas revenue : une offre entrante serait une collision. */
    private var localOfferPending: Boolean = false

    /** La dernière offre distante répondue : un rejeu exact reçoit la même réponse, sans renégociation. */
    private val answered = AnsweredRemoteOffer()

    /** Le pair a-t-il déjà remis son offre ? Un appelé qui l'attend n'est pas en panne ICE (le minuteur d'offre tient la phase). */
    private var remoteOfferSeen: Boolean = false

    /** Whether WE placed this call — the initial caller re-offers on an ICE restart (anti-glare). */
    private var isCaller: Boolean = false

    /**
     * The group-call mesh's claim on a signal (#13740): `true` when the signal belongs to another member of a
     * group call and this negotiator — the PRIMARY peer's — must not touch it. `null` (a duo, the default):
     * every signal of the call is this negotiator's, exactly as before.
     */
    var router: ((CallSignalEnvelope) -> Boolean)? = null

    /** Signals kept for a call whose connection is not open yet (see [hold]). */
    private var held: HeldSignals? = null

    private class HeldSignals(val callId: String, val collector: Job, val queue: Channel<CallSignalEnvelope>)

    /**
     * Keep [callId]'s incoming signals, in arrival order, until [observe] drains them —
     * the offer may arrive before the connection exists to receive it.
     */
    fun hold(scope: CoroutineScope, callId: String) {
        release()
        val queue = Channel<CallSignalEnvelope>(Channel.UNLIMITED)
        val collector = signals.incomingSignals
            .filter { it.callId == callId }
            .onEach { queue.trySend(it) }
            .launchIn(scope)
        held = HeldSignals(callId, collector, queue)
    }

    /** Drop whatever [hold] kept: the call ended before its connection opened. */
    fun release() {
        held?.let {
            it.collector.cancel()
            it.queue.close()
        }
        held = null
    }

    /** A call opens: forget the previous one's epoch and addressees. */
    fun begin(callId: String, peerId: String, selfId: String, isCaller: Boolean) {
        this.callId = callId
        this.peerId = peerId
        this.selfId = selfId
        epoch.reset()
        answered.clear()
        localOfferPending = false
        this.isCaller = isCaller
        this.remoteOfferSeen = false
        refreshRole()
    }

    private fun refreshRole() {
        polite = CallNegotiationRole.isPolite(selfId, peerId)
    }

    /** `true` pour l'appelé tant que l'offre du pair n'est pas arrivée. */
    val awaitingRemoteOffer: Boolean get() = !isCaller && !remoteOfferSeen

    /** Relay the remote signals into the engine and the local ICE candidates to the peer, in [scope]. */
    fun observe(scope: CoroutineScope) {
        val kept = held?.takeIf { it.callId == callId }
        if (kept != null) {
            held = null
            scope.launch {
                try {
                    for (envelope in kept.queue) onRemoteSignal(envelope)
                } finally {
                    kept.collector.cancel()
                }
            }
        } else {
            release()
            signals.incomingSignals
                .filter { it.callId == callId }
                .onEach { onRemoteSignal(it) }
                .launchIn(scope)
        }

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

        engine.renegotiationRequests
            .onEach { renegotiate() }
            .launchIn(scope)
    }

    /**
     * The engine changed a sender's direction (screen share on an audio call, #13332): either side
     * re-offers with the next generation, like iOS `screenShareNeedsRenegotiation` → `emitCallOffer`.
     */
    private suspend fun renegotiate() {
        epoch.beginOutgoing()
        sendOffer()
    }

    /** Caller only: the peer joined the room → create and send the SDP offer. */
    fun onParticipantJoined(scope: CoroutineScope, joinerId: String?) {
        // An outgoing call carries no peerId through the route; the joiner IS the
        // callee we must address, so adopt their id before offering — otherwise the
        // offer's `to` is blank and the gateway rejects it ("to field is required").
        joinerId?.takeIf { it.isNotBlank() }?.let {
            peerId = it
            refreshRole()
        }
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
            epoch.beginOutgoing()
            sendOffer()
        }
    }

    private suspend fun sendOffer() {
        try {
            val offer = engine.createOffer()
            engine.setLocalDescription(offer)
            localOfferPending = true
            signals.emitOffer(callId, offer.description, to = peerId, from = selfId, negotiationId = negotiationId)
        } catch (_: WebRtcError) {
            // Offre impossible (pair fermé entre-temps) : l'ICE monitor et le budget de reconnexion tranchent.
        }
    }

    private suspend fun onRemoteSignal(envelope: CallSignalEnvelope) {
        if (router?.invoke(envelope) == true) return
        try {
            applyRemoteSignal(envelope)
        } catch (_: WebRtcError) {
            // Un SDP refusé ou une description inapplicable ne doit ni couper le flux de signaux ni raccrocher
            // un appel sain : le signal est écarté, la négociation en cours continue.
        }
    }

    private suspend fun applyRemoteSignal(envelope: CallSignalEnvelope) {
        val signal = envelope.signal
        // §3.5 (mirrors iOS `CallManager.acceptIncomingNegotiation`) — drop a signal
        // from an older negotiation epoch before touching the engine. Checked first,
        // exactly like iOS's ordering, so a stale offer/answer/candidate cannot even
        // adopt its sender's `peerId` on its way to being ignored.
        val isOffer = signal.type == "offer"
        if (epoch.isStale(signal.negotiationId ?: 0, isOffer)) return
        when (signal.type) {
            "offer" -> {
                val sdp = signal.sdp ?: return
                remoteOfferSeen = true
                if (!acceptOffer(signal.negotiationId, sdp, signal.from)) return
                // The offer's sender is our reply target. An incoming call may carry no
                // peerId through the ring/route (an older push without its caller), so the
                // answer + ICE candidates would otherwise be sent with a blank `to`
                // and the gateway rejects the whole signal ("to field is required").
                engine.setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, sdp))
                val answer = engine.createAnswer()
                engine.setLocalDescription(answer)
                answered.remember(sdp, answer.description, negotiationId)
                signals.emitAnswer(callId, answer.description, to = peerId, from = selfId, negotiationId = negotiationId)
            }
            "answer" -> {
                val sdp = signal.sdp ?: return
                if (!epoch.accept(signal.negotiationId, isOffer = false)) return
                engine.setRemoteDescription(SessionDescription(SessionDescription.Type.ANSWER, sdp))
                localOfferPending = false
            }
            "ice-candidate" -> {
                if (!epoch.accept(signal.negotiationId, isOffer = false)) return
                val candidate = signal.candidate ?: return
                engine.addIceCandidate(IceCandidate(signal.sdpMid, signal.sdpMLineIndex ?: 0, candidate))
            }
        }
    }

    /**
     * Décide du sort d'une offre entrante (déjà non périmée) : un rejeu exact est re-servi par la même réponse ;
     * une collision avec ma propre offre est tranchée par le rôle (l'impoli ignore, le poli fait un rollback puis
     * répond). `true` : le moteur doit appliquer l'offre et répondre.
     */
    private suspend fun acceptOffer(generation: Int?, sdp: String, from: String?): Boolean {
        answered.replayFor(sdp)?.let { replay ->
            signals.emitAnswer(callId, replay.answerSdp, to = peerId, from = selfId, negotiationId = replay.generation)
            return false
        }
        when (CallNegotiationRole.glare(polite, localOfferPending)) {
            GlareVerdict.Ignore -> return false
            GlareVerdict.RollbackThenAnswer -> {
                engine.setLocalDescription(SessionDescription(SessionDescription.Type.ROLLBACK, ""))
                localOfferPending = false
            }
            GlareVerdict.Answer -> Unit
        }
        epoch.accept(generation, isOffer = true)
        // The offer's sender is our reply target (an older push may carry no caller).
        from?.takeIf { it.isNotBlank() }?.let {
            peerId = it
            refreshRole()
        }
        return true
    }
}
