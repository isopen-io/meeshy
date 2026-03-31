import Foundation
import SwiftUI
import Combine
import MeeshySDK

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
    private let limit = 20
    private var cancellables = Set<AnyCancellable>()
    private let socialSocket: SocialSocketProviding
    private let postService: PostServiceProviding
    private var cacheSaveTask: Task<Void, Never>?

    init(
        api: APIClientProviding = APIClient.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        postService: PostServiceProviding = PostService.shared
    ) {
        self.api = api
        self.socialSocket = socialSocket
        self.postService = postService
    }

    private var preferredLanguages: [String] {
        AuthManager.shared.currentUser?.preferredContentLanguages ?? []
    }

    private var userLanguage: String {
        preferredLanguages.first ?? "en"
    }

    // MARK: - Initial Load

    func loadFeed() async {
        guard !isLoading else { return }
        isLoading = true
        error = nil

        let cacheResult = await CacheCoordinator.shared.feed.load(for: "main-feed")

        switch cacheResult {
        case .fresh(let cachedPosts, _):
            posts = cachedPosts
            isLoading = false
            hasLoaded = true
            return

        case .stale(let cachedPosts, _):
            posts = cachedPosts
            isLoading = false
            hasLoaded = true
            Task {
                await fetchFeedFromNetwork(showLoading: false)
            }
            return

        case .expired, .empty:
            break
        }

        await fetchFeedFromNetwork(showLoading: true)
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

                Task.detached(priority: .utility) { [fetched] in
                    await CacheCoordinator.shared.feed.save(fetched, for: "main-feed")
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
        Task.detached { await CacheCoordinator.shared.feed.invalidate(for: "main-feed") }
        await loadFeed()
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

        do {
            if posts[index].isLiked {
                let _: SimpleAPIResponse = try await api.request(
                    endpoint: "/posts/\(postId)/like",
                    method: "POST"
                )
            } else {
                let _ = try await api.delete(endpoint: "/posts/\(postId)/like")
            }
            debouncedCacheSave()
        } catch {
            // Revert on failure — batch mutations
            var revert = posts[index]
            revert.isLiked.toggle()
            revert.likes += revert.isLiked ? 1 : -1
            posts[index] = revert
        }
    }

    func bookmarkPost(_ postId: String) async {
        do {
            let _: APIResponse<[String: Bool]> = try await api.request(
                endpoint: "/posts/\(postId)/bookmark",
                method: "POST"
            )
        } catch {
            ToastManager.shared.showError("Erreur lors de l'enregistrement")
        }
    }

    func createPost(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC", mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil, mobileTranscription: MobileTranscriptionPayload? = nil) async {
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
                mobileTranscription: mobileTranscription
            )
            let feedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
            posts.insert(feedPost, at: 0)
            debouncedCacheSave()
            publishSuccess = true
        } catch {
            publishError = error.localizedDescription
        }
    }

    func sendComment(postId: String, content: String, parentId: String? = nil) async {
        do {
            let apiComment = try await postService.addComment(postId: postId, content: content, parentId: parentId)
            if let index = posts.firstIndex(where: { $0.id == postId }) {
                let feedComment = FeedComment(
                    id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
                    authorAvatarURL: apiComment.author.avatar,
                    content: apiComment.content, timestamp: apiComment.createdAt,
                    likes: 0, replies: 0,
                    parentId: parentId
                )
                posts[index].comments.insert(feedComment, at: 0)
                posts[index].commentCount += 1
            }
        } catch {
            ToastManager.shared.showError("Erreur lors de l'envoi du commentaire")
        }
    }

    func likeComment(postId: String, commentId: String, emoji: String = "❤️") async {
        let body: [String: String] = ["emoji": emoji]
        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let _: SimpleAPIResponse = try await api.request(
                endpoint: "/posts/\(postId)/comments/\(commentId)/like",
                method: "POST",
                body: bodyData
            )
        } catch {
            ToastManager.shared.showError("Erreur lors du like")
        }
    }

    func repostPost(_ postId: String, content: String? = nil, isQuote: Bool = false) async {
        do {
            try await postService.repost(postId: postId, quote: isQuote ? content : nil)
        } catch {
            ToastManager.shared.showError("Erreur lors du repost")
        }
    }

    func sharePost(_ postId: String, platform: String? = nil) async {
        var body: [String: String] = [:]
        if let platform { body["platform"] = platform }

        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let _: SimpleAPIResponse = try await api.request(
                endpoint: "/posts/\(postId)/share",
                method: "POST",
                body: bodyData
            )
        } catch {
            ToastManager.shared.showError("Erreur lors du partage")
        }
    }

    func deletePost(_ postId: String) async {
        let snapshot = posts
        posts.removeAll { $0.id == postId }

        do {
            try await postService.delete(postId: postId)
            debouncedCacheSave()
            ToastManager.shared.showSuccess("Post supprime")
        } catch {
            posts = snapshot
            ToastManager.shared.showError("Erreur lors de la suppression")
        }
    }

    func reportPost(_ postId: String) async {
        do {
            try await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
            ToastManager.shared.showSuccess("Signalement envoye")
        } catch {
            ToastManager.shared.showError("Erreur lors du signalement")
        }
    }

    func pinPost(_ postId: String) async {
        do {
            try await postService.pinPost(postId: postId)
            ToastManager.shared.showSuccess("Post epingle")
        } catch {
            ToastManager.shared.showError("Erreur lors de l'epinglage")
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
        guard cancellables.isEmpty else { return }
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
            .store(in: &cancellables)

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
            .store(in: &cancellables)

        // --- post:deleted ---
        socialSocket.postDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] postId in
                self?.posts.removeAll { $0.id == postId }
                self?.debouncedCacheSave()
            }
            .store(in: &cancellables)

        // --- post:liked ---
        socialSocket.postLiked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].likes = data.likeCount
                self.debouncedCacheSave()
            }
            .store(in: &cancellables)

        // --- post:unliked ---
        socialSocket.postUnliked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].likes = data.likeCount
                self.debouncedCacheSave()
            }
            .store(in: &cancellables)

        // --- post:bookmarked ---
        socialSocket.postBookmarked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.debouncedCacheSave()
            }
            .store(in: &cancellables)

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
            .store(in: &cancellables)

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
            .store(in: &cancellables)

        // --- comment:deleted ---
        socialSocket.commentDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].commentCount = data.commentCount
            }
            .store(in: &cancellables)

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
            .store(in: &cancellables)

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
            .store(in: &cancellables)
    }

    func unsubscribeFromSocketEvents() {
        cancellables.removeAll()
        socialSocket.unsubscribeFeed()
    }

    private func debouncedCacheSave() {
        cacheSaveTask?.cancel()
        let snapshot = posts
        cacheSaveTask = Task {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            await CacheCoordinator.shared.feed.save(snapshot, for: "main-feed")
        }
    }
}

