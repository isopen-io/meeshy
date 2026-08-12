import Combine
@testable import MeeshySDK

enum MockSocialSocketError: Error { case notImplemented }

final class MockSocialSocket: SocialSocketProviding, @unchecked Sendable {
    let postCreated = PassthroughSubject<SocketPostCreatedData, Never>()
    let postUpdated = PassthroughSubject<APIPost, Never>()
    let postDeleted = PassthroughSubject<String, Never>()
    let postLiked = PassthroughSubject<SocketPostLikedData, Never>()
    let postUnliked = PassthroughSubject<SocketPostUnlikedData, Never>()
    let postReposted = PassthroughSubject<SocketPostRepostedData, Never>()
    let postBookmarked = PassthroughSubject<SocketPostBookmarkedData, Never>()
    let storyCreated = PassthroughSubject<APIPost, Never>()
    let storyViewed = PassthroughSubject<SocketStoryViewedData, Never>()
    let storyReacted = PassthroughSubject<SocketStoryReactedData, Never>()
    let storyUnreacted = PassthroughSubject<SocketStoryUnreactedData, Never>()
    let statusCreated = PassthroughSubject<APIPost, Never>()
    let statusDeleted = PassthroughSubject<String, Never>()
    let statusUpdated = PassthroughSubject<APIPost, Never>()
    let statusReacted = PassthroughSubject<SocketStatusReactedData, Never>()
    let statusUnreacted = PassthroughSubject<SocketStatusUnreactedData, Never>()
    let commentAdded = PassthroughSubject<SocketCommentAddedData, Never>()
    let commentDeleted = PassthroughSubject<SocketCommentDeletedData, Never>()
    let commentLiked = PassthroughSubject<SocketCommentLikedData, Never>()
    let storyTranslationUpdated = PassthroughSubject<SocketStoryTranslationUpdatedData, Never>()
    let postTranslationUpdated = PassthroughSubject<SocketPostTranslationUpdatedData, Never>()
    let commentTranslationUpdated = PassthroughSubject<SocketCommentTranslationUpdatedData, Never>()
    let commentMediaUpdated = PassthroughSubject<SocketCommentMediaUpdatedData, Never>()
    let storyUpdated = PassthroughSubject<SocketStoryUpdatedData, Never>()
    let storyDeleted = PassthroughSubject<SocketStoryDeletedData, Never>()
    let commentReactionAdded = PassthroughSubject<SocketCommentReactionUpdateEvent, Never>()
    let commentReactionRemoved = PassthroughSubject<SocketCommentReactionUpdateEvent, Never>()
    let commentReactionSync = PassthroughSubject<SocketCommentReactionSyncEvent, Never>()
    let postReactionAdded = PassthroughSubject<SocketPostReactionUpdateEvent, Never>()
    let postReactionRemoved = PassthroughSubject<SocketPostReactionUpdateEvent, Never>()
    let postReactionSync = PassthroughSubject<SocketPostReactionSyncEvent, Never>()
    let conversationDeleted = PassthroughSubject<String, Never>()
    let didReconnect = PassthroughSubject<Void, Never>()

    var isConnected: Bool = false
    var connectionState: ConnectionState = .disconnected

    private(set) var connectCallCount = 0
    private(set) var disconnectCallCount = 0
    private(set) var subscribeFeedCallCount = 0

    func connect() { connectCallCount += 1 }
    func disconnect() { disconnectCallCount += 1 }
    func subscribeFeed() { subscribeFeedCallCount += 1 }
    func unsubscribeFeed() {}

    func joinPostRoom(postId: String) {}
    func leavePostRoom(postId: String) {}

    func addCommentReaction(commentId: String, postId: String, emoji: String) async throws -> SocketCommentReactionUpdateEvent {
        throw MockSocialSocketError.notImplemented
    }
    func removeCommentReaction(commentId: String, postId: String, emoji: String) async throws -> SocketCommentReactionUpdateEvent {
        throw MockSocialSocketError.notImplemented
    }
    func requestCommentReactionSync(commentId: String) async throws -> SocketCommentReactionSyncEvent {
        throw MockSocialSocketError.notImplemented
    }
    func addPostReaction(postId: String, emoji: String) async throws -> SocketPostReactionUpdateEvent {
        throw MockSocialSocketError.notImplemented
    }
    func removePostReaction(postId: String, emoji: String) async throws -> SocketPostReactionUpdateEvent {
        throw MockSocialSocketError.notImplemented
    }
    func requestPostReactionSync(postId: String) async throws -> SocketPostReactionSyncEvent {
        throw MockSocialSocketError.notImplemented
    }
}
