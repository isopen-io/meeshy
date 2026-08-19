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

    /// Une conversation trouvée par `GET /conversations/search` n'est une cible
    /// de transfert que si l'utilisateur peut y ÉCRIRE, donc s'il en est membre.
    ///
    /// La route retourne délibérément aussi les conversations `public`/`global`
    /// dont l'appelant n'est PAS membre (`search.ts:131-137`) — elle sert aussi
    /// la recherche globale, qui les veut. Offrir un salon public homonyme
    /// comme cible produit « Permissions insuffisantes pour envoyer des
    /// messages » : une cible qui ne peut jamais fonctionner.
    ///
    /// Deux branches, parce que la clause `WHERE` de la route en a deux :
    /// - tout type AUTRE que `public`/`global` n'a pu être trouvé que par
    ///   `participants some { userId }` — appartenance garantie par
    ///   construction, sans rien lire du corps de la réponse ;
    /// - pour `public`/`global`, seul le tableau `participants` du corps le dit.
    ///
    /// LIMITE CONNUE : ce tableau est tronqué à 5 par le `include` de la route.
    /// Un salon public de plus de 5 membres dont on EST membre peut donc être
    /// écarté à tort. Le seul correctif exact est serveur (émettre la ligne de
    /// participant de l'appelant, ou un drapeau d'appartenance) — d'ici là, le
    /// salon reste atteignable par la liste paginée, tandis qu'une cible
    /// impossible ne l'est jamais.
    ///
    /// RÈGLE JUMELLE : `isReachableForwardConversation`
    /// (`apps/web/lib/forward-target-merge.ts`).
    static func isReachableConversation(
        type: String,
        participantUserIds: [String],
        currentUserId: String
    ) -> Bool {
        let openTypes: Set<String> = ["public", "global"]
        guard openTypes.contains(type.lowercased()) else { return true }
        guard !currentUserId.isEmpty else { return false }
        return participantUserIds.contains(currentUserId)
    }
}
