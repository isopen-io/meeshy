import Foundation
import MeeshySDK

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
    /// Le titre est-il le NOM DE PROFIL de la personne ? Faux pour un contact
    /// du répertoire, titré par le nom que l'utilisateur lui a donné dans son
    /// carnet — un renommage de profil n'a pas à l'écraser.
    var followsProfileName = true
}

extension ForwardTarget {
    /// #9307 — la cible d'un pair suit `user:updated` par la loi du SDK
    /// (`UserUpdatedEvent.composedName`, `OptionalMediaChange.applied`) ;
    /// `nil` quand elle ne le désigne pas ou que rien ne change.
    func repainted(by event: UserUpdatedEvent) -> ForwardTarget? {
        guard userId == event.userId else { return nil }
        let renamed = followsProfileName ? event.composedName : nil
        let handle = renamed != nil && kind == .contact ? event.username.map { "@\($0)" } : nil
        let next = ForwardTarget(
            id: id, kind: kind, conversationId: conversationId, userId: userId,
            title: renamed ?? title,
            subtitle: handle ?? subtitle,
            avatarURL: event.avatar.applied(to: avatarURL),
            followsProfileName: followsProfileName
        )
        return next == self ? nil : next
    }
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
    /// dont l'appelant n'est PAS membre (`search.ts`) — elle sert aussi la
    /// recherche globale, qui les veut. Offrir un salon public homonyme comme
    /// cible produit « Permissions insuffisantes pour envoyer des messages » :
    /// une cible qui ne peut jamais fonctionner.
    ///
    /// `isMember` est le drapeau SERVEUR (`search.ts`, décision du user
    /// 2026-08-19) et la seule autorité quand il est présent : depuis cette
    /// décision, la route n'émet plus AUCUN participant pour un non-membre, et
    /// le tableau qu'elle émet pour un membre reste tronqué à cinq — il ne peut
    /// donc ni prouver ni infirmer l'appartenance à lui seul. C'est ce qui
    /// faisait disparaître de sa propre recherche le salon public de plus de
    /// cinq personnes dont l'utilisateur EST membre.
    ///
    /// `isMember == nil` = gateway antérieur : on retombe sur l'heuristique
    /// historique plutôt que de tout écarter.
    /// - tout type AUTRE que `public`/`global` n'a pu être trouvé que par
    ///   `participants some { userId }` — appartenance garantie par
    ///   construction, sans rien lire du corps de la réponse ;
    /// - pour `public`/`global`, seul le tableau `participants` du corps le dit.
    ///
    /// RÈGLE JUMELLE : `isReachableForwardConversation`
    /// (`apps/web/lib/forward-target-merge.ts`).
    static func isReachableConversation(
        type: String,
        participantUserIds: [String],
        currentUserId: String,
        isMember: Bool? = nil
    ) -> Bool {
        if let isMember { return isMember }
        let openTypes: Set<String> = ["public", "global"]
        guard openTypes.contains(type.lowercased()) else { return true }
        guard !currentUserId.isEmpty else { return false }
        return participantUserIds.contains(currentUserId)
    }
}
