import Foundation
import Combine
import MeeshySDK

@MainActor
class PostDetailViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var post: FeedPost?
    @Published var comments: [FeedComment] = [] {
        didSet { _topLevelComments = comments.filter { $0.parentId == nil } }
    }
    @Published var isLoading = false
    @Published var isLoadingComments = false
    @Published var hasMoreComments = true
    @Published var error: String?
    @Published var replyingTo: FeedComment? = nil

    @Published var repliesMap: [String: [FeedComment]] = [:]
    @Published var expandedThreads: Set<String> = []
    @Published private(set) var loadingReplies: Set<String> = []
    /// Pagination des réponses par commentaire racine (le endpoint replies est
    /// paginé ASC, curseur `gt`, 20/page) — sans ce suivi, un fil de plus de
    /// 20 réponses était silencieusement tronqué à la première page.
    @Published var repliesHasMore: [String: Bool] = [:]
    @Published var repliesNextCursor: [String: String] = [:]

    @Published private(set) var _topLevelComments: [FeedComment] = []
    var topLevelComments: [FeedComment] { _topLevelComments }

    // Comment-like optimistic state — socket-reaction driven, miroir exact de
    // `CommentsSheetView`. Keyé par commentId. Semé depuis `currentUserReactions`
    // de chaque commentaire/réponse au chargement (sans ce seeding + sans cet état,
    // le cœur d'un commentaire restait inerte dans le détail de post).
    @Published var commentLikedIds: Set<String> = []
    @Published var commentLikeDelta: [String: Int] = [:]
    /// Commentaire en cours d'ÉDITION (auteur uniquement). Non-nil ⇒ le
    /// composer soumet un PATCH (contenu + effets) au lieu d'une création.
    @Published var editingComment: FeedComment?
    @Published var commentHeartInFlightIds: Set<String> = []

    private var commentCursor: String?
    private let postService: PostServiceProviding
    private let socialSocket: any SocialSocketProviding
    private let languageProvider: LanguageProviding
    private let offlineQueue: OfflineQueueing
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Persistence Layer

    private(set) var commentStore: CommentStore?
    private var feedPersistence: FeedPersistenceActor?

    init(
        postService: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider(),
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        socialSocket: any SocialSocketProviding = SocialSocketManager.shared
    ) {
        self.postService = postService
        self.languageProvider = languageProvider
        self.offlineQueue = offlineQueue
        self.socialSocket = socialSocket
        observePreferredLanguageChanges()
    }

    /// B2 / B4 (Prisme Linguistique) — keep the displayed post in sync
    /// with the user's preferred-content languages. When the user edits
    /// systemLanguage / regionalLanguage / customDestinationLanguage in
    /// Settings, the loaded post's `translatedContent` flips without a
    /// re-fetch (the `translations` dict carries every available language).
    private func observePreferredLanguageChanges() {
        AuthManager.shared.currentUserPublisher
            .removeDuplicates { old, new in
                old?.systemLanguage == new?.systemLanguage
                && old?.regionalLanguage == new?.regionalLanguage
                && old?.customDestinationLanguage == new?.customDestinationLanguage
            }
            .dropFirst()
            .sink { [weak self] _ in
                guard let self else { return }
                let langs = self.preferredLanguages
                if let current = self.post {
                    self.post = current.resolved(preferredLanguages: langs)
                }
            }
            .store(in: &cancellables)
    }

    /// Wire persistence store for GRDB-backed comments.
    /// Call once after init when the post ID and dependency container are available.
    func setupPersistence(commentStore: CommentStore, persistence: FeedPersistenceActor) {
        self.commentStore = commentStore
        self.feedPersistence = persistence
    }

    var preferredLanguages: [String] {
        languageProvider.preferredLanguages
    }

    var userLanguage: String {
        preferredLanguages.first ?? "en"
    }

    func repliesFor(_ commentId: String) -> [FeedComment] {
        repliesMap[commentId] ?? []
    }

    func loadPost(_ postId: String) async {
        // Drain any post the NSE prefetched for a tapped social notification into
        // the feed cache BEFORE reading it, so a cold-start open renders from
        // local data instead of a blank state (mirror of
        // `ConversationViewModel.loadMessages` draining NSEPendingMessageConsumer).
        await NSEPendingPostConsumer.shared.consumeAll()
        let cacheResult = await CacheCoordinator.shared.feed.load(for: postId)
        switch cacheResult {
        case .fresh(let cached, _):
            post = cached.first
            return
        case .stale(let cached, _):
            post = cached.first
            await refreshPost(postId)
        case .expired, .empty:
            isLoading = post == nil
            await refreshPost(postId)
        }
    }

    /// Ouvrir la page Détail d'un post est, par règle produit, une vue TOTALE
    /// (chaque ouverture compte, jamais dédupliquée) ET une impression, comptées
    /// IMMÉDIATEMENT — avant et indépendamment du tracking d'engagement (durée de
    /// lecture). Le gateway incrémente `postOpenCount` + `impressionCount` via
    /// `POST /posts/:id/impression?source=detail`. On bump les compteurs affichés
    /// de façon optimiste pour un feedback instantané, puis on enregistre (fire-
    /// and-forget). La vue UNIQUE (`viewCount`, dédupliquée, non affichée) reste
    /// portée par `viewPost` appelé séparément à l'ouverture.
    func registerDetailOpen(_ postId: String) async {
        if post != nil {
            post?.impressionCount += 1
            post?.postOpenCount += 1
        }
        try? await postService.recordImpression(postId: postId, source: "detail")
    }

    private func refreshPost(_ postId: String) async {
        defer { isLoading = false }
        do {
            let apiPost = try await postService.getPost(postId: postId)
            let feedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
            post = feedPost
            try? await CacheCoordinator.shared.feed.save([feedPost], for: postId)

            // Persist to GRDB
            if let persistence = feedPersistence, let record = PostRecord(from: apiPost) {
                Task.detached(priority: .utility) {
                    try? await persistence.insertPost(record)
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func loadComments(_ postId: String) async {
        guard !isLoadingComments else { return }

        let cacheKey = "post-\(postId)"
        let cacheResult = await CacheCoordinator.shared.comments.load(for: cacheKey)

        switch cacheResult {
        case .fresh(let cached, _):
            if comments.isEmpty { comments = cached }
            seedCommentLikes(from: cached)
            schedulePreloadReplyPreviews(postId: postId)
            return
        case .stale(let cached, _):
            if comments.isEmpty { comments = cached }
            seedCommentLikes(from: cached)
            await fetchCommentsFromNetwork(postId, cacheKey: cacheKey)
            schedulePreloadReplyPreviews(postId: postId)
        case .expired, .empty:
            isLoadingComments = comments.isEmpty
            await fetchCommentsFromNetwork(postId, cacheKey: cacheKey)
            schedulePreloadReplyPreviews(postId: postId)
        }
    }

    /// Lance le préchargement des aperçus de réponses SANS bloquer `loadComments`
    /// (sinon le chargement des commentaires sérialisait jusqu'à 5 appels REST).
    private func schedulePreloadReplyPreviews(postId: String) {
        Task { [weak self] in await self?.preloadReplyPreviews(postId: postId) }
    }

    /// Notification → commentaire hors de la première page : suit le curseur
    /// existant jusqu'à ce que le commentaire top-level ciblé soit chargé
    /// (borné — cf. `CommentTargetHunter`). Retourne `true` si la cible est
    /// présente à l'issue de la chasse.
    @discardableResult
    func loadCommentsUntilPresent(_ commentId: String, postId: String) async -> Bool {
        await CommentTargetHunter.hunt(
            isPresent: { [weak self] in
                self?.topLevelComments.contains(where: { $0.id == commentId }) ?? true
            },
            hasMore: { [weak self] in self?.hasMoreComments ?? false },
            loadNextPage: { [weak self] in await self?.loadMoreComments(postId) }
        )
    }

    func loadMoreComments(_ postId: String) async {
        // NOTE: no `commentCursor != nil` guard on purpose — see
        // `FeedViewModel.loadMoreIfNeeded`'s identical fix. `loadComments`'s
        // `.fresh` cache branch never touches the network, so `commentCursor`
        // stays `nil` while `hasMoreComments` stays at its initial `true`,
        // permanently stalling pagination for the whole session. `hasMoreComments`
        // alone is a safe gate — it's always set together with `commentCursor`
        // by `fetchCommentsFromNetwork`, and `cursor: nil` there already means
        // "fetch page 1", exactly what's needed to recover a real cursor.
        guard !isLoadingComments, hasMoreComments else { return }
        await fetchCommentsFromNetwork(postId, cacheKey: "post-\(postId)")
    }

    private func fetchCommentsFromNetwork(_ postId: String, cacheKey: String) async {
        isLoadingComments = true
        defer { isLoadingComments = false }
        do {
            let response = try await postService.getComments(postId: postId, cursor: commentCursor, limit: 20)
            let langs = preferredLanguages
            let payload = response.data
            // Map off the main actor — for a popular post's comment page this
            // decode + Prisme resolution would otherwise hitch the sheet.
            let newComments = await Task.detached(priority: .userInitiated) {
                payload.map { c -> FeedComment in
                    let translatedContent: String? = PostDetailViewModel.resolveCommentTranslation(
                        translations: c.translations, originalLanguage: c.originalLanguage, preferredLanguages: langs
                    )
                    return FeedComment(
                        id: c.id, author: c.author.name, authorId: c.author.id,
                        authorUsername: c.author.username,
                        authorAvatarURL: c.author.avatar,
                        content: c.content, timestamp: c.createdAt,
                        likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                        parentId: c.parentId,
                        effectFlags: c.effectFlags ?? 0,
                        originalLanguage: c.originalLanguage, translatedContent: translatedContent,
                        currentUserReactions: c.currentUserReactions,
                        media: (c.media ?? []).map { $0.toFeedMedia() },
                        location: c.location
                    )
                }
            }.value
            let existingIds = Set(comments.map(\.id))
            let unique = newComments.filter { !existingIds.contains($0.id) }
            comments.append(contentsOf: unique)
            seedCommentLikes(from: unique)
            commentCursor = response.pagination?.nextCursor
            hasMoreComments = response.pagination?.hasMore ?? false
            try? await CacheCoordinator.shared.comments.save(comments, for: cacheKey)

            // Persist fetched comments to GRDB
            if let persistence = feedPersistence {
                let apiComments = response.data
                let pid = postId
                Task.detached(priority: .utility) {
                    for c in apiComments {
                        if let record = CommentRecord(from: c, postId: pid) {
                            try? await persistence.insertComment(record)
                        }
                    }
                }
            }
        } catch {
            if comments.isEmpty {
                FeedbackToastManager.shared.showError(String(localized: "feed.comment.loadError", defaultValue: "Error loading comments", bundle: .main))
            }
        }
    }

    // MARK: - Thread Management

    func toggleThread(_ commentId: String, postId: String) async {
        if expandedThreads.contains(commentId) {
            expandedThreads.remove(commentId)
        } else {
            expandedThreads.insert(commentId)
            if repliesMap[commentId] == nil {
                await loadReplies(postId: postId, commentId: commentId)
            }
        }
    }

    func loadReplies(postId: String, commentId: String) async {
        guard !loadingReplies.contains(commentId), repliesMap[commentId] == nil else { return }
        loadingReplies.insert(commentId)
        defer { loadingReplies.remove(commentId) }
        do {
            let response = try await postService.getCommentReplies(
                postId: postId, commentId: commentId, cursor: nil, limit: 20
            )
            let replies = await Self.mapReplies(
                response.data, parentId: commentId, preferredLanguages: preferredLanguages
            )
            repliesMap[commentId] = replies
            recordRepliesPagination(response.pagination, for: commentId)
            seedCommentLikes(from: replies)
            // Persiste les réponses sous "replies-{commentId}" pour hydrater
            // l'aperçu (2 premières) instantanément à la ré-ouverture du post
            // (cache-first, miroir de `FeedCommentsSheet`).
            try? await CacheCoordinator.shared.comments.save(replies, for: "replies-\(commentId)")
        } catch {
            expandedThreads.remove(commentId)
        }
    }

    /// Page suivante des réponses d'un fil (curseur `gt`, tri ASC → les pages
    /// suivantes sont plus récentes, donc APPEND). Jamais de remplacement :
    /// les réponses insérées par le socket (`comment:added`) pendant la
    /// pagination sont préservées via la dédup par id.
    /// NOTE : `repliesHasMore[id] == nil` (fil hydraté du cache par
    /// `preloadReplyPreviews`, pagination jamais enregistrée) n'est PAS
    /// bloquant — même fix documenté que `loadMoreComments` : `cursor: nil`
    /// signifie « page 1 », exactement ce qu'il faut pour récupérer un vrai
    /// curseur. Seul `false` (fin de fil connue) stoppe.
    func loadMoreReplies(_ commentId: String, postId: String) async {
        guard !loadingReplies.contains(commentId), repliesHasMore[commentId] != false else { return }
        loadingReplies.insert(commentId)
        defer { loadingReplies.remove(commentId) }
        do {
            let response = try await postService.getCommentReplies(
                postId: postId, commentId: commentId,
                cursor: repliesNextCursor[commentId], limit: 20
            )
            let fetched = await Self.mapReplies(
                response.data, parentId: commentId, preferredLanguages: preferredLanguages
            )
            let existing = repliesMap[commentId] ?? []
            let existingIds = Set(existing.map(\.id))
            let unique = fetched.filter { !existingIds.contains($0.id) }
            repliesMap[commentId] = existing + unique
            recordRepliesPagination(response.pagination, for: commentId)
            seedCommentLikes(from: unique)
            try? await CacheCoordinator.shared.comments.save(
                repliesMap[commentId] ?? [], for: "replies-\(commentId)"
            )
        } catch {
            // Échec réseau : stopper proprement la pagination (et toute chasse
            // en cours) — le fil reste utilisable avec les pages déjà chargées.
            repliesHasMore[commentId] = false
        }
    }

    /// Notification → réponse hors de la première page de son fil : suit le
    /// curseur des réponses jusqu'à ce que la réponse ciblée soit chargée
    /// (borné — cf. `CommentTargetHunter`). Charge la première page si le fil
    /// n'a pas encore été ouvert. Retourne `true` si la cible est présente.
    @discardableResult
    func loadRepliesUntilPresent(_ replyId: String, in commentId: String, postId: String) async -> Bool {
        if repliesMap[commentId] == nil {
            await loadReplies(postId: postId, commentId: commentId)
        }
        return await CommentTargetHunter.hunt(
            isPresent: { [weak self] in
                guard let self else { return true }
                return self.repliesMap[commentId]?.contains(where: { $0.id == replyId }) ?? false
            },
            // `nil` = pagination inconnue (fil hydraté du cache) → tenter la
            // page 1 pour récupérer un curseur ; seul `false` arrête la chasse.
            hasMore: { [weak self] in
                guard let self else { return false }
                return self.repliesHasMore[commentId] != false
            },
            loadNextPage: { [weak self] in await self?.loadMoreReplies(commentId, postId: postId) }
        )
    }

    private func recordRepliesPagination(_ pagination: CursorPagination?, for commentId: String) {
        repliesNextCursor[commentId] = pagination?.nextCursor
        repliesHasMore[commentId] = pagination?.hasMore ?? false
    }

    /// Mappe une page de réponses API → domaine hors MainActor (décodage +
    /// résolution Prisme off-main, même forme que `fetchCommentsFromNetwork`).
    private static func mapReplies(
        _ payload: [APIPostComment], parentId: String, preferredLanguages: [String]
    ) async -> [FeedComment] {
        await Task.detached(priority: .userInitiated) {
            payload.map { c -> FeedComment in
                let translated = PostDetailViewModel.resolveCommentTranslation(
                    translations: c.translations, originalLanguage: c.originalLanguage,
                    preferredLanguages: preferredLanguages
                )
                return FeedComment(
                    id: c.id, author: c.author.name, authorId: c.author.id,
                    authorUsername: c.author.username,
                    authorAvatarURL: c.author.avatar,
                    content: c.content, timestamp: c.createdAt,
                    likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                    parentId: parentId,
                    effectFlags: c.effectFlags ?? 0,
                    originalLanguage: c.originalLanguage, translatedContent: translated,
                    currentUserReactions: c.currentUserReactions,
                    media: (c.media ?? []).map { $0.toFeedMedia() },
                    location: c.location
                )
            }
        }.value
    }

    /// Précharge l'aperçu des réponses (les 2 premières s'affichent sans tap)
    /// des premiers commentaires racine qui en ont — cache-first puis réseau,
    /// en miroir de `FeedCommentsSheet`. Sans ça, les sous-commentaires
    /// restaient masqués dans le détail de post jusqu'au tap « Voir ».
    func preloadReplyPreviews(postId: String) async {
        let withReplies = topLevelComments.filter { $0.replies > 0 }.prefix(5)
        for comment in withReplies {
            guard repliesMap[comment.id] == nil else { continue }
            let cached = await CacheCoordinator.shared.comments.load(for: "replies-\(comment.id)")
            if case .fresh(let replies, _) = cached {
                repliesMap[comment.id] = replies
                seedCommentLikes(from: replies)
                continue
            } else if case .stale(let replies, _) = cached {
                repliesMap[comment.id] = replies
                seedCommentLikes(from: replies)
                continue
            }
            await loadReplies(postId: postId, commentId: comment.id)
        }
    }

    // MARK: - Comment Like (optimistic, socket-reaction driven)

    /// Sème (additif) `commentLikedIds` depuis l'état serveur (`currentUserReactions`)
    /// des commentaires/réponses fournis, sans écraser les toggles déjà appliqués.
    private func seedCommentLikes(from comments: [FeedComment]) {
        let heart = StoryViewerView.heartEmoji
        let liked = comments
            .filter { $0.currentUserReactions?.contains(heart) == true }
            .map(\.id)
        guard !liked.isEmpty else { return }
        commentLikedIds.formUnion(liked)
    }

    /// Réconciliation par l'agrégat ABSOLU d'un événement cœur de commentaire :
    /// pose `likes = count` sur la ligne (top-level ou réponse), purge le delta
    /// optimiste, et dérive « mon cœur » de `reactorUserIds` (la liste des
    /// User.id ayant réagi — PAS `hasCurrentUser`, qui est calculé côté gateway
    /// relativement à l'ACTEUR de l'événement, donc faux pour les destinataires
    /// d'un broadcast). L'affichage `likes + delta` converge vers la vérité
    /// serveur sans jamais compter double.
    func applyCommentReactionAggregate(commentId: String, count: Int, reactorUserIds: [String], actorUserId: String) {
        var resolvedCount = count
        if let myId = AuthManager.shared.currentUser?.id {
            if reactorUserIds.contains(myId) {
                commentLikedIds.insert(commentId)
            } else if actorUserId == myId {
                // L'événement décrit MA propre action : agrégat autoritatif.
                commentLikedIds.remove(commentId)
            } else if commentLikedIds.contains(commentId) {
                // Agrégat d'un TIERS pendant que MON like est encore en vol :
                // il ne me connaît pas — préserver le cœur, compter le mien
                // par-dessus (l'écho de mon propre like reconfirmera).
                resolvedCount = count + 1
            }
        }
        commentLikeDelta[commentId] = nil
        if let idx = comments.firstIndex(where: { $0.id == commentId }) {
            comments[idx].likes = resolvedCount
            return
        }
        for (key, var replies) in repliesMap {
            if let idx = replies.firstIndex(where: { $0.id == commentId }) {
                replies[idx].likes = resolvedCount
                repliesMap[key] = replies
                return
            }
        }
    }

    /// Like/unlike d'un commentaire — optimistic + réaction socket cœur + rollback.
    /// Miroir exact de `CommentsSheetView.toggleCommentLike` pour que le like de
    /// commentaire dans le détail de post se comporte comme dans la sheet.
    func toggleCommentLike(_ commentId: String, postId: String) async {
        guard !commentHeartInFlightIds.contains(commentId) else { return }
        commentHeartInFlightIds.insert(commentId)
        defer { commentHeartInFlightIds.remove(commentId) }

        let wasLiked = commentLikedIds.contains(commentId)
        if wasLiked {
            commentLikedIds.remove(commentId)
            commentLikeDelta[commentId, default: 0] -= 1
        } else {
            commentLikedIds.insert(commentId)
            commentLikeDelta[commentId, default: 0] += 1
        }

        do {
            try await withTaskTimeout(seconds: TaskTimeoutDefaults.socialReaction) {
                if wasLiked {
                    _ = try await SocialSocketManager.shared.removeCommentReaction(
                        commentId: commentId, postId: postId, emoji: StoryViewerView.heartEmoji
                    )
                } else {
                    _ = try await SocialSocketManager.shared.addCommentReaction(
                        commentId: commentId, postId: postId, emoji: StoryViewerView.heartEmoji
                    )
                }
            }
        } catch {
            // Fallback REST quand le socket échoue (le endpoint écrit la même table
            // CommentReaction, idempotent + likeCount synchronisé). Mutuellement exclusif
            // avec le socket → pas de double-écriture. Rollback uniquement si REST échoue aussi.
            let restOK: Bool
            do {
                if wasLiked {
                    try await postService.unlikeComment(postId: postId, commentId: commentId)
                } else {
                    try await postService.likeComment(postId: postId, commentId: commentId)
                }
                restOK = true
            } catch {
                restOK = false
            }
            if !restOK {
                if wasLiked {
                    commentLikedIds.insert(commentId)
                    commentLikeDelta[commentId, default: 0] += 1
                } else {
                    commentLikedIds.remove(commentId)
                    commentLikeDelta[commentId, default: 0] -= 1
                }
            }
        }
    }

    // MARK: - Actions

    /// Wave 1 Phase C — like/unlike flows through the offline outbox so
    /// the optimistic UI flips instantly, the network call survives an
    /// app kill, and the gateway `MutationLog` dedups replays. Rollback
    /// on enqueue failure ; permanent failures (a 404 from a deleted
    /// post) are swallowed by the dispatcher.
    func likePost() async {
        guard var current = post else { return }
        // Snapshot pre-mutation state so both the synchronous enqueue-refusal
        // path and the async `.exhausted` observer roll back to it.
        let wasLiked = current.isLiked
        let priorLikes = current.likes
        let nowLiked = !current.isLiked
        current.isLiked = nowLiked
        current.likes += nowLiked ? 1 : -1
        post = current
        let cmid = ClientMutationId.generate()
        let payload = ToggleLikePostPayload(
            clientMutationId: cmid,
            postId: current.id,
            liked: nowLiked
        )
        do {
            try await offlineQueue.enqueue(.toggleLikePost, payload: payload, conversationId: nil)
            // stores-09 — write the optimistic state through to EVERY cache key
            // holding this post (detail key, feed, bookmarks…), not just RAM.
            let newLikes = current.likes
            let postId = current.id
            Task.detached(priority: .utility) {
                await CacheCoordinator.shared.feed.patchEverywhere(itemId: postId) {
                    $0.isLiked = nowLiked
                    $0.likes = newLikes
                }
            }
            // R5 — roll back the optimistic like if the outbox exhausts its
            // retry budget (server permanently rejects). Without this the toggle
            // stays stuck "liked" forever even though the server never accepted it.
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                self?.restoreLike(isLiked: wasLiked, likes: priorLikes)
            }, toast: String(localized: "feed.like.error", defaultValue: "Error liking post", bundle: .main))
        } catch {
            // Roll back optimistic state if the outbox refuses the row.
            restoreLike(isLiked: wasLiked, likes: priorLikes)
            FeedbackToastManager.shared.showError(String(localized: "feed.like.error", defaultValue: "Error liking post", bundle: .main))
        }
    }

    /// Applique le compteur ABSOLU du serveur au post affiché. `isLiked` n'est
    /// réécrit que si l'acteur est l'utilisateur courant : le like d'un tiers
    /// monte le compteur sans allumer le cœur.
    private func applyServerLike(likeCount: Int, actorId: String, liked: Bool) {
        guard var current = post else { return }
        current.likes = likeCount
        if actorId == AuthManager.shared.currentUser?.id {
            current.isLiked = liked
        }
        post = current
    }

    /// Restores the loaded post's like state to a captured snapshot. Shared by
    /// the synchronous enqueue-refusal path and the async `.exhausted` observer.
    private func restoreLike(isLiked: Bool, likes: Int) {
        guard var current = post else { return }
        current.isLiked = isLiked
        current.likes = likes
        let postId = current.id
        Task.detached(priority: .utility) {
            await CacheCoordinator.shared.feed.patchEverywhere(itemId: postId) {
                $0.isLiked = isLiked
                $0.likes = likes
            }
        }
        post = current
    }

    /// Subscribes to the injected queue's `outcomeStream(for: cmid)` and runs
    /// `rollback` if the OutboxFlusher escalates the row to `.exhausted` (retry
    /// budget spent — the server permanently rejected it). `.applied` is a no-op
    /// (the optimistic state is already final).
    /// ⚠️ Le corps du Task ne capture PAS `self` : hors-ligne le stream peut ne
    /// jamais émettre, et un `guard let self` fort aurait retenu le VM d'un
    /// écran fermé indéfiniment. Même forme que `UserProfileViewModel`.
    private func observeOutcome(
        cmid: String,
        rollback: @escaping @MainActor () -> Void,
        toast: String
    ) {
        let queue = offlineQueue
        Task { @MainActor in
            let stream = await queue.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    rollback()
                    FeedbackToastManager.shared.showError(toast)
                }
            }
        }
    }

    /// Updates the loaded post's body content. Optimistic UX mirrors
    /// FeedViewModel.updatePost: flip the in-memory post immediately, clear
    /// translations so the bubble re-renders, rollback on API failure.
    func updatePost(
        content: String,
        language: String? = nil,
        type: String? = nil,
        removeMediaIds: [String]? = nil,
        location: PostLocationUpdate? = nil,
        visibility: String? = nil,
        visibilityUserIds: [String]? = nil,
        known: Set<PostEditField> = EditPostDraft.documentFields
    ) async {
        guard let snapshot = post else { return }
        var optimistic = snapshot
        optimistic.content = content
        optimistic.translatedContent = nil
        optimistic.translations = nil
        switch location {
        case .set(let place): optimistic.location = place
        case .remove: optimistic.location = nil
        case nil: break
        }
        // L'audience bouge tout de suite, comme le texte : sans cela le badge
        // de visibilité garde l'ancienne valeur jusqu'au prochain
        // rafraîchissement et l'auteur croit son resserrement perdu.
        if let visibility {
            optimistic.visibility = visibility
            optimistic.visibilityUserIds = visibilityUserIds
        }
        self.post = optimistic
        do {
            // Le corps ne se construit plus ici : `known` dit ce que la
            // surface a su RENDRE, `PostEditPayload.build` en tire le PUT. Un
            // champ non déclaré est OMIS, et le serveur préserve le sien.
            let updated = try await postService.update(postId: snapshot.id, known: known, draft: PostEditDraft(
                content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                originalLanguage: language, type: type, removeMediaIds: removeMediaIds,
                location: location
            ))
            self.post = updated.toFeedPost(preferredLanguages: preferredLanguages)
            FeedbackToastManager.shared.showSuccess(String(localized: "Post modifie", defaultValue: "Post modifie"))
        } catch {
            self.post = snapshot
            FeedbackToastManager.shared.showError(String(localized: "Erreur lors de la modification", defaultValue: "Erreur lors de la modification"))
        }
    }

    /// Reports the loaded post as inappropriate. Mirrors `FeedViewModel.reportPost`
    /// — uses ReportService directly so PostDetailView doesn't have to dual-wire.
    func reportPost(_ postId: String) async {
        do {
            try await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
            FeedbackToastManager.shared.showSuccess(String(localized: "profile.posts.report.success", defaultValue: "Signalement envoyé", bundle: .main))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "Erreur lors du signalement", defaultValue: "Erreur lors du signalement"))
        }
    }

    /// Deletes the loaded post. Mirrors `FeedViewModel.deletePost` — no local
    /// list to remove from (this IS the single loaded post), so success just
    /// reports true and the caller (`PostDetailView`) pops the screen.
    @discardableResult
    func deletePost(_ postId: String) async -> Bool {
        do {
            try await postService.delete(postId: postId)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.deleted", defaultValue: "Post deleted", bundle: .main))
            return true
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.post.deleteError", defaultValue: "Error deleting post", bundle: .main))
            return false
        }
    }

    func pinPost(_ postId: String) async {
        do {
            try await postService.pinPost(postId: postId)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.pinned", defaultValue: "Post pinned", bundle: .main))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.post.pinError", defaultValue: "Error pinning post", bundle: .main))
        }
    }

    /// Wave 1 Phase C — comment creation flows through the offline
    /// outbox so the optimistic comment appears instantly and survives
    /// app kill. The gateway response is the authoritative comment id ;
    /// while it's pending the optimistic id (`cmid`) is shown in the
    /// list — when the server response arrives, the socket
    /// `comment:added` broadcast reconciles via the normal path.
    func sendComment(_ content: String, effectFlags: Int? = nil, location: SharedPlace? = nil) async {
        guard let post else { return }
        let cmid = ClientMutationId.generate()
        let snapshot = comments
        let snapshotCount = self.post?.commentCount ?? 0
        let currentUser = AuthManager.shared.currentUser
        let optimistic = FeedComment(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            content: content,
            timestamp: Date(),
            likes: 0,
            replies: 0,
            effectFlags: effectFlags ?? 0,
            location: location
        )
        comments.insert(optimistic, at: 0)
        self.post?.commentCount = snapshotCount + 1
        let payload = CreateCommentPayload(
            clientMutationId: cmid,
            postId: post.id,
            parentCommentId: nil,
            content: content,
            location: location,
            effectFlags: effectFlags
        )
        do {
            try await offlineQueue.enqueue(.createComment, payload: payload, conversationId: post.id)
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)")

            // R5 — roll back the optimistic comment if the outbox exhausts its
            // retry budget (server permanently rejects). The synchronous catch
            // below only covers an enqueue refusal; without this observer a
            // permanently-failing comment stays in the list forever.
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                guard let self else { return }
                self.comments = snapshot
                self.post?.commentCount = snapshotCount
            }, toast: String(localized: "feed.comment.sendError", defaultValue: "Error sending comment", bundle: .main))
        } catch {
            comments = snapshot
            self.post?.commentCount = snapshotCount
            FeedbackToastManager.shared.showError(String(localized: "feed.comment.sendError", defaultValue: "Error sending comment", bundle: .main))
        }
    }

    /// Wave 1 Phase C (fiche vm-postdetail-reply) — une réponse texte transite
    /// par l'outbox durable comme un commentaire top-level : optimiste
    /// immédiat keyé cmid, survit au kill de l'app, réconciliée par l'écho
    /// socket `comment:added`. Rollback multi-champs (repliesMap, compteur du
    /// parent, commentCount, dépliage) sur refus d'enfilement ou .exhausted.
    func sendReply(_ content: String, effectFlags: Int? = nil, location: SharedPlace? = nil) async {
        guard let post, let parent = replyingTo else { return }
        // Réponse plate à 2 niveaux : répondre à une réponse rattache au MÊME
        // parent racine pour rester au niveau 2 ; l'auteur ciblé est notifié via
        // la @mention préremplie (cf. `PostDetailView.beginReply`).
        let parentId = parent.parentId ?? parent.id
        replyingTo = nil
        let cmid = ClientMutationId.generate()
        let snapshotReplies = repliesMap[parentId] ?? []
        let snapshotExpanded = expandedThreads.contains(parentId)
        let snapshotParentReplies = comments.first(where: { $0.id == parentId })?.replies
        let snapshotCount = self.post?.commentCount ?? 0
        let currentUser = AuthManager.shared.currentUser
        let optimistic = FeedComment(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            content: content,
            timestamp: Date(),
            likes: 0,
            replies: 0,
            parentId: parentId,
            effectFlags: effectFlags ?? 0,
            location: location
        )
        var existing = repliesMap[parentId] ?? []
        existing.insert(optimistic, at: 0)
        repliesMap[parentId] = existing
        expandedThreads.insert(parentId)
        if let idx = comments.firstIndex(where: { $0.id == parentId }) {
            comments[idx].replies += 1
        }
        self.post?.commentCount = snapshotCount + 1
        let payload = CreateCommentPayload(
            clientMutationId: cmid,
            postId: post.id,
            parentCommentId: parentId,
            content: content,
            location: location,
            effectFlags: effectFlags
        )
        do {
            try await offlineQueue.enqueue(.createComment, payload: payload, conversationId: post.id)
            // Une réponse vit sous une clé SÉPARÉE de son parent : persister
            // les deux, sinon un kill avant flush perd la réponse au cold start.
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(repliesMap[parentId] ?? [], for: "replies-\(parentId)")
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)")

            observeOutcome(cmid: cmid, rollback: { [weak self] in
                guard let self else { return }
                self.repliesMap[parentId] = snapshotReplies
                if !snapshotExpanded { self.expandedThreads.remove(parentId) }
                if let idx = self.comments.firstIndex(where: { $0.id == parentId }) {
                    self.comments[idx].replies = snapshotParentReplies ?? self.comments[idx].replies
                }
                self.post?.commentCount = snapshotCount
            }, toast: String(localized: "feed.comment.replyError", defaultValue: "Error sending reply", bundle: .main))
        } catch {
            repliesMap[parentId] = snapshotReplies
            if !snapshotExpanded { expandedThreads.remove(parentId) }
            if let idx = comments.firstIndex(where: { $0.id == parentId }) {
                comments[idx].replies = snapshotParentReplies ?? comments[idx].replies
            }
            self.post?.commentCount = snapshotCount
            FeedbackToastManager.shared.showError(String(localized: "feed.comment.replyError", defaultValue: "Error sending reply", bundle: .main))
        }
    }

    func clearReply() {
        replyingTo = nil
    }

    // MARK: - Édition de commentaire (auteur)

    /// PATCH du commentaire : remplacement optimiste EN PLACE (jamais
    /// d'insertion — même id), rollback complet si le serveur refuse.
    /// L'écho `comment:updated` reconfirme ensuite la ligne (idempotent).
    func updateComment(_ target: FeedComment, content: String, effectFlags: Int) async {
        guard let post else { return }
        let edited = target.withEditedContent(content, effectFlags: effectFlags)
        let snapshotComments = comments
        let snapshotReplies = repliesMap
        applyCommentUpdated(edited)
        do {
            _ = try await postService.updateComment(
                postId: post.id, commentId: target.id, content: content, effectFlags: effectFlags
            )
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)")
            if let parentId = edited.parentId, let replies = repliesMap[parentId] {
                try? await CacheCoordinator.shared.comments.savePreservingFreshness(replies, for: "replies-\(parentId)")
            }
        } catch {
            comments = snapshotComments
            repliesMap = snapshotReplies
            FeedbackToastManager.shared.showError(
                String(localized: "feed.comments.edit_error", defaultValue: "Erreur lors de la modification du commentaire", bundle: .main))
        }
    }

    /// Pose une traduction de commentaire fraîchement arrivée (racine ou
    /// réponse) — uniquement si la langue est préférée et que la ligne n'a pas
    /// déjà une traduction plus prioritaire affichée.
    func applyCommentTranslationUpdate(commentId: String, language: String, text: String) {
        guard preferredLanguages.contains(where: { $0.caseInsensitiveCompare(language) == .orderedSame }) else { return }
        if let idx = comments.firstIndex(where: { $0.id == commentId }), comments[idx].translatedContent == nil {
            comments[idx].translatedContent = text
            return
        }
        for (key, var replies) in repliesMap {
            if let idx = replies.firstIndex(where: { $0.id == commentId }), replies[idx].translatedContent == nil {
                replies[idx].translatedContent = text
                repliesMap[key] = replies
                return
            }
        }
    }

    /// Remplace la ligne éditée EN PLACE (racine ou réponse) — idempotent,
    /// partagé par l'optimiste local et l'écho socket `comment:updated`.
    func applyCommentUpdated(_ edited: FeedComment) {
        if let parentId = edited.parentId, var existing = repliesMap[parentId],
           let idx = existing.firstIndex(where: { $0.id == edited.id }) {
            existing[idx] = edited
            repliesMap[parentId] = existing
            return
        }
        if let idx = comments.firstIndex(where: { $0.id == edited.id }) {
            comments[idx] = edited
        }
    }

    /// Envoi d'un commentaire (top-level OU réponse) portant UN média
    /// (image/vidéo/audio). Contrairement au chemin texte top-level qui transite par
    /// l'OfflineQueue, un commentaire média DOIT passer en direct (l'upload du fichier
    /// exige le réseau). Optimistic-first avec le média local, puis upload TUS
    /// (`uploadContext=comment`) → `addComment(attachmentIds:)`, réconcilie/rollback.
    func submitCommentWithMedia(_ content: String, effectFlags: Int?, parentId: String?, pendingMedia: PendingCommentMedia, location: SharedPlace? = nil) async {
        guard let post else { return }
        if parentId != nil { replyingTo = nil }
        // La ligne optimiste est keyée par le cmid envoyé au gateway : l'écho
        // `comment:added` porte ce cmid et la remplace en place (pas de doublon),
        // et un retry REST après timeout est dédoublonné serveur (MutationLog).
        let tempId = ClientMutationId.generate()
        let me = AuthManager.shared.currentUser
        let optimistic = FeedComment(
            id: tempId,
            author: me?.displayName ?? me?.username ?? "",
            authorId: me?.id ?? "",
            authorUsername: me?.username,
            authorAvatarURL: me?.avatar,
            content: content, timestamp: Date(),
            likes: 0, replies: 0, parentId: parentId,
            effectFlags: effectFlags ?? 0,
            media: [pendingMedia.optimistic]
        )
        let snapshotComments = comments
        let snapshotReplies = parentId.flatMap { repliesMap[$0] }
        let snapshotCount = post.commentCount
        if let parentId {
            var existing = repliesMap[parentId] ?? []
            existing.insert(optimistic, at: 0)
            repliesMap[parentId] = existing
            expandedThreads.insert(parentId)
            if let idx = comments.firstIndex(where: { $0.id == parentId }) { comments[idx].replies += 1 }
        } else {
            comments.insert(optimistic, at: 0)
        }
        self.post?.commentCount = snapshotCount + 1

        do {
            let attachmentId = try await CommentMediaUploader.upload(pendingMedia)
            let apiComment = try await postService.addComment(
                postId: post.id, content: content, parentId: parentId, effectFlags: effectFlags,
                attachmentIds: [attachmentId], mobileTranscription: pendingMedia.mobileTranscription,
                originalLanguage: nil, location: location, clientMutationId: tempId
            )
            let server = FeedComment(
                id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
                authorUsername: apiComment.author.username,
                authorAvatarURL: apiComment.author.avatar,
                content: apiComment.content, timestamp: apiComment.createdAt,
                likes: 0, replies: 0, parentId: parentId,
                effectFlags: apiComment.effectFlags ?? effectFlags ?? 0,
                media: (apiComment.media ?? []).map { $0.toFeedMedia() }
            )
            if let parentId {
                var existing = repliesMap[parentId] ?? []
                if let idx = existing.firstIndex(where: { $0.id == tempId }) { existing[idx] = server }
                else if !existing.contains(where: { $0.id == server.id }) { existing.insert(server, at: 0) }
                repliesMap[parentId] = existing
            } else if let idx = comments.firstIndex(where: { $0.id == tempId }) {
                comments[idx] = server
            } else if !comments.contains(where: { $0.id == server.id }) {
                comments.insert(server, at: 0)
            }
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)")
        } catch {
            // Rollback optimiste.
            comments = snapshotComments
            if let parentId { repliesMap[parentId] = snapshotReplies }
            self.post?.commentCount = snapshotCount
            FeedbackToastManager.shared.showError(String(localized: "feed.comment.sendError", defaultValue: "Error sending comment", bundle: .main))
        }
    }

    // MARK: - Comment Deletion

    /// Supprime un commentaire (auteur uniquement — le gating se fait côté vue
    /// via `CommentRowView`). Retrait optimiste immédiat (racine + réponses, ou
    /// réponse avec décrément du parent), puis appel API, rollback du snapshot
    /// si l'API échoue. Miroir du flux optimiste de `submitCommentWithMedia`.
    func deleteComment(_ comment: FeedComment) async {
        guard let post else { return }
        let snapshotComments = comments
        let snapshotReplies = repliesMap
        let snapshotExpanded = expandedThreads
        let snapshotCount = post.commentCount

        if let parentId = comment.parentId {
            if var existing = repliesMap[parentId] {
                existing.removeAll { $0.id == comment.id }
                repliesMap[parentId] = existing
                // Met à jour l'aperçu en cache pour ne pas réafficher la réponse
                // supprimée à la ré-ouverture du post.
                try? await CacheCoordinator.shared.comments.savePreservingFreshness(existing, for: "replies-\(parentId)")
            }
            if let idx = comments.firstIndex(where: { $0.id == parentId }), comments[idx].replies > 0 {
                comments[idx].replies -= 1
            }
            self.post?.commentCount = max(0, snapshotCount - 1)
        } else {
            comments.removeAll { $0.id == comment.id }
            repliesMap[comment.id] = nil
            expandedThreads.remove(comment.id)
            // Suppression d'un commentaire racine → cascade serveur de ses réponses.
            self.post?.commentCount = max(0, snapshotCount - 1 - comment.replies)
        }

        do {
            try await postService.deleteComment(postId: post.id, commentId: comment.id)
            try? await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)")
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.comments.deleted", defaultValue: "Commentaire supprimé", bundle: .main))
        } catch {
            comments = snapshotComments
            repliesMap = snapshotReplies
            expandedThreads = snapshotExpanded
            self.post?.commentCount = snapshotCount
            FeedbackToastManager.shared.showError(String(localized: "feed.comments.delete_error", defaultValue: "Impossible de supprimer le commentaire", bundle: .main))
        }
    }

    // MARK: - Socket

    /// Id du post couvert par les sinks actifs. Keyer la garde sur le postId
    /// (et non un simple Bool) garde la méthode re-ciblable : une réutilisation
    /// du VM pour un autre post remplace les sinks au lieu de laisser les
    /// anciens filtrer à jamais sur le premier id.
    private var subscribedPostId: String?
    private var socketCancellables = Set<AnyCancellable>()

    func subscribeToSocket(_ postId: String) {
        // `.task` re-fire à chaque ré-apparition de l'écran alors que le
        // `@StateObject` persiste : sans cette garde, N sinks dupliqués
        // s'accumulaient (compteurs de réponses incrémentés N fois par
        // événement). Set dédié — `cancellables` porte aussi le sink de
        // préférences de langue posé à l'init.
        guard subscribedPostId != postId else { return }
        subscribedPostId = postId
        socketCancellables.removeAll()

        // --- didReconnect → backfill du post + commentaires ---
        // `SocialSocketManager` re-joint la room du post au `.connect` (le flux
        // VIVANT reprend), mais les événements émis PENDANT la coupure restent
        // irréconciliés. Refetch le post (compteurs absolus) + la page 1 des
        // commentaires ; la dédup par id de `fetchCommentsFromNetwork` rend
        // l'append idempotent — ne JAMAIS vider `comments` ici (flash-vide).
        socialSocket.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                guard let self else { return }
                Task {
                    await self.refreshPost(postId)
                    self.commentCursor = nil
                    await self.fetchCommentsFromNetwork(postId, cacheKey: "post-\(postId)")
                }
            }
            .store(in: &socketCancellables)

        // Le détail écoutait les commentaires, leurs réactions et les
        // traductions — mais PAS le like du post lui-même. Un like posé depuis
        // le feed, depuis le pager de réels ou par un autre utilisateur
        // n'atteignait donc jamais l'écran ouvert, qui affichait son compteur
        // figé jusqu'au prochain fetch. `likeCount` est ABSOLU (recalculé par
        // le gateway depuis `PostReaction`) : on l'écrit tel quel, sans delta.
        socialSocket.postLiked
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] data in
                self?.applyServerLike(likeCount: data.likeCount, actorId: data.userId, liked: true)
            }
            .store(in: &socketCancellables)

        socialSocket.postUnliked
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] data in
                self?.applyServerLike(likeCount: data.likeCount, actorId: data.userId, liked: false)
            }
            .store(in: &socketCancellables)

        socialSocket.commentAdded
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] data in
                guard let self else { return }
                let parentId = data.comment.parentId
                // Prisme + effects parity with the REST comment mapping
                // (`loadComments`/`loadReplies`): a comment arriving in real
                // time while the detail sheet is open used to render as a
                // blank row for a media/effect comment (effectFlags dropped)
                // and always in its original language (resolveCommentTranslation
                // never consulted).
                let translatedContent = PostDetailViewModel.resolveCommentTranslation(
                    translations: data.comment.translations,
                    originalLanguage: data.comment.originalLanguage,
                    preferredLanguages: self.preferredLanguages
                )
                let comment = FeedComment(
                    id: data.comment.id, author: data.comment.author.name,
                    authorId: data.comment.author.id,
                    authorUsername: data.comment.author.username,
                    authorAvatarURL: data.comment.author.avatar,
                    content: data.comment.content, timestamp: data.comment.createdAt,
                    likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0,
                    parentId: parentId,
                    effectFlags: data.comment.effectFlags ?? 0,
                    originalLanguage: data.comment.originalLanguage,
                    translatedContent: translatedContent,
                    currentUserReactions: data.comment.currentUserReactions,
                    media: (data.comment.media ?? []).map { $0.toFeedMedia() }
                )
                // Écho de NOTRE propre envoi : la ligne optimiste est keyée par
                // le cmid (sendComment/sendReply/submitCommentWithMedia) — la
                // remplacer EN PLACE. Sans cette réconciliation, l'écho (id
                // serveur ≠ cmid) passait la dédup par id et insérait un
                // doublon visible jusqu'au prochain rechargement.
                if let parentId {
                    var reconciledOwnOptimistic = false
                    if let cmid = data.clientMutationId, var existing = self.repliesMap[parentId],
                       let optimisticIdx = existing.firstIndex(where: { $0.id == cmid }) {
                        existing[optimisticIdx] = comment
                        self.repliesMap[parentId] = existing
                        reconciledOwnOptimistic = true
                    }
                    if !reconciledOwnOptimistic, self.expandedThreads.contains(parentId) {
                        var existing = self.repliesMap[parentId] ?? []
                        if existing.contains(where: { $0.id == comment.id }) {
                            reconciledOwnOptimistic = true
                        } else {
                            existing.insert(comment, at: 0)
                            self.repliesMap[parentId] = existing
                        }
                    }
                    // Le +1 du parent n'est dû que pour une réponse VRAIMENT
                    // nouvelle : la nôtre a déjà incrémenté à l'insertion
                    // optimiste (sendReply), la re-livraison d'un même id non plus.
                    if !reconciledOwnOptimistic,
                       let idx = self.comments.firstIndex(where: { $0.id == parentId }) {
                        self.comments[idx].replies += 1
                    }
                } else {
                    if let cmid = data.clientMutationId,
                       let optimisticIdx = self.comments.firstIndex(where: { $0.id == cmid }) {
                        self.comments[optimisticIdx] = comment
                    } else if !self.comments.contains(where: { $0.id == comment.id }) {
                        self.comments.insert(comment, at: 0)
                    }
                }
                self.post?.commentCount = data.commentCount
                // Re-persiste les listes réconciliées : la ligne optimiste
                // (id = cmid) avait été sauvée par sendComment/sendReply — sans
                // cette réécriture, le fantôme cmid restait en cache et
                // ré-apparaissait en DOUBLON du vrai commentaire à la prochaine
                // ouverture (fetch qui APPEND sur la liste issue du cache).
                let reconciledComments = self.comments
                let reconciledReplies = parentId.flatMap { self.repliesMap[$0] }
                Task {
                    try? await CacheCoordinator.shared.comments.savePreservingFreshness(reconciledComments, for: "post-\(postId)")
                    if let parentId, let reconciledReplies {
                        try? await CacheCoordinator.shared.comments.savePreservingFreshness(reconciledReplies, for: "replies-\(parentId)")
                    }
                }
            }
            .store(in: &socketCancellables)

        // Édition en temps réel : remplace la ligne EN PLACE (contenu, effets,
        // traductions régénérées) — idempotent avec l'optimiste local.
        socialSocket.commentUpdated
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] data in
                guard let self else { return }
                let translated = PostDetailViewModel.resolveCommentTranslation(
                    translations: data.comment.translations,
                    originalLanguage: data.comment.originalLanguage,
                    preferredLanguages: self.preferredLanguages
                )
                let updated = FeedComment(
                    id: data.comment.id, author: data.comment.author.name,
                    authorId: data.comment.author.id,
                    authorUsername: data.comment.author.username,
                    authorAvatarURL: data.comment.author.avatar,
                    content: data.comment.content, timestamp: data.comment.createdAt,
                    likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0,
                    parentId: data.comment.parentId,
                    effectFlags: data.comment.effectFlags ?? 0,
                    originalLanguage: data.comment.originalLanguage,
                    translatedContent: translated,
                    currentUserReactions: data.comment.currentUserReactions,
                    media: (data.comment.media ?? []).map { $0.toFeedMedia() }
                )
                self.applyCommentUpdated(updated)
                // Invalidation locale par réécriture (écho d'un autre appareil) :
                // les autres vues resservent la version éditée depuis le cache.
                let snapshot = self.comments
                Task {
                    try? await CacheCoordinator.shared.comments.savePreservingFreshness(snapshot, for: "post-\(postId)")
                }
            }
            .store(in: &socketCancellables)

        // Traduction de commentaire arrivée (pipeline async ou demande à la
        // demande) : pose `translatedContent` si la langue est PRÉFÉRÉE et
        // qu'aucune traduction n'est déjà affichée — même règle unique que
        // `FeedViewModel.applyCommentTranslation`.
        socialSocket.commentTranslationUpdated
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] data in
                guard let self else { return }
                self.applyCommentTranslationUpdate(
                    commentId: data.commentId, language: data.language, text: data.translation.text
                )
            }
            .store(in: &socketCancellables)

        // Pipeline audio d'un média de commentaire terminé → remplace le média
        // (transcription / variantes TTS prêtes) du commentaire en cache, qu'il
        // soit top-level ou réponse. Miroir du handler de CommentsSheetView.
        socialSocket.commentMediaUpdated
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] data in
                guard let self else { return }
                let media = (data.comment.media ?? []).map { $0.toFeedMedia() }
                guard !media.isEmpty else { return }
                let commentId = data.commentId
                // Invalidation locale par réécriture, comme le sink
                // `comment:updated` : sans elle, la transcription et les
                // variantes TTS reçues à distance ne vivaient qu'en mémoire,
                // et l'écran suivant resservait le média NU depuis le cache.
                if let parentId = data.comment.parentId, var existing = self.repliesMap[parentId],
                   let idx = existing.firstIndex(where: { $0.id == commentId }) {
                    existing[idx].media = media
                    self.repliesMap[parentId] = existing
                    let snapshot = existing
                    Task {
                        try? await CacheCoordinator.shared.comments.savePreservingFreshness(snapshot, for: "replies-\(parentId)")
                    }
                } else if let idx = self.comments.firstIndex(where: { $0.id == commentId }) {
                    self.comments[idx].media = media
                    let snapshot = self.comments
                    Task {
                        try? await CacheCoordinator.shared.comments.savePreservingFreshness(snapshot, for: "post-\(postId)")
                    }
                }
            }
            .store(in: &socketCancellables)

        // Suppression de commentaire en temps réel : retire la ligne sur TOUS les
        // clients et resynchronise le compteur sur la valeur autoritative du serveur
        // (heale toute dérive de l'arithmétique optimiste locale). Sans ce sink, un
        // commentaire supprimé ailleurs persistait et le total dérivait sans se
        // corriger. Idempotent avec le retrait optimiste du client qui supprime.
        socialSocket.commentDeleted
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] data in
                guard let self else { return }
                let id = data.commentId
                let hadTopLevelRow = self.comments.contains { $0.id == id }
                self.comments.removeAll { $0.id == id }
                self.repliesMap[id] = nil
                self.expandedThreads.remove(id)
                // Réponse supprimée : retire-la de son fil + décrémente le compteur
                // de réponses de son parent racine.
                var touchedThreadIds: [String] = []
                for (key, var replies) in self.repliesMap {
                    if let idx = replies.firstIndex(where: { $0.id == id }) {
                        replies.remove(at: idx)
                        self.repliesMap[key] = replies
                        touchedThreadIds.append(key)
                        if let pIdx = self.comments.firstIndex(where: { $0.id == key }), self.comments[pIdx].replies > 0 {
                            self.comments[pIdx].replies -= 1
                        }
                    }
                }
                self.post?.commentCount = data.commentCount
                // Invalidation locale par réécriture : sans elle, la version
                // cachée ressuscitait le commentaire supprimé à la prochaine
                // ouverture. Une RÉPONSE touche DEUX clés — son fil, et
                // `post-` dont le compteur de réponses du parent a bougé. La
                // clé orpheline `replies-<commentId>` d'un top-level supprimé
                // reste intouchée : plus rien ne la relira.
                //
                // Rien n'est écrit quand RIEN n'a bougé : un sink qui tire
                // avant le premier chargement écrirait une liste VIDE
                // par-dessus la page déjà en cache sous la même clé.
                guard hadTopLevelRow || !touchedThreadIds.isEmpty else { return }
                let snapshot = self.comments
                let threadSnapshots = self.repliesMap
                let touchedThreads = touchedThreadIds
                Task {
                    for key in touchedThreads {
                        try? await CacheCoordinator.shared.comments.savePreservingFreshness(threadSnapshots[key] ?? [], for: "replies-\(key)")
                    }
                    try? await CacheCoordinator.shared.comments.savePreservingFreshness(snapshot, for: "post-\(postId)")
                }
            }
            .store(in: &socketCancellables)

        // Réactions cœur de commentaire en temps réel (miroir de CommentsSheetView) :
        // synchronise `commentLikedIds` (réaction du user courant) ou `commentLikeDelta`
        // (réaction d'un tiers) sans toucher l'optimistic local déjà appliqué.
        // Réconciliation par l'AGRÉGAT ABSOLU (miroir de
        // `StoryViewerView.applyCommentReactionEvent`) : l'événement porte
        // `aggregation.count` (état global après application) et
        // `hasCurrentUser`. L'ancien ±1 sur `commentLikeDelta` ne purgeait
        // jamais le delta de sa PROPRE réaction : dès que la base était
        // rafraîchie (`loadReplies`, refetch), `likes` incluait déjà le like
        // et l'affichage `likes + delta` comptait DOUBLE.
        socialSocket.commentReactionAdded
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] event in
                guard let self, event.emoji == StoryViewerView.heartEmoji else { return }
                self.applyCommentReactionAggregate(
                    commentId: event.commentId,
                    count: event.aggregation.count,
                    reactorUserIds: event.aggregation.userIds,
                    actorUserId: event.userId
                )
            }
            .store(in: &socketCancellables)

        socialSocket.commentReactionRemoved
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] event in
                guard let self, event.emoji == StoryViewerView.heartEmoji else { return }
                self.applyCommentReactionAggregate(
                    commentId: event.commentId,
                    count: event.aggregation.count,
                    reactorUserIds: event.aggregation.userIds,
                    actorUserId: event.userId
                )
            }
            .store(in: &socketCancellables)

        socialSocket.postTranslationUpdated
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] data in
                guard let self else { return }
                let translation = PostTranslation(
                    text: data.translation.text,
                    translationModel: data.translation.translationModel,
                    confidenceScore: data.translation.confidenceScore
                )
                var translations = self.post?.translations ?? [:]
                translations[data.language] = translation
                self.post?.translations = translations
                let langs = self.preferredLanguages
                if langs.contains(where: { $0.caseInsensitiveCompare(data.language) == .orderedSame }) {
                    if self.post?.translatedContent == nil {
                        self.post?.translatedContent = data.translation.text
                    }
                }
            }
            .store(in: &socketCancellables)
    }

    // MARK: - Translation Resolution

    // `nonisolated`: pure Prisme resolver (params in, String? out — no actor
    // state). Lets the comment/reply maps run it from a detached task.
    nonisolated static func resolveCommentTranslation(
        translations: [String: APIPostTranslationEntry]?,
        originalLanguage: String?,
        preferredLanguages: [String]
    ) -> String? {
        guard let translations, !translations.isEmpty else { return nil }
        let origLower = originalLanguage?.lowercased()
        for lang in preferredLanguages {
            let langLower = lang.lowercased()
            if let orig = origLower, orig == langLower { return nil }
            if let match = translations.first(where: { $0.key.lowercased() == langLower }) {
                return match.value.text
            }
        }
        return nil
    }
}
