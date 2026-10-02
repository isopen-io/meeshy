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

/// Ce que `CallManager` observe du système pendant un appel : retours
/// haptiques, capture d'écran, passage en arrière-plan et retour au premier plan.

extension CallManager {

    // MARK: - Haptic Helpers

    func playHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    func playNotificationHaptic(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        UINotificationFeedbackGenerator().notificationOccurred(type)
    }

    // MARK: - Screen Capture Monitoring

    func startScreenCaptureMonitoring() {
        // Garantir qu'un seul observateur est actif — évite les doublons sur reconnexion
        stopScreenCaptureMonitoring()
        screenCaptureObserver = NotificationCenter.default.addObserver(
            forName: UIScreen.capturedDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                // Swift 6: Notification is not Sendable — avoid capturing it into the Task.
                // Query all connected window scenes on the MainActor instead. This is
                // correct for multi-screen setups (Stage Manager, external displays) and
                // avoids UIScreen.main (deprecated in iOS 16+).
                let isCapturing = UIApplication.shared.connectedScenes
                    .compactMap { $0 as? UIWindowScene }
                    .contains { $0.screen.isCaptured }
                Logger.calls.info("Screen capture state changed: \(isCapturing)")
                if let callId = self.currentCallId {
                    let userId = AuthManager.shared.currentUser?.id ?? ""
                    MessageSocketManager.shared.emitCallScreenCaptureDetected(
                        callId: callId,
                        participantId: userId,
                        isCapturing: isCapturing
                    )
                }
            }
        }
    }

    func stopScreenCaptureMonitoring() {
        if let observer = screenCaptureObserver {
            NotificationCenter.default.removeObserver(observer)
            screenCaptureObserver = nil
        }
    }

    // MARK: - Background/Foreground Monitoring (H1)

    /// Registers a still-ringing, in-app-only incoming call with CallKit.
    /// No-op unless we're genuinely in that gap: ringing, incoming, and
    /// `callUsesCallKit` is false because `handleIncomingCallNotification`
    /// skipped CallKit for being foreground/macOS at arrival time. macOS
    /// never gets a system call UI (`reportNewIncomingCall` fails there),
    /// so it's excluded here too.
    ///
    /// Guideline 5 (MIIT) — `Self.platformSupportsCallKit` is also `false`
    /// for China-region devices, so this promotion is permanently a no-op
    /// there too: an incoming call ringing in-app that backgrounds before
    /// being answered can be silently suspended by iOS with no lock-screen
    /// card, and falls back to the existing 60s server-side ringing timeout
    /// (missed call) — an accepted, documented degradation inherent to
    /// Apple disallowing CallKit while contractually requiring it as the
    /// only reliable background wake mechanism. See
    /// `test_promoteRingingCallToCallKitIfNeeded_neverPromotesInChina_evenWhileRinging`.
    @MainActor
    private func promoteRingingCallToCallKitIfNeeded() {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard !callUsesCallKit, Self.platformSupportsCallKit else { return }
        guard let uuid = activeCallUUID else { return }

        let handleValue = (remoteUserId?.isEmpty == false ? remoteUserId : nil) ?? (remoteUsername ?? "")
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: handleValue)
        update.localizedCallerName = remoteUsername
        update.hasVideo = isVideoEnabled
        update.supportsGrouping = false
        update.supportsHolding = false

        callUsesCallKit = true
        ringbackPlayer.shouldSelfActivateSession = false
        callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let error {
                    Logger.calls.error("CallKit late-promote on background failed: \(error.localizedDescription)")
                    self.callUsesCallKit = false
                    self.ringbackPlayer.shouldSelfActivateSession = true
                } else {
                    // CallKit now owns ringing (its own `config.ringtoneSound`,
                    // same "Ringtone.caf" asset). Stop the in-app loop or it
                    // plays doubled on top of CallKit's, and the self-activated
                    // AVAudioSession it was holding (`shouldSelfActivateSession`,
                    // just cleared above) risks blocking CallKit's `didActivate`.
                    self.ringbackPlayer.stopRingtone()
                    Logger.calls.info("Promoted ringing call to CallKit on background entry")
                }
            }
        }
    }

    func startBackgroundMonitoring() {
        // Garantir un seul observateur actif par type — évite les doublons sur reconnexion
        stopBackgroundMonitoring()
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let callId = self.currentCallId else { return }
                self.promoteRingingCallToCallKitIfNeeded() // see doc above — no-op unless still ringing
                let userId = AuthManager.shared.currentUser?.id ?? ""
                MessageSocketManager.shared.emitCallBackgrounded(callId: callId, participantId: userId)
                Logger.calls.info("Call backgrounded")
                // C3 — AUCUNE émission « caméra coupée » ici. Passer en
                // arrière-plan n'éteint pas la caméra quand un PiP système est
                // actif : la seule preuve est l'interruption de la session de
                // capture, republiée par `P2PWebRTCClient` et traitée dans
                // `webRTCService(_:didChangeCameraInterruption:)`. Ce
                // déclencheur est auto-corrigeant — si la caméra survit, rien
                // n'est posté et le pair continue de nous voir.
            }
        }

        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let callId = self.currentCallId else { return }
                let userId = AuthManager.shared.currentUser?.id ?? ""
                MessageSocketManager.shared.emitCallForegrounded(callId: callId, participantId: userId)
                Logger.calls.info("Call foregrounded")
                // C3 — garde-fou. `AVCaptureSession.h` documente la fin
                // d'interruption comme survenant « when your app comes back to
                // foreground » : un signal de fin peut donc ne JAMAIS arriver
                // tant que l'app reste en arrière-plan (PiP rangé sur le bord,
                // par exemple). Sans cette levée, le pair resterait sur l'avatar
                // jusqu'à la fin de l'appel — un mode de panne pire que le bug
                // corrigé. Le retour en avant-plan, lui, garantit la reprise.
                self.applyCameraSuspension(false, cause: "foreground")
            }
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

    func stopBackgroundMonitoring() {
        if let observer = backgroundObserver {
            NotificationCenter.default.removeObserver(observer)
            backgroundObserver = nil
        }
        if let observer = foregroundObserver {
            NotificationCenter.default.removeObserver(observer)
            foregroundObserver = nil
        }
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
