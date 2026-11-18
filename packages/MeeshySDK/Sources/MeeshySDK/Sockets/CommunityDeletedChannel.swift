import Combine
import Foundation

/// `community:deleted` (#19590, consommé sur iOS par #19591) — la communauté
/// vient d'être supprimée par son créateur (`deleted`) ou désactivée par
/// l'équipe (`deactivated`), diffusé sur la room personnelle de chaque membre
/// actif et du créateur.
///
/// Miroir de `CommunityDeletedEventData`
/// (`packages/shared/types/socketio-events/community.ts`). La charge ne dit que
/// QUELLE communauté a disparu : ni membres, ni créateur, ni identité.
public struct CommunityDeletedEvent: Decodable, Sendable, Equatable {
    public let communityId: String
    /// `deleted` (le créateur) · `deactivated` (l'équipe).
    public let reason: String
    public let at: String

    public init(communityId: String, reason: String, at: String) {
        self.communityId = communityId; self.reason = reason; self.at = at
    }

    /// La communauté disparue, `nil` quand la charge ne désigne rien : rien
    /// n'est retiré sur une charge illisible.
    public var disappearedId: String? {
        communityId.isEmpty ? nil : communityId
    }
}

/// Le canal de `community:deleted`, hors de `MessageSocketManager` (au-delà de
/// son budget de cohésion), comme `CommunityUpdateChannel` : la route socket y
/// publie l'identifiant de la communauté disparue,
/// `MessageSocketProviding.communityDeleted` le sert.
public final class CommunityDeletedChannel: Sendable {
    public static let shared = CommunityDeletedChannel()

    private let subject = Locked(uncheckedState: PassthroughSubject<String, Never>())

    public var deleted: PassthroughSubject<String, Never> {
        subject.mutateUnchecked { $0 }
    }

    /// Le flux vivant, prêt à injecter par défaut dans un écran de l'app.
    public static var live: AnyPublisher<String, Never> {
        shared.deleted.eraseToAnyPublisher()
    }

    func publish(_ event: CommunityDeletedEvent) {
        guard let communityId = event.disappearedId else { return }
        deleted.send(communityId)
    }

    public init() {}
}
