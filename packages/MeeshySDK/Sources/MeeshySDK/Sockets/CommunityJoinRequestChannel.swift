import Combine
import Foundation

/// Le canal de `community:join-requested` (#19877), hors de
/// `MessageSocketManager` (au-delà de son budget de cohésion), comme
/// `CommunityMemberChannel` : la route socket y publie, l'écran Membres d'un
/// intendant s'y abonne et relit sa liste.
public final class CommunityJoinRequestChannel: Sendable {
    public static let shared = CommunityJoinRequestChannel()

    private let subject = Locked(uncheckedState: PassthroughSubject<CommunityJoinRequestedEvent, Never>())

    public var requested: PassthroughSubject<CommunityJoinRequestedEvent, Never> {
        subject.mutateUnchecked { $0 }
    }

    /// Le flux vivant, prêt à injecter par défaut dans un écran de l'app.
    public static var live: AnyPublisher<CommunityJoinRequestedEvent, Never> {
        shared.requested.eraseToAnyPublisher()
    }

    /// Une charge sans communauté est écartée : rien n'est relu pour elle.
    func publish(_ event: CommunityJoinRequestedEvent) {
        guard !event.communityId.isEmpty else { return }
        requested.send(event)
    }

    public init() {}
}
