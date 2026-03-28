import Combine
@testable import MeeshySDK

final class MockSocialSocket: SocialSocketProviding, @unchecked Sendable {
    let postCreated = PassthroughSubject<APIPost, Never>()
    let postUpdated = PassthroughSubject<APIPost, Never>()
    let postDeleted = PassthroughSubject<String, Never>()
    let postLiked = PassthroughSubject<SocketPostLikedData, Never>()
    let postUnliked = PassthroughSubject<SocketPostUnlikedData, Never>()
    let postReposted = PassthroughSubject<SocketPostRepostedData, Never>()
    let postBookmarked = PassthroughSubject<SocketPostBookmarkedData, Never>()
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
    let postTranslationUpdated = PassthroughSubject<SocketPostTranslationUpdatedData, Never>()
    let commentTranslationUpdated = PassthroughSubject<SocketCommentTranslationUpdatedData, Never>()

    var isConnected: Bool = false
    var connectionState: ConnectionState = .disconnected

    private(set) var connectCallCount = 0
    private(set) var disconnectCallCount = 0
    private(set) var subscribeFeedCallCount = 0

    func connect() { connectCallCount += 1 }
    func disconnect() { disconnectCallCount += 1 }
    func subscribeFeed() { subscribeFeedCallCount += 1 }
    func unsubscribeFeed() {}
}
