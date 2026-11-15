import Combine
import MeeshySDK
import MeeshyUI

extension UserProfileDependencies {
    static let live = UserProfileDependencies(
        currentUser: { AuthManager.shared.currentUser },
        relationships: LiveProfileRelationshipState(),
        social: LiveProfileSocialActions(),
        userUpdates: MessageSocketManager.shared.userUpdated.eraseToAnyPublisher(),
        fallbackProfileLoading: UncachedProfileLoading()
    )
}
