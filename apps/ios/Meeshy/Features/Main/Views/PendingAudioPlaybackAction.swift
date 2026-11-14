import Foundation
import MeeshyUI

/// Ce que fait le bouton de lecture d'un vocal en attente d'envoi (#7171).
///
/// Le composeur n'a qu'un lecteur : il tient au plus un vocal, et la tuile
/// touchée n'est pas forcément celui qu'il tient. Un lecteur arrêté garde
/// l'identifiant du dernier vocal mais plus son son — `isLoaded` le dit.
nonisolated enum PendingAudioPlaybackAction: Equatable {
    /// Le vocal touché est en lecture : le mettre en pause.
    case pause
    /// Le vocal touché est chargé et en pause : reprendre où il s'est arrêté.
    case resume
    /// Un autre vocal, ou aucun, est chargé : démarrer celui-ci depuis son fichier.
    case start

    static func resolve(
        isPlaying: Bool,
        isLoaded: Bool,
        loadedAttachmentId: String?,
        tappedAttachmentId: String
    ) -> Self {
        guard isLoaded, loadedAttachmentId == tappedAttachmentId else { return .start }
        return isPlaying ? .pause : .resume
    }
}

/// Exécute la loi sur le lecteur du composeur : le toucher d'une tuile devient
/// pause, reprise ou démarrage du fichier du plateau.
@MainActor
struct PendingAudioPlayback {
    let player: AudioPlaybackManager

    func toggle(attachmentId: String, fileURL: URL?) {
        let action = PendingAudioPlaybackAction.resolve(
            isPlaying: player.isPlaying,
            isLoaded: player.currentUrl != nil,
            loadedAttachmentId: player.attachmentId,
            tappedAttachmentId: attachmentId
        )
        switch action {
        case .pause, .resume:
            player.togglePlayPause()
        case .start:
            guard let fileURL else { return }
            player.attachmentId = attachmentId
            player.playLocal(url: fileURL)
        }
    }
}
