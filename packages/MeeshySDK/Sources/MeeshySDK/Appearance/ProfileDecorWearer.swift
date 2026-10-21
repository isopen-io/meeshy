import Foundation

/// Un résumé de PERSONNE qui porte son décor servi (#10945) — auteur de post, de commentaire, de
/// story ou de message, participant, résultat de recherche, demande d'ami, membre de communauté,
/// suggestion de mention, contact rapproché. La passerelle n'y sert que le contour
/// (`profileDecor.avatarRing`) ; il est absent sans contour, et son décodage ne fait jamais
/// échouer le résumé (`ServedProfileDecor` est tolérant par côté).
public protocol ProfileDecorWearer {
    var profileDecor: ServedProfileDecor? { get }
}

extension ProfileDecorWearer {
    /// Le contour équipé, ce que l'avatar dessine ; `nil` sans contour.
    public var avatarRing: ServedProfileDecorItem? { profileDecor?.avatarRing }
}

extension APIMessageSender: ProfileDecorWearer {}
extension APIParticipant: ProfileDecorWearer {}
extension PaginatedParticipant: ProfileDecorWearer {}
