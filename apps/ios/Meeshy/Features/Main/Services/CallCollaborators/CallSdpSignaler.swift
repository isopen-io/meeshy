import Foundation
import MeeshySDK
import os

/// L'émission ACK de `call:signal` — la seule couture réseau du signaleur SDP.
protocol CallSignalAckEmitting: Sendable {
    func emitCallSignalWithAck(callId: String, type: String, payload: [String: Any]) async -> Bool
}

extension MessageSocketManager: CallSignalAckEmitting {}

@MainActor
protocol CallSdpSignalerProviding: AnyObject {
    var negotiationId: Int { get }
    var isCurrentCall: (String) -> Bool { get set }
    func resetEpoch()
    func beginOutgoingNegotiation() -> Int
    func acceptIncomingNegotiation(_ generation: Int, isOffer: Bool) -> Bool
    func emitOffer(callId: String, payload: [String: Any], generation: Int)
    func emitAnswer(callId: String, payload: [String: Any]) async -> Bool
    func cancelRetries()
}

/// L'époque de la négociation parfaite (§3.5) et la livraison au moins une fois
/// de l'offre et de la réponse SDP (§6.3, H3) : un seul propriétaire pour le
/// compteur de génération et les deux relances (#11522).
@MainActor
final class CallSdpSignaler: CallSdpSignalerProviding {
    nonisolated deinit {}

    /// §3.5 — current negotiation generation (high-water mark of generations
    /// SENT or SEEN). Stamped on every outgoing offer/answer/ICE; incoming
    /// signals older than this are dropped. Reset per call by `resetEpoch()`
    /// (CallManager is a singleton, so it must not carry over between calls —
    /// otherwise a peer with a higher counter from a prior call would wrongly
    /// drop the new call's first offer).
    private(set) var negotiationId = 0
    /// A new offer supersedes the previous one via the generation guard inside
    /// `emitOfferWithRetry`, but cancelling the Task is cheaper than sleeping.
    private(set) var offerRetryTask: Task<Void, Never>?
    /// Same as `offerRetryTask` for the SDP answer backoff path.
    private(set) var answerRetryTask: Task<Void, Never>?
    var isCurrentCall: (String) -> Bool = { _ in false }

    private let emitter: CallSignalAckEmitting
    private let retryInitialDelay: TimeInterval

    init(
        emitter: CallSignalAckEmitting = MessageSocketManager.shared,
        retryInitialDelay: TimeInterval = QualityThresholds.signalRetryInitialDelaySeconds
    ) {
        self.emitter = emitter
        self.retryInitialDelay = retryInitialDelay
    }

    func resetEpoch() {
        negotiationId = 0
    }

    /// §3.5 — begin a new outgoing negotiation: bump the epoch and return it to
    /// stamp on the offer. Only offer creation starts a new generation; the
    /// answer and ICE reuse the current value.
    func beginOutgoingNegotiation() -> Int {
        negotiationId += 1
        return negotiationId
    }

    /// §3.5 — accept an incoming signal of `generation` unless it is stale
    /// (older than the high-water mark). Advances the mark on accept. The first
    /// signal of a call (generation 0 or 1) is always accepted.
    func acceptIncomingNegotiation(_ generation: Int, isOffer: Bool = false) -> Bool {
        if CallManager.isStaleNegotiation(incoming: generation, highWaterMark: negotiationId, isOffer: isOffer) {
            Logger.calls.info("[CALL-DIAG] dropping stale signal gen=\(generation) < current=\(self.negotiationId)")
            return false
        }
        let freshLink = CallManager.isFreshLinkOffer(incoming: generation, highWaterMark: negotiationId, isOffer: isOffer)
        negotiationId = max(negotiationId, generation)
        if freshLink { negotiationId = generation }
        return true
    }

    // §6.3 — at-least-once delivery. The offer is the single most critical
    // signal (no offer ⇒ caller rings forever, callee stuck "Connexion…").
    // Fire-and-forget dropped it silently on socket churn; the gateway
    // buffer/replay (§4.6) is the *backstop* for a target not-yet-in-room,
    // but the EMITTER must also retry when its own socket lost the frame.
    func emitOffer(callId: String, payload: [String: Any], generation: Int) {
        offerRetryTask?.cancel()
        offerRetryTask = Task { [weak self] in
            await self?.emitOfferWithRetry(callId: callId, payload: payload, generation: generation)
        }
    }

