import Foundation
import Combine

// MARK: - Protocol

public protocol SocialSocketProviding: Sendable {
    var postCreated: PassthroughSubject<SocketPostCreatedData, Never> { get }
    var postUpdated: PassthroughSubject<APIPost, Never> { get }
    var postDeleted: PassthroughSubject<String, Never> { get }
    var postLiked: PassthroughSubject<SocketPostLikedData, Never> { get }
    var postUnliked: PassthroughSubject<SocketPostUnlikedData, Never> { get }
    var postReposted: PassthroughSubject<SocketPostRepostedData, Never> { get }
    var postBookmarked: PassthroughSubject<SocketPostBookmarkedData, Never> { get }
    var storyCreated: PassthroughSubject<APIPost, Never> { get }
    var storyUpdated: PassthroughSubject<SocketStoryUpdatedData, Never> { get }
    var storyDeleted: PassthroughSubject<SocketStoryDeletedData, Never> { get }
    var storyViewed: PassthroughSubject<SocketStoryViewedData, Never> { get }
    var storyReacted: PassthroughSubject<SocketStoryReactedData, Never> { get }
    var storyUnreacted: PassthroughSubject<SocketStoryUnreactedData, Never> { get }
    var statusCreated: PassthroughSubject<APIPost, Never> { get }
    var statusDeleted: PassthroughSubject<String, Never> { get }
    var statusUpdated: PassthroughSubject<APIPost, Never> { get }
    var statusReacted: PassthroughSubject<SocketStatusReactedData, Never> { get }
    var statusUnreacted: PassthroughSubject<SocketStatusUnreactedData, Never> { get }
    var conversationDeleted: PassthroughSubject<String, Never> { get }
    var commentAdded: PassthroughSubject<SocketCommentAddedData, Never> { get }
    var commentUpdated: PassthroughSubject<SocketCommentUpdatedData, Never> { get }
    var commentDeleted: PassthroughSubject<SocketCommentDeletedData, Never> { get }
    var commentLiked: PassthroughSubject<SocketCommentLikedData, Never> { get }
    var commentUnliked: PassthroughSubject<SocketCommentLikedData, Never> { get }
    var commentReactionAdded: PassthroughSubject<SocketCommentReactionUpdateEvent, Never> { get }
    var commentReactionRemoved: PassthroughSubject<SocketCommentReactionUpdateEvent, Never> { get }
    var commentReactionSync: PassthroughSubject<SocketCommentReactionSyncEvent, Never> { get }
    var postReactionAdded: PassthroughSubject<SocketPostReactionUpdateEvent, Never> { get }
    var postReactionRemoved: PassthroughSubject<SocketPostReactionUpdateEvent, Never> { get }
    var postReactionSync: PassthroughSubject<SocketPostReactionSyncEvent, Never> { get }
    var storyTranslationUpdated: PassthroughSubject<SocketStoryTranslationUpdatedData, Never> { get }
    var postTranslationUpdated: PassthroughSubject<SocketPostTranslationUpdatedData, Never> { get }
    var commentTranslationUpdated: PassthroughSubject<SocketCommentTranslationUpdatedData, Never> { get }
    var commentMediaUpdated: PassthroughSubject<SocketCommentMediaUpdatedData, Never> { get }
    var mediaCaptionTranslationUpdated: PassthroughSubject<SocketMediaCaptionTranslationUpdatedData, Never> { get }
    /// Fires on every reconnect (a `.connect` that follows a previous one).
    /// App-side feed handlers (FeedViewModel) observe this to backfill posts /
    /// reactions missed while the social socket was down.
    var didReconnect: PassthroughSubject<Void, Never> { get }
    var isConnected: Bool { get }
    var connectionState: ConnectionState { get }
    func connect()
    func disconnect()
    func subscribeFeed()
    func unsubscribeFeed()
    func joinPostRoom(postId: String)
    func leavePostRoom(postId: String)
    func addCommentReaction(commentId: String, postId: String, emoji: String) async throws -> SocketCommentReactionUpdateEvent
    func removeCommentReaction(commentId: String, postId: String, emoji: String) async throws -> SocketCommentReactionUpdateEvent
    func requestCommentReactionSync(commentId: String) async throws -> SocketCommentReactionSyncEvent
    func addPostReaction(postId: String, emoji: String) async throws -> SocketPostReactionUpdateEvent
    func removePostReaction(postId: String, emoji: String) async throws -> SocketPostReactionUpdateEvent
    func requestPostReactionSync(postId: String) async throws -> SocketPostReactionSyncEvent
}
