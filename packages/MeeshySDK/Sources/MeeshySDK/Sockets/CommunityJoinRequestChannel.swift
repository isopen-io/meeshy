import Combine
import Foundation

/// Le canal de `community:join-requested` (#19877), hors de
/// `MessageSocketManager` (au-delà de son budget de cohésion), comme
/// `CommunityMemberChannel` : la route socket y publie, l'écran Membres d'un
/// intendant s'y abonne et relit sa liste. `community:join-request-decided`
/// (#19948) y passe aussi : le détail du DEMANDEUR s'y abonne.
public final class CommunityJoinRequestChannel: Sendable {
    public static let shared = CommunityJoinRequestChannel()

    private let subject = Locked(uncheckedState: PassthroughSubject<CommunityJoinRequestedEvent, Never>())

    private let decidedSubject = Locked(uncheckedState: PassthroughSubject<CommunityJoinRequestDecidedEvent, Never>())

    public var requested: PassthroughSubject<CommunityJoinRequestedEvent, Never> {
        subject.mutateUnchecked { $0 }
    }

    public var decided: PassthroughSubject<CommunityJoinRequestDecidedEvent, Never> {
        decidedSubject.mutateUnchecked { $0 }
    }

    /// Les décisions sur la demande du lecteur, prêtes à injecter dans le détail.
    public static var liveDecisions: AnyPublisher<CommunityJoinRequestDecidedEvent, Never> {
        shared.decided.eraseToAnyPublisher()
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

    /// Une décision qui ne se lit pas (communauté absente, décision inconnue,
    /// date illisible) est écartée : l'écran garde ce qu'il montrait.
    func publish(_ event: CommunityJoinRequestDecidedEvent) {
        guard event.refusedUntil != nil else { return }
        decided.send(event)
    }

    public init() {}
}
