import Foundation
import MeeshySDK

// MARK: - Répondre à une pièce SANS quitter son plein écran (#6165)
//
// Un fichier à lui, et non trois lignes de plus dans `+Send.swift` (1 040
// lignes) : la responsabilité tenue ici n'est pas « envoyer un message » mais
// « transformer la pièce REGARDÉE en un envoi qui la cite ». Elle résout le
// PORTEUR, applique la garde de protection et compose l'ancre — trois décisions
// que le chemin d'envoi général n'a pas à connaître.

extension ConversationViewModel {

    /// **Le chemin d'envoi du plein écran** — la barre universelle hébergée
    /// au-dessus du média (`MediaReplyComposerBar`) n'en connaît aucun autre.
    ///
    /// Elle ne reçoit qu'un identifiant de PIÈCE : la galerie ne connaît pas
    /// les messages, seulement des pièces jointes, et c'est le ViewModel qui
    /// tient la liste. Résoudre le porteur ici — plutôt que de le faire
    /// remonter par la vue — est ce qui garantit que le `replyToId` gravé et
    /// l'ancre désignent le MÊME message : la garde serveur
    /// (`admitAttachmentReply`) refuse le couple sinon, et un refus au moment
    /// de l'envoi est un message perdu.
    ///
    /// **La garde de protection est REJOUÉE ici, et ce n'est pas une
    /// redondance.** `FullscreenReplyRoute` décide si le BOUTON existe ; cette
    /// garde décide si l'ENVOI part. Une règle d'affichage n'est pas une règle
    /// d'accès : un second chemin vers la barre — un raccourci clavier, un
    /// geste futur, un rappel d'accessibilité — contournerait la première sans
    /// que rien ne rougisse. C'est la forme du cycle 124 (« un champ de service
    /// qui DÉCLARE une restriction ne la fait pas respecter »), prise à
    /// l'endroit où elle coûte le moins.
    ///
    /// Rend `false` sans rien envoyer quand la pièce est introuvable, protégée,
    /// ou que le texte est vide — l'appelant garde alors son brouillon.
    @discardableResult
    func sendReplyToAttachment(attachmentId: String,
                               text: String,
                               language: String?) async -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        guard let carrier = messages.first(where: { message in
            message.attachments.contains { $0.id == attachmentId }
        }) else { return false }
        guard let piece = carrier.attachments.first(where: { $0.id == attachmentId }),
              !ComposableAttachment.isProtected(piece),
              !carrier.isViewOnce, !carrier.isBlurred, !carrier.isEncrypted
        else { return false }

        return await sendMessage(
            content: trimmed,
            replyToId: carrier.id,
            originalLanguage: language,
            attachmentReplyTo: QuotedAttachmentSend(attachmentId: piece.id)
        )
    }

    /// La CITATION que la barre du plein écran peint au-dessus de sa rangée de
    /// saisie — la vignette de la pièce REGARDÉE, sa nature, son auteur.
    ///
    /// Passe par la fabrique UNIQUE (`optimisticReplyReference(quoting:citing:)`),
    /// celle que la bulle optimiste et la bannière du composeur du fil
    /// emploient déjà : une seconde composition divergerait au premier champ
    /// ajouté — c'est exactement ce que #4945 a payé, et refermé.
    ///
    /// `nil` quand la pièce n'a pas de porteur en mémoire : la barre ne monte
    /// alors pas, plutôt que de monter sans dire ce qu'elle cite.
    func fullscreenReplyCitation(for attachmentId: String) -> ReplyReference? {
        guard let carrier = messages.first(where: { message in
            message.attachments.contains { $0.id == attachmentId }
        }) else { return nil }
        let piece = carrier.attachments.first { $0.id == attachmentId }
        return optimisticReplyReference(quoting: carrier, citing: piece)
    }
}
