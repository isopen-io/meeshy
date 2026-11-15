import Foundation
import MeeshySDK

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
    nonisolated static func mayDetach(isLocked: Bool) -> Bool { !isLocked }

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

// MARK: - Le toucher de l'avatar d'une ligne (#15887)

/// Ce qu'ouvre le toucher de l'avatar d'une ligne : le profil du pair, les
/// détails de la conversation, ou — verrouillée par PIN, quel que soit son
/// type — la porte du verrou PUIS les détails. Jamais le fil, que le toucher
/// d'un avatar ne demande pas ; jamais rien.
nonisolated enum ConversationAvatarRoute: Equatable, Sendable {
    case profile(userId: String)
    case info
    case unlockThenInfo

    var opensProfile: Bool {
        guard case .profile = self else { return false }
        return true
    }
}

extension ConversationOpenRoute {
    /// La cible vient de la loi du SDK (`ConversationAvatarTarget`) ; la liste
    /// y ajoute la porte du verrou, qu'un profil ne contourne pas.
    nonisolated static func avatarRoute(target: ConversationAvatarTarget, isLocked: Bool) -> ConversationAvatarRoute {
        guard !isLocked else { return .unlockThenInfo }
        switch target {
        case .profile(let userId): return .profile(userId: userId)
        case .conversationInfo: return .info
        }
    }

    /// Le verrou et le blocage relus MAINTENANT : la ligne s'en sert à son
    /// rendu, la liste au toucher.
    static func avatarRoute(
        for conversation: Conversation,
        locks: ConversationLockManager = .shared,
        blocks: BlockServiceProviding = BlockService.shared
    ) -> ConversationAvatarRoute {
        let isPeerBlocked = conversation.participantUserId.map { blocks.isBlocked(userId: $0) } ?? false
        return avatarRoute(
            target: conversation.avatarTarget(isPeerBlocked: isPeerBlocked),
            isLocked: locks.isLocked(conversation.id)
        )
    }
}
