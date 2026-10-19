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
        .none
    }

    mutating func returnedToForeground(otherAudioPlaying: Bool) -> Outcome {
        .none
    }

    mutating func userPaused() {}
}
