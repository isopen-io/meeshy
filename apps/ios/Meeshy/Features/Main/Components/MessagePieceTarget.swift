import Foundation
import MeeshySDK

// MARK: - La pièce qu'un geste vise dans un message (milestone « Chaque pièce d'un message se vise seule »)

/// **Ce qu'un geste sur une PIÈCE désigne, et ce qu'il a le droit d'atteindre.**
///
/// Un message porte souvent plusieurs pièces. Jusqu'ici, toute action de menu
/// partait du MESSAGE et se rabattait sur sa première pièce quand il fallait en
/// nommer une : « Supprimer le média » effaçait `attachments.first`, quelle que
/// soit la photo que l'utilisateur avait en tête (#9906). La règle vit ici,
/// pure, pour que chaque surface — la feuille « Plus… », l'aperçu d'appui long,
/// le plein écran — pose la MÊME question à la MÊME fonction.
nonisolated enum MessagePieceTarget {

    /// **La pièce que « Supprimer le média » efface — jamais une voisine.**
    ///
    /// - une pièce VISÉE l'est si elle appartient bien au message ;
    /// - sans visée, un message qui ne porte qu'UNE pièce (hors lieu) la
    ///   désigne sans ambiguïté ;
    /// - sans visée, un LOT ne désigne rien : effacer la première serait
    ///   effacer une pièce que personne n'a choisie.
    static func deletableMedia(in message: Message, targeted attachmentId: String?) -> String? {
        let pieces = message.attachments.filter { $0.type != .location }
        if let attachmentId {
            return pieces.first { $0.id == attachmentId }?.id
        }
        return pieces.count == 1 ? pieces[0].id : nil
    }
}
