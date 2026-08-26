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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    private let persistence: FeedPersistenceActor
    private let socialSocket: SocialSocketProviding
    private let currentUserIdProvider: @MainActor () -> String?
    private var cancellables = Set<AnyCancellable>()

    init(
        persistence: FeedPersistenceActor,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        currentUserIdProvider: @MainActor @escaping () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.persistence = persistence
        self.socialSocket = socialSocket
        self.currentUserIdProvider = currentUserIdProvider
    }

    // MARK: - Lifecycle

    /// Armé UNE fois au niveau app (`RootView.task`) et jamais désarmé : la
    /// persistance disque ne doit dépendre d'aucun écran monté. La garde le
    /// rend idempotent — un second appel (setup de `FeedView`, remontage) ne
    /// duplique aucun sink.
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

        // Jumelle DESCENDANTE : même écriture, parce que les deux charges
        // portent le total ABSOLU. Sans cet abonnement, un compteur de
        // commentaire ne savait que monter — et comme la valeur est PERSISTÉE
        // ici, le compte gonflé survivait au redémarrage jusqu'au prochain REST.
        socialSocket.commentUnliked
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

        // Pipeline audio d'un média de commentaire terminé (transcription
        // Whisper + variantes TTS). Les deux surfaces qui l'écoutaient
        // (PostDetailViewModel, FeedCommentsSheet) ne muteraient que leur état
        // en mémoire : l'enrichissement disparaissait à la fermeture de
        // l'écran et ne revenait qu'au prochain aller-retour REST.
        socialSocket.commentMediaUpdated
            .sink { [weak self] data in
                Task { await self?.handleCommentMediaUpdated(data) }
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

    // stores-03 — isLikedByMe n'a de sens que pour l'utilisateur courant : le
    // like d'un TIERS ne porte que le compteur absolu (miroir des gates des
    // trois consommateurs RAM : CacheCoordinator.applyPostLike, FeedViewModel,
    // PostDetailViewModel.applyServerLike).
    private func handlePostLiked(_ data: SocketPostLikedData) async {
        if data.userId == currentUserIdProvider() {
            try? await persistence.updateLikeCount(
                postId: data.postId, count: data.likeCount, isLikedByMe: true
            )
        } else {
            try? await persistence.updateLikeCountOnly(postId: data.postId, count: data.likeCount)
        }
    }

    private func handlePostUnliked(_ data: SocketPostUnlikedData) async {
        if data.userId == currentUserIdProvider() {
            try? await persistence.updateLikeCount(
                postId: data.postId, count: data.likeCount, isLikedByMe: false
            )
        } else {
            try? await persistence.updateLikeCountOnly(postId: data.postId, count: data.likeCount)
        }
    }

    // MARK: - Comment Handlers

    private func handleCommentAdded(_ data: SocketCommentAddedData) async {
        guard let record = CommentRecord(from: data.comment, postId: data.postId) else { return }
        try? await persistence.insertComment(record)
        try? await persistence.updateCommentCount(postId: data.postId, count: data.commentCount)
    }

    /// Sert `comment:liked` ET `comment:unliked` — un seul écrasement idempotent
    /// couvre les deux sens, la charge portant le total absolu (miroir de
    /// `handleCommentReaction` ci-dessous).
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

    private func handleCommentMediaUpdated(_ data: SocketCommentMediaUpdatedData) async {
        guard let media = data.comment.media, !media.isEmpty,
              let json = try? JSONEncoder().encode(media) else { return }
        try? await persistence.updateCommentMedia(commentId: data.commentId, mediaJson: json)
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
            // Colonne conservée en base (pas de migration), mais plus écrite :
            // `APIPost.mentionedUsers` n'a jamais eu de source côté gateway.
            mentionedUsersJson: nil,
            translationsJson: Self.encode(post.translations),
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
            changeVersion: 0,
            // Sans ce hissage, une position affichée juste après l'envoi
            // disparaît au prochain chargement du cache : `locationJson`
            // resterait nil pour toujours (Task 16).
            locationJson: Self.encode(post.location).flatMap { String(data: $0, encoding: .utf8) },
            // Même hissage que `locationJson` : sans lui, l'audience nommée
            // d'un post EXCEPT/ONLY ne survit pas au démarrage à froid.
            visibilityUserIdsJson: Self.encode(post.visibilityUserIds)
                .flatMap { String(data: $0, encoding: .utf8) }
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
            changeVersion: 0,
            // Même hissage que sur PostRecord : sans lui, la position d'un
            // commentaire disparaît au prochain chargement du cache (Task 16).
            locationJson: comment.location.flatMap { try? JSONEncoder().encode($0) }
                .flatMap { String(data: $0, encoding: .utf8) },
            // Idem pour le média : sans ce hissage, `updateCommentMedia` serait
            // le SEUL écrivain de la colonne et un commentaire audio inséré par
            // `comment:added` naîtrait sans son média.
            mediaJson: comment.media.flatMap { try? JSONEncoder().encode($0) }
        )
    }
}
