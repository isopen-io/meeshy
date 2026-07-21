import Foundation
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// `LanguageProviding` and `AuthManagerLanguageProvider` were extracted to
// `Features/Main/Services/LanguageProviding.swift` so PostDetailViewModel /
// BookmarksViewModel can depend on them without importing FeedViewModel.

@MainActor
class FeedViewModel: ObservableObject {
    @Published var posts: [FeedPost] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var hasMore = true
    @Published var hasLoaded = false
    @Published var error: String?

    /// Number of new posts received via Socket.IO while the user is scrolled down.
    /// Reset to 0 when the user taps the "New posts" banner or pulls to refresh.
    @Published var newPostsCount: Int = 0
    @Published var publishError: String?
    @Published var publishSuccess: Bool = false

    private var nextCursor: String?
    private let api: APIClientProviding
    private let offlineQueue: OfflineQueueing
    private let limit = 20
    private var cancellables = Set<AnyCancellable>()
    /// Subscriptions owned by `subscribeToSocketEvents()` only — kept
    /// separate from the general `cancellables` set so the
    /// `cancellables.isEmpty` guard isn't tripped by init-time
    /// subscriptions like `observePreferredLanguageChanges()`. The
    /// `unsubscribeFromSocketEvents()` removes only this set so the
    /// language-change observer keeps living across socket re-subscribes.
    private var socketCancellables = Set<AnyCancellable>()
    private let socialSocket: SocialSocketProviding
    private let postService: PostServiceProviding
    private let languageProvider: LanguageProviding
    private var cacheSaveTask: Task<Void, Never>?
    private var isFeedLoadInProgress = false
    /// Tracks postIds whose comments are currently being prefetched, to coalesce
    /// duplicate calls triggered by repeated cell .onAppear events.
    private var prefetchingComments: Set<String> = []

    // MARK: - Persistence Layer

    private(set) var feedStore: FeedStore?
    private(set) var feedSocketHandler: FeedSocketHandler?
    private var feedPersistence: FeedPersistenceActor?

    init(
        api: APIClientProviding = APIClient.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        postService: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider(),
        offlineQueue: OfflineQueueing = OfflineQueue.shared
    ) {
        self.api = api
        self.socialSocket = socialSocket
        self.postService = postService
        self.languageProvider = languageProvider
        self.offlineQueue = offlineQueue
        observePreferredLanguageChanges()
    }

