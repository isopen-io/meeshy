import Foundation
@preconcurrency import CallKit
import UIKit
import MeeshySDK
import os

/// La vie de l'application pendant un appel : capture d'écran, passage en
/// arrière-plan et retour au premier plan. Le collaborateur possède ses trois
/// observateurs, idempotents (chaque démarrage retire le précédent), et tient
/// l'appel faiblement (#11522). Les événements partent sur le fil comme avant :
/// `call:screen-capture-detected`, `call:backgrounded`, `call:foregrounded`.
@MainActor
final class CallAppStateObserver: CallAppStateObserverProviding {
    nonisolated deinit {}

    private weak var call: CallManager?
    private var screenCaptureObserver: NSObjectProtocol?
    private var backgroundObserver: NSObjectProtocol?
    private var foregroundObserver: NSObjectProtocol?

    var isObservingScreenCapture: Bool { screenCaptureObserver != nil }
    var isObservingBackground: Bool { backgroundObserver != nil && foregroundObserver != nil }

    func attach(to call: CallManager) {
        self.call = call
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
                guard let call = self?.call else { return }
                // Swift 6: Notification is not Sendable — avoid capturing it into the Task.
                // Query all connected window scenes on the MainActor instead. This is
                // correct for multi-screen setups (Stage Manager, external displays) and
                // avoids UIScreen.main (deprecated in iOS 16+).
                let isCapturing = UIApplication.shared.connectedScenes
                    .compactMap { $0 as? UIWindowScene }
                    .contains { $0.screen.isCaptured }
                Logger.calls.info("Screen capture state changed: \(isCapturing)")
                if let callId = call.currentCallId {
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
    private func promoteRingingCallToCallKitIfNeeded() {
        guard let call, case .ringing(isOutgoing: false) = call.callState else { return }
        guard !call.callUsesCallKit, CallManager.platformSupportsCallKit else { return }
        guard let uuid = call.activeCallUUID else { return }

        let handleValue = (call.remoteUserId?.isEmpty == false ? call.remoteUserId : nil) ?? (call.remoteUsername ?? "")
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: handleValue)
        update.localizedCallerName = call.remoteUsername
        update.hasVideo = call.isVideoEnabled
        update.supportsGrouping = false
        update.supportsHolding = false

        call.callUsesCallKit = true
        call.ringbackPlayer.shouldSelfActivateSession = false
        call.callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak call] error in
            Task { @MainActor [weak call] in
                guard let call else { return }
                if let error {
                    Logger.calls.error("CallKit late-promote on background failed: \(error.localizedDescription)")
                    call.callUsesCallKit = false
                    call.ringbackPlayer.shouldSelfActivateSession = true
                } else {
                    // CallKit now owns ringing (its own `config.ringtoneSound`,
                    // same "Ringtone.caf" asset). Stop the in-app loop or it
                    // plays doubled on top of CallKit's, and the self-activated
                    // AVAudioSession it was holding (`shouldSelfActivateSession`,
                    // just cleared above) risks blocking CallKit's `didActivate`.
                    call.ringbackPlayer.stopRingtone()
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
                guard let self, let callId = self.call?.currentCallId else { return }
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
                guard let call = self?.call, let callId = call.currentCallId else { return }
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
                call.applyCameraSuspension(false, cause: "foreground")
            }
        }
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

/// Déclaré après le type : les gardes de l'unité lisent la PREMIÈRE
/// occurrence de chaque signature, qui doit être son corps.
@MainActor
protocol CallAppStateObserverProviding: AnyObject {
    func attach(to call: CallManager)
    func startScreenCaptureMonitoring()
    func stopScreenCaptureMonitoring()
    func startBackgroundMonitoring()
    func stopBackgroundMonitoring()
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
