import Foundation
import MeeshySDK
import XCTest

final class MockProfileCache: UserProfileCaching, @unchecked Sendable {

    // MARK: - Stubbed Results

    var profileResults: [String: Result<MeeshyUser, Error>] = [:]
    var statsResults: [String: Result<UserStats, Error>] = [:]
    var conversationsResults: [String: Result<[APIConversation], Error>] = [:]

    // MARK: - Call Tracking

    var profileCallCount = 0
    var profileUserIds: [String] = []
    var statsCallCount = 0
    var statsUserIds: [String] = []
    var sharedConversationsCallCount = 0
    var sharedConversationsUserIds: [String] = []
    var invalidateCallCount = 0
    var invalidateUserIds: [String] = []
    var clearAllCallCount = 0

    // MARK: - Default Error

    private let noStubError = NSError(
        domain: "MockProfileCache",
        code: 0,
        userInfo: [NSLocalizedDescriptionKey: "No stub configured"]
    )

    // MARK: - Protocol Methods

    func profile(for userId: String) async throws -> MeeshyUser {
        profileCallCount += 1
        profileUserIds.append(userId)
        guard let result = profileResults[userId] else {
            throw noStubError
        }
        return try result.get()
    }

    func stats(for userId: String) async throws -> UserStats {
        statsCallCount += 1
        statsUserIds.append(userId)
        guard let result = statsResults[userId] else {
            throw noStubError
        }
        return try result.get()
    }

    func sharedConversations(with userId: String) async throws -> [APIConversation] {
        sharedConversationsCallCount += 1
        sharedConversationsUserIds.append(userId)
        guard let result = conversationsResults[userId] else {
            throw noStubError
        }
        return try result.get()
    }

    func invalidate(userId: String) async {
        invalidateCallCount += 1
        invalidateUserIds.append(userId)
        profileResults.removeValue(forKey: userId)
        statsResults.removeValue(forKey: userId)
        conversationsResults.removeValue(forKey: userId)
    }

    func clearAll() async {
        clearAllCallCount += 1
        profileResults.removeAll()
        statsResults.removeAll()
        conversationsResults.removeAll()
    }

    // MARK: - Test Helpers

    func stubProfile(_ user: MeeshyUser, for userId: String) {
        profileResults[userId] = .success(user)
    }

    func stubStats(_ stats: UserStats, for userId: String) {
        statsResults[userId] = .success(stats)
    }

    func stubConversations(_ conversations: [APIConversation], for userId: String) {
        conversationsResults[userId] = .success(conversations)
    }

    // MARK: - Reset

    func reset() {
        profileResults.removeAll()
        statsResults.removeAll()
        conversationsResults.removeAll()
        profileCallCount = 0
        profileUserIds.removeAll()
        statsCallCount = 0
        statsUserIds.removeAll()
        sharedConversationsCallCount = 0
        sharedConversationsUserIds.removeAll()
        invalidateCallCount = 0
        invalidateUserIds.removeAll()
        clearAllCallCount = 0
    }
}
