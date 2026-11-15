import Foundation

/// **L'ANCRE qu'un ENVOI pose** — la moitié ÉCRITURE de #6164.
///
/// `APIQuotedAttachmentReference` est la moitié LECTURE : ce que le fil SERT
/// sous `replyTo.attachmentReplyTo`, `kind` compris. Ce type-ci est son
/// contraire de sens, et ce n'est pas une jumelle qu'on aurait dû fusionner —
/// **la différence de champs EST la règle du lot** :
///
/// > « La NATURE est DÉRIVÉE du MIME relu, jamais de ce que le client déclare :
/// > `kind` est le seul fait descriptif qui survit à une protection posée plus
/// > tard, donc c'est le seul que le client ne doit pas pouvoir forger. »
/// > (`services/gateway/src/services/messaging/attachmentReplySnapshot.ts`)
///
/// Un type unique porterait donc un `kind` que l'écriture n'a PAS le droit de
/// remplir — un champ qu'on doit se souvenir de laisser vide est un champ qui
/// finira rempli. Le schéma REST de la passerelle dit la même chose dans sa
/// forme : `z.object({ attachmentId: z.string().min(1) }).optional()`, et rien
/// d'autre.
///
/// Ce que la passerelle fait de cette ancre : `admitAttachmentReply` relit la
/// ligne de la pièce, REFUSE l'envoi si elle n'appartient pas au message cité,
/// dérive `kind` du MIME relu, et range le couple sous
/// `metadata.attachmentReplyTo`. Citer une pièce sans citer son message est
/// donc refusé côté serveur : `replyToId` accompagne TOUJOURS ce champ.
public struct QuotedAttachmentSend: Encodable, Sendable, Equatable {
    public let attachmentId: String

    public init(attachmentId: String) {
        self.attachmentId = attachmentId
    }

    /// Depuis ce que la CITATION a gravé. `nil` ⇒ la réponse vise le message
    /// entier, et le corps REST n'a alors aucune clé `attachmentReplyTo` —
    /// exactement ce que faisaient toutes les réponses avant ce lot.
    public init?(anchor attachmentId: String?) {
        guard let attachmentId, !attachmentId.isEmpty else { return nil }
        self.attachmentId = attachmentId
    }
}
