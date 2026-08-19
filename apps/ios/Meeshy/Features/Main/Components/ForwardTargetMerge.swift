import Foundation

/// Une cible que le sélecteur de transfert peut proposer — soit une conversation
/// existante, soit un contact sans conversation encore ouverte.
enum ForwardTargetKind: Equatable {
    case conversation
    case contact
}

struct ForwardTarget: Identifiable, Equatable {
    let id: String              // "conv:<id>" ou "user:<id>" — clé d'état stable
    let kind: ForwardTargetKind
    let conversationId: String? // nil pour un contact sans conversation
    let userId: String?         // identifiant de la personne, nil pour un groupe
    let title: String
    let subtitle: String?
    let avatarURL: String?
}

/// Fusion PURE des cibles du sélecteur de transfert — conversations et contacts.
/// RÈGLE JUMELLE : apps/web/lib/forward-target-merge.ts — toute évolution touche
/// les deux sites.
enum ForwardTargetMerge {
    /// Ordre : conversations (dans l'ordre reçu), puis contacts non absorbés.
    /// Un contact dont `userId` correspond au `userId` d'une conversation
    /// directe déjà listée est ABSORBÉ par elle — une personne n'apparaît
    /// jamais deux fois.
    static func merge(conversations: [ForwardTarget], contacts: [ForwardTarget]) -> [ForwardTarget] {
        var seenIds = Set<String>()
        var joinedUserIds = Set<String>()
        var out: [ForwardTarget] = []

        for target in conversations where seenIds.insert(target.id).inserted {
            if let userId = target.userId { joinedUserIds.insert(userId) }
            out.append(target)
        }
        for target in contacts {
            guard seenIds.insert(target.id).inserted else { continue }
            if let userId = target.userId, joinedUserIds.contains(userId) { continue }
            out.append(target)
        }
        return out
    }
}
