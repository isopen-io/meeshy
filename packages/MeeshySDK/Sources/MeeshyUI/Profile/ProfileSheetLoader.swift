import Foundation
import Combine
import MeeshySDK

@MainActor
protocol ProfileSheetDataProviding: AnyObject {
    func cachedProfile(for key: String) async -> CacheResult<[MeeshyUser]>
    func fetchProfile(handle: String) async throws -> MeeshyUser
    func storeProfile(_ user: MeeshyUser, lookupKey: String) async
    func cachedStats(for userId: String) async -> CacheResult<[UserStats]>
    func fetchStats(userId: String) async throws -> UserStats
    func storeStats(_ stats: UserStats, userId: String) async
}

@MainActor
final class ProfileSheetLoader: ObservableObject {
    @Published private(set) var profile: MeeshyUser?
    @Published private(set) var stats: UserStats?
    @Published private(set) var isLoadingProfile = false
    @Published private(set) var isLoadingStats = false
    @Published private(set) var isBlockedByTarget = false

    private let data: ProfileSheetDataProviding

    init(data: ProfileSheetDataProviding) {
        self.data = data
    }

    func paintFromCache(userId: String?, username: String) async {}

    func open(userId: String?, username: String) async {}

    func repaint(_ user: MeeshyUser) {}
}