    /// B2 (Prisme Linguistique) — when the viewer's preferred-content
    /// languages change mid-session (Settings edit), re-resolve every
    /// already-mapped FeedPost. The `translations` dict stored on each
    /// post is enough; no network re-fetch is needed.
    ///
    /// Observed on `AuthManager.shared.currentUserPublisher` (the canonical
    /// source-of-truth — `LanguageProviding` is reactive too but exposes
    /// no publisher). Distinct duplicate filter avoids spurious work on
    /// unrelated `currentUser` mutations (e.g. avatar change).
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
                self.posts = self.posts.map { $0.resolved(preferredLanguages: langs) }
            }
            .store(in: &cancellables)
    }

    /// Wire persistence store and socket handler for GRDB-backed feed.
    /// Call once after init when the dependency container is available.
    func setupPersistence(store: FeedStore, socketHandler: FeedSocketHandler, persistence: FeedPersistenceActor) {
        self.feedStore = store
        self.feedSocketHandler = socketHandler
        self.feedPersistence = persistence
        socketHandler.arm()
    }

    private var preferredLanguages: [String] {
        languageProvider.preferredLanguages
    }

    // MARK: - Initial Load

    /// Loads the feed cache-first. Pass `forceRefresh: true` (pull-to-refresh) to
    /// bypass the cache read entirely and always fetch from the network — the
    /// fetch's write-back save then overwrites the cache with fresh data.
    func loadFeed(forceRefresh: Bool = false) async {
        guard !isFeedLoadInProgress else { return }
        isFeedLoadInProgress = true
        defer { isFeedLoadInProgress = false }
        // Yield so concurrent tasks see the in-progress flag before any
        // fast (e.g. cache or synchronous mock) path resets it.
        await Task.yield()
        error = nil

        if !forceRefresh {
            let cacheResult = await CacheCoordinator.shared.feed.load(for: "main-feed")

            switch cacheResult {
            case .fresh(let cachedPosts, _):
                posts = cachedPosts
                hasLoaded = true
                prefetchMedia(around: 0)
                return

            case .stale(let cachedPosts, _):
                posts = cachedPosts
                hasLoaded = true
                prefetchMedia(around: 0)
                Task {
                    await fetchFeedFromNetwork(showLoading: false)
                }
                return

            case .expired, .empty:
                break
            }
        }

        await fetchFeedFromNetwork(showLoading: posts.isEmpty)
    }

    private func fetchFeedFromNetwork(showLoading: Bool) async {
        if showLoading {
            isLoading = true
        }

        do {
            let response: PaginatedAPIResponse<[APIPost]> = try await api.paginatedRequest(
                endpoint: "/posts/feed",
                cursor: nil,
                limit: limit
            )

            if response.success {
                // Map the API payload off the main actor — `toFeedPost` decodes
                // each post's media / comments / translations, real CPU for a
                // full feed page (FeedViewModel is @MainActor + SE-0461). Both
                // `[APIPost]` in and `[FeedPost]` out are Sendable, clean hop.
                let preferred = self.preferredLanguages
                let payload = response.data
                let fetched = await Task.detached(priority: .userInitiated) {
                    payload.map { $0.toFeedPost(preferredLanguages: preferred) }
                }.value
                // Protective merge — same class of fix as MessageStore.publish:
                // a `.stale` cache load kicks off this background refresh, and a
                // socket `post:created` / `post:reposted` can insert a post at
                // index 0 WHILE the fetch is in flight. A straight `posts =
                // fetched` would erase that just-arrived post (it flashes in,
                // then vanishes). Preserve only real-time posts strictly newer
                // than the server head so server-side deletions within the
                // fetched range still take effect.
                posts = Self.mergePreservingRealtimeHead(fetched: fetched, existing: posts)
                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
                prefetchMedia(around: 0)

                Task.detached(priority: .utility) { [fetched] in
                    try? await CacheCoordinator.shared.feed.save(fetched, for: "main-feed")
                }

                // Persist to GRDB alongside cache
                if let persistence = feedPersistence {
                    let apiPosts = response.data
                    Task.detached(priority: .utility) {
                        let records = apiPosts.compactMap { PostRecord(from: $0) }
                        try? await persistence.insertPosts(records)
                    }
                }
            } else {
                if posts.isEmpty {
                    error = response.error ?? String(localized: "Impossible de charger le fil", defaultValue: "Impossible de charger le fil")
                }
            }
        } catch let apiError as APIError {
            if posts.isEmpty {
                error = apiError.localizedDescription
            }
        } catch {
            if posts.isEmpty {
                self.error = error.localizedDescription
            }
        }

        isLoading = false
        hasLoaded = true
    }

    /// Merges a freshly-fetched feed page with the in-memory list, preserving
    /// real-time posts (socket `post:created` / `post:reposted`, inserted at
    /// index 0) that arrived DURING a background refresh. Only posts strictly
    /// newer than the newest fetched post AND absent from the fetched set are
    /// preserved, so server-side deletions inside the fetched range still
    /// apply. Pure + static so it is unit-testable without a live ViewModel.
    static func mergePreservingRealtimeHead(fetched: [FeedPost], existing: [FeedPost]) -> [FeedPost] {
        guard let newestFetched = fetched.first else { return fetched }
        let fetchedIds = Set(fetched.map(\.id))
        let realtimeHead = existing.filter {
            $0.timestamp > newestFetched.timestamp && !fetchedIds.contains($0.id)
        }
        return realtimeHead.isEmpty ? fetched : realtimeHead + fetched
    }

    // MARK: - Load More (Infinite Scroll)

    func loadMoreIfNeeded(currentPost: FeedPost) async {
        // Trigger when we're 5 posts from the end
        guard let index = posts.firstIndex(where: { $0.id == currentPost.id }) else { return }
        let threshold = posts.count - 5

        // NOTE: no `nextCursor != nil` guard here on purpose. A session that
        // started from a `.fresh` cache hit (loadFeed) never touches the
        // network, so `nextCursor` stays at its initial `nil` forever while
        // `hasMore` stays at its initial `true` — requiring a non-nil cursor
        // permanently stalled infinite scroll for the whole session. `hasMore`
        // alone is a safe gate: it's always set together with `nextCursor`
        // by every real network response below, so `hasMore == true` with a
        // `nil` cursor can only mean "no real fetch has happened yet" — and
        // `cursor: nil` is exactly how `loadFeed` already requests page 1.
        guard index >= threshold,
              hasMore,
              !isLoadingMore else { return }

        isLoadingMore = true

        do {
            let response: PaginatedAPIResponse<[APIPost]> = try await api.paginatedRequest(
                endpoint: "/posts/feed",
                cursor: nextCursor,
                limit: limit
            )

            if response.success {
                // Map off the main actor (see loadFeed) — toFeedPost decode is CPU-bound.
                let preferred = self.preferredLanguages
                let payload = response.data
                let newPosts = await Task.detached(priority: .userInitiated) {
                    payload.map { $0.toFeedPost(preferredLanguages: preferred) }
                }.value
                // Deduplicate
                let existingIds = Set(posts.map(\.id))
                let uniqueNew = newPosts.filter { !existingIds.contains($0.id) }
                posts.append(contentsOf: uniqueNew)

                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false

                prefetchMedia(around: posts.count - uniqueNew.count)

                // Persist to GRDB
                if let persistence = feedPersistence {
                    let apiPosts = response.data
                    Task.detached(priority: .utility) {
                        let records = apiPosts.compactMap { PostRecord(from: $0) }
                        try? await persistence.insertPosts(records)
                    }
                }
            }
        } catch {
            // Silently fail on load more -- user can scroll again
        }

        isLoadingMore = false
    }

    // MARK: - Pull to Refresh

    func refresh() async {
        nextCursor = nil
        hasMore = true
        newPostsCount = 0
        await loadFeed(forceRefresh: true)
    }

    // MARK: - Comments Prefetch

    /// Pre-loads comments for a visible post into the cache so that opening the post
    /// detail does not require a network round-trip. Cache-first: skips the network
    /// call when the cache is already fresh. Coalesced: concurrent calls for the
    /// same `postId` are no-ops while a prefetch is in flight.
    func prefetchComments(_ postId: String) {
        guard !prefetchingComments.contains(postId) else { return }
        prefetchingComments.insert(postId)

        Task(priority: .utility) { [weak self] in
            guard let self else { return }
            defer { self.prefetchingComments.remove(postId) }

            let cacheKey = "post-\(postId)"
            let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
            if case .fresh = cached { return }

            do {
                let response = try await self.postService.getComments(postId: postId, cursor: nil, limit: 20)
                let langs = self.preferredLanguages
                let payload = response.data
                let comments = await Task.detached(priority: .utility) {
                    payload.map { c -> FeedComment in
                        let translatedContent = PostDetailViewModel.resolveCommentTranslation(
                            translations: c.translations,
                            originalLanguage: c.originalLanguage,
                            preferredLanguages: langs
                        )
                        return FeedComment(
                            id: c.id, author: c.author.name, authorId: c.author.id,
                            authorAvatarURL: c.author.avatar,
                            content: c.content, timestamp: c.createdAt,
                            likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                            parentId: c.parentId,
                            originalLanguage: c.originalLanguage, translatedContent: translatedContent,
                            currentUserReactions: c.currentUserReactions,
                            media: (c.media ?? []).map { $0.toFeedMedia() }
                        )
                    }
                }.value
                try? await CacheCoordinator.shared.comments.save(comments, for: cacheKey)
            } catch {
                // Silent fail on prefetch — user-triggered open will retry the network.
            }
        }
    }

    // MARK: - New Posts Banner

    /// Call this when the user taps the "New posts" banner to scroll to top
    /// and reset the counter.
    func acknowledgeNewPosts() {
        newPostsCount = 0
    }

    // MARK: - Interactions

    func likePost(_ postId: String) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }

        // Snapshot pre-mutation state so both the synchronous enqueue-refusal
        // path and the async `.exhausted` observer roll back to the exact prior
        // state (the feed may mutate across the enqueue await).
        let wasLiked = posts[index].isLiked
        let priorLikes = posts[index].likes

        // Optimistic update — batch mutations to trigger a single objectWillChange
        var post = posts[index]
        post.isLiked.toggle()
        post.likes += post.isLiked ? 1 : -1
        posts[index] = post

        // T10b — route the like through the durable outbox (survives offline +
        // app kill, flushes on reconnect via T10) instead of a direct REST call
        // that was lost when offline. Mirrors PostDetailViewModel.likePost and
        // this VM's own toggleLikeComment; the dispatcher sends POST/DELETE
        // /posts/:id/like per `liked`.
        let liked = posts[index].isLiked
        let cmid = ClientMutationId.generate()
        let payload = ToggleLikePostPayload(
            clientMutationId: cmid,
            postId: postId,
            liked: liked
        )
        do {
            try await offlineQueue.enqueue(.toggleLikePost, payload: payload, conversationId: nil)
            debouncedCacheSave()

            // Sync optimistic like state to GRDB so the feed cache matches.
            if let persistence = feedPersistence {
                let count = posts[index].likes
                Task.detached(priority: .utility) {
                    try? await persistence.updateLikeCount(postId: postId, count: count, isLikedByMe: liked)
                }
            }

            // R7 — roll back the optimistic like if the outbox exhausts its
            // retry budget (server permanently rejects). Without this the toggle
            // stays stuck "liked" forever even though the server never accepted it.
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                self?.restoreLike(postId: postId, isLiked: wasLiked, likes: priorLikes)
            }, toast: String(localized: "feed.like.error", defaultValue: "Error liking post", bundle: .main))
        } catch {
            // Roll back optimistic state if the outbox refuses the row.
            restoreLike(postId: postId, isLiked: wasLiked, likes: priorLikes)
        }
    }

    /// Restores a post's like state to a captured snapshot, re-resolving the
    /// index since the feed may have mutated during an `await`. Shared by the
    /// synchronous enqueue-refusal path and the async `.exhausted` observer.
    private func restoreLike(postId: String, isLiked: Bool, likes: Int) {
        guard let i = posts.firstIndex(where: { $0.id == postId }) else { return }
        var revert = posts[i]
        revert.isLiked = isLiked
        revert.likes = likes
        posts[i] = revert
        debouncedCacheSave()
    }

    /// Subscribes to the injected queue's `outcomeStream(for: cmid)` and runs
    /// `rollback` if the OutboxFlusher escalates the row to `.exhausted` (retry
    /// budget spent — the server permanently rejected it). `.applied` is a no-op
    /// (the optimistic state is already final).
    /// ⚠️ Le corps du Task ne capture PAS `self` : hors-ligne le stream peut ne
    /// jamais émettre, et un `guard let self` fort aurait retenu un VM fermé
    /// indéfiniment (un Task fantôme par like/post). Même forme que
    /// `UserProfileViewModel.observeOutcome`.
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

    func bookmarkPost(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }) else { return }

        // Optimistic: insert into the local "bookmarks" cache so opening the
        // Favoris tab shows the post immediately. Mirror BookmarksViewModel's
        // snapshot/rollback pattern on failure.
        //
        // SWR: an in-cache list (fresh or stale) is the rollback target; an
        // expired/empty cache means there is nothing to roll back to and we
        // simply seed the bookmarks list with this post. The bookmarks list
        // itself is revalidated by `BookmarksViewModel` when the user opens
        // the Favoris tab, so we do NOT trigger a remote refresh here.
        let bookmarksKey = "bookmarks"
        let result = await CacheCoordinator.shared.feed.load(for: bookmarksKey)
        let cachedBookmarks: [FeedPost]
        switch result {
        case .fresh(let v, _), .stale(let v, _):
            cachedBookmarks = v
        case .expired, .empty:
            cachedBookmarks = []
        }
        let snapshot = cachedBookmarks
        if !cachedBookmarks.contains(where: { $0.id == postId }) {
            var updated = cachedBookmarks
            updated.insert(post, at: 0)
            try? await CacheCoordinator.shared.feed.save(updated, for: bookmarksKey)
        }
        FeedbackToastManager.shared.showSuccess(String(localized: "feed.bookmark.success", defaultValue: "Added to bookmarks", bundle: .main))

        do {
            let _: APIResponse<[String: Bool]> = try await api.request(
                endpoint: "/posts/\(postId)/bookmark",
                method: "POST"
            )
        } catch {
            // Rollback the optimistic cache insertion.
            try? await CacheCoordinator.shared.feed.save(snapshot, for: bookmarksKey)
            FeedbackToastManager.shared.showError(String(localized: "feed.bookmark.error", defaultValue: "Error saving bookmark", bundle: .main))
        }
    }

    func createPost(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC", mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil, originalLanguage: String? = nil, mobileTranscription: MobileTranscriptionPayload? = nil) async {
        publishError = nil
        publishSuccess = false

        // U1 ST3 — a text-only POST routes through the durable outbox so it
        // survives offline + app kill (the direct postService.create below was
        // silently lost when offline). Media / audio posts stay on the direct
        // path for now (their assets are not yet durably queued — U1b). The
        // gateway only echoes the cmid on the POST branch of post:created, so
        // only type == "POST" can be reconciled by FeedViewModel.postCreated.
        let hasMedia = !(mediaIds?.isEmpty ?? true)
        let isDurableTextOnly = type == "POST"
            && !hasMedia
            && audioUrl == nil
            && mobileTranscription == nil
        if isDurableTextOnly,
           let text = content,
           !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            await enqueueDurableTextPost(content: text, visibility: visibility, originalLanguage: originalLanguage)
            return
        }

        do {
            let apiPost = try await postService.create(
                content: content,
                type: type,
                visibility: visibility,
                moodEmoji: nil,
                mediaIds: mediaIds,
                audioUrl: audioUrl,
                audioDuration: audioDuration,
                originalLanguage: originalLanguage,
                mobileTranscription: mobileTranscription,
                repostOfId: nil
            )
            let feedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
            posts.insert(feedPost, at: 0)
            debouncedCacheSave()
            publishSuccess = true

            // Persist to GRDB
            if let persistence = feedPersistence, let record = PostRecord(from: apiPost) {
                Task.detached(priority: .utility) {
                    try? await persistence.insertPost(record)
                }
            }
        } catch {
            publishError = error.localizedDescription
        }
    }

    /// U1 ST3 — inserts an optimistic post keyed by a fresh cmid and enqueues a
    /// durable `.createPost` row. The post appears instantly; the OutboxFlusher
    /// dispatches it (POST /posts with `X-Client-Mutation-Id`) and the gateway
    /// echoes the cmid on `post:created`, where FeedViewModel reconciles the
    /// optimistic post in place (cmid -> server id). Rolls back if the outbox
    /// refuses the row synchronously, or later exhausts its retry budget.
    private func enqueueDurableTextPost(content: String, visibility: String, originalLanguage: String?) async {
        let cmid = ClientMutationId.generate()
        let currentUser = AuthManager.shared.currentUser
        let optimistic = FeedPost(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            type: "POST",
            content: content,
            timestamp: Date(),
            originalLanguage: originalLanguage
        )
        posts.insert(optimistic, at: 0)
        debouncedCacheSave()

        let payload = CreatePostPayload(
            clientMutationId: cmid,
            content: content,
            attachmentIds: [],
            visibility: visibility,
            originalLanguage: originalLanguage
        )
        do {
            try await offlineQueue.enqueue(.createPost, payload: payload, conversationId: nil)
            publishSuccess = true
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                self?.removeOptimisticPost(id: cmid)
            }, toast: "Erreur lors de la publication")
        } catch {
            removeOptimisticPost(id: cmid)
            publishError = error.localizedDescription
        }
    }

    /// A post/reel is "stuck offline" (recoverable as a composer draft) once it
    /// has been unsent for longer than this — the "pas envoyé dans la minute →
    /// offline" rule shared by every composer. `nonisolated` so it can be read
    /// from any isolation (matches `SyncPillViewModel.staleInflightThreshold`).
    nonisolated static let offlineStuckThreshold: TimeInterval = 60

    /// Returns the last POST/REEL that got stuck offline (unsent for more than
    /// `offlineStuckThreshold`) so the feed composer can pre-fill it as a draft.
    func recoverUnsentPost() async -> RecoveredOfflinePost? {
        await offlineQueue.recoverLastUnsentPost(
            matchingTypes: ["POST", "REEL"],
            olderThan: Self.offlineStuckThreshold
        )
    }

    /// Supersedes a recovered post/reel when the user re-sends it from the
    /// composer, so the resend replaces the stuck row (and reclaims its
    /// pending-media files) instead of duplicating it on reconnect.
    ///
    /// Also drops the orphaned optimistic feed post keyed by this cmid: an
    /// offline post/reel was inserted optimistically (id == cmid) when first
    /// queued, and its `.createPost` row is what we're now deleting — without
    /// this the optimistic card would linger in the feed forever (its row gone,
    /// so it can never reconcile). The resend inserts a fresh optimistic card
    /// under a new cmid.
    func supersedeRecoveredPost(clientMutationId: String) async {
        removeOptimisticPost(id: clientMutationId)
        await offlineQueue.cancelCreatePost(clientMutationId: clientMutationId)
    }

    /// Removes an optimistic post by id (re-resolving the index since the feed
    /// may mutate across an `await`). Rolls back a queued create the outbox
    /// refused or exhausted.
    private func removeOptimisticPost(id: String) {
        guard let i = posts.firstIndex(where: { $0.id == id }) else { return }
        posts.remove(at: i)
        debouncedCacheSave()
    }

    /// U1b — durably publishes an OFFLINE media post. Inserts an optimistic post
    /// keyed by a fresh cmid (rendering the picked files as a local-URL preview)
    /// and routes the media through `enqueuePostMedia` (relocate + write-ahead
    /// `.createPost`). The OutboxFlusher uploads the files via TUS on reconnect
    /// and creates the post; the gateway echoes the cmid on `post:created`, where
    /// the reconcile (U1 ST2) swaps the optimistic post for the server one (no
    /// duplicate). Rolls back on synchronous enqueue refusal or `.exhausted`.
    /// Falls back to the text-only path when there are no media URLs.
    ///
    /// `type` mirrors the online media path (`ReelComposition.defaultType`): a
    /// video / multi-image post created offline is enqueued as a `REEL` so it
    /// lands on the reels surface once the OutboxFlusher uploads it — reusing the
    /// exact post durability machinery, only the server-side `type` differs.
    func createOfflineMediaPost(
        localMediaURLs: [URL],
        content: String?,
        visibility: String = "PUBLIC",
        originalLanguage: String? = nil,
        type: String = "POST"
    ) async {
        publishError = nil
        publishSuccess = false
        guard !localMediaURLs.isEmpty else {
            await enqueueDurableTextPost(
                content: content ?? "",
                visibility: visibility,
                originalLanguage: originalLanguage
            )
            return
        }

        let cmid = ClientMutationId.generate()
        let currentUser = AuthManager.shared.currentUser
        let optimistic = FeedPost(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            type: type,
            content: content ?? "",
            timestamp: Date(),
            media: localMediaURLs.map(Self.optimisticFeedMedia(forLocalURL:)),
            originalLanguage: originalLanguage
        )
        posts.insert(optimistic, at: 0)
        debouncedCacheSave()

        do {
            _ = try await offlineQueue.enqueuePostMedia(
                sourceMediaURLs: localMediaURLs,
                clientMutationId: cmid,
                content: content,
                visibility: visibility,
                originalLanguage: originalLanguage,
                type: type
            )
            publishSuccess = true
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                self?.removeOptimisticPost(id: cmid)
            }, toast: "Erreur lors de la publication")
        } catch {
            removeOptimisticPost(id: cmid)
            publishError = error.localizedDescription
        }
    }

    /// Builds the optimistic `FeedMedia` for a not-yet-uploaded local file,
    /// deriving the type from its extension so the preview renders as image vs
    /// video. The `file://` URL is replaced by the server media URL on reconcile.
    private static func optimisticFeedMedia(forLocalURL url: URL) -> FeedMedia {
        let mime = MimeTypeResolver.mimeType(forExtension: url.pathExtension)
        let type: FeedMediaType
        switch AttachmentKind(mimeType: mime) {
        case .video: type = .video
        case .audio: type = .audio
        default: type = .image
        }
        return FeedMedia(type: type, url: url.absoluteString)
    }

    func sendComment(postId: String, content: String, parentId: String? = nil, effectFlags: Int? = nil) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        // T10c — optimistic insert + durable outbox enqueue (survives offline +
        // app kill, flushes on reconnect via T10) instead of the direct
        // postService call that silently lost the comment offline. The real
        // server comment reconciles via `comment:added` / a feed refresh.
        // Mirrors PostDetailViewModel.sendComment.
        let cmid = ClientMutationId.generate()
        let snapshot = posts[index].comments
        let snapshotCount = posts[index].commentCount
        let currentUser = AuthManager.shared.currentUser
        let optimistic = FeedComment(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorAvatarURL: currentUser?.avatar,
            content: content,
            timestamp: Date(),
            likes: 0, replies: 0,
            parentId: parentId,
            effectFlags: effectFlags ?? 0
        )
        posts[index].comments.insert(optimistic, at: 0)
        posts[index].commentCount += 1

        let payload = CreateCommentPayload(
            clientMutationId: cmid,
            postId: postId,
            parentCommentId: parentId,
            content: content
        )
        do {
            try await offlineQueue.enqueue(.createComment, payload: payload, conversationId: postId)

            // R7 — roll back the optimistic comment if the outbox exhausts its
            // retry budget (server permanently rejects). The synchronous catch
            // below only covers an enqueue refusal; without this observer a
            // permanently-failing comment stays in the feed forever.
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                guard let self, let i = self.posts.firstIndex(where: { $0.id == postId }) else { return }
                self.posts[i].comments = snapshot
                self.posts[i].commentCount = snapshotCount
            }, toast: String(localized: "feed.comment.sendError", defaultValue: "Error sending comment", bundle: .main))
        } catch {
            // Roll back the optimistic comment if the outbox refuses the row
            // (re-resolve the index — the feed may have mutated during the await).
            if let i = posts.firstIndex(where: { $0.id == postId }) {
                posts[i].comments = snapshot
                posts[i].commentCount = snapshotCount
            }
            FeedbackToastManager.shared.showError(String(localized: "feed.comment.sendError", defaultValue: "Error sending comment", bundle: .main))
        }
    }

    func repostPost(_ postId: String, content: String? = nil, isQuote: Bool = false) async {
        do {
            _ = try await postService.repost(
                postId: resolveRepostTargetId(postId),
                targetType: nil,           // nil = server defaults to original post type
                content: isQuote ? content : nil,
                isQuote: isQuote ? (content != nil) : false
            )
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.repost.error", defaultValue: "Error reposting", bundle: .main))
        }
    }

    /// Re-sharing a SHARE must reference the ORIGINAL reel/post (root), never the
    /// intermediate share — otherwise the new post embeds an empty share card
    /// (the gateway hydrates `repostOf` only one level deep). When `postId` is
    /// itself a repost, resolve to its recorded root (`originalRepostOfId`, else
    /// the directly reposted content's id). Non-shares repost with their own id.
    private func resolveRepostTargetId(_ postId: String) -> String {
        guard let repost = posts.first(where: { $0.id == postId })?.repost else { return postId }
        return repost.originalRepostOfId ?? repost.id
    }

    /// Server-side payload returned by `POST /posts/:postId/share`. The
    /// counter fields are always present; `shortUrl` + `token` are only
    /// populated when the caller asked the gateway to mint a TrackingLink
    /// for the share (so the user gets an attributable `meeshy.me/l/…`
    /// URL to paste into any external share sheet).
    struct PostSharePayload: Decodable {
        let shared: Bool
        let shareCount: Int
        let shortUrl: String?
        let token: String?
    }

    /// Records a share on `postId`. When `generateLink` is `true` the
    /// gateway mints a `TrackingLink` owned by the current user and returns
    /// the absolute short URL — returned here so the caller can immediately
    /// hand it off to a `UIActivityViewController` / `ShareLink`.
    @discardableResult
    func sharePost(_ postId: String, platform: String? = nil, generateLink: Bool = false) async -> String? {
        var body: [String: Any] = [:]
        if let platform { body["platform"] = platform }
        if generateLink { body["generateLink"] = true }

        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let response: APIResponse<PostSharePayload> = try await api.request(
                endpoint: "/posts/\(postId)/share",
                method: "POST",
                body: bodyData
            )
            return response.data.shortUrl
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.share.error", defaultValue: "Error sharing post", bundle: .main))
            return nil
        }
    }

    func deletePost(_ postId: String) async {
        let snapshot = posts
        posts.removeAll { $0.id == postId }

        do {
            try await postService.delete(postId: postId)
            debouncedCacheSave()

            // Remove from GRDB
            if let persistence = feedPersistence {
                Task.detached(priority: .utility) {
                    try? await persistence.deletePost(id: postId)
                }
            }

            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.deleted", defaultValue: "Post deleted", bundle: .main))
        } catch {
            posts = snapshot
            FeedbackToastManager.shared.showError(String(localized: "feed.post.deleteError", defaultValue: "Error deleting post", bundle: .main))
        }
    }

    func reportPost(_ postId: String) async {
        do {
            try await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.reported", defaultValue: "Post reported", bundle: .main))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.post.reportError", defaultValue: "Error reporting post", bundle: .main))
        }
    }

    /// Updates the body content of an authored post. Optimistic UX:
    /// the new text is written into `posts[idx]` immediately, translations
    /// are cleared (the gateway re-translates in background and pushes
    /// `post:updated` via socket). Rolls back the snapshot on API failure.
    /// No-op if the post isn't found in the current feed.
    func updatePost(_ postId: String, content: String, language: String? = nil, type: String? = nil, removeMediaIds: [String]? = nil) async {
        guard let idx = posts.firstIndex(where: { $0.id == postId }) else { return }
        let snapshot = posts[idx]
        // Apply optimistic mutation: new content + clear translations so the
        // bubble re-renders with the new source text immediately. A language
        // change re-runs translation server-side, so the stale map is dropped.
        var optimistic = snapshot
        optimistic.content = content
        optimistic.translatedContent = nil
        optimistic.translations = nil
        posts[idx] = optimistic
        debouncedCacheSave()
        do {
            let updated = try await postService.update(postId: postId, content: content, visibility: nil, moodEmoji: nil, originalLanguage: language, type: type, removeMediaIds: removeMediaIds)
            // Re-hydrate from the server response so the gateway-authoritative
            // fields (updatedAt, isEdited, sanitized content, …) replace the
            // optimistic in-memory copy. Preserves the resolved translation
            // for the user's preferred language chain.
            if let newIdx = posts.firstIndex(where: { $0.id == postId }) {
                posts[newIdx] = updated.toFeedPost(preferredLanguages: preferredLanguages)
                debouncedCacheSave()
            }
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.edited", defaultValue: "Post edited", bundle: .main))
        } catch {
            // Rollback the optimistic snapshot.
            if let rollbackIdx = posts.firstIndex(where: { $0.id == postId }) {
                posts[rollbackIdx] = snapshot
                debouncedCacheSave()
            }
            FeedbackToastManager.shared.showError(String(localized: "feed.post.editError", defaultValue: "Error editing post", bundle: .main))
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

    // MARK: - Translation

    func setTranslationOverride(postId: String, language: String) {
        guard let index = posts.firstIndex(where: { $0.id == postId }),
              let translation = posts[index].translations?[language] else { return }
        posts[index].translatedContent = translation.text
    }

    /// Re-resolves the post's displayed language back to the Prisme default
    /// (undoes a manual flag-tap override). Previously did an exact-key
    /// dictionary lookup on `userLanguage` alone — case-sensitive AND only
    /// ever consulting the FIRST preferred language, so a francophone with
    /// `["de", "fr"]` preferred languages (or any uppercase-cased locale
    /// string) lost their translation even though "fr" matched further down
    /// the chain. `resolved(preferredLanguages:)` walks the FULL chain
    /// case-insensitively, matching the same algorithm used everywhere else
    /// in the Prisme (never `translations.first`).
    func clearTranslationOverride(postId: String) {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        posts[index] = posts[index].resolved(preferredLanguages: preferredLanguages)
    }

    func requestTranslation(postId: String, targetLanguage: String) async {
        do {
            try await postService.requestTranslation(postId: postId, targetLanguage: targetLanguage)
        } catch {
            // Translation will arrive via socket event
        }
    }

    // MARK: - Socket.IO Real-Time Updates

    func subscribeToSocketEvents() {
        // Ré-arme le bridge de persistance GRDB désarmé par
        // `unsubscribeFromSocketEvents` à l'onDisappear : il restait sinon
        // désarmé en permanence après le premier aller-retour sur le feed
        // (le `arm()` initial n'était fait que dans le bloc one-shot
        // `feedStore == nil` du setup). `arm()` est idempotent.
        feedSocketHandler?.arm()
        guard socketCancellables.isEmpty else { return }
        socialSocket.connect()

        // --- didReconnect → backfill du feed ---
        // Apres un flap reseau, le gateway a oublie nos rooms et des posts ont pu
        // etre crees pendant la coupure. Un refresh (forceRefresh) recharge la tete
        // du feed ; mergePreservingRealtimeHead conserve les posts inseres en temps
        // reel. Miroir de ConversationSyncEngine sur messageSocket.didReconnect.
        socialSocket.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                guard let self else { return }
                Task { await self.loadFeed(forceRefresh: true) }
            }
            .store(in: &socketCancellables)

        // --- post:created ---
        socialSocket.postCreated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self else { return }
                let feedPost = payload.post.toFeedPost(preferredLanguages: preferredLanguages)
                // U1 — reconcile an offline-created optimistic post: it was
                // inserted with the cmid as its id (U1 ST3), so the server echo
                // (carrying that cmid) replaces it in place — swapping cmid →
                // server id — instead of inserting a duplicate. Preserve local-
                // only state (isLiked) across the swap, like postUpdated.
                if let cmid = payload.clientMutationId,
                   let idx = self.posts.firstIndex(where: { $0.id == cmid }) {
                    var merged = feedPost
                    merged.isLiked = self.posts[idx].isLiked
                    self.posts[idx] = merged
                    self.debouncedCacheSave()
                    return
                }
                if !self.posts.contains(where: { $0.id == feedPost.id }) {
                    self.posts.insert(feedPost, at: 0)
                    self.newPostsCount += 1
                    self.debouncedCacheSave()
                }
            }
            .store(in: &socketCancellables)

        // --- post:updated ---
        socialSocket.postUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                let updatedFeedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
                if let index = self.posts.firstIndex(where: { $0.id == updatedFeedPost.id }) {
                    // Preserve local-only state (isLiked) across the update
                    var merged = updatedFeedPost
                    merged.isLiked = self.posts[index].isLiked
                    self.posts[index] = merged
                    self.debouncedCacheSave()
                }
            }
            .store(in: &socketCancellables)

        // --- post:deleted ---
        socialSocket.postDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] postId in
                self?.posts.removeAll { $0.id == postId }
                self?.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:liked --- (compteur ABSOLU, source unique du like de post)
        socialSocket.postLiked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].likes = data.likeCount
                // Persister `isLiked` pour l'acteur → le cache reste correct au cold
                // start (le seeding `postLikedIds` relit `post.isLiked`).
                if data.userId == AuthManager.shared.currentUser?.id {
                    self.posts[index].isLiked = true
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:unliked ---
        socialSocket.postUnliked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].likes = data.likeCount
                if data.userId == AuthManager.shared.currentUser?.id {
                    self.posts[index].isLiked = false
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:bookmarked ---
        // Le favori est PERSONNEL : le gateway n'émet `post:bookmarked` que vers la
        // feed room du viewer (toutes ses sessions/vues, dont le reel viewer). On
        // réconcilie `isBookmarkedByMe` sur le post → le re-seed du reel viewer
        // depuis `FeedViewModel.posts` porte le bon état (favori persistant).
        socialSocket.postBookmarked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self else { return }
                if let index = self.posts.firstIndex(where: { $0.id == payload.postId }) {
                    self.posts[index].isBookmarkedByMe = payload.bookmarked
                    // Absolute count (when the gateway provides it) is authoritative
                    // → the feed reconciles the displayed count live, no reload.
                    if let count = payload.bookmarkCount {
                        self.posts[index].bookmarkCount = count
                    }
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:reposted ---
        socialSocket.postReposted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self else { return }
                let repostFeedPost = data.repost.toFeedPost(preferredLanguages: self.preferredLanguages)
                if !self.posts.contains(where: { $0.id == repostFeedPost.id }) {
                    self.posts.insert(repostFeedPost, at: 0)
                    self.newPostsCount += 1
                    self.debouncedCacheSave()
                }
            }
            .store(in: &socketCancellables)

        // --- comment:added ---
        socialSocket.commentAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                // Prisme + effects parity with the REST comment mapping
                // (`toFeedPost`/`loadComments`): a comment arriving in real
                // time while the feed is open used to render as a blank row
                // for a media/effect comment (effectFlags dropped) and
                // always in its original language (no resolveCommentTranslation),
                // and lost the "liked by me" heart on a comment that already
                // carried reactions when it landed (currentUserReactions dropped).
                let translatedContent = PostDetailViewModel.resolveCommentTranslation(
                    translations: data.comment.translations,
                    originalLanguage: data.comment.originalLanguage,
                    preferredLanguages: self.preferredLanguages
                )
                let feedComment = FeedComment(
                    id: data.comment.id, author: data.comment.author.name,
                    authorId: data.comment.author.id,
                    authorAvatarURL: data.comment.author.avatar,
                    content: data.comment.content, timestamp: data.comment.createdAt,
                    likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0,
                    parentId: data.comment.parentId,
                    effectFlags: data.comment.effectFlags ?? 0,
                    originalLanguage: data.comment.originalLanguage,
                    translatedContent: translatedContent,
                    currentUserReactions: data.comment.currentUserReactions
                )
                if !self.posts[index].comments.contains(where: { $0.id == feedComment.id }) {
                    self.posts[index].comments.insert(feedComment, at: 0)
                }
                self.posts[index].commentCount = data.commentCount
            }
            .store(in: &socketCancellables)

        // --- comment:deleted ---
        socialSocket.commentDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].commentCount = data.commentCount
            }
            .store(in: &socketCancellables)

        // --- post:translation-updated ---
        socialSocket.postTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (data: SocketPostTranslationUpdatedData) in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                let translation = PostTranslation(
                    text: data.translation.text,
                    translationModel: data.translation.translationModel,
                    confidenceScore: data.translation.confidenceScore
                )
                // Batch mutations into a single array assignment
                var post = self.posts[index]
                var translations = post.translations ?? [:]
                translations[data.language] = translation
                post.translations = translations
                let langs = self.preferredLanguages
                if langs.contains(where: { $0.caseInsensitiveCompare(data.language) == .orderedSame }) {
                    if post.translatedContent == nil {
                        post.translatedContent = data.translation.text
                    }
                }
                self.posts[index] = post
            }
            .store(in: &socketCancellables)

        // --- comment:translation-updated ---
        socialSocket.commentTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (data: SocketCommentTranslationUpdatedData) in
                guard let self,
                      let postIndex = self.posts.firstIndex(where: { $0.id == data.postId }),
                      let commentIndex = self.posts[postIndex].comments.firstIndex(where: { $0.id == data.commentId })
                else { return }
                let langs = self.preferredLanguages
                if langs.contains(where: { $0.caseInsensitiveCompare(data.language) == .orderedSame }) {
                    if self.posts[postIndex].comments[commentIndex].translatedContent == nil {
                        self.posts[postIndex].comments[commentIndex].translatedContent = data.translation.text
                    }
                }
            }
            .store(in: &socketCancellables)
    }

    func unsubscribeFromSocketEvents() {
        socketCancellables.removeAll()
        socialSocket.unsubscribeFeed()
        feedSocketHandler?.disarm()
    }

    // MARK: - Media Prefetch

    private var prefetchTask: Task<Void, Never>?
    private var prefetchDebounceTask: Task<Void, Never>?
    private var lastPrefetchIndex: Int = -1

    /// Debounced entry point from scroll — avoids task thrashing during fast scroll.
    func prefetchMediaForPost(_ postId: String) {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        guard abs(index - lastPrefetchIndex) >= 2 else { return }
        lastPrefetchIndex = index
        prefetchDebounceTask?.cancel()
        prefetchDebounceTask = Task {
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled else { return }
            prefetchMedia(around: index)
        }
    }

    /// Prefetch media for posts in the visible window + next 5.
    func prefetchMedia(around index: Int) {
        prefetchTask?.cancel()
        let slice = Array(posts[max(0, index - 2)..<min(posts.count, index + 7)])
        prefetchTask = Task(priority: .utility) {
            guard !slice.isEmpty else { return }

            let imageStore = await CacheCoordinator.shared.images
            let thumbStore = await CacheCoordinator.shared.thumbnails

            // Parallel prefetch: images/thumbnails in TaskGroup, video preroll separate
            await withTaskGroup(of: Void.self) { group in
                for post in slice {
                    for media in post.media {
                        guard !Task.isCancelled else { return }

                        switch media.type {
                        case .image:
                            if let thumbUrl = media.thumbnailUrl,
                               let resolved = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            }
                            if let url = media.url,
                               let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            }

                        case .video:
                            if let thumbUrl = media.thumbnailUrl,
                               let resolved = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            } else if let url = media.url, let resolved = MeeshyConfig.resolveMediaURL(url) {
                                let thumbKey = "thumb:\(resolved.absoluteString)"
                                if thumbStore.cachedData(for: thumbKey) == nil {
                                    group.addTask { _ = await StoryMediaLoader.shared.videoThumbnail(url: resolved) }
                                }
                            }

                        case .audio:
                            if let url = media.url,
                               let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString {
                                group.addTask { _ = try? await CacheCoordinator.shared.audio.data(for: resolved) }
                            }

                        default:
                            break
                        }
                    }
                }
            }

            // Video preroll: separate from main group — non-blocking, fire-and-forget.
            // Suspended while the device is critically hot (SOTA thermal back-off,
            // WWDC19 #422) so fast scrolling stops spawning new decode sessions until
            // it cools down.
            if MediaThermalPolicy.shouldPrefetchVideo(thermalState: ProcessInfo.processInfo.thermalState),
               let firstVideo = slice.flatMap(\.media).first(where: { $0.type == .video }),
               let url = firstVideo.url, let resolved = MeeshyConfig.resolveMediaURL(url) {
                Task(priority: .utility) {
                    await StoryMediaLoader.shared.preloadAndCachePlayer(url: resolved)
                }
            }
        }
    }

    private func debouncedCacheSave() {
        cacheSaveTask?.cancel()
        let snapshot = posts
        cacheSaveTask = Task {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            try? await CacheCoordinator.shared.feed.save(snapshot, for: "main-feed")
        }
    }
}

