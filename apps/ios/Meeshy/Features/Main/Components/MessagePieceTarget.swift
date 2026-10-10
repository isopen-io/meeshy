import Foundation
import CoreGraphics
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

    // MARK: - L'aperçu d'UNE pièce (#9907)

    /// Les pièces que l'aperçu fait défiler : les TUILES du message — photos et
    /// vidéos —, dans l'ordre où le message les porte.
    static func pieces(of message: Message) -> [MessageAttachment] {
        message.attachments.filter { $0.type == .image || $0.type == .video }
    }

    /// La pièce visée, si elle est bien une tuile de CE message. `nil` ⇒ l'appui
    /// long vise le message entier, et l'aperçu reste celui du message.
    static func piece(_ attachmentId: String?, in message: Message) -> MessageAttachment? {
        guard let attachmentId else { return nil }
        return pieces(of: message).first { $0.id == attachmentId }
    }

    /// Le rang (à partir de 0) de la pièce parmi les tuiles du message.
    static func index(of attachmentId: String, in message: Message) -> Int? {
        pieces(of: message).firstIndex { $0.id == attachmentId }
    }

    /// L'indicateur visible : « 3/7 ».
    static func position(index: Int, count: Int) -> String {
        "\(index + 1)/\(max(count, index + 1))"
    }

    /// **La pièce se montre-t-elle en clair dans l'aperçu ?** Non dès qu'elle,
    /// ou son message, est à vue unique, floutée ou chiffrée : l'appui long ne
    /// dévoile pas ce que le fil retient (#8009), et ne l'enregistre pas.
    static func isProtected(_ piece: MessageAttachment, in message: Message) -> Bool {
        ComposableAttachment.isProtected(piece)
            || message.holdsViewOnce
            || message.isBlurred
            || message.isEncrypted
    }

    /// **La taille d'une pièce dans la scène de l'aperçu, à son RATIO.**
    ///
    /// La plus grande taille qui tient dans `bounds` sans changer le rapport
    /// largeur/hauteur : jamais étirée, jamais rognée. Un ratio inconnu (≤ 0)
    /// vaut un carré.
    static func fittedSize(ratio: CGFloat, in bounds: CGSize) -> CGSize {
        guard bounds.width > 0, bounds.height > 0 else { return .zero }
        let safeRatio = ratio > 0 ? ratio : 1
        let widthBound = CGSize(width: bounds.width, height: bounds.width / safeRatio)
        guard widthBound.height > bounds.height else { return widthBound }
        return CGSize(width: bounds.height * safeRatio, height: bounds.height)
    }

    /// **L'ancre d'une réponse à UNE pièce** (#9908) — ce que l'envoi transmet
    /// sous `attachmentReplyTo`. Elle n'existe que si la citation en attente
    /// NOMME encore la pièce choisie : un autre geste de réponse (glisser,
    /// « Répondre » du message) remplace la citation, et l'ancre tombe d'elle-même.
    static func replyAnchor(pending: ReplyReference?, pieceId: String?) -> QuotedAttachmentSend? {
        guard let pieceId, let pending, !pending.isStoryReply,
              pending.attachmentId == pieceId else { return nil }
        return QuotedAttachmentSend(attachmentId: pieceId)
    }

    /// La pièce suivante (`step = 1`) ou précédente (`-1`), bornée aux tuiles du
    /// message — le geste d'accessibilité « balayer vers le haut / le bas ».
    static func neighbour(of attachmentId: String, step: Int, in message: Message) -> String? {
        let all = pieces(of: message)
        guard let current = all.firstIndex(where: { $0.id == attachmentId }) else { return nil }
        let next = current + step
        guard all.indices.contains(next) else { return nil }
        return all[next].id
    }
}

// MARK: - Le menu de la pièce (#9907, #9908)

/// **Le menu d'une pièce visée** — logique pure, à côté de
/// `MessageActionResolver` dont il partage le vocabulaire (`PrimaryAction`).
enum MessagePieceMenu {

    /// Ce que le menu sait de la pièce visée — des VERDICTS, jamais des
    /// drapeaux bruts à recombiner.
    struct Context: Equatable {
        /// `MessagePieceTarget.isProtected` : vue unique, flou, chiffrement.
        let isProtected: Bool
        /// La loi de sortie du message porteur (`Message.exitOffer`).
        let exits: MessageExitOffer
        /// L'utilisateur a-t-il le droit de supprimer (auteur, admin, modérateur).
        let canDelete: Bool
    }

    /// Répondre, enregistrer, supprimer : chacun atteint la pièce AFFICHÉE.
    ///
    /// - une pièce protégée ne se cite ni ne s'enregistre : sa forme se montre,
    ///   jamais son contenu ;
    /// - l'enregistrement suit la loi de sortie du message (#9573) ;
    /// - la suppression suit le droit de l'utilisateur, protégée ou non ;
    /// - « Tout le message » ferme toujours la liste : l'aperçu d'une pièce ne
    ///   retire jamais l'accès au message entier.
    ///
    /// **Transférer une seule pièce n'est pas offert** : la passerelle copie
    /// TOUTES les pièces du message transféré (`copyForwardedAttachments`), et
    /// une entrée « Transférer » enverrait le lot entier sous le nom d'une
    /// pièce. Elle entrera ici quand la passerelle saura copier une pièce.
    static func actions(_ ctx: Context) -> [PrimaryAction] {
        var out: [PrimaryAction] = []
        if !ctx.isProtected { out.append(.replyToPiece) }
        if !ctx.isProtected && ctx.exits.offers(.save) { out.append(.saveMedia) }
        if ctx.canDelete { out.append(.deletePiece) }
        out.append(.wholeMessage)
        return out
    }
}
