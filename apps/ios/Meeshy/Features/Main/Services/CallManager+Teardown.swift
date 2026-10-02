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

/// La fin d'un appel : diagnostics persistés, analytique de qualité, échec
/// d'appel et démontage complet (`endCallInternal`).

extension CallManager {

    // MARK: - Post-call diagnostics persistence

    /// UserDefaults key for the last persisted call quality summary.
    static let lastCallSummaryDefaultsKey = "me.meeshy.lastCallQualitySummary"

    /// Lightweight call quality summary persisted to UserDefaults at call teardown.
    /// Survives app termination so quality issues are debuggable after the fact.
    struct CallQualitySummary: Codable, Sendable {
        let callId: String?
        let remoteUser: String?
        let durationSeconds: TimeInterval
        let endReason: String
        let stats: CallStats?
    }

    /// Returns the last persisted call summary from a previous call (or the
    /// current session, if already torn down). Nil when no call has been made yet.
    static var lastCallSummary: CallQualitySummary? {
        guard let data = UserDefaults.standard.data(forKey: lastCallSummaryDefaultsKey) else { return nil }
        return JSONDecoder().decodeOrLog(CallQualitySummary.self, from: data,
                                         field: "last call summary", logger: Logger.calls)
    }

    private static func persistCallSummary(
        stats: CallStats?,
        callId: String?,
        duration: TimeInterval,
        remote: String?,
        reason: CallEndReason
    ) {
        let summary = CallQualitySummary(
            callId: callId,
            remoteUser: remote,
            durationSeconds: duration,
            endReason: String(describing: reason),
            stats: stats
        )
        guard let data = JSONEncoder().encodeOrLog(summary, field: "call summary",
                                                   id: callId ?? "-", logger: Logger.calls) else { return }
        UserDefaults.standard.set(data, forKey: lastCallSummaryDefaultsKey)
    }

    private func emitCallAnalyticsIfNeeded(reason: CallEndReason) {
        guard let callId = currentCallId else { return }
        // Émission finale — le snapshot est PUR (la fenêtre de niveau ouverte
        // est repliée virtuellement par qualityDistribution, plus de flush
        // mutatif ici) ; le gateway écrase le dernier snapshot in_progress
        // avec la raison terminale réelle.
        emitCallAnalyticsSnapshot(callId: callId, endReasonLabel: String(describing: reason))

        // Reset accumulators so a subsequent call starts clean.
        analyticsCallInitiatedDate = nil
        analyticsNegotiationStartDate = nil
        analyticsConnectedDate = nil
        analyticsNetworkTransitions = 0
        analyticsQualitySeconds = [:]
        analyticsLastQualityDate = nil
        analyticsCurrentLevel = nil
        analyticsRttSum = 0
        analyticsSampleCount = 0
        analyticsMaxPacketLoss = 0
        analyticsPacketLossSum = 0
        analyticsEffectsUsed = []
        analyticsVideoFiltersUsed = false
    }

    /// Snapshot analytics NON destructif — payload complet construit depuis
    /// les accumulateurs sans les muter (la fenêtre de niveau ouverte est
    /// repliée virtuellement par `CallReliabilityPolicy.qualityDistribution`).
    /// Sert (a) aux émissions périodiques `in_progress` pendant l'appel et
    /// (b) à l'émission finale de teardown. Le gateway persiste par
    /// updateMany : chaque envoi écrase le précédent — un kill de l'app en
    /// background (vécu 2026-07-03 : row analytics perdue après 29 min
    /// d'appel) ne perd plus que la dernière fenêtre.
    private func emitCallAnalyticsSnapshot(callId: String, endReasonLabel: String) {
        let setupMetrics = CallReliabilityPolicy.callSetupMetrics(
            initiatedAt: analyticsCallInitiatedDate,
            negotiationStartAt: analyticsNegotiationStartDate,
            connectedAt: analyticsConnectedDate
        )
        let qualityDistribution = CallReliabilityPolicy.qualityDistribution(
            accumulatedSeconds: analyticsQualitySeconds,
            openWindowLevel: analyticsCurrentLevel,
            openWindowSince: analyticsLastQualityDate,
            now: Date()
        )

        let averageRtt = analyticsSampleCount > 0
            ? analyticsRttSum / Double(analyticsSampleCount) : 0
        let averagePacketLoss = analyticsSampleCount > 0
            ? analyticsPacketLossSum / Double(analyticsSampleCount) : 0
        let codec = lastKnownStats?.codec ?? "unknown"
        let filtersUsed = analyticsVideoFiltersUsed || webRTCService.videoFilters.config.isEnabled

        let payload: [String: Any] = [
            "setupTimeMs":         setupMetrics.setupTimeMs,
            "negotiationTimeMs":   setupMetrics.negotiationTimeMs,
            "durationSeconds":     callDuration,
            "reconnectionCount":   analyticsTotalReconnects,
            "networkTransitions":  analyticsNetworkTransitions,
            "averageRtt":          averageRtt,
            "averagePacketLoss":   averagePacketLoss,
            "maxPacketLoss":       analyticsMaxPacketLoss,
            "codec":               codec,
            "effectsUsed":         Array(analyticsEffectsUsed),
            "filtersUsed":         filtersUsed,
            "transcriptionUsed":   transcriptionService.isTranscribing,
            "qualityDistribution": qualityDistribution,
            "platform":            "ios",
            "deviceModel":         UIDevice.current.model,
            "isVideo":             isVideoEnabled,
            "endReason":           endReasonLabel
        ]
        MessageSocketManager.shared.emitCallAnalytics(callId: callId, payload: payload)
    }

