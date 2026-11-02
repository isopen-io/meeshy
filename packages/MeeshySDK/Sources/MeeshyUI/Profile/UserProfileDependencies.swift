import Combine
import MeeshySDK

@MainActor
public struct UserProfileDependencies {
    public let currentUser: @MainActor () -> MeeshyUser?
    public let relationships: any ProfileRelationshipStateProviding
    public let social: any ProfileSocialActionsProviding
    public let userUpdates: AnyPublisher<UserUpdatedEvent, Never>
    public let fallbackProfileLoading: any ProfileLoading

    public init(
        currentUser: @escaping @MainActor () -> MeeshyUser?,
        relationships: any ProfileRelationshipStateProviding,
        social: any ProfileSocialActionsProviding,
        userUpdates: AnyPublisher<UserUpdatedEvent, Never>,
        fallbackProfileLoading: any ProfileLoading
    ) {
        self.currentUser = currentUser
        self.relationships = relationships
        self.social = social
        self.userUpdates = userUpdates
        self.fallbackProfileLoading = fallbackProfileLoading
    }
}
