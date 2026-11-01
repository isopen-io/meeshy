import Combine
import Foundation
import MeeshySDK
@testable import MeeshyUI

struct StubFailure: Error {}

@MainActor
final class SpyProfileRelationshipState: ProfileRelationshipStateProviding {
    nonisolated deinit {}

    var statuses: [String: FriendshipStatus] = [:]
    var blockedIds: Set<String> = []
    private(set) var events: [String] = []
    private let subject = PassthroughSubject<Void, Never>()

    var changes: AnyPublisher<Void, Never> { subject.eraseToAnyPublisher() }

    func status(for userId: String) -> FriendshipStatus { statuses[userId] ?? .none }
    func isBlocked(userId: String) -> Bool { blockedIds.contains(userId) }
    func didSendRequest(to receiverId: String, requestId: String) { events.append("didSend:\(receiverId):\(requestId)") }
    func didCancelRequest(to receiverId: String) { events.append("didCancel:\(receiverId)") }
    func didAcceptRequest(from senderId: String) { events.append("didAccept:\(senderId)") }
    func rollbackAccept(senderId: String, requestId: String) { events.append("rollbackAccept:\(senderId):\(requestId)") }
    func didRejectRequest(from senderId: String) { events.append("didReject:\(senderId)") }
    func rollbackReject(senderId: String, requestId: String) { events.append("rollbackReject:\(senderId):\(requestId)") }
}

@MainActor
final class StubProfileSocialActions: ProfileSocialActionsProviding {
    nonisolated deinit {}

    var sendResult: Result<FriendRequest, Error> = .failure(StubFailure())
    var deleteResult: Result<Void, Error> = .success(())
    var respondResult: Result<Void, Error> = .success(())
    var blockResult: Result<Void, Error> = .success(())
    var unblockResult: Result<Void, Error> = .success(())
    var reportResult: Result<Void, Error> = .success(())
    var postsResult: Result<[APIPost], Error> = .success([])

    private(set) var sendCalls: [String] = []
    private(set) var deleteCalls: [String] = []
    private(set) var respondCalls: [(requestId: String, accepted: Bool)] = []
    private(set) var blockCalls: [String] = []
    private(set) var unblockCalls: [String] = []
    private(set) var reportCalls: [(userId: String, reportType: String)] = []

    func sendFriendRequest(to userId: String) async throws -> FriendRequest {
        sendCalls.append(userId)
        return try sendResult.get()
    }

    func deleteFriendRequest(_ requestId: String) async throws {
        deleteCalls.append(requestId)
        try deleteResult.get()
    }

    func respondToFriendRequest(_ requestId: String, accepted: Bool) async throws {
        respondCalls.append((requestId, accepted))
        try respondResult.get()
    }

    func blockUser(_ userId: String) async throws {
        blockCalls.append(userId)
        try blockResult.get()
    }

    func unblockUser(_ userId: String) async throws {
        unblockCalls.append(userId)
        try unblockResult.get()
    }

    func reportUser(_ userId: String, reportType: String) async throws {
        reportCalls.append((userId, reportType))
        try reportResult.get()
    }

    func userPosts(of userId: String) async throws -> [APIPost] {
        try postsResult.get()
    }
}

@MainActor
final class EmptyProfileLoading: ProfileLoading {
    nonisolated deinit {}

    func cachedProfile(for key: String) async -> CacheResult<[MeeshyUser]> { .empty }
    func fetchProfile(handle: String) async throws -> MeeshyUser { throw StubFailure() }
    func storeProfile(_ user: MeeshyUser, lookupKey: String) async {}
    func cachedStats(for userId: String) async -> CacheResult<[UserStats]> { .empty }
    func fetchStats(userId: String) async throws -> UserStats { throw StubFailure() }
    func storeStats(_ stats: UserStats, userId: String) async {}
    func sharedConversations(with userId: String, currentUserId: String) async throws -> [MeeshyConversation] { [] }
}

@MainActor
enum ProfileDependencyDoubles {
    static func make(
        currentUser: MeeshyUser? = nil,
        relationships: any ProfileRelationshipStateProviding = SpyProfileRelationshipState(),
        social: any ProfileSocialActionsProviding = StubProfileSocialActions()
    ) -> UserProfileDependencies {
        UserProfileDependencies(
            currentUser: { currentUser },
            relationships: relationships,
            social: social,
            userUpdates: Empty<UserUpdatedEvent, Never>().eraseToAnyPublisher(),
            fallbackProfileLoading: EmptyProfileLoading()
        )
    }

    static func makeFriendRequest(id: String = "req-1") -> FriendRequest {
        FriendRequest(id: id, senderId: "me", receiverId: "u-bob", status: "pending", createdAt: Date(timeIntervalSince1970: 0))
    }
}
