import Foundation
import UIKit
import MeeshySDK
import MeeshyUI
import os

/// #8788 — une caméra qui ne démarre pas ne termine pas l'appel : il continue
/// en audio, et le pair l'apprend comme une caméra coupée.

/// Pourquoi la vidéo locale n'a pas pu démarrer. `nil` : une panne qui n'est
/// pas une absence de caméra — l'appel échoue.
enum CallVideoFallback: Equatable, Sendable {
    case simulator
    case cameraPermissionDenied
    case noCamera

    static func classify(_ error: Error) -> CallVideoFallback? {
        switch error {
        case WebRTCError.simulatorVideoUnsupported: return .simulator
        case WebRTCError.cameraPermissionDenied: return .cameraPermissionDenied
        case WebRTCError.noCameraAvailable, WebRTCError.noCameraFormatAvailable: return .noCamera
        default: return nil
        }
    }
}

extension CallManager {

    /// Le repli UNIQUE vers l'audio : la caméra s'éteint, le pair reçoit
    /// `call:media-toggled(video, false)` — son écran montre l'avatar au lieu
    /// d'attendre une image qui ne viendra pas — et l'audio démarre seul.
    @MainActor
    func continueAudioOnly(after fallback: CallVideoFallback, callId: String) async {
        Logger.calls.warning("[CALL_SETUP] video unavailable (\(String(describing: fallback), privacy: .public)) — continuing audio-only")
        guard currentCallId == callId else { return }
        isVideoEnabled = false
        MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
        do {
            try await startLocalMediaKeepingMute(isVideo: false, callId: callId)
        } catch {
            // Le repli a échoué à son tour : l'appel n'a PLUS AUCUN média
            // (ni vidéo ni audio) — état muet invisible sans cette trace.
            Logger.calls.error("Audio-only fallback failed, call has no local media at all: \(error.localizedDescription, privacy: .public)")
        }
        guard currentCallId == callId, fallback == .cameraPermissionDenied else { return }
        FeedbackToastManager.shared.showError(
            String(localized: "call.video.permission.denied",
                   defaultValue: "Caméra : accès refusé — toucher pour ouvrir les Paramètres",
                   bundle: .main)
        ) {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
        }
    }
}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
