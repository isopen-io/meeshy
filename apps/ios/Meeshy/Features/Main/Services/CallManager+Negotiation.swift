import Foundation
import AVFoundation
@preconcurrency import CallKit
import Combine
import Network
import UIKit
import MeeshySDK
import MeeshyUI
@preconcurrency import WebRTC
import os

/// La négociation SDP d'un appel : arrivée du correspondant côté appelant, rôle
/// poli/impoli et époque de la négociation parfaite (§3.4/§3.5), et émissions
/// d'offre, de réponse et de refus avec leurs relances.

extension CallManager {

    // MARK: - Participant Joined (Outgoing Call)

    func listenForParticipantJoined(callId: String, toUserId: String, isVideo: Bool) {
        // Idempotent join handler: creates the offer exactly once. Guarded so a
        // replayed buffered event + the live event can't both fire it.
        let handleJoin: (CallParticipantData) -> Void = { [weak self] event in
            guard let self, self.currentCallId == callId else { return }
            self.designateGroupPrimary(from: event)
            // Once we've started offering/connecting, ignore further joins.
            switch self.callState {
            case .offering, .connecting, .connected, .reconnecting: return
            default: break
            }
            self.participantJoinedCancellable?.cancel()
            Logger.calls.info("Participant joined call \(callId), creating offer")
            // Ancrage négociation côté appelant : l'appelé vient de décrocher,
            // la sonnerie est finie — tout ce qui suit est du setup technique.
            self.analyticsNegotiationStartDate = Date()

            // Update ICE servers with TURN credentials without recreating the peer connection
            if let servers = event.iceServers, !servers.isEmpty {
                let dynamicServers = servers.map { server in
                    IceServer(urls: server.urls.asArray, username: server.username, credential: server.credential)
                }
                self.webRTCService.updateIceServers(dynamicServers)
            }

            // Phase 1 fix E5: distinct .offering state. We're no longer ringing
            // (peer joined) but not yet connecting (no answer received). This
            // makes the FSM observable and matches the SOTA spec §2.2.
            // Le ring timeout 45s RESTE armé : le join est automatique à la
            // sonnerie (avant tout décroché humain), donc `.offering` = l'appelé
            // sonne encore. Il n'est annulé qu'à la réception de l'answer SDP
            // (handleRemoteAnswer) — sinon un appel sans réponse pendait sans
            // aucune horloge cliente une fois l'offer envoyé.
            self.callState = .offering
            Task { [weak self] in
                guard let self else { return }
                guard let offer = await self.webRTCService.createOffer() else {
                    // Post-await guard: if the call ended while createOffer() was
                    // building the SDP, peerConnection is nil → nil return.
                    // Don't clobber a clean end with .failed.
                    guard self.currentCallId == callId else { return }
                    // The callee already joined and is waiting for our offer —
                    // tell the gateway now instead of leaving them hanging until
                    // the cron reaper.
                    MessageSocketManager.shared.emitCallEnd(callId: callId)
                    self.failCall("Failed to create offer")
                    return
                }
                guard self.currentCallId == callId else {
                    Logger.calls.info("[CALL] participant-joined offer discarded: call ended during createOffer")
                    return
                }
                self.emitCallOffer(callId: callId, toUserId: toUserId, isVideo: isVideo, sdp: offer)
                Logger.calls.info("SDP offer sent for call: \(callId)")
            }
        }

        participantJoinedCancellable?.cancel()
        participantJoinedCancellable = MessageSocketManager.shared.callParticipantJoined
            .receive(on: DispatchQueue.main)
            .filter { $0.callId == callId }
            .sink { [weak self] event in
                handleJoin(event)
                self?.reannounceListeningIntent()
                self?.screenShare.announceIfSharing()
            }

        // CALL-FIX 2026-06-06 — the callee may have ALREADY joined (socket churn /
        // re-join / rapid retry) before this listener subscribed; the live
        // PassthroughSubject doesn't replay, so the offer would never be created
        // and the call would ring-timeout at 45s. Replay the SDK's buffered last
        // event if it matches this callId.
        if let buffered = MessageSocketManager.shared.lastCallParticipantJoined,
           buffered.callId == callId {
            Logger.calls.info("Replaying buffered participant-joined for \(callId)")
            handleJoin(buffered)
        }
    }

