import AVFoundation

extension AVAudioSession {
    /// Demande la permission micro HORS de tout acteur.
    ///
    /// `requestRecordPermission` rappelle sur la queue
    /// `com.avaudiosession.tccserver`. Sous `defaultIsolation(MainActor)`
    /// (MeeshyUI), un closure littéral passé à cette API hérite lui-même de
    /// `@MainActor` ; son prologue (`swift_task_isCurrentExecutorImpl`) vérifie
    /// l'exécuteur À L'ENTRÉE — sur la queue TCC — et trappe (`EXC_BREAKPOINT`)
    /// AVANT même qu'un `Task { @MainActor in }` interne ne s'exécute (crash à
    /// la 1re demande de permission micro, 2026-06-15).
    ///
    /// Ce helper `nonisolated` confine le callback à un simple `resume` de
    /// continuation — aucun accès à l'acteur, donc aucun check inséré — et
    /// expose le résultat en `async`, consommable sur le MainActor via `await`.
    nonisolated static func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }
}
