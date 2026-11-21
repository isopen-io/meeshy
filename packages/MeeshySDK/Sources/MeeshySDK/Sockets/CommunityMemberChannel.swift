import Combine
import Foundation

/// `community:member-joined`, `community:member-left`,
/// `community:member-role-updated` (#18766, consommés sur iOS par #18767) —
/// l'effectif d'une communauté vient de changer, diffusé sur la room
/// personnelle de chaque membre actif, du créateur et de la personne concernée.
///
/// Miroirs de `CommunityMemberJoinedEventData`, `CommunityMemberLeftEventData`
/// et `CommunityMemberRoleUpdatedEventData`
/// (`packages/shared/types/socketio-events/community.ts`). La personne n'est
/// nommée que par son identifiant : ni profil, ni présence, ni coordonnées.
public struct CommunityMemberJoinedEvent: Decodable, Sendable, Equatable {
    public let communityId: String
    public let userId: String
    /// `admin` · `moderator` · `member`.
    public let role: String
    /// `self` (entrée d'elle-même) · `invited` (invitation, ajout).
    public let via: String
    public let memberCount: Int
    public let at: String

    public init(communityId: String, userId: String, role: String, via: String, memberCount: Int, at: String) {
        self.communityId = communityId; self.userId = userId; self.role = role
        self.via = via; self.memberCount = memberCount; self.at = at
    }
}

public struct CommunityMemberLeftEvent: Decodable, Sendable, Equatable {
    public let communityId: String
    public let userId: String
    /// `left` (sortie d'elle-même) · `removed` (retirée par un administrateur).
    public let reason: String
    public let memberCount: Int
    public let at: String

    public init(communityId: String, userId: String, reason: String, memberCount: Int, at: String) {
        self.communityId = communityId; self.userId = userId; self.reason = reason
        self.memberCount = memberCount; self.at = at
    }
}

public struct CommunityMemberRoleUpdatedEvent: Decodable, Sendable, Equatable {
    public let communityId: String
    public let userId: String
    public let role: String
    public let memberCount: Int
    public let at: String

    public init(communityId: String, userId: String, role: String, memberCount: Int, at: String) {
        self.communityId = communityId; self.userId = userId; self.role = role
        self.memberCount = memberCount; self.at = at
    }
}

/// Ce que les trois gestes disent, lu d'une seule façon (miroir du
/// `MemberChange` du web et du `CommunityMemberChange` Android) : la
/// communauté, la personne, l'effectif actif après l'écriture, et le rôle
/// qu'elle TIENT après le geste — `nil` quand elle est sortie.
///
/// Une charge illisible est écartée (`init?` rend `nil`) : identifiant vide,
/// effectif négatif, rôle inconnu. Rien n'est inventé.
public struct CommunityMemberChange: Sendable, Equatable {
    public let communityId: String
    public let userId: String
    public let memberCount: Int
    public let role: MemberRole?

    public init?(communityId: String, userId: String, memberCount: Int, role: MemberRole?) {
        guard !communityId.isEmpty, !userId.isEmpty, memberCount >= 0 else { return nil }
        self.communityId = communityId; self.userId = userId
        self.memberCount = memberCount; self.role = role
    }

    public init?(_ event: CommunityMemberJoinedEvent) {
        guard let role = Self.heldRole(event.role) else { return nil }
        self.init(communityId: event.communityId, userId: event.userId, memberCount: event.memberCount, role: role)
    }

    public init?(_ event: CommunityMemberLeftEvent) {
        self.init(communityId: event.communityId, userId: event.userId, memberCount: event.memberCount, role: nil)
    }

    public init?(_ event: CommunityMemberRoleUpdatedEvent) {
        guard let role = Self.heldRole(event.role) else { return nil }
        self.init(communityId: event.communityId, userId: event.userId, memberCount: event.memberCount, role: role)
    }

    /// `creator` n'est pas un rôle d'appartenance : la passerelle ne l'émet pas.
    private static func heldRole(_ raw: String) -> MemberRole? {
        MemberRole(rawValue: raw).flatMap { $0 == .creator ? nil : $0 }
    }

    /// La personne concernée est-elle le lecteur ? Un lecteur inconnu ne l'est jamais.
    public func concerns(readerId: String) -> Bool {
        !readerId.isEmpty && userId == readerId
    }
}

/// Le canal des trois gestes, hors de `MessageSocketManager` (au-delà de son
/// budget de cohésion), comme `CommunityUpdateChannel` : les routes socket y
/// publient, `MessageSocketProviding.communityMemberChanged` le sert.
public final class CommunityMemberChannel: Sendable {
    public static let shared = CommunityMemberChannel()

    private let subject = Locked(uncheckedState: PassthroughSubject<CommunityMemberChange, Never>())

    public var changed: PassthroughSubject<CommunityMemberChange, Never> {
        subject.mutateUnchecked { $0 }
    }

    /// Le flux vivant, prêt à injecter par défaut dans un écran de l'app.
    public static var live: AnyPublisher<CommunityMemberChange, Never> {
        shared.changed.eraseToAnyPublisher()
    }

    func publish(_ change: CommunityMemberChange?) {
        guard let change else { return }
        changed.send(change)
    }

    public init() {}
}
