import Foundation
import Combine
import MeeshySDK
import os

// MARK: - FeedSocketHandler

/// Routes real-time Socket.IO events from SocialSocketManager to FeedPersistenceActor.
/// Each event is decoded into a persistence record and written atomically to the actor.
/// Subscribes on @MainActor so Combine publisher callbacks are guaranteed on the main thread.
@MainActor
final class FeedSocketHandler {
    private let persistence: FeedPersistenceActor
    private let socialSocket: SocialSocketProviding
    private var cancellables = Set<AnyCancellable>()

    init(
        persistence: FeedPersistenceActor,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared
    ) {
        self.persistence = persistence
        self.socialSocket = socialSocket
    }

    // MARK: - Lifecycle

    /// Idempotent : appelé à CHAQUE apparition du feed (le `disarm()` de
    /// l'`onDisappear` doit être ré-armé au retour, pas seulement au premier
    /// setup) — sans la garde, des sinks dupliqués s'accumuleraient.
    func arm() {
        guard cancellables.isEmpty else { return }
        // Post events
        socialSocket.postCreated
            .sink { [weak self] payload in
                Task { await self?.handlePostUpsert(payload.post) }
            }
            .store(in: &cancellables)

        socialSocket.postUpdated
            .sink { [weak self] post in
                Task { await self?.handlePostUpsert(post) }
            }
            .store(in: &cancellables)

        socialSocket.postDeleted
            .sink { [weak self] postId in
                Task { try? await self?.persistence.deletePost(id: postId) }
            }
            .store(in: &cancellables)

        socialSocket.postLiked
            .sink { [weak self] data in
                Task { await self?.handlePostLiked(data) }
            }
            .store(in: &cancellables)

        socialSocket.postUnliked
            .sink { [weak self] data in
                Task { await self?.handlePostUnliked(data) }
            }
            .store(in: &cancellables)

        socialSocket.postReposted
            .sink { [weak self] data in
                Task { await self?.handlePostUpsert(data.repost) }
            }
            .store(in: &cancellables)

        socialSocket.postBookmarked
            .sink { _ in
                // Bookmark state is UI-only — no persistence record to update
            }
            .store(in: &cancellables)

        // Comment events
        socialSocket.commentAdded
            .sink { [weak self] data in
                Task { await self?.handleCommentAdded(data) }
            }
            .store(in: &cancellables)

        socialSocket.commentDeleted
            .sink { [weak self] data in
                Task {
                    try? await self?.persistence.deleteComment(id: data.commentId)
                    try? await self?.persistence.updateCommentCount(
                        postId: data.postId,
                        count: data.commentCount
                    )
                }
            }
            .store(in: &cancellables)

        socialSocket.commentLiked
            .sink { [weak self] data in
                Task { await self?.handleCommentLiked(data) }
            }
            .store(in: &cancellables)

        // Comment emoji reactions — persist the ABSOLUTE per-emoji count so it
        // survives a cold start. The live UI (PostDetailViewModel) only tracks the
        // current user's heart state in-memory; without this bridge the aggregate
        // count reverted to the last REST snapshot on app restart. Mirror of the
        // `post:reaction-*` persistence path above.
        socialSocket.commentReactionAdded
            .sink { [weak self] event in
                Task { await self?.handleCommentReaction(event) }
            }
            .store(in: &cancellables)

        socialSocket.commentReactionRemoved
            .sink { [weak self] event in
                Task { await self?.handleCommentReaction(event) }
            }
            .store(in: &cancellables)

        socialSocket.commentReactionSync
            .sink { [weak self] event in
                Task { await self?.handleCommentReactionSync(event) }
            }
            .store(in: &cancellables)

        // Reaction events (emoji, non-heart) — persist to GRDB so the count
        // survives an app restart. The live UI already updates in-session via
        // FeedViewModel / PostDetailViewModel; without this bridge the cached
        // count was stale on cold start.
        socialSocket.postReactionAdded
            .sink { [weak self] event in
                Task { await self?.handlePostReaction(event) }
            }
            .store(in: &cancellables)

        socialSocket.postReactionRemoved
            .sink { [weak self] event in
                Task { await self?.handlePostReaction(event) }
            }
            .store(in: &cancellables)

        // Translation events
        socialSocket.postTranslationUpdated
            .sink { [weak self] data in
                Task { await self?.handlePostTranslationUpdated(data) }
            }
            .store(in: &cancellables)
    }

    func disarm() {
        cancellables.removeAll()
    }

    // MARK: - Post Handlers

    private func handlePostUpsert(_ post: APIPost) async {
        guard let record = PostRecord(from: post) else { return }
        try? await persistence.insertPost(record)
    }

    private func handlePostLiked(_ data: SocketPostLikedData) async {
        try? await persistence.updateLikeCount(
            postId: data.postId,
            count: data.likeCount,
            isLikedByMe: true
        )
    }

