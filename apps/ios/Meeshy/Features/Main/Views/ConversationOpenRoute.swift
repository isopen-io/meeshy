import Foundation

/// **Ce que devient une demande d'ouverture depuis la liste** (#11213, revue
/// adversariale).
///
/// La LISTE demande le PIN elle-même, avant de remettre l'ouverture au
/// routeur : tout chemin qui ouvre une conversation depuis la liste — le
/// toucher d'une rangée, le clavier, la carte d'aperçu, sa loupe, l'entrée
/// « Rechercher » du menu natif — lit cette loi, par
/// `ConversationListView.openConversation(_:searching:)`. Les autres chemins
/// (lien profond, notification, recherche globale, widget, Siri…) sont gardés
/// par la porte du routeur, `Router.admitConversation` (#11386), que la liste
/// traverse aussi : le PIN donné ici y vaut UNE ouverture.
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

    /// Une fenêtre détachée monte le fil sans repasser par la liste : elle ne
    /// s'offre donc qu'à une conversation que le PIN ne garde pas.
    static func mayDetach(isLocked: Bool) -> Bool { !isLocked }

    static func mayDetach(_ conversationId: String, locks: ConversationLockManager = .shared) -> Bool {
        mayDetach(isLocked: locks.isLocked(conversationId))
    }

    /// La fiche de détails (membres, médias, liens) ne s'ouvre pas devant un PIN
    /// que le fil exigerait : même règle que la fenêtre détachée.
    static func mayShowInfo(isLocked: Bool) -> Bool { !isLocked }

    static func mayShowInfo(_ conversationId: String, locks: ConversationLockManager = .shared) -> Bool {
        mayShowInfo(isLocked: locks.isLocked(conversationId))
    }

    /// L'aperçu d'un toast de notification (appui long) monte le fil en lecture
    /// sans passer la porte du routeur (#11386) : même règle qu'une fenêtre
    /// détachée. Refusé, l'appui long se replie sur le toucher, qui la passe.
    static func mayPreview(_ conversationId: String, locks: ConversationLockManager = .shared) -> Bool {
        mayDetach(isLocked: locks.isLocked(conversationId))
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