    // MARK: - Perfect Negotiation Role (§3.4) + Epoch (§3.5)


    /// Assigns the deterministic, symmetric polite/impolite role to the WebRTC
    /// client. Both peers compute it identically from the two userIds, so it is
    /// independent of who called whom and survives renegotiations. Called once
    /// per call, right after `webRTCService.configure`. Also resets the §3.5
    /// epoch for the new call (single per-call setup chokepoint).
    func applyNegotiationRole() {
        negotiationId = 0
        // §7.7 — front camera by default on iPhone/iPad (mirror), not on Mac.
        isUsingFrontCamera = !ProcessInfo.processInfo.isiOSAppOnMac
        let localId = AuthManager.shared.currentUser?.id ?? ""
        let remoteId = remoteUserId ?? ""
        let polite = Self.isPolitePeer(localUserId: localId, remoteUserId: remoteId)
        webRTCService.setNegotiationRole(isPolite: polite)
        Logger.calls.debug("negotiation role: \(polite ? "polite" : "impolite") (local=\(localId, privacy: .public) remote=\(remoteId, privacy: .public))")
    }

    /// §3.5 — accept an incoming signal of `generation` unless it is stale
    /// (older than the high-water mark). Advances the mark on accept. The first
    /// signal of a call (generation 0 or 1) is always accepted.
    func acceptIncomingNegotiation(_ generation: Int, isOffer: Bool = false) -> Bool {
        if Self.isStaleNegotiation(incoming: generation, highWaterMark: negotiationId, isOffer: isOffer) {
            Logger.calls.info("[CALL-DIAG] dropping stale signal gen=\(generation) < current=\(self.negotiationId)")
            return false
        }
        let freshLink = Self.isFreshLinkOffer(incoming: generation, highWaterMark: negotiationId, isOffer: isOffer)
        negotiationId = max(negotiationId, generation)
        if freshLink { negotiationId = generation }
        return true
    }

    /// Pure, testable epoch rule (§3.5): a signal is stale when its generation
    /// is strictly older than the highest already seen-or-sent. Equal/newer is
    /// accepted (offer, its answer, and the matching ICE share a generation).
    static func isStaleNegotiation(incoming: Int, highWaterMark: Int, isOffer: Bool = false) -> Bool {
        incoming < highWaterMark && !isFreshLinkOffer(incoming: incoming, highWaterMark: highWaterMark, isOffer: isOffer)
    }

    /// §3.5 — begin a new outgoing negotiation: bump the epoch and return it to
    /// stamp on the offer. Only offer creation starts a new generation; the
    /// answer and ICE reuse the current value.
    private func nextOutgoingNegotiationId() -> Int {
        negotiationId += 1
        return negotiationId
    }

    /// Pure, testable politeness rule (W3C perfect negotiation): the
    /// lexicographically-smaller userId is the polite peer. Symmetric — peer A
    /// comparing (idA, idB) and peer B comparing (idB, idA) both reduce to
    /// `min(idA, idB)` and therefore agree without any extra signaling. Returns
    /// `false` (impolite) when an id is missing, so a misconfigured side never
    /// yields blindly. Scales cleanly to SFU later (client always polite).
    static func isPolitePeer(localUserId: String, remoteUserId: String) -> Bool {
        guard !localUserId.isEmpty, !remoteUserId.isEmpty, localUserId != remoteUserId else { return false }
        return localUserId < remoteUserId
    }

    /// Resolves the preferred transcription/call language for a participant per
    /// Prisme Linguistique (full 5-level chain, mirroring `MeeshyUser.preferredContentLanguages`):
    ///   1. `systemLanguage`            — primary in-app preference
    ///   2. `regionalLanguage`          — secondary in-app preference
    ///   3. `customDestinationLanguage` — per-conversation override
    ///   4. `deviceLocale`              — OS-level locale (4th priority, normalised to ISO 639-1)
    ///   5. `"fr"`                      — ultimate fallback
    /// Pure + static — no side effects, no async, safe to unit test directly.
    static func preferredCallLanguage(for user: MeeshyUser?) -> String {
        user?.systemLanguage
            ?? user?.regionalLanguage
            ?? user?.customDestinationLanguage
            ?? MeeshyUser.normalizeLanguageCode(user?.deviceLocale)
            ?? "fr"
    }

