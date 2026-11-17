import Combine
import MeeshySDK

@MainActor
public struct UserProfileDependencies {
    public let currentUser: @MainActor () -> MeeshyUser?
    public let relationships: any ProfileRelationshipStateProviding
    public let social: any ProfileSocialActionsProviding
    public let userUpdates: AnyPublisher<UserUpdatedEvent, Never>
    public let fallbackProfileLoading: any ProfileLoading
    /// « En commun » (#19377) : communautés, amis et médias partagés, cache d'abord. Absente, la fiche s'en passe.
    public let inCommon: any ProfileInCommonLoading
    /// « Faire connaissance » (#19456) : le verdict « écrire part en demande » et l'envoi. Absente, la fiche s'en passe.
    public let acquaintance: (any ProfileAcquaintanceProviding)?
    /// Hors ligne, ce que la file garde pour la personne (#19465). Absente, la fiche ne pose pas le bloc.
    public let pendingQueue: (any ProfilePendingQueueProviding)?

    public init(
        currentUser: @escaping @MainActor () -> MeeshyUser?,
        relationships: any ProfileRelationshipStateProviding,
        social: any ProfileSocialActionsProviding,
        userUpdates: AnyPublisher<UserUpdatedEvent, Never>,
        fallbackProfileLoading: any ProfileLoading,
        inCommon: any ProfileInCommonLoading = ProfileInCommonUnavailable(),
        acquaintance: (any ProfileAcquaintanceProviding)? = nil,
        pendingQueue: (any ProfilePendingQueueProviding)? = nil
    ) {
        self.currentUser = currentUser
        self.relationships = relationships
        self.social = social
        self.userUpdates = userUpdates
        self.fallbackProfileLoading = fallbackProfileLoading
        self.inCommon = inCommon
        self.acquaintance = acquaintance
        self.pendingQueue = pendingQueue
    }
}
