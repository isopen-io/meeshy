import AVFoundation
import Foundation
import os

/// Interruptions de la session de capture d'UN appel.
///
/// Republie les interruptions de la session de capture de CET appel vers le
/// delegate, sous forme d'un booléen typé.
///
/// Aucune lecture d'`AVCaptureSession.InterruptionReason` : une session
/// interrompue ne délivre plus de frames, quelle qu'en soit la raison, et le
/// booléen reste donc juste. C'est aussi ce qui met le code à l'abri de la
/// croissance de l'énumération (iOS 26 y ajoute
/// `.sensitiveContentMitigationActivated`) — il n'y a pas de `switch` à
/// tenir à jour, donc pas de `default` à oublier.
///
/// La session ne sert QU'À la vidéo ici : WebRTC gère l'audio par
/// `RTCAudioSession`, séparément.
final class CaptureInterruptionObserver {
    private var observers: [NSObjectProtocol] = []

    func observe(session: AVCaptureSession, onChange: @escaping @MainActor @Sendable (Bool) -> Void) {
        stop()
        let center = NotificationCenter.default
        observers = [
            center.addObserver(
                forName: AVCaptureSession.wasInterruptedNotification,
                object: session,
                queue: .main
            ) { _ in
                Task { @MainActor in
                    Logger.webrtc.info("[WEBRTC] capture session interrupted — peer will be notified")
                    onChange(true)
                }
            },
            center.addObserver(
                forName: AVCaptureSession.interruptionEndedNotification,
                object: session,
                queue: .main
            ) { _ in
                Task { @MainActor in
                    Logger.webrtc.info("[WEBRTC] capture session interruption ended")
                    onChange(false)
                }
            }
        ]
    }

    func stop() {
        let center = NotificationCenter.default
        observers.forEach(center.removeObserver)
        observers = []
    }

    nonisolated deinit {}
}
