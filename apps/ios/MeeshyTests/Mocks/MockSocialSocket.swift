import Combine
import Foundation
import MeeshySDK
import XCTest

enum MockSocialSocketError: Error { case notImplemented }

final class MockSocialSocket: SocialSocketProviding, @unchecked Sendable {

    // MARK: - State

    var isConnected: Bool = false
    var connectionState: ConnectionState = .disconnected

    // MARK: - Publishers

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
    let conversationDeleted = PassthroughSubject<String, Never>()
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
    let didReconnect = PassthroughSubject<Void, Never>()

    // MARK: - Call Tracking

    var connectCallCount = 0
    var disconnectCallCount = 0
    var subscribeFeedCallCount = 0
    var unsubscribeFeedCallCount = 0

    // MARK: - Protocol Methods

    func connect() {
        connectCallCount += 1
        isConnected = true
        connectionState = .connected
    }

    func disconnect() {
        disconnectCallCount += 1
        isConnected = false
        connectionState = .disconnected
    }

    func subscribeFeed() {
        subscribeFeedCallCount += 1
    }

    func unsubscribeFeed() {
        unsubscribeFeedCallCount += 1
    }

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

    // MARK: - Simulation Helpers

    func simulatePostCreated(_ post: APIPost, clientMutationId: String? = nil) {
        postCreated.send(SocketPostCreatedData(post: post, clientMutationId: clientMutationId))
    }

    func simulatePostDeleted(_ postId: String) {
        postDeleted.send(postId)
    }

    func simulateDisconnect() {
        isConnected = false
        connectionState = .disconnected
    }

    // MARK: - Reset

    func reset() {
        isConnected = false
        connectionState = .disconnected
        connectCallCount = 0
        disconnectCallCount = 0
        subscribeFeedCallCount = 0
        unsubscribeFeedCallCount = 0
    }
}
