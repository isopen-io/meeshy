import Combine
import MeeshySDK
import MeeshyUI

extension UserProfileDependencies {
    static let live = UserProfileDependencies(
        currentUser: { AuthManager.shared.currentUser },
        relationships: LiveProfileRelationshipState(),
        social: LiveProfileSocialActions(),
        userUpdates: MessageSocketManager.shared.userUpdated.eraseToAnyPublisher(),
        fallbackProfileLoading: UncachedProfileLoading(),
        inCommon: LiveProfileInCommonLoading()
    )
}

/// « En commun » (#19377) : le store chiffré du `CacheCoordinator`, clé = la personne, puis `GET /users/:id/in-common`.
/// Seule la réponse complète se grave : une page d'un seul type de médias ne remplace jamais la fiche entière.
@MainActor
final class LiveProfileInCommonLoading: ProfileInCommonLoading {
    nonisolated deinit {}

    private let service: UserInCommonProviding

    init(service: UserInCommonProviding = UserInCommonService.shared) {
        self.service = service
    }

    func cachedInCommon(with userId: String) async -> CacheResult<[UserInCommon]> {
        await CacheCoordinator.shared.profileInCommon.load(for: userId)
    }

    func fetchInCommon(with userId: String, mediaKind: InCommonMediaKind?) async throws -> UserInCommon {
        try await service.inCommon(with: userId, mediaKind: mediaKind)
    }

    func storeInCommon(_ inCommon: UserInCommon) async {
        await bestEffort("profileInCommon.save", category: .cache) {
            try await CacheCoordinator.shared.profileInCommon.save([inCommon], for: inCommon.id)
        }
    }
}