    // MARK: - Socket Emit Helpers

    func emitCallOffer(callId: String, toUserId: String, isVideo: Bool, sdp: SessionDescription) {
        let fromUserId = AuthManager.shared.currentUser?.id ?? ""
        // §3.5 — a new offer opens a new negotiation generation.
        let generation = nextOutgoingNegotiationId()
        let payload: [String: Any] = [
            "sdp": sdp.sdp, "to": offerTarget(for: toUserId), "from": fromUserId, "negotiationId": generation
        ]
        // §6.3 — at-least-once delivery. The offer is the single most critical
        // signal (no offer ⇒ caller rings forever, callee stuck "Connexion…").
        // Fire-and-forget dropped it silently on socket churn; the gateway
        // buffer/replay (§4.6) is the *backstop* for a target not-yet-in-room,
        // but the EMITTER must also retry when its own socket lost the frame.
        offerRetryTask?.cancel()
        offerRetryTask = Task { [weak self] in
            await self?.emitOfferWithRetry(callId: callId, payload: payload, generation: generation)
        }
    }

    /// §6.3 — ACK + bounded exponential backoff for the SDP offer. Stops early
    /// if the call ended or a newer negotiation superseded this offer (epoch),
    /// so a stale retry never lands on the peer after a renegotiation.
    private func emitOfferWithRetry(callId: String, payload: [String: Any], generation: Int) async {
        let maxAttempts = QualityThresholds.signalOfferMaxAttempts
        var delay: TimeInterval = QualityThresholds.signalRetryInitialDelaySeconds
        for attempt in 1...maxAttempts {
            guard !Task.isCancelled, currentCallId == callId, generation >= negotiationId else {
                Logger.calls.info("[CALL-DIAG] offer gen=\(generation) superseded/cancelled — stop retry")
                return
            }
            let acked = await MessageSocketManager.shared.emitCallSignalWithAck(
                callId: callId, type: "offer", payload: payload
            )
            if acked {
                if attempt > 1 { Logger.calls.info("[CALL-DIAG] offer ACK'd on attempt \(attempt)") }
                return
            }
            Logger.calls.warning("[CALL-DIAG] offer ACK timed out (attempt \(attempt)/\(maxAttempts)) call=\(callId)")
            if attempt < maxAttempts {
                try? await Task.sleep(for: .seconds(delay))
                delay *= 2
            }
        }
        Logger.calls.error("[CALL-DIAG] offer never ACK'd after \(maxAttempts) attempts — relying on gateway replay (§4.6)")
    }

    /// PERF-004: Awaits gateway ACK (3s timeout) confirming the SDP answer
    /// was relayed to the remote peer. Returning from this method means the
    /// answer is on the wire — so CXAnswerCallAction.fulfill() can run with
    /// confidence that the ICE/SDP exchange has actually started.
    @discardableResult
    func emitCallAnswer(callId: String, toUserId: String, sdp: SessionDescription) async -> Bool {
        let fromUserId = AuthManager.shared.currentUser?.id ?? ""
        // §3.5 — the answer belongs to the offer's generation (the current
        // high-water mark, advanced when the offer was accepted).
        let generation = negotiationId
        let payload: [String: Any] = [
            "sdp": sdp.sdp, "to": toUserId, "from": fromUserId, "negotiationId": generation
        ]
        // PERF-004 — first attempt awaited inline so CXAnswerCallAction.fulfill()
        // is paired with a relayed answer in the common case.
        let acked = await MessageSocketManager.shared.emitCallSignalWithAck(
            callId: callId, type: "answer", payload: payload
        )
        if acked { return true }
        // H3 — an un-ACK'd answer used to be dropped silently, leaving the peer
        // stuck on "Connexion…" until the reliability watchdog fired. The offer
        // already retries (`emitOfferWithRetry`); mirror it for the answer, but
        // in the BACKGROUND so the CallKit fulfill window isn't blocked. The
        // gateway dedupes the duplicate by `negotiationId` (§3.5), so a re-sent
        // answer never causes glare.
        Logger.calls.warning("[CALL-DIAG] answer ACK timed out (attempt 1) call=\(callId) — retrying in background")
        answerRetryTask?.cancel()
        answerRetryTask = Task { [weak self] in
            await self?.emitAnswerRetry(callId: callId, payload: payload, generation: generation)
        }
        return false
    }

