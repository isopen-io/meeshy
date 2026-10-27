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

/// L'état qu'un nouvel appel remet à zéro, et ce qui dit qu'un appel échoué se
/// retente. Le démarrage lui-même vit dans `CallOutgoingDial`.

extension CallManager {

    // MARK: - Outgoing Call

    /// Force reset à `.idle` quand l'état est encore `.ended` au moment où
    /// un nouveau call (entrant ou sortant) arrive. Sans ça la fenêtre de
    /// 1.5s laisse passer une seconde tentative qui se voit refusée avec
    /// "already in state ended(...)" — le signal disparaît côté user.
    @MainActor
    func resetEndedStateForNewCall() {
        // Audit P1-2 — bump the settle token so any pending 1.5s settle Task
        // bails out instead of clobbering the new call's identity fields.
        settleToken = nil
        if case .ended = callState {
            callState = .idle
            currentCallId = nil
            remoteUserId = nil
            remoteUsername = nil
            conversationId = nil
            callDuration = 0
            isVideoEnabled = false
            remoteMedia = .initial
            isMuted = false
            isSpeaker = false
            bubbleEdge = .trailing
            bubbleVerticalFraction = 0.08
            videoSurvivalController.reset()
            isVideoSuspended = false
            isVideoSuspendedByCaptureInterruption = false
            isVideoSuspendedByHold = false
            Logger.calls.info("Force-reset .ended → .idle to accept new call")
        }
    }

    // MARK: - Retry a transiently-failed call (« Réessayer »)

    /// True when the ended call failed transiently (`.failed`/`.connectionLost`)
    /// and its outgoing dial context is known — the ended view offers
    /// « Réessayer ». Parité web/Android retry-on-failure.
    var canRetryCall: Bool {
        guard case .ended(let reason) = callState else { return false }
        return CallRetryPolicy.isRetryable(reason) && lastOutgoingContext != nil
    }
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
