import Foundation
import MeeshySDK

/// **Ouvrir une vue unique** (#7618) — le toucher de la puce
/// `(1) · Touchez pour afficher`, dans les cinq modes.
///
/// Tant qu'il n'est pas ouvert, le message est SCELLÉ : aucun mode ne reçoit
/// son contenu (`MeeshyMessage.sealedForDisplay`). L'ouverture est donc une
/// donnée de la visite, tenue ICI, et non un état de feuille : une feuille ne
/// peut pas rendre ce que son modèle ne porte plus, et la cellule du fil lit le
/// message depuis GRDB, jamais depuis `messages`.
///
/// - un MÉDIA s'ouvre en plein écran, et c'est l'hôte qui le présente : il ne
///   se révèle jamais dans la bulle ;
/// - un TEXTE se lit sur place : le message est marqué révélé, et chaque mode
///   le reçoit de nouveau avec son contenu.
extension ConversationViewModel {

    enum ViewOnceOpening {
        /// Le plein écran à présenter, sur cette pièce.
        case fullscreen(MessageAttachment)
        /// Le texte est révélé à sa place dans le fil.
        case inPlace
        /// Rien à ouvrir : message inconnu ou sans vue unique.
        case unavailable
    }

    func openViewOnce(messageId: String) -> ViewOnceOpening {
        guard let index = messages.firstIndex(where: { $0.id == messageId }),
              messages[index].holdsViewOnce else {
            return .unavailable
        }
        if let media = messages[index].openableViewOnceMedia {
            return .fullscreen(media)
        }
        revealedViewOnceIds[messageId] = true
        messages[index].isViewOnceRevealed = true
        return .inPlace
    }

    /// Pose la révélation de la visite sur des messages relus du magasin : une
    /// écriture GRDB (un accusé, une réaction) ne doit pas refermer un texte
    /// que le lecteur est en train de lire.
    func applyingViewOnceReveals(_ incoming: [Message]) -> [Message] {
        guard !revealedViewOnceIds.isEmpty else { return incoming }
        return incoming.map { message in
            guard revealedViewOnceIds[message.id] == true else { return message }
            var revealed = message
            revealed.isViewOnceRevealed = true
            return revealed
        }
    }
}