    /// H3 — bounded exponential backoff for the SDP answer (attempts 2…4, the
    /// first having run inline in `emitCallAnswer`). Stops early if the call
    /// ended or a newer negotiation superseded this answer (epoch), so a stale
    /// answer never lands on the peer after a renegotiation.
    private func emitAnswerRetry(callId: String, payload: [String: Any], generation: Int) async {
        var delay: TimeInterval = QualityThresholds.signalRetryInitialDelaySeconds
        let total = QualityThresholds.signalAnswerTotalAttempts
        for attempt in 2...total {
            guard !Task.isCancelled, currentCallId == callId, generation >= negotiationId else {
                Logger.calls.info("[CALL-DIAG] answer gen=\(generation) superseded/cancelled — stop retry")
                return
            }
            try? await Task.sleep(for: .seconds(delay))
            delay *= 2
            guard !Task.isCancelled, currentCallId == callId, generation >= negotiationId else { return }
            let acked = await MessageSocketManager.shared.emitCallSignalWithAck(
                callId: callId, type: "answer", payload: payload
            )
            if acked {
                Logger.calls.info("[CALL-DIAG] answer ACK'd on attempt \(attempt)")
                return
            }
            Logger.calls.warning("[CALL-DIAG] answer ACK timed out (attempt \(attempt)/\(total)) call=\(callId)")
        }
        Logger.calls.error("[CALL-DIAG] answer never ACK'd after \(total) attempts — relying on gateway replay (§4.6)")
    }

    // Refus explicite = `call:end {reason: "rejected"}` (plus `call:leave`) :
    // le leave pré-décroché terminait bien l'appel 1:1 mais le serveur le
    // résolvait en `missed` — notification « appel manqué » envoyée au callee
    // qui venait de REFUSER, et refus compté dans le filtre « manqués » du
    // journal. Parité Android/web (fix 2026-07-12).
    func emitCallReject(callId: String) {
        // Refus socket-down (parité Android DeclinedCallStore) : un refus émis
        // dans une socket morte est JETÉ par le SDK — l'appelant sonnerait les
        // 60 s de la fenêtre serveur et l'appel se résoudrait `missed`. Cas
        // typique : push VoIP à froid, l'utilisateur refuse avant la fin du
        // handshake socket. Différé + rejoué avec sa raison au reconnect.
        guard MessageSocketManager.shared.isConnected else {
            armPendingEndReconciliation(callId: callId, reason: "rejected")
            Logger.calls.warning("call:end (rejected) deferred — socket down, will reconcile on reconnect (callId=\(callId))")
            return
        }
        // ACK parity avec emitCallEndReliably (2026-08-11) : un socket vu
        // "connecté" au moment du refus n'implique pas que l'emit atteint le
        // gateway — un blip qui s'auto-répare avant que `connectionState` ne
        // publie la coupure le laisse filer sans ACK ni réconciliation. Le
        // déclinant a déjà fermé localement (endCallInternal a tourné avant
        // cet appel), l'appelant sonne alors jusqu'au timeout (~45-60s) et le
        // gateway résout `missed` au lieu de `rejected` — le même mislabel
        // que l'arc reject 2026-07-12 fermait déjà sur les autres chemins,
        // ici rouvert par la seule fenêtre "connecté mais jamais livré".
        Task { [weak self] in
            let acked = await MessageSocketManager.shared.emitCallRejectWithAck(callId: callId)
            if !acked {
                MessageSocketManager.shared.emitCallReject(callId: callId)
                self?.armPendingEndReconciliation(callId: callId, reason: "rejected")
                Logger.calls.warning("call:end (rejected) ACK failed pour \(callId) — fallback émis + réconciliation armée pour le prochain connect")
            }
        }
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
