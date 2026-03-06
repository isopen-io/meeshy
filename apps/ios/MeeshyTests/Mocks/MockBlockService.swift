import Foundation
import MeeshySDK
import XCTest

@MainActor
final class MockBlockService: BlockServiceProviding {
    nonisolated init() {}

    // MARK: - State

    var blockedUserIds: Set<String> = []

    // MARK: - Stubbing

    var blockUserResult: Result<Void, Error> = .success(())
    var unblockUserResult: Result<Void, Error> = .success(())
    var listBlockedUsersResult: Result<[BlockedUser], Error> = .success([])
    var refreshCacheResult: Result<Void, Error> = .success(())

    // MARK: - Call Tracking

    var blockUserCallCount = 0
    var lastBlockUserId: String?

    var unblockUserCallCount = 0
    var lastUnblockUserId: String?

    var listBlockedUsersCallCount = 0

    var isBlockedCallCount = 0

    var refreshCacheCallCount = 0

    // MARK: - Protocol Conformance

    func blockUser(userId: String) async throws {
        blockUserCallCount += 1
        lastBlockUserId = userId
        try blockUserResult.get()
        blockedUserIds.insert(userId)
    }

    func unblockUser(userId: String) async throws {
        unblockUserCallCount += 1
        lastUnblockUserId = userId
        try unblockUserResult.get()
        blockedUserIds.remove(userId)
    }

    func listBlockedUsers() async throws -> [BlockedUser] {
        listBlockedUsersCallCount += 1
        let users = try listBlockedUsersResult.get()
        blockedUserIds = Set(users.map(\.id))
        return users
    }

    func isBlocked(userId: String) -> Bool {
        isBlockedCallCount += 1
        return blockedUserIds.contains(userId)
    }

    func refreshCache() async {
        refreshCacheCallCount += 1
        _ = try? await listBlockedUsers()
    }

    // MARK: - Reset

    func reset() {
        blockedUserIds = []

        blockUserResult = .success(())
        blockUserCallCount = 0
        lastBlockUserId = nil

        unblockUserResult = .success(())
        unblockUserCallCount = 0
        lastUnblockUserId = nil

        listBlockedUsersResult = .success([])
        listBlockedUsersCallCount = 0

        isBlockedCallCount = 0

        refreshCacheCallCount = 0
    }
}
