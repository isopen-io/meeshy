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

    private var userLanguage: String {
        preferredLanguages.first ?? "en"
    }

    // MARK: - Initial Load

    /// Loads the feed cache-first. Pass `forceRefresh: true` (pull-to-refresh) to
    /// bypass the cache read entirely and always fetch from the network — the
    /// fetch's write-back save then overwrites the cache with fresh data.
    func loadFeed(forceRefresh: Bool = false) async {
        guard !isFeedLoadInProgress else { return }
        isFeedLoadInProgress = true
        defer { isFeedLoadInProgress = false }
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
                let fetched = response.data.map { $0.toFeedPost(preferredLanguages: self.preferredLanguages) }
                posts = fetched
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

    // MARK: - Load More (Infinite Scroll)

    func loadMoreIfNeeded(currentPost: FeedPost) async {
        // Trigger when we're 5 posts from the end
        guard let index = posts.firstIndex(where: { $0.id == currentPost.id }) else { return }
        let threshold = posts.count - 5

        guard index >= threshold,
              hasMore,
              !isLoadingMore,
              nextCursor != nil else { return }

        isLoadingMore = true

        do {
            let response: PaginatedAPIResponse<[APIPost]> = try await api.paginatedRequest(
                endpoint: "/posts/feed",
                cursor: nextCursor,
                limit: limit
            )

            if response.success {
                let newPosts = response.data.map { $0.toFeedPost(preferredLanguages: self.preferredLanguages) }
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
                let comments = response.data.map { c -> FeedComment in
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
                        originalLanguage: c.originalLanguage, translatedContent: translatedContent
                    )
                }
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
        let payload = ToggleLikePostPayload(
            clientMutationId: ClientMutationId.generate(),
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
        } catch {
            // Roll back optimistic state if the outbox refuses the row.
            var revert = posts[index]
            revert.isLiked.toggle()
            revert.likes += revert.isLiked ? 1 : -1
            posts[index] = revert
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
        FeedbackToastManager.shared.showSuccess(String(localized: "Ajoute aux favoris", defaultValue: "Ajoute aux favoris"))

        do {
            let _: APIResponse<[String: Bool]> = try await api.request(
                endpoint: "/posts/\(postId)/bookmark",
                method: "POST"
            )
        } catch {
            // Rollback the optimistic cache insertion.
            try? await CacheCoordinator.shared.feed.save(snapshot, for: bookmarksKey)
            FeedbackToastManager.shared.showError("Erreur lors de l'enregistrement")
        }
    }

    func createPost(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC", mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil, originalLanguage: String? = nil, mobileTranscription: MobileTranscriptionPayload? = nil) async {
        publishError = nil
        publishSuccess = false
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
        } catch {
            // Roll back the optimistic comment if the outbox refuses the row
            // (re-resolve the index — the feed may have mutated during the await).
            if let i = posts.firstIndex(where: { $0.id == postId }) {
                posts[i].comments = snapshot
                posts[i].commentCount = snapshotCount
            }
            FeedbackToastManager.shared.showError("Erreur lors de l'envoi du commentaire")
        }
    }

    /// Wave 1 Phase C — comment like flows through the offline outbox.
    /// `emoji` is currently fixed to `❤️` server-side ; until the route
    /// accepts custom emojis the parameter is ignored at the wire layer
    /// but still threaded through here for API stability with the view.
    func likeComment(postId: String, commentId: String, emoji: String = "❤️") async {
        let cmid = ClientMutationId.generate()
        let payload = ToggleLikeCommentPayload(
            clientMutationId: cmid,
            commentId: commentId,
            liked: true
        )
        do {
            try await offlineQueue.enqueue(.toggleLikeComment, payload: payload, conversationId: postId)
        } catch {
            FeedbackToastManager.shared.showError("Erreur lors du like")
        }
    }

    func repostPost(_ postId: String, content: String? = nil, isQuote: Bool = false) async {
        do {
            _ = try await postService.repost(
                postId: postId,
                targetType: nil,           // nil = server defaults to original post type
                content: isQuote ? content : nil,
                isQuote: isQuote ? (content != nil) : false
            )
        } catch {
            FeedbackToastManager.shared.showError("Erreur lors du repost")
        }
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
            FeedbackToastManager.shared.showError("Erreur lors du partage")
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

            FeedbackToastManager.shared.showSuccess("Post supprime")
        } catch {
            posts = snapshot
            FeedbackToastManager.shared.showError("Erreur lors de la suppression")
        }
    }

    func reportPost(_ postId: String) async {
        do {
            try await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
            FeedbackToastManager.shared.showSuccess("Signalement envoye")
        } catch {
            FeedbackToastManager.shared.showError("Erreur lors du signalement")
        }
    }

    /// Updates the body content of an authored post. Optimistic UX:
    /// the new text is written into `posts[idx]` immediately, translations
    /// are cleared (the gateway re-translates in background and pushes
    /// `post:updated` via socket). Rolls back the snapshot on API failure.
    /// No-op if the post isn't found in the current feed.
    func updatePost(_ postId: String, content: String) async {
        guard let idx = posts.firstIndex(where: { $0.id == postId }) else { return }
        let snapshot = posts[idx]
        // Apply optimistic mutation: new content + clear translations so the
        // bubble re-renders with the new source text immediately.
        var optimistic = snapshot
        optimistic.content = content
        optimistic.translatedContent = nil
        optimistic.translations = nil
        posts[idx] = optimistic
        debouncedCacheSave()
        do {
            let updated = try await postService.update(postId: postId, content: content, visibility: nil, moodEmoji: nil)
            // Re-hydrate from the server response so the gateway-authoritative
            // fields (updatedAt, isEdited, sanitized content, …) replace the
            // optimistic in-memory copy. Preserves the resolved translation
            // for the user's preferred language chain.
            if let newIdx = posts.firstIndex(where: { $0.id == postId }) {
                posts[newIdx] = updated.toFeedPost(preferredLanguages: preferredLanguages)
                debouncedCacheSave()
            }
            FeedbackToastManager.shared.showSuccess(String(localized: "Post modifie", defaultValue: "Post modifie"))
        } catch {
            // Rollback the optimistic snapshot.
            if let rollbackIdx = posts.firstIndex(where: { $0.id == postId }) {
                posts[rollbackIdx] = snapshot
                debouncedCacheSave()
            }
            FeedbackToastManager.shared.showError(String(localized: "Erreur lors de la modification", defaultValue: "Erreur lors de la modification"))
        }
    }

    func pinPost(_ postId: String) async {
        do {
            try await postService.pinPost(postId: postId)
            FeedbackToastManager.shared.showSuccess("Post epingle")
        } catch {
            FeedbackToastManager.shared.showError("Erreur lors de l'epinglage")
        }
    }

    // MARK: - Translation

    func setTranslationOverride(postId: String, language: String) {
        guard let index = posts.firstIndex(where: { $0.id == postId }),
              let translation = posts[index].translations?[language] else { return }
        posts[index].translatedContent = translation.text
    }

    func clearTranslationOverride(postId: String) {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        if let translation = posts[index].translations?[userLanguage] {
            posts[index].translatedContent = translation.text
        } else {
            posts[index].translatedContent = nil
        }
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
        guard socketCancellables.isEmpty else { return }
        socialSocket.connect()

        // --- post:created ---
        socialSocket.postCreated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                let feedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
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

        // --- post:liked ---
        socialSocket.postLiked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].likes = data.likeCount
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:unliked ---
        socialSocket.postUnliked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].likes = data.likeCount
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:bookmarked ---
        socialSocket.postBookmarked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.debouncedCacheSave()
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
                let feedComment = FeedComment(
                    id: data.comment.id, author: data.comment.author.name,
                    authorId: data.comment.author.id,
                    authorAvatarURL: data.comment.author.avatar,
                    content: data.comment.content, timestamp: data.comment.createdAt,
                    likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0,
                    parentId: data.comment.parentId
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

            // Video preroll: separate from main group — non-blocking, fire-and-forget
            if let firstVideo = slice.flatMap(\.media).first(where: { $0.type == .video }),
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

