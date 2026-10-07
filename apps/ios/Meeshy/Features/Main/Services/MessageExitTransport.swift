import UIKit
import MeeshySDK

/// **Le SECOND verrou des sorties d'un message** (#9573).
///
/// Le premier verrou est le rendu : un bouton que `MessageExitOffer` n'offre
/// pas n'est pas monté. Celui-ci tient le GESTE — copier, enregistrer, partager
/// — pour qu'un gestionnaire appelé par une autre porte (menu resté ouvert
/// pendant que le message change de nature, hôte qui oublie de filtrer) ne
/// fasse rien. Les sites qui exécutent une sortie passent par ici au lieu
/// d'écrire dans le presse-papiers ou de composer une requête eux-mêmes.
@MainActor
enum MessageExitTransport {

    /// Copie `text` si le message offre la copie ; sinon ne touche à rien.
    @discardableResult
    static func copy(_ text: String, of message: Message, to pasteboard: UIPasteboard = .general) -> Bool {
        guard message.exitOffer.offers(.copy) else { return false }
        pasteboard.string = text
        return true
    }

    /// La requête d'enregistrement de la pièce que le menu désigne — la première
    /// qui n'est pas un lieu —, ou `nil` quand la loi de sortie la retient.
    static func saveRequest(for message: Message) -> MediaSaveRequest? {
        guard message.exitOffer.offers(.save),
              let attachment = message.attachments.first(where: { $0.type != .location }) else { return nil }
        return MediaSaveRequest(
            kind: attachment.kind,
            origin: .transmitted,
            remoteURLString: attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl,
            suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
            attachmentId: attachment.id.isEmpty ? nil : attachment.id
        )
    }

    /// Enregistre la pièce que le menu désigne par le coordinateur de l'hôte,
    /// auquel il remet le portillon DE CE MESSAGE : le coordinateur refuse de
    /// lui-même si la loi retient la pièce. Rend `false` quand rien n'est parti.
    @discardableResult
    static func save(_ message: Message, through coordinator: MediaSaveCoordinator) -> Bool {
        coordinator.exitGate = message.exitGate
        guard let request = saveRequest(for: message) else { return false }
        coordinator.save(request)
        return true
    }

    /// Le message peut-il partir dans la feuille de partage système ?
    static func mayShare(_ message: Message) -> Bool {
        message.exitOffer.offers(.share)
    }
}

/// **L'aperçu d'une pièce du composeur, AVANT l'envoi** (#9573).
///
/// Ce plein écran ne montre jamais un média de conversation : c'est le fichier
/// que l'auteur vient de choisir sur son propre appareil et n'a pas encore
/// envoyé (`ConversationComposerState.previewMedia`, posé par les bannières du
/// composeur). Aucun message ne le porte, aucune loi de sortie ne le juge — le
/// portillon y est ouvert, et c'est ce type qui le dit, pour que le site ne
/// porte pas une constante sans raison.
enum ComposerPreviewExit {
    static let gate = ContentExitGate.open
}