    /// Démarre les snapshots analytics périodiques (60 s) pour l'appel
    /// courant. Idempotent (une seule task par appel — les reconnexions
    /// mid-call repassent par connected sans re-armer). Annulé au teardown.
    func startAnalyticsSnapshots(callId: String) {
        guard analyticsSnapshotTask == nil else { return }
        analyticsSnapshotTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(QualityThresholds.analyticsSnapshotIntervalSeconds))
                guard !Task.isCancelled, let self else { return }
                // Un autre appel a remplacé celui-ci sans passer par le cancel
                // (défensif) : cette task ne parle plus pour personne.
                guard self.currentCallId == callId else { return }
                // Pendant une reconnexion, les stats sont gelées (RTT/loss à 0
                // liraient "excellent") — sauter la fenêtre, pas la task.
                guard case .connected = self.callState else { continue }
                self.emitCallAnalyticsSnapshot(callId: callId, endReasonLabel: "in_progress")
            }
        }
    }

    /// Audit 2026-07-02 (bug 1) — shared failure teardown. `endCallInternal`
    /// never reports to CallKit on its own (its only CallKit side effect is
    /// failing a still-pending CXAnswerCallAction), so every failure path that
    /// reached it directly left the system call UI stranded on a call the app
    /// had already abandoned (caller-side ACK/SDP/media failures, connecting
    /// watchdog, server call:error). Report the failure first, while
    /// `activeCallUUID` is still set — the wrapper sites for local/remote ends
    /// (endCall, handleRemoteEnd, …) keep doing their own CallKit teardown with
    /// end-specific reasons.
    ///
    /// Audit 2026-07-08 — guard `callState.isActive` like its sibling paths
    /// (`endCall`, `handleRemoteEnd`). Several async call sites (SDP
    /// offer/answer handling, the participant-joined offer) only check
    /// `currentCallId == callId` for liveness, and `currentCallId` stays
    /// populated for ~1.5s after a local hangup (the "settle window"). Without
    /// this guard, hanging up right as an SDP exchange is in flight lets that
    /// in-flight failure call `failCall()` on an already-ended call, and
    /// `endCallInternal(.failed(...))` overwrites the real end reason
    /// (`.local`/`.missed`/`.rejected`) in the UI, the UserDefaults snapshot,
    /// and — because the gateway's last-write-wins on the call-history
    /// snapshot — the call history too.
    /// #9085 — le principal a quitté un groupe qui continue (le maillage l'a
    /// constaté) : sa liaison n'est plus reprise et l'appel reste établi.
    func groupPrimaryDidVacate() {
        iceRestartTask?.cancel()
        iceRestartTask = nil
        switch callState {
        case .connecting, .reconnecting: transitionToConnected()
        default: break
        }
    }

    func failCall(_ reasonMessage: String) {
        guard callState.isActive else { return }
        if callUsesCallKit, let uuid = activeCallUUID {
            callProvider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
        }
        abandonOnServer(cause: .failure)
        endCallInternal(reason: .failed(reasonMessage))
    }

    func endCallInternal(reason: CallEndReason) {
        // CALL-FIX 2026-06-06 — stop any ringing loop + play the "ended" cue, but
        // ONLY if the call was actually active (ringing/connecting/connected). The
        // `isActive` guard means a re-entrant endCallInternal (already .ended/.idle)
        // won't double-play the cue.
        let wasActive = callState.isActive
        ringbackPlayer.stop()
        ringbackPlayer.stopRingtone()
        if wasActive { ringbackPlayer.playEnded() }
        durationTask?.cancel()
        durationTask = nil
        reliabilityMonitorTask?.cancel()
        reliabilityMonitorTask = nil
        localMediaTask?.cancel()
        localMediaTask = nil
        callJoinTask?.cancel()
        callJoinTask = nil
        // L'appel se termine avant la connexion : échouer l'answer action encore
        // pendante pour que CallKit démonte proprement (no-op si déjà settled).
        settlePendingAnswerAction(fulfilled: false, reason: "teardown before connect")
        outgoingRingTimeoutTask?.cancel()
        outgoingRingTimeoutTask = nil
        // Cancel le Task de setup outgoing (force-leave + ACK + media +
        // listenForParticipantJoined). Sans ça, après endCallInternal, ce
        // Task continuait à tourner et pouvait re-armer la connexion, faire
        // des emit/setup sur un appel déjà clos, ou laisser des observables
        // attachés.
        setupCallTask?.cancel()
        setupCallTask = nil
        turnRefreshTask?.cancel()
        turnRefreshTask = nil
        turnRefreshWatchdogTask?.cancel()
        turnRefreshWatchdogTask = nil
        turnRefreshRetryAttempt = 0
        stopHeartbeat()
        stopScreenCaptureMonitoring()
        stopBackgroundMonitoring()
        transcriptionService.resetForCallEnd(
            callId: currentCallId,
            conversationId: conversationId ?? "",
            callStartedAt: callStartDate,
            localUserId: AuthManager.shared.currentUser?.id ?? "",
            localSpeakerName: AuthManager.shared.currentUser?.displayName ?? AuthManager.shared.currentUser?.username ?? "",
            remoteSpeakerName: remoteUsername ?? ""
        )
        participantJoinedCancellable?.cancel()
        participantJoinedCancellable = nil
        sdpOfferTimeoutTask?.cancel()
        sdpOfferTimeoutTask = nil
        offerRetryTask?.cancel()
        offerRetryTask = nil
        answerRetryTask?.cancel()
        answerRetryTask = nil
        videoToggleTask?.cancel()
        videoToggleTask = nil
        holdVideoTask?.cancel()
        holdVideoTask = nil
        survivalVideoTask?.cancel()
        survivalVideoTask = nil
        remoteQualityResetTask?.cancel()
        remoteQualityResetTask = nil
        iceRestartTask?.cancel()
        iceRestartTask = nil
        signalOfferAnswerTask?.cancel()
        signalOfferAnswerTask = nil
        cameraSwitchTask?.cancel()
        cameraSwitchTask = nil
        audioActivationFallbackTask?.cancel()
        audioActivationFallbackTask = nil
        CallManager.callKitDidActivateFired = false
        voipFreshnessTask?.cancel()
        voipFreshnessTask = nil
        analyticsSnapshotTask?.cancel()
        analyticsSnapshotTask = nil
        isRemoteQualityDegraded = false
        isSignalingDegraded = false
        pendingRemoteOffer = nil
        pendingIceCandidates = []
        thermalMonitor.stopMonitoring()
        // Snapshot analytics before state is torn down so the payload has access
        // to callId, callDuration, callStartDate, etc.
        emitCallAnalyticsIfNeeded(reason: reason)
        hasLocalVideoTrack = false
        hasRemoteVideoTrack = false
        remoteTranscriptionActive = false
        listeningPeers = []
        publishedListeningIntent = false
        callStartDate = nil
        reconnectAttempt = 0
        analyticsTotalReconnects = 0
        // Reset inconditionnel de l'état vidéo per-call. Avant, seul
        // `resetEndedStateForNewCall` (fenêtre settle 1,5 s) le faisait : un
        // appel démarré plus tard héritait d'`isRemoteVideoEnabled == false`
        // (placeholder "Caméra désactivée" fantôme) et d'un FSM de survie
        // vidéo potentiellement suspendu — violation du contrat documenté de
        // `VideoSurvivalControlling.reset()`.
        isRemoteVideoEnabled = true
        isRemoteAudioEnabled = true
        isRemoteScreenCapturing = false
        screenShare.callEnded()
        recording.callEnded()
        videoSurvivalController.reset()
        isVideoSuspended = false
        isVideoSuspendedByCaptureInterruption = false
        isVideoSuspendedByHold = false
        // Même rationale que le reset vidéo ci-dessus : `resetEndedStateForNewCall`
        // ne reset la bulle QUE si le nouvel appel arrive dans la fenêtre de
        // settle 1,5s (callState encore `.ended`). Le cas ordinaire — un appel
        // qui démarre plus tard — passe par `callState == .idle`, où ce garde
        // ne se déclenche jamais. Sans ce reset inconditionnel, la bulle
        // réapparaît silencieusement à la position de l'appel PRÉCÉDENT.
        bubbleEdge = .trailing
        bubbleVerticalFraction = 0.08
        // C6 — l'appel se termine pendant que la fenêtre PiP flotte au-dessus
        // d'une autre app. La pilule et la bulle se masquent toutes deux dès
        // `.ended`, et le `fullScreenCover` exige `.fullScreen` : sans ça,
        // l'utilisateur revient dans une app où l'appel a disparu sans motif.
        // Posé AVANT `detachSystemPiP()` (qui remet `isSystemPiPActive` à faux)
        // et avant `.ended` — `shouldPresentFullScreenCover` accepte encore
        // l'état actif, puis reste vrai par `isEnded` jusqu'au reset `.idle`.
        // La condition sur le PiP est ce qui évite d'imposer un modal plein
        // écran à chaque raccrochage depuis la pilule, le flux le plus courant.
        if CallPiPPolicy.shouldRestoreFullScreenBeforeTeardown(
            isPiPActive: isSystemPiPActive,
            currentMode: displayMode
        ) {
            displayMode = .fullScreen
        }
        detachSystemPiP()
        Self.persistCallSummary(stats: lastKnownStats, callId: currentCallId,
                                duration: callDuration, remote: remoteUsername, reason: reason)
        lastKnownStats = nil
        CallQualityStatsFeed.shared.reset()
        webRTCService.close()
        deactivateAudioSession()
        callState = .ended(reason: reason)
        connectionQuality = .new
        liveVideoQualityLevel = nil
        degradedLinkTracker.reset()
        isLinkQualityDegraded = false
        activeCallUUID = nil
        // Audit P2-iOS-1 — drop any pending "busy" incoming call. If a 2nd
        // call arrived while this one was active and got immediately ended
        // (.unanswered), the banner kept pointing at a callId that the
        // gateway has already torn down — tapping it joined a phantom room.
        pendingIncomingCall = nil
        showCallWaitingBanner = false

        // L'UI se base sur `callState == .ended` pour afficher le panneau de
        // fin d'appel ; on garde l'état visible 1.5s avant de reset à `.idle`
        // pour laisser le user voir le motif. Si une nouvelle tentative
        // d'appel arrive PENDANT ce délai, on accepte et on force-reset
        // (cf. `forceResetIfEndedThenStart`/branches `case .ended` dans
        // startCall et handleIncomingCallNotification). Le délai legacy de
        // 3s + double-call entrant via VoIP push faisait que tout appel
        // entrant ou sortant suivant un ended remote était rejeté avec
        // "already in state ended(...)" pendant 3s — le user voyait le
        // signal d'appel disparaître. 1.5s suffit pour le feedback UI.
        // Audit P1-2 — stamp this settle window with a token. If a new call
        // arrives within 1.5s, `resetEndedStateForNewCall` nils the token and
        // we must NOT clobber its freshly-assigned identity.
        let token = UUID()
        settleToken = token
        // A retryable transient failure holds the ended screen LONGER so the user
        // has time to tap « Réessayer » (parité web/Android), then auto-dismisses
        // like any other ended call. Tapping retry re-enters startCall, whose
        // resetEndedStateForNewCall nils this token so the pending settle bails.
        let settleDelay = canRetryCall
            ? QualityThresholds.callEndRetryableSettleSeconds
            : QualityThresholds.callEndSettleSeconds
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(settleDelay))
            guard let self else { return }
            guard self.settleToken == token else { return }
            if case .ended = self.callState {
                self.settleToken = nil
                self.callState = .idle
                self.currentCallId = nil
                self.remoteUserId = nil
                self.remoteUsername = nil
                self.conversationId = nil
                self.callDuration = 0
                self.isVideoEnabled = false
                self.isMuted = false
                self.isSpeaker = false
            }
        }
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
