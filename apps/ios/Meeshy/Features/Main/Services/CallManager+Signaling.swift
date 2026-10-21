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
        observeSignalingConnection(socket)
        observeIncomingOffers(socket)
        observeTranscription(socket)
        observeNegotiation(socket)
        observeTermination(socket)
        observeCallErrors(socket)
        observeSocketReconnect(socket)
        observeAnsweredElsewhere(socket)
        observeRemoteMedia(socket)
        observeForcedLeave(socket)
        observeIceServerRefresh(socket)
        observeRemoteQuality(socket)
    }

    private func observeSignalingConnection(_ socket: MessageSocketManager) {
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
    }

    private func observeIncomingOffers(_ socket: MessageSocketManager) {
        socket.callOfferReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.handleCallOffer(event) }
            .store(in: &cancellables)
    }

    private func observeTranscription(_ socket: MessageSocketManager) {
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
    }

    private func observeNegotiation(_ socket: MessageSocketManager) {
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
    }

    private func observeTermination(_ socket: MessageSocketManager) {
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
    }

    private func observeCallErrors(_ socket: MessageSocketManager) {
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
                let accessoryRequest = CallAccessoryRequestLog.shared.request(answeredBy: event.callId)
                let disposition = CallErrorDisposition.resolve(
                    code: event.code,
                    errorCallId: event.callId,
                    currentCallId: self.currentCallId,
                    isTransientDuringResume: CallResumePolicy.isTransientDuringResume(
                        code: event.code, isResuming: self.isResumingCall
                    ),
                    answersAccessoryRequest: accessoryRequest != nil,
                    callIsActive: self.callState.isActive
                )
                switch disposition {
                case .ignore:
                    Logger.calls.warning("call:error ignored (code=\(event.code ?? "?", privacy: .public), callId=\(event.callId ?? "nil", privacy: .public), accessory=\(accessoryRequest?.rawValue ?? "none", privacy: .public))")
                case .reconcileEnd(let callId):
                    Logger.calls.info("call:error CALL_ENDED — reconciling to ended (benign terminal race, #12)")
                    self.handleRemoteEnd(callId: callId)
                case .surface(let endsCall):
                    FeedbackToastManager.shared.showError(message)
                    if endsCall { self.failCall(message) }
                }
            }
            .store(in: &cancellables)
    }

    private func observeSocketReconnect(_ socket: MessageSocketManager) {
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
                    // Toujours émettre, même non muet : écrase l'état périmé du pair.
                    MessageSocketManager.shared.emitCallToggleAudio(callId: callId, enabled: !self.isMuted)
                    Logger.calls.info("Socket reconnect — re-syncing audio mute state to peer (isMuted=\(self.isMuted))")
                    self.screenShare.announceIfSharing()
                    // Identifiants TURN frais : le scheduler périodique est annulé
                    // d'abord ; `call:ice-servers-refreshed` le réarme au nouveau TTL.
                    self.turnRefreshTask?.cancel()
                    self.turnRefreshTask = nil
                    self.requestFreshTurnCredentials(callId: callId)
                    Logger.calls.info("Socket reconnect — requesting fresh TURN credentials for call \(callId)")
                }
            }
            .store(in: &cancellables)
    }

    private func observeAnsweredElsewhere(_ socket: MessageSocketManager) {
        // Audit P1-27 — fired when another device of the same user answered.
        // Dismiss the local ringing UI with .answeredElsewhere so CallKit
        // displays "Answered on another device" in Recents.
        socket.callAlreadyAnswered
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                self.clearPendingIncomingCall(ifMatching: event.callId)
                guard self.currentCallId == event.callId,
                      CallResumePolicy.yieldsToAnotherDevice(callState: self.callState) else { return }
                Logger.calls.info("call:already-answered received — dismissing local ring (callId=\(event.callId))")
                if let uuid = self.activeCallUUID {
                    self.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .answeredElsewhere)
                }
                self.endCallInternal(reason: .remote, reportsAnalytics: false)
            }
            .store(in: &cancellables)
    }

    private func observeRemoteMedia(_ socket: MessageSocketManager) {
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
                    let videoEnabled = event.mediaType == "screen"
                        ? self.screenShare.applyRemoteScreenShare(enabled: event.enabled)
                        : self.screenShare.applyRemoteCamera(enabled: event.enabled)
                    self.remoteMedia = self.remoteMedia.applying(.video(videoEnabled))
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
                    self.remoteMedia = self.remoteMedia.applying(.audio(event.enabled))
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
                self.remoteMedia = self.remoteMedia.applying(.screenCapture(event.isCapturing))
                Logger.calls.info("Remote screen capture \(event.isCapturing ? "started" : "stopped") (callId=\(event.callId))")
            }
            .store(in: &cancellables)
    }

    private func observeForcedLeave(_ socket: MessageSocketManager) {
        socket.callForcedLeave
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                self.clearPendingIncomingCall(ifMatching: event.callId)
                // `currentCallId` survit à la fin de l'appel (écran « terminé »,
                // « Réessayer ») : un force-leave tardif ne rejoue pas le démontage.
                guard CallReliabilityPolicy.shouldProcessRemoteEnd(
                    currentCallId: self.currentCallId,
                    incomingCallId: event.callId,
                    callState: self.callState
                ) else { return }
                Logger.calls.warning("call:force-leave received — ending call (callId=\(event.callId) reason=\(event.reason ?? "unspecified"))")
                if let uuid = self.activeCallUUID {
                    self.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
                }
                self.endCallInternal(reason: .remote)
            }
            .store(in: &cancellables)
    }

    private func observeIceServerRefresh(_ socket: MessageSocketManager) {
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
    }

    private func observeRemoteQuality(_ socket: MessageSocketManager) {
        // Gateway emits call:quality-alert when the REMOTE peer's RTT or
        // packet loss exceeds thresholds. Surface this as a transient indicator
        // so the UI can show "Your contact is experiencing network issues" —
        // FaceTime-parity. Auto-clears 15 s after the last alert (sustained
        // poor quality keeps resetting the timer).
        socket.callQualityAlert
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                self.remoteMedia = self.remoteMedia.applying(.qualityDegraded(true))
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
            guard let self else { return }
            self.remoteMedia = self.remoteMedia.applying(.qualityDegraded(false))
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
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