    private func handlePostUnliked(_ data: SocketPostUnlikedData) async {
        try? await persistence.updateLikeCount(
            postId: data.postId,
            count: data.likeCount,
            isLikedByMe: false
        )
    }

    // MARK: - Comment Handlers

    private func handleCommentAdded(_ data: SocketCommentAddedData) async {
        guard let record = CommentRecord(from: data.comment, postId: data.postId) else { return }
        try? await persistence.insertComment(record)
        try? await persistence.updateCommentCount(postId: data.postId, count: data.commentCount)
    }

    private func handleCommentLiked(_ data: SocketCommentLikedData) async {
        try? await persistence.updateCommentLikeCount(
            commentId: data.commentId,
            count: data.likeCount
        )
    }

    /// Both `comment:reaction-added` and `comment:reaction-removed` carry the
    /// ABSOLUTE per-emoji count in `aggregation`, so a single idempotent write
    /// covers both (mirror of `handlePostReaction`).
    private func handleCommentReaction(_ event: SocketCommentReactionUpdateEvent) async {
        try? await persistence.updateCommentReactionSummary(
            commentId: event.commentId,
            emoji: event.aggregation.emoji,
            count: event.aggregation.count
        )
    }

    /// The `comment:reaction-request-sync` ACK carries the full authoritative set
    /// of aggregations — replace the persisted dict wholesale.
    private func handleCommentReactionSync(_ event: SocketCommentReactionSyncEvent) async {
        let counts = Dictionary(
            event.reactions.map { ($0.emoji, $0.count) },
            uniquingKeysWith: { first, _ in first }
        )
        try? await persistence.replaceCommentReactionSummary(
            commentId: event.commentId,
            counts: counts
        )
    }

    // MARK: - Reaction Handlers

    /// Both `post:reaction-added` and `post:reaction-removed` carry the ABSOLUTE
    /// per-emoji count in `aggregation`, so a single idempotent write covers both.
    private func handlePostReaction(_ event: SocketPostReactionUpdateEvent) async {
        try? await persistence.updatePostReactionSummary(
            postId: event.postId,
            emoji: event.aggregation.emoji,
            count: event.aggregation.count
        )
    }

    // MARK: - Translation Handler

    private func handlePostTranslationUpdated(_ data: SocketPostTranslationUpdatedData) async {
        try? await persistence.upsertPostTranslation(
            postId: data.postId,
            language: data.language,
            translatedText: data.translation.text
        )
    }
}

// MARK: - PostRecord convenience init from APIPost

extension PostRecord {
    nonisolated init?(from post: APIPost) {
        guard !post.id.isEmpty, !post.author.id.isEmpty else { return nil }
        self.init(
            id: post.id,
            authorId: post.author.id,
            authorUsername: post.author.username,
            authorDisplayName: post.author.displayName,
            authorAvatarURL: post.author.avatar,
            type: post.type,
            content: post.content,
            originalLanguage: post.originalLanguage,
            visibility: post.visibility,
            likeCount: post.likeCount ?? 0,
            commentCount: post.commentCount ?? 0,
            repostCount: post.repostCount ?? 0,
            viewCount: post.viewCount ?? 0,
            bookmarkCount: post.bookmarkCount ?? 0,
            shareCount: post.shareCount ?? 0,
            isLikedByMe: post.isLikedByMe ?? false,
            isPinned: post.isPinned ?? false,
            isEdited: post.isEdited ?? false,
            isQuote: post.isQuote ?? false,
            moodEmoji: post.moodEmoji,
            audioUrl: post.audioUrl,
            audioDuration: post.audioDuration,
            mediaJson: Self.encode(post.media),
            reactionSummaryJson: Self.encode(post.reactionSummary),
            repostOfJson: Self.encode(post.repostOf),
            mentionedUsersJson: Self.encode(post.mentionedUsers),
            translationsJson: Self.encode(post.translations),
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
            changeVersion: 0
        )
    }

    nonisolated private static func encode<T: Encodable>(_ value: T?) -> Data? {
        guard let value else { return nil }
        return try? JSONEncoder().encode(value)
    }
}

// MARK: - CommentRecord convenience init from APIPostComment

extension CommentRecord {
    nonisolated init?(from comment: APIPostComment, postId: String) {
        guard !comment.id.isEmpty, !comment.author.id.isEmpty else { return nil }
        self.init(
            id: comment.id,
            postId: postId,
            parentId: comment.parentId,
            authorId: comment.author.id,
            authorUsername: comment.author.username,
            authorDisplayName: comment.author.displayName,
            authorAvatarURL: comment.author.avatar,
            content: comment.content,
            originalLanguage: comment.originalLanguage,
            translatedContent: nil,
            likeCount: comment.likeCount ?? 0,
            replyCount: comment.replyCount ?? 0,
            effectFlags: comment.effectFlags ?? 0,
            createdAt: comment.createdAt,
            changeVersion: 0
        )
    }
}
