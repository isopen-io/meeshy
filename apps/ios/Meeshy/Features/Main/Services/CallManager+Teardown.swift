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
    static let lastCallSummaryDefaultsKey = CallQualitySummaryStore.defaultsKey

    typealias CallQualitySummary = CallPersistedQualitySummary

    /// Returns the last persisted call summary from a previous call (or the
    /// current session, if already torn down). Nil when no call has been made yet.
    static var lastCallSummary: CallQualitySummary? {
        CallQualitySummaryStore().read()
    }

    private func emitCallAnalyticsIfNeeded(reason: CallEndReason, reports: Bool) {
        guard let callId = currentCallId else { return }
        // Émission finale — le snapshot est PUR (la fenêtre de niveau ouverte
        // est repliée virtuellement par qualityDistribution, plus de flush
        // mutatif ici) ; le gateway écrase le dernier snapshot in_progress
        // avec la raison terminale réelle.
        if reports {
            emitCallAnalyticsSnapshot(callId: callId, endReasonLabel: String(describing: reason))
        }

        // Reset accumulators so a subsequent call starts clean.
        analytics.resetAccumulators()
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
        let payload = analytics.payload(
            now: Date(),
            context: CallAnalyticsContext(
                callDuration: callDuration,
                codec: lastKnownStats?.codec ?? "unknown",
                filtersEnabledNow: webRTCService.videoFilters.config.isEnabled,
                transcriptionUsed: transcriptionService.isTranscribing,
                deviceModel: UIDevice.current.model,
                isVideo: isVideoEnabled,
                endReason: endReasonLabel
            )
        )
        MessageSocketManager.shared.emitCallAnalytics(callId: callId, payload: payload)
    }

    /// Démarre les snapshots analytics périodiques (60 s) pour l'appel
    /// courant. Idempotent (une seule task par appel — les reconnexions
    /// mid-call repassent par connected sans re-armer). Annulé au teardown.
    func startAnalyticsSnapshots(callId: String) {
        guard analyticsSnapshotTask == nil else { return }
        analyticsSnapshotTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard await cancellableSleep(for: .seconds(QualityThresholds.analyticsSnapshotIntervalSeconds)), !Task.isCancelled, let self else { return }
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

    /// `reportsAnalytics: false` : effacé devant un autre appareil qui a décroché (#11468).
    func endCallInternal(reason: CallEndReason, reportsAnalytics: Bool = true) {
        // CALL-FIX 2026-06-06 — stop any ringing loop + play the "ended" cue, but
        // ONLY if the call was actually active (ringing/connecting/connected). The
        // `isActive` guard means a re-entrant endCallInternal (already .ended/.idle)
        // won't double-play the cue.
        let wasActive = callState.isActive
        ringbackPlayer.stop()
        ringbackPlayer.stopRingtone()
        if wasActive { ringbackPlayer.playEnded() }
        cancelCallScopedWork()
        remoteMedia = remoteMedia.applying(.qualityDegraded(false))
        isSignalingDegraded = false
        pendingRemoteOffer = nil
        pendingIceCandidates = []
        thermalMonitor.stopMonitoring()
        // Snapshot analytics before state is torn down so the payload has access
        // to callId, callDuration, callStartDate, etc.
        emitCallAnalyticsIfNeeded(reason: reason, reports: reportsAnalytics)
        resetPerCallState()
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
        CallQualitySummaryStore().persist(stats: lastKnownStats, callId: currentCallId,
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
        scheduleEndedSettle()
    }

    /// Every task, timer and observer scoped to the call, in teardown order.
    fileprivate func cancelCallScopedWork() {
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
        incomingRingTimeoutTask?.cancel()
        incomingRingTimeoutTask = nil
        // Le setup sortant (force-leave, ACK, média) ne doit pas réarmer un
        // appel déjà clos.
        setupCallTask?.cancel()
        setupCallTask = nil
        turnRefreshTask?.cancel()
        turnRefreshTask = nil
        turnRefreshWatchdogTask?.cancel()
        turnRefreshWatchdogTask = nil
        turnRefreshRetryAttempt = 0
        stopHeartbeat()
        appStateObserver.stopScreenCaptureMonitoring()
        appStateObserver.stopBackgroundMonitoring()
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
        sdpSignaler.cancelRetries()
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
    }

    /// The per-call UI and media state, reset after the analytics snapshot.
    fileprivate func resetPerCallState() {
        hasLocalVideoTrack = false
        hasRemoteVideoTrack = false
        remoteTranscriptionActive = false
        isOnHold = false
        listeningPeers = []
        publishedListeningIntent = false
        callStartDate = nil
        reconnectAttempt = 0
        analytics.totalReconnects = 0
        // Reset inconditionnel de l'état vidéo : sinon un appel démarré après la
        // fenêtre de 1,5 s héritait d'un « Caméra désactivée » fantôme et d'une
        // survie vidéo suspendue (contrat de `VideoSurvivalControlling.reset()`).
        remoteMedia = .initial
        screenShare.callEnded()
        recording.callEnded()
        videoSurvivalController.reset()
        isVideoSuspended = false
        isVideoSuspendedByCaptureInterruption = false
        isVideoSuspendedByHold = false
        // Idem pour la bulle : hors de la fenêtre de 1,5 s, elle réapparaissait
        // à la position de l'appel PRÉCÉDENT.
        bubbleEdge = .trailing
        bubbleVerticalFraction = 0.08
    }

    /// Holds `.ended` on screen, then settles to `.idle` unless a new call came.
    fileprivate func scheduleEndedSettle() {
        // `.ended` reste visible 1,5 s (le panneau de fin montre le motif) puis
        // repasse à `.idle`. Un nouvel appel pendant ce délai est accepté :
        // `resetEndedStateForNewCall` annule le jeton (audit P1-2) et ce reset
        // ne doit pas écraser l'identité du nouvel appel. L'ancien délai de 3 s
        // rejetait tout appel suivant un raccroché distant.
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
            _ = await cancellableSleep(for: .seconds(settleDelay))
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
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
