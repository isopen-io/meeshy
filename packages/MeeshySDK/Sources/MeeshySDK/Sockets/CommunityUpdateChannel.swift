import Combine
import Foundation

/// `community:updated` (#18435, consommé sur iOS par #18439) — l'identité
/// publique d'une communauté telle qu'elle vient d'être ÉCRITE, diffusée sur la
/// room personnelle de chaque membre actif et du créateur.
///
/// Miroir de `CommunityUpdatedEventData` (`packages/shared/types/socketio-events/community.ts`).
/// La charge ne porte que ce que tout membre lit déjà dans le détail : ni
/// membres, ni présence, ni « N en ligne », ni créateur. Le nom et la
/// description voyagent tels que STOCKÉS (#16786), comme dans la réponse
/// HTTP : le client les lit par le même chemin, sans décodage propre.
public struct CommunityUpdatedEvent: Decodable, Sendable, Equatable {
    public let communityId: String
    public let identifier: String
    public let name: String
    public let description: String?
    public let avatar: String?
    public let banner: String?
    public let isPrivate: Bool
    public let memberCount: Int
    /// Chaîne ISO 8601 ; `writtenAt` en est la lecture.
    public let updatedAt: String

    public init(
        communityId: String, identifier: String, name: String, description: String?,
        avatar: String?, banner: String?, isPrivate: Bool, memberCount: Int, updatedAt: String
    ) {
        self.communityId = communityId; self.identifier = identifier; self.name = name
        self.description = description; self.avatar = avatar; self.banner = banner
        self.isPrivate = isPrivate; self.memberCount = memberCount; self.updatedAt = updatedAt
    }

    /// L'instant de l'écriture, `nil` si la chaîne est illisible.
    public var writtenAt: Date? {
        WireDate.date(from: updatedAt)
    }
}

/// Le canal de `community:updated`, hors de `MessageSocketManager` (au-delà de
/// son budget de cohésion), comme `ConversationObsolescenceChannel` : la route
/// socket y publie, `MessageSocketProviding.communityUpdated` le sert.
public final class CommunityUpdateChannel: Sendable {
    public static let shared = CommunityUpdateChannel()

    private let subject = Locked(uncheckedState: PassthroughSubject<CommunityUpdatedEvent, Never>())

    public var updated: PassthroughSubject<CommunityUpdatedEvent, Never> {
        subject.mutateUnchecked { $0 }
    }

    /// Le flux vivant, prêt à injecter par défaut dans un écran de l'app.
    public static var live: AnyPublisher<CommunityUpdatedEvent, Never> {
        shared.updated.eraseToAnyPublisher()
    }

    public init() {}
}