    /// §6.3 — ACK + bounded exponential backoff for the SDP offer. Stops early
    /// if the call ended or a newer negotiation superseded this offer (epoch),
    /// so a stale retry never lands on the peer after a renegotiation.
    func emitOfferWithRetry(callId: String, payload: [String: Any], generation: Int) async {
        let maxAttempts = QualityThresholds.signalOfferMaxAttempts
        var delay: TimeInterval = retryInitialDelay
        for attempt in 1...maxAttempts {
            guard !Task.isCancelled, isCurrentCall(callId), generation >= negotiationId else {
                Logger.calls.info("[CALL-DIAG] offer gen=\(generation) superseded/cancelled — stop retry")
                return
            }
            let acked = await emitter.emitCallSignalWithAck(callId: callId, type: "offer", payload: payload)
            if acked {
                if attempt > 1 { Logger.calls.info("[CALL-DIAG] offer ACK'd on attempt \(attempt)") }
                return
            }
            Logger.calls.warning("[CALL-DIAG] offer ACK timed out (attempt \(attempt)/\(maxAttempts)) call=\(callId)")
            if attempt < maxAttempts {
                _ = await cancellableSleep(for: .seconds(delay))
                delay *= 2
            }
        }
        Logger.calls.error("[CALL-DIAG] offer never ACK'd after \(maxAttempts) attempts — relying on gateway replay (§4.6)")
    }

    /// PERF-004: Awaits gateway ACK (3s timeout) confirming the SDP answer
    /// was relayed to the remote peer. The first attempt is awaited inline so
    /// CXAnswerCallAction.fulfill() is paired with a relayed answer in the
    /// common case.
    ///
    /// H3 — an un-ACK'd answer used to be dropped silently, leaving the peer
    /// stuck on "Connexion…" until the reliability watchdog fired. The offer
    /// already retries (`emitOfferWithRetry`); mirror it for the answer, but
    /// in the BACKGROUND so the CallKit fulfill window isn't blocked. The
    /// gateway dedupes the duplicate by `negotiationId` (§3.5), so a re-sent
    /// answer never causes glare.
    func emitAnswer(callId: String, payload: [String: Any]) async -> Bool {
        let generation = negotiationId
        let acked = await emitter.emitCallSignalWithAck(callId: callId, type: "answer", payload: payload)
        if acked { return true }
        Logger.calls.warning("[CALL-DIAG] answer ACK timed out (attempt 1) call=\(callId) — retrying in background")
        answerRetryTask?.cancel()
        answerRetryTask = Task { [weak self] in
            await self?.emitAnswerRetry(callId: callId, payload: payload, generation: generation)
        }
        return false
    }

    /// H3 — bounded exponential backoff for the SDP answer (attempts 2…4, the
    /// first having run inline in `emitAnswer`). Stops early if the call
    /// ended or a newer negotiation superseded this answer (epoch), so a stale
    /// answer never lands on the peer after a renegotiation.
    private func emitAnswerRetry(callId: String, payload: [String: Any], generation: Int) async {
        var delay: TimeInterval = retryInitialDelay
        let total = QualityThresholds.signalAnswerTotalAttempts
        for attempt in 2...total {
            guard !Task.isCancelled, isCurrentCall(callId), generation >= negotiationId else {
                Logger.calls.info("[CALL-DIAG] answer gen=\(generation) superseded/cancelled — stop retry")
                return
            }
            _ = await cancellableSleep(for: .seconds(delay))
            delay *= 2
            guard !Task.isCancelled, isCurrentCall(callId), generation >= negotiationId else { return }
            let acked = await emitter.emitCallSignalWithAck(callId: callId, type: "answer", payload: payload)
            if acked {
                Logger.calls.info("[CALL-DIAG] answer ACK'd on attempt \(attempt)")
                return
            }
            Logger.calls.warning("[CALL-DIAG] answer ACK timed out (attempt \(attempt)/\(total)) call=\(callId)")
        }
        Logger.calls.error("[CALL-DIAG] answer never ACK'd after \(total) attempts — relying on gateway replay (§4.6)")
    }

    /// Une fin d'appel coupe les deux relances : sans cela, la boucle émettrait
    /// encore vers une salle démontée pendant la fenêtre de 1,5 s où
    /// `currentCallId` n'est pas encore nul.
    func cancelRetries() {
        offerRetryTask?.cancel()
        offerRetryTask = nil
        answerRetryTask?.cancel()
        answerRetryTask = nil
    }
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
