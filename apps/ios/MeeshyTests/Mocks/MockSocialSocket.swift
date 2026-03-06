import Combine
import Foundation
import MeeshySDK
import XCTest

final class MockSocialSocket: SocialSocketProviding, @unchecked Sendable {

    // MARK: - State

    var isConnected: Bool = false
    var connectionState: ConnectionState = .disconnected

    // MARK: - Publishers

    let postCreated = PassthroughSubject<APIPost, Never>()
    let postUpdated = PassthroughSubject<APIPost, Never>()
    let postDeleted = PassthroughSubject<String, Never>()
    let postLiked = PassthroughSubject<SocketPostLikedData, Never>()
    let postUnliked = PassthroughSubject<SocketPostUnlikedData, Never>()
    let postReposted = PassthroughSubject<SocketPostRepostedData, Never>()
    let storyCreated = PassthroughSubject<APIPost, Never>()
    let storyViewed = PassthroughSubject<SocketStoryViewedData, Never>()
    let storyReacted = PassthroughSubject<SocketStoryReactedData, Never>()
    let statusCreated = PassthroughSubject<APIPost, Never>()
    let statusDeleted = PassthroughSubject<String, Never>()
    let statusUpdated = PassthroughSubject<APIPost, Never>()
    let statusReacted = PassthroughSubject<SocketStatusReactedData, Never>()
    let commentAdded = PassthroughSubject<SocketCommentAddedData, Never>()
    let commentDeleted = PassthroughSubject<SocketCommentDeletedData, Never>()
    let commentLiked = PassthroughSubject<SocketCommentLikedData, Never>()
    let storyTranslationUpdated = PassthroughSubject<SocketStoryTranslationUpdatedData, Never>()

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

    // MARK: - Simulation Helpers

    func simulatePostCreated(_ post: APIPost) {
        postCreated.send(post)
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
