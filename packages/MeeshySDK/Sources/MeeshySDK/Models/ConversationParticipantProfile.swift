import Foundation

/// Fiche d'un participant — pensée d'abord pour ceux qui n'ont PAS de compte.
///
/// Un visiteur entré par lien a rempli un formulaire pour passer la porte, et
/// rien de ce qu'il y a écrit n'était lisible ensuite : les autres membres ne
/// voyaient qu'un pseudo. Un participant sans fiche est un participant qu'on ne
/// peut ni reconnaître, ni accueillir, ni modérer.
///
/// DEUX CERCLES, tranchés par le gateway et non par le client :
///   - l'IDENTITÉ (nom, pseudo, langue, arrivée, lien emprunté) est servie à
///     tout membre — c'est ce que la personne montre en entrant ;
///   - les COORDONNÉES (`email`, `birthday`) arrivent à `nil` pour un membre
///     ordinaire, même quand la personne les a fournies. Elles n'ont été
///     demandées que parce que l'HÔTE a coché `requireEmail` / `requireBirthday`
///     sur son lien : elles lui reviennent, à lui et à ses modérateurs, pas à
///     une salle qui contient d'autres visiteurs venus par ce même lien public.
///
/// `hasEmail` / `hasBirthday` disent qu'une coordonnée EXISTE sans la livrer.
/// Sans eux, un visiteur qui a tout rempli et un visiteur qui n'a rien donné
/// s'afficheraient à l'identique, et l'hôte ne saurait pas si sa condition
/// d'entrée a été honorée.
///
/// Source : `GET /conversations/:id/participants/:participantId/profile`.
/// Nommé `Conversation…` parce que `ParticipantProfile` est DÉJÀ pris par
/// l'analyse agent (`AgentAnalysisModels.swift`) — un profil de style
/// rédactionnel, sans rapport. Deux types homonymes dans le même module se
/// seraient masqués l'un l'autre.
public struct ConversationParticipantProfile: Decodable, Sendable, Equatable {
    public let participantId: String
    public let conversationId: String
    /// Le participant n'a pas de compte.
    public let isAnonymous: Bool
    public let userId: String?
    public let username: String?
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let avatar: String?
    public let language: String?
    public let country: String?
    public let conversationRole: String?
    public let joinedAt: Date?
    public let isOnline: Bool
    public let lastActiveAt: Date?
    /// Nom du lien de partage emprunté pour entrer.
    public let shareLinkName: String?
    public let hasEmail: Bool
    public let hasBirthday: Bool
    /// `nil` quand le lecteur n'est pas administrateur/modérateur de la
    /// conversation — voir le second cercle ci-dessus.
    public let email: String?
    public let birthday: Date?

    /// Nom lisible : ce que la personne a écrit en entrant, à défaut son pseudo.
    public var resolvedFullName: String {
        let full = [firstName, lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        if !full.isEmpty { return full }
        return displayName ?? username ?? ""
    }
}
