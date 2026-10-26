import Foundation

/// Ce que l'app fait d'un signal reçu.
public enum E2EESignalVerdict: Equatable, Sendable {
    /// Le signal est authentifié et autorisé : il s'applique.
    case apply
    /// Le message visé n'est pas encore connu de cet appareil (le signal a
    /// devancé son message) : le signal attend dans la boîte, il se rejugera.
    case awaitTarget
    /// Le signal ne s'applique jamais, quoi qu'il arrive ensuite.
    case reject(E2EESignalRejection)
}

public enum E2EESignalRejection: String, Equatable, Sendable {
    /// Une action d'une version ultérieure : reconnue, jamais appliquée à moitié.
    case unsupported
    /// Une frappe de mon propre appareil : elle ne s'affiche pas chez moi.
    case ownEcho
    /// Modifier ou supprimer pour tous un message dont l'expéditeur n'est pas l'auteur.
    case notAuthor
    /// La vue unique ne se consomme que par MON geste, sur un de MES appareils.
    case notOwnDevice
    /// Le message visé appartient à une autre conversation que celle du signal.
    case targetElsewhere
    /// Une charge hors de ses bornes (emoji, texte, liste d'accusés, position).
    case malformed
}

/// **La loi d'un signal reçu** (#13142, #13060). L'appareil émetteur est
/// authentifié par libsignal et nommé dans le chiffré (`E2EEReceivedSignal`) ;
/// cette loi dit, pour CHAQUE action, qui a le droit de la faire. L'auteur d'un
/// message est celui que libsignal a authentifié à SA réception, rangé dans le
/// coffre avec son clair (`E2EEPlaintextEntry.readable(_, senderUserId:)`), jamais
/// l'auteur que le serveur annonce sur la ligne.
///
/// Référence : Signal ne laisse supprimer pour tous ou modifier un message
/// qu'à son auteur (`DataMessage.Delete`, `EditMessage` : l'expéditeur du
/// contrôle doit être celui du message visé), et la vue unique ne se consomme
/// que par la synchro de MES appareils (`SyncMessage.ViewOnceOpen`).
///
/// Modèle de menace : serveur compromis. Il ne forge aucun signal (libsignal),
/// mais il peut en retenir, en retarder, en rejouer l'enveloppe (libsignal
/// refuse le rejeu) et réordonner. Il ne fait jamais effacer un clair.
public enum E2EESignalAuthority {
    public static let maxEmojiBytes = 64
    public static let maxEditedTextLength = 20_000
    public static let maxReceiptTargets = 500

    public static func verdict(for received: E2EEReceivedSignal, localUserId: String, target: E2EEPlaintextEntry?) -> E2EESignalVerdict {
        let fromMe = received.senderUserId == localUserId
        switch received.signal.action {
        case .unknown:
            return .reject(.unsupported)
        case .typing:
            return fromMe ? .reject(.ownEcho) : .apply
        case .receipt(_, let targets):
            return (1...maxReceiptTargets).contains(targets.count) ? .apply : .reject(.malformed)
        case .reaction(_, let emoji, _):
            guard isEmoji(emoji) else { return .reject(.malformed) }
            return known(target, in: received)
        case .readProgress(_, _, let position, _):
            guard position.isFinite, position >= 0 else { return .reject(.malformed) }
            return known(target, in: received)
        case .pin:
            return known(target, in: received)
        case .edit(_, let text, _):
            guard !text.isEmpty, text.count <= maxEditedTextLength else { return .reject(.malformed) }
            return authored(target, in: received)
        case .deleteForEveryone:
            return authored(target, in: received)
        case .viewOnceOpened:
            guard fromMe else { return .reject(.notOwnDevice) }
            return known(target, in: received)
        }
    }

    private static func isEmoji(_ emoji: String) -> Bool {
        !emoji.isEmpty && emoji.utf8.count <= maxEmojiBytes && !emoji.contains(where: \.isNewline)
    }

    /// Le message visé est connu ici, et dans la conversation du signal.
    private static func known(_ target: E2EEPlaintextEntry?, in received: E2EEReceivedSignal) -> E2EESignalVerdict {
        switch target {
        case nil: .awaitTarget
        case .undecryptable: .apply
        case .readable(let content, _): content.belongs(to: received.conversationId) ? .apply : .reject(.targetElsewhere)
        }
    }

    /// Le message visé est connu, lisible, dans la conversation du signal, et son
    /// auteur authentifié est l'expéditeur du signal. Un message illisible n'a pas
    /// d'auteur connu : personne ne le modifie ni ne le supprime pour tous.
    private static func authored(_ target: E2EEPlaintextEntry?, in received: E2EEReceivedSignal) -> E2EESignalVerdict {
        switch target {
        case nil:
            return .awaitTarget
        case .undecryptable:
            return .reject(.notAuthor)
        case .readable(let content, let author):
            guard content.belongs(to: received.conversationId) else { return .reject(.targetElsewhere) }
            return author == received.senderUserId ? .apply : .reject(.notAuthor)
        }
    }
}
