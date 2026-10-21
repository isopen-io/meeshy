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
    /// #8656 — la base du fil est celle du compte ACTIF, relue à chaque
    /// événement : armé une fois pour la vie de l'app, ce pont écrirait sinon
    /// les événements du compte suivant dans la base du compte quitté.
    private let persistenceProvider: @MainActor () -> FeedPersistenceActor
    private var persistence: FeedPersistenceActor { persistenceProvider() }
    private let socialSocket: SocialSocketProviding
    private let currentUserIdProvider: @MainActor () -> String?
    private var cancellables = Set<AnyCancellable>()
    private var eventLane: OrderedEventLane?

    convenience init(
        persistence: FeedPersistenceActor,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        currentUserIdProvider: @MainActor @escaping () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.init(
            persistenceProvider: { persistence },
            socialSocket: socialSocket,
            currentUserIdProvider: currentUserIdProvider
        )
    }

    init(
        persistenceProvider: @MainActor @escaping () -> FeedPersistenceActor,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        currentUserIdProvider: @MainActor @escaping () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.persistenceProvider = persistenceProvider
        self.socialSocket = socialSocket
        self.currentUserIdProvider = currentUserIdProvider
    }

    // MARK: - Lifecycle

    /// Armé UNE fois au niveau app (`RootView.task`) et jamais désarmé : la
    /// persistance disque ne doit dépendre d'aucun écran monté. La garde le
    /// rend idempotent — un second appel (setup de `FeedView`, remontage) ne
    /// duplique aucun abonnement. Tous les événements qui écrivent entrent dans
    /// UNE file ordonnée (#11047) : une suppression reçue après une création ne
    /// peut plus être appliquée avant elle.
    func arm() {
        guard cancellables.isEmpty else { return }
        let lane = OrderedEventLane()
        lane.store(in: &cancellables)
        eventLane = lane
        armPostEvents(on: lane)
        armCommentEvents(on: lane)
        armReactionEvents(on: lane)
    }

    func disarm() {
        cancellables.removeAll()
        eventLane = nil
    }

    /// Barrière des tests : rend la main quand tout événement reçu avant
    /// l'appel est appliqué.
    func awaitPendingEvents() async {
        await eventLane?.barrier()
    }

    private func armPostEvents(on lane: OrderedEventLane) {
        socialSocket.postCreated
            .relay(through: lane) { [weak self] in await self?.handlePostUpsert($0.post) }
            .store(in: &cancellables)

        socialSocket.postUpdated
            .relay(through: lane) { [weak self] in await self?.handlePostUpsert($0) }
            .store(in: &cancellables)

        socialSocket.postDeleted
            .relay(through: lane) { [weak self] in await self?.handlePostDeleted(id: $0) }
            .store(in: &cancellables)

        socialSocket.postLiked
            .relay(through: lane) { [weak self] in await self?.handlePostLiked($0) }
            .store(in: &cancellables)

        socialSocket.postUnliked
            .relay(through: lane) { [weak self] in await self?.handlePostUnliked($0) }
            .store(in: &cancellables)

        socialSocket.postReposted
            .relay(through: lane) { [weak self] in await self?.handlePostReposted($0) }
            .store(in: &cancellables)

        socialSocket.postBookmarked
            .sink { _ in
                // Bookmark state is UI-only — no persistence record to update
            }
            .store(in: &cancellables)

        socialSocket.postTranslationUpdated
            .relay(through: lane) { [weak self] in await self?.handlePostTranslationUpdated($0) }
            .store(in: &cancellables)
    }

    private func armCommentEvents(on lane: OrderedEventLane) {
        socialSocket.commentAdded
            .relay(through: lane) { [weak self] in await self?.handleCommentAdded($0) }
            .store(in: &cancellables)

        socialSocket.commentDeleted
            .relay(through: lane) { [weak self] in await self?.handleCommentDeleted($0) }
            .store(in: &cancellables)

        socialSocket.commentLiked
            .relay(through: lane) { [weak self] in await self?.handleCommentLiked($0) }
            .store(in: &cancellables)

        // Jumelle DESCENDANTE : même écriture, parce que les deux charges
        // portent le total ABSOLU. Sans cet abonnement, un compteur de
        // commentaire ne savait que monter — et comme la valeur est PERSISTÉE
        // ici, le compte gonflé survivait au redémarrage jusqu'au prochain REST.
        socialSocket.commentUnliked
            .relay(through: lane) { [weak self] in await self?.handleCommentLiked($0) }
            .store(in: &cancellables)

        // Pipeline audio d'un média de commentaire terminé (transcription
        // Whisper + variantes TTS). Les surfaces qui l'écoutaient ne muteraient
        // que leur état en mémoire : l'enrichissement disparaissait à la
        // fermeture de l'écran et ne revenait qu'au prochain aller-retour REST.
        socialSocket.commentMediaUpdated
            .relay(through: lane) { [weak self] in await self?.handleCommentMediaUpdated($0) }
            .store(in: &cancellables)
    }

    // Reactions emoji (non-heart) — persistées dans GRDB pour que le compte
    // survive à un redémarrage. L'UI vivante se met déjà à jour en session via
    // FeedViewModel / PostDetailViewModel ; sans ce pont le compte en cache était
    // périmé au démarrage à froid. Pour les commentaires, on persiste le compte
    // ABSOLU par emoji (miroir du chemin `post:reaction-*`).
    private func armReactionEvents(on lane: OrderedEventLane) {
        socialSocket.commentReactionAdded
            .relay(through: lane) { [weak self] in await self?.handleCommentReaction($0) }
            .store(in: &cancellables)

        socialSocket.commentReactionRemoved
            .relay(through: lane) { [weak self] in await self?.handleCommentReaction($0) }
            .store(in: &cancellables)

        socialSocket.commentReactionSync
            .relay(through: lane) { [weak self] in await self?.handleCommentReactionSync($0) }
            .store(in: &cancellables)

        socialSocket.postReactionAdded
            .relay(through: lane) { [weak self] in await self?.handlePostReaction($0) }
            .store(in: &cancellables)

        socialSocket.postReactionRemoved
            .relay(through: lane) { [weak self] in await self?.handlePostReaction($0) }
            .store(in: &cancellables)
    }

    // MARK: - Post Handlers

    private func handlePostUpsert(_ post: APIPost) async {
        guard let record = PostRecord(from: post) else { return }
        try? await persistence.insertPost(record)
    }

    private func handlePostDeleted(id postId: String) async {
        try? await persistence.deletePost(id: postId)
    }

    /// `post:reposted` n'est pas typé : une story repostée y arrive et
    /// s'insérait dans `feed_posts`, la table que le secours de pagination
    /// hors-ligne (`FeedViewModel.loadMoreIfNeeded`) mappe TELLE QUELLE en
    /// `FeedPost`. Le chemin socket EN DIRECT applique déjà ce partage : la
    /// persistance doit le partager, sinon le tray reparaît dans le fil dès que
    /// le réseau tombe. Les lignes STORY DÉJÀ persistées ne sont pas purgées par
    /// cette garde — un résidu après mise à jour n'est donc pas un échec du filtre.
    private func handlePostReposted(_ data: SocketPostRepostedData) async {
        guard !data.repost.belongsToStoryTray else { return }
        await handlePostUpsert(data.repost)
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

    private func handleCommentDeleted(_ data: SocketCommentDeletedData) async {
        try? await persistence.deleteComment(id: data.commentId)
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
        await bestEffort("feedSocketHandler.postTranslation.upsert", category: .grdb) { try await persistence.upsertPostTranslation(
            postId: data.postId,
            language: data.language,
            translatedText: data.translation.text
        ) }
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
                .flatMap { String(data: $0, encoding: .utf8) },
            // #10400 — la portée suit le post dans le cache, sinon le repli
            // hors ligne la remet à zéro sous des likes intacts.
            impressionCount: post.impressionCount,
            postOpenCount: post.postOpenCount,
            playCount: post.playCount,
            qualifiedViewCount: post.qualifiedViewCount,
            // #10946 — le contour de l'auteur survit au repli hors ligne.
            authorRing: post.author.avatarRing
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
