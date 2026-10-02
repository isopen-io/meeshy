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

/// Les écoutes Socket.IO de `CallManager` : chaque événement `call:*` de la
/// passerelle rejoint ici la machine d'état de l'appel.

extension CallManager {

    // MARK: - Socket.IO Signaling

    func setupSocketListeners() {
        let socket = MessageSocketManager.shared

        // EXIGENCE №1 — degraded-signaling indicator. This subscription has NO
        // power over the call lifecycle (media is P2P; `didReconnect` re-joins
        // and resyncs); it only drives the discreet CallView banner.
        socket.$connectionState
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                guard let self else { return }
                self.isSignalingDegraded = CallReliabilityPolicy.signalingDegraded(
                    callEstablished: self.callState == .connected,
                    socketConnected: state == .connected
                )
                // Reconciliation — every hang-up/decline that happened while
                // the socket was down is replayed as soon as the transport
                // returns, even if no call is active anymore (the gateway end
                // handler is idempotent). ALL pending entries replay, not just
                // one — see pendingEndReconciliations' doc comment.
                if state == .connected, !self.pendingEndReconciliations.isEmpty {
                    let pending = self.pendingEndReconciliations
                    self.pendingEndReconciliations.removeAll()
                    for entry in pending {
                        let wasReject = entry.reason == "rejected"
                        Logger.calls.info("Reconciling deferred call:end after reconnect (callId=\(entry.callId), rejected=\(wasReject))")
                        if wasReject {
                            // Rejouer un refus en end plat ressusciterait le mislabel
                            // `missed` — la raison voyage avec la réconciliation.
                            self.emitCallReject(callId: entry.callId)
                        } else {
                            self.emitCallEndReliably(callId: entry.callId)
                        }
                    }
                }
            }
            .store(in: &cancellables)

