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
    @Published var isLoading = false
    @Published var loadFailure: ContentFetchFailure?
    @Published var replyingTo: FeedComment? = nil

    /// The post's comment thread — roots, replies, expansion and reply
    /// pagination — the same model as the sheet's and the story's (#13133).
    let commentThreadModel: CommentThreadViewModel
    var comments: [FeedComment] {
        get { commentThreadModel.roots }
        set { commentThreadModel.roots = newValue }
    }
    var repliesMap: [String: [FeedComment]] {
        get { commentThreadModel.replies }
        set { commentThreadModel.replies = newValue }
    }
    var expandedThreads: Set<String> {
        get { commentThreadModel.expandedThreads }
        set { commentThreadModel.expandedThreads = newValue }
    }
    var loadingReplies: Set<String> { commentThreadModel.loadingReplies }
    var repliesHasMore: [String: Bool] {
        get { commentThreadModel.repliesHasMore }
        set { commentThreadModel.repliesHasMore = newValue }
    }
    var repliesNextCursor: [String: String] {
        get { commentThreadModel.repliesNextCursor }
        set { commentThreadModel.repliesNextCursor = newValue }
    }
    var topLevelComments: [FeedComment] { commentThreadModel.topLevelRoots }
    var isLoadingComments: Bool { commentThreadModel.isLoadingRoots }
    /// `nil` = pas encore chargé ≠ « il y en a plus » (#4868).
    var hasMoreComments: Bool? { commentThreadModel.rootsHasMore }

    // Comment-like optimistic state — socket-reaction driven, miroir exact de
    // `CommentsSheetView`. Keyé par commentId. Semé depuis `currentUserReactions`
    // de chaque commentaire/réponse au chargement (sans ce seeding + sans cet état,
    // le cœur d'un commentaire restait inerte dans le détail de post).
    @Published var commentHearts = CommentHeartLedger()
    /// Commentaire en cours d'ÉDITION (auteur uniquement). Non-nil ⇒ le
    /// composer soumet un PATCH (contenu + effets) au lieu d'une création.
    @Published var editingComment: FeedComment?

    let postService: PostServiceProviding
    private let socialSocket: any SocialSocketProviding
    private let languageProvider: LanguageProviding
    let offlineQueue: OfflineQueueing
    private let openSources: DetailOpenSourceProviding
    /// Les posts dont l'ouverture est déjà comptée par CETTE instance (#10483) :
    /// le `.task` du détail se relance au retour d'un écran poussé.
    private var countedOpenPostIds: Set<String> = []
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Persistence Layer

    private(set) var feedPersistence: FeedPersistenceActor?

    init(
        postService: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider(),
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        socialSocket: any SocialSocketProviding = SocialSocketManager.shared,
        openSources: DetailOpenSourceProviding = DetailOpenSources.shared
    ) {
        self.openSources = openSources
        self.postService = postService
        self.languageProvider = languageProvider
        self.offlineQueue = offlineQueue
        self.socialSocket = socialSocket
        self.commentThreadModel = CommentThreadViewModel(
            entity: .post(""), postService: postService,
            preferredLanguages: { languageProvider.preferredLanguages })
        commentThreadModel.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        commentThreadModel.onRepliesLoaded = { [weak self] in self?.seedCommentLikes(from: $0) }
        commentThreadModel.onRootsLoaded = { [weak self] in self?.seedCommentLikes(from: $0) }
        commentThreadModel.onRootsFetched = { [weak self] in self?.persistFetchedComments($0) }
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
                // Les commentaires et leurs réponses suivent : ils restaient
                // dans l'ancienne langue.
                self.comments = self.comments.map { $0.resolved(preferredLanguages: langs) }
                self.repliesMap = self.repliesMap.mapValues { replies in
                    replies.map { $0.resolved(preferredLanguages: langs) }
                }
            }
            .store(in: &cancellables)
    }

    /// Wire the GRDB persistence layer used by comment-adjacent reads.
    /// Call once after init when the dependency container is available.
    func setupPersistence(persistence: FeedPersistenceActor) {
        self.feedPersistence = persistence
    }

    var preferredLanguages: [String] {
        languageProvider.preferredLanguages
    }

    var userLanguage: String {
        preferredLanguages.first ?? "en"
    }

    func repliesFor(_ commentId: String) -> [FeedComment] {
        commentThreadModel.repliesFor(commentId)
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
    /// lecture). Le gateway incrémente `postOpenCount` + `impressionCount` par
    /// l'impression `source=detail` de `POST /social/events`. On bump les compteurs affichés
    /// de façon optimiste pour un feedback instantané, puis on enregistre (fire-
    /// and-forget), impression puis vue.
    ///
    /// Une ouverture se compte à la PREMIÈRE apparition de l'instance, pas à
    /// chaque relance du `.task` (#10483). Son ENTRÉE (la marque posée par la
    /// porte qui l'a amenée : tap d'un listing, notification, lien) donne la
    /// source de l'impression et la provenance de la vue ; sans marque, `direct`.
    func registerDetailOpen(_ postId: String) async {
        guard countedOpenPostIds.insert(postId).inserted else { return }
        if post != nil {
            post?.impressionCount += 1
            post?.postOpenCount += 1
        }
        let entry = openSources.consumeEntry(for: postId)
        // Une seule requête : l'impression et la vue sont deux types qu'un
        // serveur antérieur à #10483 connaît déjà ; la provenance et l'origine
        // de la vue, inconnues de lui, sont retirées sans refus. `viewCount` est
        // le TOTAL des vues : chaque ouverture en compte une, sous la même garde
        // que l'impression, et porte par où elle est venue.
        _ = try? await postService.recordSocialEvents(
            [
                .impression(postId: postId, source: entry.detailImpressionSource, surface: .detail),
                .view(postId: postId, durationMs: nil, surface: .detail, entry: entry),
            ],
            credential: .account
        )
    }

    private func refreshPost(_ postId: String) async {
        defer { isLoading = false }
        do {
            let apiPost = try await postService.getPost(postId: postId)
            let feedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
            post = feedPost
            await bestEffort("postDetailViewModel.feed.savePost", category: .cache) { try await CacheCoordinator.shared.feed.save([feedPost], for: postId) }

            // Persist to GRDB
            if let persistence = feedPersistence, let record = PostRecord(from: apiPost) {
                Task.detached(priority: .utility) {
                    try? await persistence.insertPost(record)
                }
            }
        } catch {
            // La CAUSE, pas une phrase : l'écran en tire connexion, serveur ou
            // indisponibilité (`PostDetailAbsenceReason`, #4903, #6508).
            self.loadFailure = ContentFetchFailure.classify(error)
        }
    }

    func loadComments(_ postId: String) async {
        let outcome = await onThread(postId).loadRoots()
        guard outcome != .skipped else { return }
        if outcome == .failed { warnIfNoComments() }
        schedulePreloadReplyPreviews(postId: postId)
    }

    /// Lance le préchargement des aperçus de réponses SANS bloquer `loadComments`
    /// (sinon le chargement des commentaires sérialisait jusqu'à 5 appels REST).
    private func schedulePreloadReplyPreviews(postId: String) {
        Task { [weak self] in await self?.preloadReplyPreviews(postId: postId) }
    }

    /// Notification → commentaire hors de la première page : suit le curseur
    /// jusqu'à ce que le commentaire top-level ciblé soit chargé (borné).
    @discardableResult
    func loadCommentsUntilPresent(_ commentId: String, postId: String) async -> Bool {
        await onThread(postId).loadRootsUntilPresent([commentId])
    }

    func loadMoreComments(_ postId: String) async {
        if await onThread(postId).loadMoreRoots() == .failed { warnIfNoComments() }
    }

    private func warnIfNoComments() {
        guard comments.isEmpty else { return }
        FeedbackToastManager.shared.showError(String(localized: "feed.comment.loadError", defaultValue: "Impossible de charger les commentaires", bundle: .main))
    }

    /// GRDB copy of a fetched root page.
    private func persistFetchedComments(_ apiComments: [APIPostComment]) {
        guard let persistence = feedPersistence else { return }
        let pid = commentThreadModel.entity.id
        Task.detached(priority: .utility) {
            for c in apiComments {
                if let record = CommentRecord(from: c, postId: pid) {
                    try? await persistence.insertComment(record)
                }
            }
        }
    }

    // MARK: - Thread Management

    func toggleThread(_ commentId: String, postId: String) async {
        await onThread(postId).toggleThread(commentId)
    }

    func loadReplies(postId: String, commentId: String) async {
        await onThread(postId).loadReplies(commentId: commentId)
    }

    func loadMoreReplies(_ commentId: String, postId: String) async {
        await onThread(postId).loadMoreReplies(commentId: commentId)
    }

    @discardableResult
    func loadRepliesUntilPresent(_ replyId: String, in commentId: String, postId: String) async -> Bool {
        await onThread(postId).loadRepliesUntilPresent(replyId, in: commentId)
    }

    private func onThread(_ postId: String) -> CommentThreadViewModel {
        commentThreadModel.entity = .post(postId)
        return commentThreadModel
    }

    /// Précharge l'aperçu des réponses (les 2 premières s'affichent sans tap)
    /// des premiers commentaires racine qui en ont — cache-first puis réseau.
    func preloadReplyPreviews(postId: String) async {
        await onThread(postId).preloadReplyPreviews()
    }

    // MARK: - Comment Like (optimistic, socket-reaction driven)

    /// Sème (additif) `commentHearts` depuis l'état serveur (`currentUserReactions`)
    /// des commentaires/réponses fournis, sans écraser les toggles déjà appliqués.
    private func seedCommentLikes(from comments: [FeedComment]) {
        let liked = CommentHeartLedger.likedIds(in: comments)
        guard !liked.isEmpty else { return }
        commentHearts.markLiked(liked)
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
            }, toast: String(localized: "feed.like.error", defaultValue: "Impossible d'aimer la publication", bundle: .main))
        } catch {
            // Roll back optimistic state if the outbox refuses the row.
            restoreLike(isLiked: wasLiked, likes: priorLikes)
            FeedbackToastManager.shared.showError(String(localized: "feed.like.error", defaultValue: "Impossible d'aimer la publication", bundle: .main))
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
    func observeOutcome(
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
                    FeedbackToastManager.shared.showError(DailyGestureLimitNotice.exhaustedText(clientMutationId: cmid) ?? toast)
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
        known: Set<PostEditField> = EditPostDraft.documentFields, storyEffects: StoryEffects? = nil
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
                originalLanguage: language, type: type, removeMediaIds: removeMediaIds, storyEffects: storyEffects,
                location: location
            ))
            self.post = updated.toFeedPost(preferredLanguages: preferredLanguages)
            FeedbackToastManager.shared.showSuccess(String(localized: "post.detail.edit.success", defaultValue: "Post modifié"))
        } catch {
            self.post = snapshot
            FeedbackToastManager.shared.showError(String(localized: "post.detail.edit.error", defaultValue: "Erreur lors de la modification"))
        }
    }

    // MARK: - Comment Deletion

    /// Supprime un commentaire (auteur uniquement — le gating se fait côté vue
    /// via `CommentRowView`). Retrait optimiste immédiat (racine + réponses, ou
    /// réponse avec décrément du parent), puis appel API, rollback du snapshot
    /// si l'API échoue. Miroir du flux optimiste de `submitCommentWithMedia`.
    func deleteComment(_ comment: FeedComment, reason: String? = nil) async {
        guard let post else { return }
        let snapshotComments = comments
        let snapshotReplies = repliesMap
        let snapshotExpanded = expandedThreads
        let snapshotCount = post.commentCount

        let removal = commentThread.removing(comment)
        commentThread = removal.thread
        self.post?.commentCount = max(0, snapshotCount - removal.removedCount)
        if comment.parentId == nil { expandedThreads.remove(comment.id) }
        if let parentId = comment.parentId, let remaining = repliesMap[parentId] {
            // Met à jour l'aperçu en cache pour ne pas réafficher la réponse
            // supprimée à la ré-ouverture du post.
            await bestEffort("postDetailViewModel.comments.pruneDeletedReply", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(remaining, for: "replies-\(parentId)") }
        }

        do {
            try await postService.deleteComment(postId: post.id, commentId: comment.id, reason: reason)
            await bestEffort("postDetailViewModel.comments.pruneDeletedComment", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(comments, for: "post-\(post.id)") }
            FeedbackToastManager.shared.showSuccess(ContentRemovalKind.successText(reason: reason, deleted: String(localized: "feed.comments.deleted", defaultValue: "Commentaire supprimé", bundle: .main)))
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
                    await self.onThread(postId).refreshFirstRootsPage()
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
                let comment = FeedComment(api: data.comment, preferredLanguages: self.preferredLanguages)
                // Écho de NOTRE propre envoi : la ligne optimiste (keyée par le
                // cmid) est remplacée EN PLACE ; une réponse nouvelle compte sur
                // son parent — la règle unique du fil (`applyingEcho`).
                self.commentThreadModel.applyEcho(comment, clientMutationId: data.clientMutationId)
                self.post?.commentCount = data.commentCount
                // Re-persiste les listes réconciliées : la ligne optimiste
                // (id = cmid) avait été sauvée par sendComment/sendReply — sans
                // cette réécriture, le fantôme cmid restait en cache et
                // ré-apparaissait en DOUBLON du vrai commentaire à la prochaine
                // ouverture (fetch qui APPEND sur la liste issue du cache).
                let reconciledComments = self.comments
                let reconciledReplies = parentId.flatMap { self.repliesMap[$0] }
                Task {
                    await bestEffort("postDetailViewModel.comments.reconcileCreatedThread", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(reconciledComments, for: "post-\(postId)") }
                    if let parentId, let reconciledReplies {
                        await bestEffort("postDetailViewModel.comments.reconcileCreatedReplies", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(reconciledReplies, for: "replies-\(parentId)") }
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
                let updated = FeedComment(api: data.comment, preferredLanguages: self.preferredLanguages)
                self.applyCommentUpdated(updated)
                // Invalidation locale par réécriture (écho d'un autre appareil) :
                // les autres vues resservent la version éditée depuis le cache.
                let snapshot = self.comments
                Task {
                    await bestEffort("postDetailViewModel.comments.applyRemoteEdit", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(snapshot, for: "post-\(postId)") }
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
                        await bestEffort("postDetailViewModel.comments.applyMediaUpdateReplies", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(snapshot, for: "replies-\(parentId)") }
                    }
                } else if let idx = self.comments.firstIndex(where: { $0.id == commentId }) {
                    self.comments[idx].media = media
                    let snapshot = self.comments
                    Task {
                        await bestEffort("postDetailViewModel.comments.applyMediaUpdateThread", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(snapshot, for: "post-\(postId)") }
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
                        await bestEffort("postDetailViewModel.comments.applyRemoteDeleteReplies", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(threadSnapshots[key] ?? [], for: "replies-\(key)") }
                    }
                    await bestEffort("postDetailViewModel.comments.applyRemoteDeleteThread", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(snapshot, for: "post-\(postId)") }
                }
            }
            .store(in: &socketCancellables)

        // Réactions cœur de commentaire en temps réel (miroir de CommentsSheetView) :
        // synchronise `commentHearts` (réaction du user courant, delta optimiste)
        // (réaction d'un tiers) sans toucher l'optimistic local déjà appliqué.
        // Réconciliation par l'AGRÉGAT ABSOLU (miroir de
        // `StoryViewerView.applyCommentReactionEvent`) : l'événement porte
        // `aggregation.count` (état global après application) et
        // `hasCurrentUser`. L'ancien ±1 sur le delta de `commentHearts` ne purgeait
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
                // #6531 — re-résout le texte AFFICHÉ par la descente unique du
                // Prisme après fusion (`FeedPost.resolved`), au lieu de figer la
                // première traduction arrivée dont la langue figurait n'importe
                // où dans le Prisme. C'est CE chemin (l'écran de détail, pas le
                // feed) que la seconde reproduction de l'issue démontre.
                if let post = self.post {
                    self.post = post.resolved(preferredLanguages: self.preferredLanguages)
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
        return PrismTranslationResolver.resolve(
            originalLanguage: originalLanguage,
            translations: translations.mapValues(\.text),
            preferredLanguages: preferredLanguages
        )?.text
    }
}
