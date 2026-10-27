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

/// Les retours haptiques d'un appel et la porte unique du signal caméra lié
/// à la capture ; la vie de l'application est à `CallAppStateObserver`.

extension CallManager {

    // MARK: - Haptic Helpers

    func playHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        switch style {
        case .light: HapticFeedback.light()
        case .medium: HapticFeedback.medium()
        case .heavy: HapticFeedback.heavy()
        case .rigid: HapticFeedback.rigid()
        case .soft: UIImpactFeedbackGenerator(style: style).impactOccurred()
        @unknown default: UIImpactFeedbackGenerator(style: style).impactOccurred()
        }
    }

    func playNotificationHaptic(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        switch type {
        case .success: HapticFeedback.success()
        case .warning: HapticFeedback.warning()
        case .error: HapticFeedback.error()
        @unknown default: UINotificationFeedbackGenerator().notificationOccurred(type)
        }
    }

    /// C3 — unique porte d'entrée du signal `call:toggle-video` lié à la vie de
    /// la capture caméra. Deux appelants : l'interruption de session (autorité)
    /// et le retour en avant-plan (garde-fou).
    ///
    /// Les gardes de sortie sont celles qui existaient déjà, à l'identique :
    /// • `isVideoEnabled` — ne pas faire de bruit quand la caméra est éteinte
    ///   par choix de l'utilisateur ; toutes les émissions du fichier sont
    ///   gardées ainsi, sinon on désynchronise l'état du pair ;
    /// • `isVideoSuspendedByHold` — CallKit tient l'appel en pause (préemption
    ///   cellulaire) : revenir en avant-plan ne lève PAS un hold, donc annoncer
    ///   « caméra active » serait faux.
    ///
    /// L6-1 — `isVideoSuspended` (gel réseau) N'EST PLUS une garde ici : le gel
    /// laisse la capture tourner, donc il ne dit rien sur la vie de la caméra.
    /// L'y garder faisait taire un VRAI signal caméra (une interruption de
    /// capture survenant pendant un épisode dégradé) — l'inverse de ce que cette
    /// porte existe pour faire.
    func applyCameraSuspension(_ suspended: Bool, cause: StaticString) {
        guard let callId = currentCallId, callState.isActive else { return }
        guard isVideoSuspendedByCaptureInterruption != suspended else { return }
        isVideoSuspendedByCaptureInterruption = suspended
        guard isVideoEnabled, !isVideoSuspendedByHold else { return }
        MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: !suspended)
        Logger.calls.info("Camera \(suspended ? "suspended" : "resumed") (\(cause)) — peer notified")
    }


}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
