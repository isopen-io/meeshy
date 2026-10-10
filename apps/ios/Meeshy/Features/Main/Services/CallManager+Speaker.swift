import AVFoundation
import Foundation
@preconcurrency import WebRTC
import os

// #8735 — « Sortie » répond au premier toucher. `toggleSpeaker()` attendait
// `audioSessionQueue.sync` (verrou de la session + `overrideOutputAudioPort`)
// avant de rendre la main : l'état basculé n'était dessiné qu'une fois la
// session revenue, et la même file est prise par les gestionnaires de la
// session audio. La bascule et son haptique partent désormais dans l'image du
// toucher ; la route s'applique hors du fil principal, et l'état revient en
// arrière sur le fil principal si elle échoue.

/// La route de sortie que réclame l'état du haut-parleur, et son application.
/// UNE source pour les deux chemins — synchrone (`applySpeakerRoute`, cycle de
/// vie de la session) et hors fil principal (`applySpeakerRouteOffMain`).
nonisolated enum CallSpeakerRoute {
    /// CRITIQUE simulator : `.none` (= défaut earpiece/Receiver) ne route PAS
    /// vers les haut-parleurs macOS sur iOS Simulator — silence total même si
    /// l'ADM tourne ; on force `.speaker`. Sur device réel, `.none` = earpiece
    /// pour `.voiceChat`. CALL-FIX 2026-06-05 (macOS) — même panne sur
    /// iOS-app-on-Mac (« Designed for iPad », PAS Catalyst) : pas d'earpiece,
    /// donc `.speaker` forcé ; test à l'exécution car le Mac exécute la
    /// tranche iphoneos.
    static func port(isSpeaker: Bool) -> AVAudioSession.PortOverride {
        #if targetEnvironment(simulator)
        return .speaker
        #else
        let forceSpeakerForMac = ProcessInfo.processInfo.isiOSAppOnMac
        return (isSpeaker || forceSpeakerForMac) ? .speaker : .none
        #endif
    }

    /// Rend `false` quand `overrideOutputAudioPort` lève (ex. `insufficientPriority`
    /// sous une route Bluetooth). S'exécute sur `audioSessionQueue`.
    static func override(_ port: AVAudioSession.PortOverride, isSpeaker: Bool) -> Bool {
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        defer { session.unlockForConfiguration() }
        do {
            try session.overrideOutputAudioPort(port)
            Logger.calls.info("Audio route override applied: \(port.rawValue) (isSpeaker=\(isSpeaker))")
            return true
        } catch {
            Logger.calls.error("Audio route change failed: \(error.localizedDescription)")
            return false
        }
    }
}

extension CallManager {
    /// Applique la route du haut-parleur SANS bloquer le fil principal, puis
    /// rend son issue sur le fil principal. Appel inactif : rien à appliquer,
    /// rien à annuler — l'issue est un succès.
    func applySpeakerRouteOffMain(completion: @escaping @MainActor @Sendable (Bool) -> Void) {
        guard callState.isActive else { return completion(true) }
        let speaker = isSpeaker
        let port = CallSpeakerRoute.port(isSpeaker: speaker)
        audioSessionQueue.async {
            let applied = CallSpeakerRoute.override(port, isSpeaker: speaker)
            Task { @MainActor in completion(applied) }
        }
    }
}

fileprivate extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
