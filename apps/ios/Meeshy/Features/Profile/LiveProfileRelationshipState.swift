import Combine
import MeeshySDK
import MeeshyUI

@MainActor
final class LiveProfileRelationshipState: ProfileRelationshipStateProviding {
    nonisolated deinit {}

    let changes: AnyPublisher<Void, Never>
    private let friendshipCache: FriendshipCache
    private let blockService: BlockService

    init(friendshipCache: FriendshipCache = .shared, blockService: BlockService = .shared) {
        self.friendshipCache = friendshipCache
        self.blockService = blockService
        self.changes = friendshipCache.objectWillChange.map { _ in () }.eraseToAnyPublisher()
    }

    func status(for userId: String) -> FriendshipStatus {
        friendshipCache.status(for: userId)
    }

    func isBlocked(userId: String) -> Bool {
        blockService.isBlocked(userId: userId)
    }

    func didSendRequest(to receiverId: String, requestId: String) {
        friendshipCache.didSendRequest(to: receiverId, requestId: requestId)
    }

    func didCancelRequest(to receiverId: String) {
        friendshipCache.didCancelRequest(to: receiverId)
    }

    func didAcceptRequest(from senderId: String) {
        friendshipCache.didAcceptRequest(from: senderId)
    }

    func rollbackAccept(senderId: String, requestId: String) {
        friendshipCache.rollbackAccept(senderId: senderId, requestId: requestId)
    }

    func didRejectRequest(from senderId: String) {
        friendshipCache.didRejectRequest(from: senderId)
    }

    func rollbackReject(senderId: String, requestId: String) {
        friendshipCache.rollbackReject(senderId: senderId, requestId: requestId)
    }
}