        socket.callOfferReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.handleCallOffer(event) }
            .store(in: &cancellables)

        socket.callTranslatedSegmentReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                // Réception liée au panneau : panneau caché ⇒ désabonné du
                // canal (le segment est ignoré, pas accumulé en silence). Le
                // journal déjà reçu reste dans le service et se réaffiche à
                // la réouverture — seule resetForCallEnd le purge.
                guard self.transcriptionService.isShowingOverlay else { return }
                let segment = CallManager.makeTranscriptionSegment(from: event)
                self.transcriptionService.receiveTranslatedSegment(segment)
            }
            .store(in: &cancellables)

        // Signal de présence transcription : le pair a activé/fermé son
        // panneau → indicateur d'invitation sur l'icône captions. PAS de
        // garde isShowingOverlay ici — le signal doit précisément atteindre
        // un panneau fermé. Les échos de ses propres autres devices (même
        // compte, exclus du fanout socket par socket.to mais possibles via
        // un autre socket du même user) sont ignorés.
        socket.callTranscriptionActiveReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                guard event.speakerId != AuthManager.shared.currentUser?.id else { return }
                if event.active {
                    self.listeningPeers.insert(event.speakerId)
                } else {
                    self.listeningPeers.remove(event.speakerId)
                }
                self.remoteTranscriptionActive = !self.listeningPeers.isEmpty
                // Un pair qui ouvre son panneau devient un AUDITEUR : ce
                // device doit alors capturer son propre micro, panneau local
                // ouvert ou non — sinon le pair n'a rien à lire. Symétrie
                // stricte : quand le dernier auditeur ferme, la capture
                // s'arrête (cf. TranscriptionCapturePolicy).
                self.toggleTranscription()
            }
            .store(in: &cancellables)

        // Un pair peut quitter l'appel (raccroché, crash, coupure) panneau
        // OUVERT, sans jamais émettre `{active: false}` — son entrée
        // survivrait dans `listeningPeers` pour le reste de l'appel et ce
        // device continuerait de tapper le micro pour un auditeur qui n'existe
        // plus. Miroir exact du nettoyage web (`use-remote-transcription-active`,
        // Vague 134) : identité résolue par `userId` puis `participantId`.
        socket.callParticipantLeft
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                guard let identity = event.userId ?? event.participantId else { return }
                guard self.listeningPeers.remove(identity) != nil else { return }
                self.remoteTranscriptionActive = !self.listeningPeers.isEmpty
                self.toggleTranscription()
            }
            .store(in: &cancellables)

        // ⚠️ Crash SIGTRAP (≤ build 1175) — ces `.sink` sont implicitement @MainActor
        // (CallManager est @MainActor + SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor).
        // Les livrer sur `DispatchQueue.global` faisait échouer l'assertion
        // d'isolation Swift 6 (`dispatch_assert_queue` → EXC_BREAKPOINT) DÈS l'entrée
        // de la closure, sur le thread de fond → l'app crashait à CHAQUE
        // offer/answer/ICE candidate reçu pendant un appel (boucle crash → socket
        // tombe → reconnexion → recrash = le « connecte puis coupe »). On livre sur
        // la main queue : le wrapping SDP/ICE est trivial et `handle*` est déjà
        // @MainActor (le `Task { @MainActor }` interne était donc redondant).
        socket.callSignalOfferReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let sdpString = event.signal.sdp, !self.routesToGroupMesh(event.signal, callId: event.callId) else { return }
                let sdp = SessionDescription(type: .offer, sdp: sdpString)
                self.handleSignalOffer(callId: event.callId, sdp: sdp, generation: event.signal.negotiationId ?? 0)
            }
            .store(in: &cancellables)

        socket.callAnswerReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let sdpString = event.signal.sdp, !self.routesToGroupMesh(event.signal, callId: event.callId) else { return }
                let sdp = SessionDescription(type: .answer, sdp: sdpString)
                self.handleRemoteAnswer(callId: event.callId, sdp: sdp, generation: event.signal.negotiationId ?? 0)
            }
            .store(in: &cancellables)

        socket.callICECandidateReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let candidateString = event.signal.candidate, !self.routesToGroupMesh(event.signal, callId: event.callId) else { return }
                let candidate = IceCandidate(
                    sdpMid: event.signal.sdpMid,
                    sdpMLineIndex: Int32(event.signal.sdpMLineIndex ?? 0),
                    candidate: candidateString
                )
                self.handleRemoteICECandidate(callId: event.callId, candidate: candidate, generation: event.signal.negotiationId ?? 0)
            }
            .store(in: &cancellables)

        socket.callEnded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                self.clearPendingIncomingCall(ifMatching: event.callId)
                self.handleRemoteEnd(callId: event.callId, rawReason: event.reason)
            }
            .store(in: &cancellables)

        // Audit P1-25 — surface missed calls explicitly. The gateway emits
        // both `call:ended` and `call:missed` for ringing-timeout scenarios;
        // listening here lets future UX (banner, badge) react to missed
        // calls without the ambiguity of `endedBy != self`.
        socket.callMissed
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                Logger.calls.info("call:missed received: callId=\(event.callId), caller=\(event.callerName ?? "?")")
                self.clearPendingIncomingCall(ifMatching: event.callId)
                if self.currentCallId == event.callId {
                    self.handleRemoteEnd(callId: event.callId, rawReason: "missed")
                }
            }
            .store(in: &cancellables)

        // Audit WS — `call:error` était décodé (MessageSocketManager.callError)
        // mais n'avait AUCUN abonné : un rejet serveur d'opération d'appel émis
        // hors de l'ACK `call:initiate` (ex. salle pleine, conversation fermée,
        // permission) laissait l'écran d'appel figé sans feedback ni teardown. On
        // surface le message et on termine l'appel si l'un est en cours/connexion.
        socket.callError
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                let message = CallRefusalMessage.localized(forCode: event.code) ?? event.message
                    ?? String(localized: "call.error.generic", defaultValue: "Erreur lors de l'appel", bundle: .main)
                Logger.calls.error("call:error received: code=\(event.code ?? "?") message=\(message)")
                // Call-scoping guard: RATE_LIMIT_EXCEEDED/TARGET_NOT_FOUND/etc. below
                // were each hardened one prod incident at a time, but none of them
                // (nor any future code) can be call-scoped without this — `CallError`
                // carries no callId at all until now. An error naming a DIFFERENT call
                // than the one currently active must never affect this device's
                // healthy call (e.g. a stale relay failure from a call that already
                // ended, or cross-talk from a duplicate-device session). Errors with
                // no callId (emit sites not yet call-scoped server-side, or pre-call
                // failures like auth) fall through to the existing per-code handling.
                if let errorCallId = event.callId, errorCallId != self.currentCallId {
                    Logger.calls.warning("call:error for a different call (\(errorCallId, privacy: .public) vs current \(self.currentCallId ?? "nil", privacy: .public)) — ignoring")
                    return
                }
                // INVALID_SIGNAL is a per-message relay rejection (a malformed or
                // non-WebRTC signal type), NOT a call-fatal operation error. It
                // must never tear down a healthy WebRTC call nor surface a user
                // toast — defense in depth against a stray app-level signal ever
                // reaching the strict gateway schema again.
                if event.code == "INVALID_SIGNAL" {
                    return
                }
                // [Audit prod 2026-07-02, C2] RATE_LIMIT_EXCEEDED is throttling
                // of ONE event (gateway cap `socket:call:ice` = 50 per 5 s; a
                // legitimate ICE-gathering flush emits 15-25 candidates per
                // millisecond) — dropping a candidate degrades nothing (ICE is
                // redundant by design). Treating it as fatal killed a live call
                // 382 ms after connection (callId 6a461199…935c, prod).
                if event.code == "RATE_LIMIT_EXCEEDED" {
                    Logger.calls.warning("call:error RATE_LIMIT_EXCEEDED — non-fatal, dropping throttled event")
                    return
                }
                // [Chaos-test prod 2026-07-02, EXIGENCE №1] TARGET_NOT_FOUND is
                // a TRANSIENT relay failure: the peer momentarily has no socket
                // in the call room (socket churn, re-join in flight after a
                // gateway restart). The P2P media is untouched — tearing down
                // here killed a healthy call while the peer re-joined seconds
                // later. ICE candidates are redundant by design and the answer
                // path has its own bounded retry; dropping the failed relay is
                // safe.
                if event.code == "TARGET_NOT_FOUND" {
                    Logger.calls.warning("call:error TARGET_NOT_FOUND — transient relay failure, keeping the call")
                    return
                }
                // CALL_ENDED is terminal-state reconciliation, NOT a user error:
                // the gateway rejected a late emit (join/signal/end) because the
                // call already ended — a benign race with the normal end fanout
                // (#12). Route through the canonical remote-end path (dedup on
                // .ended + correct Recents reason) instead of toasting "already
                // ended" and calling failCall, which would flag a healthy end as
                // a failure. Idempotent: handleRemoteEnd no-ops if already ended.
                if event.code == "CALL_ENDED" {
                    Logger.calls.info("call:error CALL_ENDED — reconciling to ended (benign terminal race, #12)")
                    if let endCallId = event.callId ?? self.currentCallId {
                        self.handleRemoteEnd(callId: endCallId)
                    }
                    return
                }
                if CallResumePolicy.isTransientDuringResume(code: event.code, isResuming: self.isResumingCall) { return }
                FeedbackToastManager.shared.showError(message)
                // Ne teardown que si un appel est réellement en vol (ringing →
                // reconnecting). Une erreur hors-appel ne fait qu'afficher le toast.
                if self.callState.isActive {
                    self.failCall(message)
                }
            }
            .store(in: &cancellables)

        // Audit P1-30 — on Socket.IO reconnect, re-emit `call:join` so the
        // gateway puts us back in the call's room. Without this rejoin, ICE
        // continued via NWPathMonitor restart but every gateway-relayed
        // event targeting `ROOMS.call(callId)` (ICE candidates from peer,
        // re-offer on ICE restart, `call:ended`) was silently dropped — the
        // call became a zombie.
        socket.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                guard self.callState.isActive, let callId = self.currentCallId else { return }
                Logger.calls.info("Socket reconnected — re-joining call room \(callId)")
                // Await the gateway's ACK before sending room-scoped events.
                // call:join is async server-side (DB lookup + socket.join); if we
                // fire call:request-ice-servers or call:toggle-video immediately the
                // gateway's `socket.rooms.has(ROOMS.call(callId))` guard fails and
                // those events are silently dropped.
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    let ackResult = await MessageSocketManager.shared.emitCallJoinWithAckDetailed(callId: callId)
                    guard self.callState.isActive, self.currentCallId == callId else { return }
                    // Vague 162 — the call already ended server-side during the
                    // disconnection (lost the race against the gateway's
                    // DISCONNECT_GRACE_MS window, or ended for another reason
                    // while we were offline) and the `call:ended` broadcast that
                    // would normally tell us was itself dropped by the very
                    // outage this handler exists to recover from. Previously we
                    // only logged "proceeding anyway" and never transitioned
                    // `callState` — the app stayed on the active-call screen
                    // forever, no retry offered, no indication anything ended.
                    // Route through the canonical remote-end path (same one
                    // `call:ended`/`call:error CALL_ENDED` use) with the real
                    // `endReason` so a transient cause (connectionLost/
                    // heartbeatTimeout) still offers « Réessayer ».
                    if ackResult.errorCode == "CALL_ENDED" {
                        Logger.calls.warning("Socket reconnect — call:join rejected, call already ended server-side (callId=\(callId), endReason=\(ackResult.endReason ?? "nil"))")
                        self.handleRemoteEnd(callId: callId, rawReason: ackResult.endReason)
                        return
                    }
                    if !ackResult.joined {
                        Logger.calls.warning("Socket reconnect — call:join ACK timed out (callId=\(callId)), proceeding anyway")
                    }
                    self.flushPendingIceCandidates()
                    // Re-sync video state with the peer. The gateway resets the peer's
                    // call:media-toggled view when our socket disconnects; after reconnect
                    // the peer defaults to assuming our camera is on, which is wrong if we
                    // toggled video off, are on hold, or are backgrounded.
                    //
                    // L6-2 — `isVideoSuspended` is deliberately absent: a socket
                    // reconnect is MOST likely precisely during a survival freeze,
                    // and folding the freeze in here re-emitted the very
                    // `media-toggled(video,false)` the actuator stopped sending —
                    // the peer would destroy the last frame anyway, one layer down.
                    // Only the two flags that mean "capture really stopped" count.
                    if self.isVideoEnabled {
                        let effectiveVideoOn = !self.isVideoSuspendedByCaptureInterruption
                            && !self.isVideoSuspendedByHold
                        MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: effectiveVideoOn)
                        Logger.calls.info("Socket reconnect — re-syncing video state to peer (effectiveVideoOn=\(effectiveVideoOn))")
                    }
                    // Re-sync audio mute state. The gateway resets per-participant
                    // media state when a socket disconnects; the peer defaults to
                    // assuming our mic is live, which is wrong if we were muted.
                    // Always emit (even when !isMuted) to overwrite any stale state.
                    MessageSocketManager.shared.emitCallToggleAudio(callId: callId, enabled: !self.isMuted)
                    Logger.calls.info("Socket reconnect — re-syncing audio mute state to peer (isMuted=\(self.isMuted))")
                    self.screenShare.announceIfSharing()
                    // Request fresh TURN credentials after reconnect. The socket may
                    // have been down long enough for our credentials to approach
                    // expiry (the periodic refresh only fires at 80% of the TTL,
                    // leaving a window of vulnerability for the remaining 20%).
                    // Cancel the periodic scheduler first so the
                    // old deadline doesn't fire while the fresh response is in flight,
                    // causing duplicate requests. The response re-arms the scheduler
                    // at the new TTL via `call:ice-servers-refreshed`.
                    self.turnRefreshTask?.cancel()
                    self.turnRefreshTask = nil
                    self.requestFreshTurnCredentials(callId: callId)
                    Logger.calls.info("Socket reconnect — requesting fresh TURN credentials for call \(callId)")
                }
            }
            .store(in: &cancellables)

        // Audit P1-27 — fired when another device of the same user answered.
        // Dismiss the local ringing UI with .answeredElsewhere so CallKit
        // displays "Answered on another device" in Recents.
        socket.callAlreadyAnswered
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                self.clearPendingIncomingCall(ifMatching: event.callId)
                guard self.currentCallId == event.callId,
                      case .ringing = self.callState else { return }
                Logger.calls.info("call:already-answered received — dismissing local ring (callId=\(event.callId))")
                if let uuid = self.activeCallUUID {
                    self.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .answeredElsewhere)
                }
                self.endCallInternal(reason: .remote)
            }
            .store(in: &cancellables)

        // P0-3 — the peer toggled its camera (call:media-toggled). The gateway
        // routes this to the OTHER participant only (socket.to(room)), so every
        // event we receive reflects the REMOTE peer's video state. Drives the
        // avatar placeholder in CallView instead of a frozen last frame.
        socket.callMediaToggled
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                guard event.callId == self.currentCallId, !self.isGroupMeshMediaToggle(event) else { return }
                switch event.mediaType {
                case "video", "screen":
                    self.isRemoteVideoEnabled = event.mediaType == "screen"
                        ? self.screenShare.applyRemoteScreenShare(enabled: event.enabled)
                        : self.screenShare.applyRemoteCamera(enabled: event.enabled)
                    // C7 — la caméra du pair fait basculer `isVideoUIActive`, donc
                    // l'éligibilité au PiP système. `AVPictureInPictureVideoCall-
                    // ViewController` exige `.videoChat` : sans cette ré-application
                    // la session reste en `.voiceChat` sur escalade unilatérale et
                    // le PiP peut refuser de démarrer.
                    self.updateAudioSessionModeForCurrentVideoState()
                    // Le capteur de proximité doit se désarmer/réarmer en miroir de
                    // `isVideoUIActive` — sans cette ligne il reste actif pendant tout
                    // un appel vidéo escaladé unilatéralement par le pair et bloque
                    // l'écran/le tactile dès qu'un objet couvre le capteur.
                    self.updateProximityMonitoring()
                    // System PiP renders the raw remote track directly onto an
                    // AVSampleBufferDisplayLayer (bypassing SwiftUI's declarative
                    // placeholder branch below) — it needs an explicit nudge or
                    // it keeps showing the last live frame frozen indefinitely.
                    self.pip.setRemoteVideoMuted(!self.isRemoteVideoEnabled)
                    Logger.calls.info("Remote \(event.mediaType) \(event.enabled ? "enabled" : "disabled") (callId=\(event.callId))")
                case "audio":
                    self.isRemoteAudioEnabled = event.enabled
                    Logger.calls.info("Remote audio \(event.enabled ? "enabled" : "muted") (callId=\(event.callId))")
                default:
                    break
                }
            }
            .store(in: &cancellables)

        socket.callScreenCaptureAlert
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                guard event.callId == self.currentCallId else { return }
                self.isRemoteScreenCapturing = event.isCapturing
                Logger.calls.info("Remote screen capture \(event.isCapturing ? "started" : "stopped") (callId=\(event.callId))")
            }
            .store(in: &cancellables)

        socket.callForcedLeave
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                self.clearPendingIncomingCall(ifMatching: event.callId)
                guard self.currentCallId == event.callId else { return }
                Logger.calls.warning("call:force-leave received — ending call (callId=\(event.callId) reason=\(event.reason ?? "unspecified"))")
                if let uuid = self.activeCallUUID {
                    self.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
                }
                self.endCallInternal(reason: .remote)
            }
            .store(in: &cancellables)

        socket.callIceServersRefreshed
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                self.webRTCService.updateIceServers(event.iceServers.map {
                    IceServer(urls: $0.urls.asArray, username: $0.username, credential: $0.credential)
                })
                self.scheduleTURNCredentialRefresh(ttl: TimeInterval(event.ttl))
                // #8074 — `updateIceServers` ne fait que `setConfiguration` : sans
                // relance, les allocations gardent des identifiants qui expirent.
                switch TurnCredentialRefreshPolicy.iceAction(after: self.callState) {
                case .inert: return
                case .rearmReconnect: self.scheduleICERestart(attempt: self.reconnectAttempt, backoffSeconds: 0)
                case .restartIce: self.restartIceOnLiveCall()
                }
            }
            .store(in: &cancellables)

        // Gateway emits call:quality-alert when the REMOTE peer's RTT or
        // packet loss exceeds thresholds. Surface this as a transient indicator
        // so the UI can show "Your contact is experiencing network issues" —
        // FaceTime-parity. Auto-clears 15 s after the last alert (sustained
        // poor quality keeps resetting the timer).
        socket.callQualityAlert
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                self.isRemoteQualityDegraded = true
                Logger.calls.info("Remote quality degraded: metric=\(event.metric) value=\(event.value) (callId=\(event.callId))")
                self.scheduleRemoteQualityReset()
            }
            .store(in: &cancellables)
    }

    private func scheduleRemoteQualityReset() {
        remoteQualityResetTask?.cancel()
        remoteQualityResetTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.remoteQualityResetSeconds))
            guard !Task.isCancelled else { return }
            self?.isRemoteQualityDegraded = false
        }
    }

    /// #8074 — identifiants TURN frais sur un appel ÉTABLI : relance ICE
    /// discrète, chaînée derrière les mêmes renégociations que
    /// `scheduleICERestart` (même risque de collision sur `createOffer()`).
    private func restartIceOnLiveCall() {
        let previous = [videoToggleTask, holdVideoTask, iceRestartTask, signalOfferAnswerTask, cameraSwitchTask]
        let previousSurvival = survivalVideoTask
        iceRestartTask?.cancel()
        iceRestartTask = Task { @MainActor [weak self] in
            for task in previous { await task?.value }
            _ = await previousSurvival?.value
            guard let self, !Task.isCancelled, self.callState == .connected,
                  let callId = self.currentCallId, let userId = self.remoteUserId,
                  let offer = await self.webRTCService.performICERestart(),
                  !Task.isCancelled, self.callState == .connected else { return }
            Logger.calls.info("fresh TURN credentials on a live call — ICE restarted")
            self.emitCallOffer(callId: callId, toUserId: userId, isVideo: self.isVideoEnabled, sdp: offer)
        }
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
