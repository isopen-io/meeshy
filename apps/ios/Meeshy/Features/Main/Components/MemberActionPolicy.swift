import Foundation
import MeeshySDK

/// Quelles actions de gestion un rang donné peut exercer sur un membre — et,
/// question distincte et bien plus facile à rater, **avec quel identifiant**.
///
/// Les trois routes de gestion (`PATCH …/participants/:userId/role`,
/// `DELETE …/participants/:userId`, `PATCH …/participants/:userId/ban`) filtrent
/// toutes sur la colonne `Participant.userId`. Le trombinoscope leur passait
/// `participant.id` — le `Participant.id` — et rien ne le distinguait à l'œil :
/// les deux sont des ObjectId de 24 caractères, portés côte à côte par le même
/// modèle. Promouvoir répondait 404 ; retirer répondait **200 sans rien faire**,
/// le gateway filtrant par `updateMany`, qui ne trouve aucune ligne et n'échoue
/// pas.
///
/// La quatrième route de la famille — `/participants/:participantId/rights`,
/// pour un visiteur sans compte — attend, elle, un `Participant.id`. Les deux
/// natures coexistent donc à un segment d'URL près : c'est pourquoi le choix
/// vit ici, nommé et testé, plutôt que réparti dans les fermetures d'une vue.
///
/// Règle produit, app-side par nature (cf. `packages/MeeshySDK/CLAUDE.md`) : le
/// SDK fournit les appels, l'orchestration « qui peut quoi » reste ici.
enum MemberActionPolicy {

    enum Kind: Equatable {
        case promoteToAdmin
        case promoteToModerator
        case demoteToMember
        case expel
        case ban

        /// Le rang à poster au gateway, pour les seules actions qui en changent.
        var targetRole: String? {
            switch self {
            case .promoteToAdmin: return "ADMIN"
            case .promoteToModerator: return "MODERATOR"
            case .demoteToMember: return "MEMBER"
            case .expel, .ban: return nil
            }
        }
    }

    struct Action: Equatable {
        let kind: Kind
        /// La clé à mettre dans l'URL — un `User.id` pour un compte, un
        /// `Participant.id` pour un visiteur venu par un lien partagé, qui n'a
        /// pas de ligne `User`. Les routes d'expulsion et de bannissement
        /// résolvent leur cible sous les DEUX colonnes ; celle du RANG, non, et
        /// c'est pourquoi la politique ne l'offre qu'aux comptes.
        ///
        /// Le champ s'appelait `targetUserId` et affirmait en commentaire être
        /// « TOUJOURS un User.id, jamais un Participant.id ». C'était vrai du
        /// correctif qui l'a écrit, et faux du geste : un invariant énoncé plus
        /// large que ce qu'il garde devient la loi que le suivant lit.
        let targetKey: String
    }

    static func actions(
        for participant: APIParticipant,
        currentUserRole: MemberRole
    ) -> [Action] {
        // La clé à envoyer. Expulser et bannir résolvent leur cible sous les DEUX
        // colonnes côté gateway (`User.id` OU `Participant.id`), donc un visiteur
        // venu par un lien partagé — qui n'a aucune ligne `User` — est atteignable
        // par son `Participant.id`, sa seule identité.
        let hasAccount = participant.userId != nil
        let targetKey = participant.userId ?? participant.id

        // `effectiveRole` lit `conversationRole` avant le rôle PLATEFORME :
        // confondre les deux donnerait à tout ADMIN de la plateforme un rang
        // d'admin dans chaque conversation.
        let targetRole = MemberRole(rawValue: participant.effectiveRole.lowercased()) ?? .member
        guard currentUserRole > targetRole else { return [] }

        var kinds: [Kind] = []

        // Changer un RANG reste réservé aux comptes : la route de rang est
        // adressée par `User.id` seul, et promouvoir un visiteur de passage n'a
        // pas de sens produit. Ses droits d'écriture se pilotent par
        // `/participants/:participantId/rights`, qui est un autre écran.
        if hasAccount {
            if currentUserRole == .creator && targetRole < .admin {
                kinds.append(.promoteToAdmin)
            }
            if currentUserRole.hasMinimumRole(.admin) && targetRole == .member {
                kinds.append(.promoteToModerator)
            }
            if targetRole > .member {
                kinds.append(.demoteToMember)
            }
        }

        kinds.append(.expel)

        // Bannir, c'est expulser ET fermer la porte : le gateway invalide le lien
        // de partage par lequel la personne est entrée. C'est le geste qui compte
        // face à un visiteur indésirable — sans lui, il revient par le même lien
        // sous un autre pseudonyme.
        if currentUserRole.hasMinimumRole(.admin) {
            kinds.append(.ban)
        }

        return kinds.map { Action(kind: $0, targetKey: targetKey) }
    }
}
