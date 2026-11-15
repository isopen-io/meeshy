import Foundation

/// **Le plafond de SILENCE d'une transcription demandée au serveur (#10759)** — miroir
/// de `ON_DEMAND_STALL_MS` (`apps/web/src/lib/view/use-audio-on-demand.ts`).
///
/// Ce n'est pas une estimation de latence : « Transcription… » reste affiché tant que
/// la tâche est en cours, et l'arrivée de la transcription (`transcriptionReady`)
/// lève l'attente dès qu'elle arrive. Le plafond ne sert qu'au silence réel
/// (traducteur arrêté, socket coupée) : passé 90 s sans rien, « Transcrire » revient
/// et la demande peut se refaire. À 20 s, une transcription arrivée à 30 s se
/// posait sous un bouton déjà revenu à « Transcrire ».
enum ServerTranscriptionWait {

    static let silenceCeiling: TimeInterval = 90

    static func isWaiting(requestedAt: Date, now: Date, hasArrived: Bool) -> Bool {
        !hasArrived && now.timeIntervalSince(requestedAt) < silenceCeiling
    }
}
