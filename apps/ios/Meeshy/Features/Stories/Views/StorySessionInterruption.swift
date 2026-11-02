import Foundation
import MeeshySDK

/// **Une interruption de la lecture fige l'horloge de la story** (#11040,
/// décision porteur g du 2026-10-20).
///
/// Un appel téléphonique, Siri, une alarme, l'audio d'une autre app : le
/// système retire la session à Meeshy, et la story s'arrêtait de SONNER
/// pendant que sa barre continuait d'avancer — l'utilisateur revenait sur une
/// autre story que la sienne. Désormais sa progression s'arrête avec le son
/// et repart avec la reprise.
///
/// La décision « reprendre ou non » appartient à `InterruptionResumeLedger`,
/// comme pour tous les lecteurs de Meeshy ; cette loi la traduit pour une
/// story, qui a une HORLOGE en plus d'un son :
/// - l'interruption commence pendant que la story joue ⇒ elle se fige ;
/// - elle s'achève avec `shouldResume` (ou au retour dans Meeshy quand plus
///   rien d'autre ne joue) ⇒ elle repart là où elle était ;
/// - elle s'achève SANS reprise ⇒ la story reste arrêtée, comme une pause de
///   l'utilisateur, qu'un toucher relance ;
/// - l'utilisateur la met en pause pendant l'interruption ⇒ sa pause
///   l'emporte, la fin de l'interruption ne relance rien.
///
/// Les appels Meeshy ne passent pas par ici : `PlaybackInterruption` les
/// gèle déjà, d'après l'état de l'appel (#8725).
nonisolated struct StorySessionInterruption: Equatable {

    enum Outcome: Equatable {
        case none
        /// La story se fige en place.
        case freeze
        /// La story repart là où elle s'était figée.
        case resume
        /// L'interruption est finie sans reprise : la story reste arrêtée,
        /// tenue désormais par une pause de l'utilisateur.
        case settleAsPause
    }

    private var ledger = InterruptionResumeLedger()

    /// `true` tant qu'une interruption tient la story figée.
    private(set) var isFrozen = false

    mutating func handle(_ event: MediaSessionCoordinator.Event, storyIsPlaying: Bool) -> Outcome {
        guard Self.concernsTheClock(event),
              let signal = InterruptionResumeLedger.signal(for: event, isPlaying: storyIsPlaying) else { return .none }
        return apply(ledger.handle(signal))
    }

    /// Retour au premier plan sans signal de fin (la vidéo d'une autre app
    /// n'en envoie presque jamais).
    mutating func returnedToForeground(otherAudioPlaying: Bool) -> Outcome {
        guard isFrozen else { return .none }
        return apply(ledger.handle(.returnedToForeground(
            otherAudioPlaying: otherAudioPlaying, contentStillOnScreen: true
        )))
    }

    /// L'utilisateur a mis la story en pause : sa pause l'emporte.
    mutating func userPaused() {
        _ = ledger.handle(.userPaused)
        isFrozen = false
    }

    /// Un changement de route (casque débranché) coupe le son du canvas, qui
    /// s'en charge ; il n'arrête pas l'horloge.
    private static func concernsTheClock(_ event: MediaSessionCoordinator.Event) -> Bool {
        switch event {
        case .interruptionBegan, .interruptionEndedShouldResume, .interruptionEndedShouldNotResume,
             .callEndedShouldResume:
            return true
        case .routeChangedOldDeviceUnavailable, .routeChangedOther:
            return false
        }
    }

    private mutating func apply(_ action: InterruptionResumeLedger.Action) -> Outcome {
        let wasFrozen = isFrozen
        isFrozen = ledger.holdsInterruptedPlayback
        switch action {
        case .pause:
            return .freeze
        case .resume:
            return .resume
        case .none:
            return wasFrozen && !isFrozen ? .settleAsPause : .none
        }
    }
}
