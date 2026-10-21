import Foundation

/// **Ce que devient une demande d'ouverture depuis la liste** (#11213, revue
/// adversariale).
///
/// Le verrou par PIN d'une conversation n'est vérifié qu'ICI : ni le fil, ni
/// le routeur ne le revérifient. Tout chemin qui ouvre une conversation depuis
/// la liste — le toucher d'une rangée, le clavier, la carte d'aperçu, sa loupe,
/// l'entrée « Rechercher » du menu natif — lit donc cette loi, par
/// `ConversationListView.openConversation(_:searching:)`.
///
/// La recherche demandée sur une conversation verrouillée attend le PIN : armée
/// avant, elle survivrait à un PIN abandonné et s'ouvrirait dans la prochaine
/// conversation venue.
enum ConversationOpenRoute: Equatable {
    case open(searching: Bool)
    case unlockFirst(searching: Bool)

    static func resolve(isLocked: Bool, searching: Bool) -> ConversationOpenRoute {
        isLocked ? .unlockFirst(searching: searching) : .open(searching: searching)
    }

    static func resolve(
        _ conversationId: String,
        searching: Bool,
        locks: ConversationLockManager = .shared
    ) -> ConversationOpenRoute {
        resolve(isLocked: locks.isLocked(conversationId), searching: searching)
    }

    var presentsLockSheet: Bool {
        guard case .unlockFirst = self else { return false }
        return true
    }

    var armsSearchNow: Bool {
        guard case .open(let searching) = self else { return false }
        return searching
    }

    var searchesAfterUnlock: Bool {
        guard case .unlockFirst(let searching) = self else { return false }
        return searching
    }
}
