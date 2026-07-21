import Foundation
import Combine
import MeeshySDK

@MainActor
class PostDetailViewModel: ObservableObject {
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

    @Published private(set) var _topLevelComments: [FeedComment] = []
    var topLevelComments: [FeedComment] { _topLevelComments }

    // Comment-like optimistic state — socket-reaction driven, miroir exact de
    // `CommentsSheetView`. Keyé par commentId. Semé depuis `currentUserReactions`
    // de chaque commentaire/réponse au chargement (sans ce seeding + sans cet état,
    // le cœur d'un commentaire restait inerte dans le détail de post).
    @Published var commentLikedIds: Set<String> = []
    @Published var commentLikeDelta: [String: Int] = [:]
    @Published var commentHeartInFlightIds: Set<String> = []

    private var commentCursor: String?
    private let postService: PostServiceProviding
    private let socialSocket = SocialSocketManager.shared
    private let languageProvider: LanguageProviding
    private let offlineQueue: OfflineQueueing
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Persistence Layer

    private(set) var commentStore: CommentStore?
    private var feedPersistence: FeedPersistenceActor?

    init(
        postService: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider(),
        offlineQueue: OfflineQueueing = OfflineQueue.shared
    ) {
        self.postService = postService
        self.languageProvider = languageProvider
        self.offlineQueue = offlineQueue
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
            return
        case .stale(let cached, _):
            if comments.isEmpty { comments = cached }
            seedCommentLikes(from: cached)
            await fetchCommentsFromNetwork(postId, cacheKey: cacheKey)
        case .expired, .empty:
            isLoadingComments = comments.isEmpty
            await fetchCommentsFromNetwork(postId, cacheKey: cacheKey)
        }
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
                        authorAvatarURL: c.author.avatar,
                        content: c.content, timestamp: c.createdAt,
                        likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                        parentId: c.parentId,
                        originalLanguage: c.originalLanguage, translatedContent: translatedContent,
                        currentUserReactions: c.currentUserReactions
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
            let langs = preferredLanguages
            let payload = response.data
            let replies = await Task.detached(priority: .userInitiated) {
                payload.map { c -> FeedComment in
                    let translated = PostDetailViewModel.resolveCommentTranslation(
                        translations: c.translations, originalLanguage: c.originalLanguage,
                        preferredLanguages: langs
                    )
                    return FeedComment(
                        id: c.id, author: c.author.name, authorId: c.author.id,
                        authorAvatarURL: c.author.avatar,
                        content: c.content, timestamp: c.createdAt,
                        likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                        parentId: commentId,
                        originalLanguage: c.originalLanguage, translatedContent: translated,
                        currentUserReactions: c.currentUserReactions
                    )
                }
            }.value
            repliesMap[commentId] = replies
            seedCommentLikes(from: replies)
        } catch {
            expandedThreads.remove(commentId)
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

    /// Restores the loaded post's like state to a captured snapshot. Shared by
    /// the synchronous enqueue-refusal path and the async `.exhausted` observer.
    private func restoreLike(isLiked: Bool, likes: Int) {
        guard var current = post else { return }
        current.isLiked = isLiked
        current.likes = likes
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
    func updatePost(content: String, language: String? = nil, type: String? = nil, removeMediaIds: [String]? = nil) async {
        guard let snapshot = post else { return }
        var optimistic = snapshot
        optimistic.content = content
        optimistic.translatedContent = nil
        optimistic.translations = nil
        self.post = optimistic
        do {
            let updated = try await postService.update(postId: snapshot.id, content: content, visibility: nil, moodEmoji: nil, originalLanguage: language, type: type, removeMediaIds: removeMediaIds)
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
            FeedbackToastManager.shared.showSuccess(String(localized: "Signalement envoye", defaultValue: "Signalement envoye"))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "Erreur lors du signalement", defaultValue: "Erreur lors du signalement"))
        }
    }

    /// Wave 1 Phase C — comment creation flows through the offline
    /// outbox so the optimistic comment appears instantly and survives
    /// app kill. The gateway response is the authoritative comment id ;
    /// while it's pending the optimistic id (`cmid`) is shown in the
    /// list — when the server response arrives, the socket
    /// `comment:added` broadcast reconciles via the normal path.
    func sendComment(_ content: String, effectFlags: Int? = nil) async {
        guard let post else { return }
        let cmid = ClientMutationId.generate()
        let snapshot = comments
        let snapshotCount = self.post?.commentCount ?? 0
        let currentUser = AuthManager.shared.currentUser
        let optimistic = FeedComment(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorAvatarURL: currentUser?.avatar,
            content: content,
            timestamp: Date(),
            likes: 0,
            replies: 0,
            effectFlags: effectFlags ?? 0
        )
        comments.insert(optimistic, at: 0)
        self.post?.commentCount = snapshotCount + 1
        let payload = CreateCommentPayload(
            clientMutationId: cmid,
            postId: post.id,
            parentCommentId: nil,
            content: content
        )
        do {
            try await offlineQueue.enqueue(.createComment, payload: payload, conversationId: post.id)
            try? await CacheCoordinator.shared.comments.save(comments, for: "post-\(post.id)")

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

    func sendReply(_ content: String, effectFlags: Int? = nil) async {
        guard let post, let parent = replyingTo else { return }
        let parentId = parent.id
        replyingTo = nil
        do {
            let apiComment = try await postService.addComment(postId: post.id, content: content, parentId: parentId, effectFlags: effectFlags)
            let reply = FeedComment(
                id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
                authorAvatarURL: apiComment.author.avatar,
                content: apiComment.content, timestamp: apiComment.createdAt,
                likes: 0, replies: 0,
                parentId: parentId,
                effectFlags: apiComment.effectFlags ?? effectFlags ?? 0
            )
            var existing = repliesMap[parentId] ?? []
            existing.insert(reply, at: 0)
            repliesMap[parentId] = existing
            expandedThreads.insert(parentId)
            if let idx = comments.firstIndex(where: { $0.id == parentId }) {
                comments[idx].replies += 1
            }
            self.post?.commentCount += 1
            try? await CacheCoordinator.shared.comments.save(comments, for: "post-\(post.id)")

            // Persist reply to GRDB
            if let persistence = feedPersistence,
               let record = CommentRecord(from: apiComment, postId: post.id) {
                let newCount = self.post?.commentCount ?? 0
                Task.detached(priority: .utility) {
                    try? await persistence.insertComment(record)
                    try? await persistence.updateCommentCount(postId: post.id, count: newCount)
                }
            }
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.comment.replyError", defaultValue: "Error sending reply", bundle: .main))
        }
    }

    func clearReply() {
        replyingTo = nil
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
                    authorAvatarURL: data.comment.author.avatar,
                    content: data.comment.content, timestamp: data.comment.createdAt,
                    likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0,
                    parentId: parentId,
                    effectFlags: data.comment.effectFlags ?? 0,
                    originalLanguage: data.comment.originalLanguage,
                    translatedContent: translatedContent,
                    currentUserReactions: data.comment.currentUserReactions
                )
                if let parentId {
                    if self.expandedThreads.contains(parentId) {
                        var existing = self.repliesMap[parentId] ?? []
                        if !existing.contains(where: { $0.id == comment.id }) {
                            existing.insert(comment, at: 0)
                            self.repliesMap[parentId] = existing
                        }
                    }
                    if let idx = self.comments.firstIndex(where: { $0.id == parentId }) {
                        self.comments[idx].replies += 1
                    }
                } else {
                    if !self.comments.contains(where: { $0.id == comment.id }) {
                        self.comments.insert(comment, at: 0)
                    }
                }
                self.post?.commentCount = data.commentCount
            }
            .store(in: &socketCancellables)

        // Réactions cœur de commentaire en temps réel (miroir de CommentsSheetView) :
        // synchronise `commentLikedIds` (réaction du user courant) ou `commentLikeDelta`
        // (réaction d'un tiers) sans toucher l'optimistic local déjà appliqué.
        socialSocket.commentReactionAdded
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] event in
                guard let self, event.emoji == StoryViewerView.heartEmoji else { return }
                if event.userId == AuthManager.shared.currentUser?.id {
                    self.commentLikedIds.insert(event.commentId)
                } else {
                    self.commentLikeDelta[event.commentId, default: 0] += 1
                }
            }
            .store(in: &socketCancellables)

        socialSocket.commentReactionRemoved
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] event in
                guard let self, event.emoji == StoryViewerView.heartEmoji else { return }
                if event.userId == AuthManager.shared.currentUser?.id {
                    self.commentLikedIds.remove(event.commentId)
                } else {
                    self.commentLikeDelta[event.commentId, default: 0] -= 1
                }
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
