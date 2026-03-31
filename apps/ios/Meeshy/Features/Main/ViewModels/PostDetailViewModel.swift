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

    private var commentCursor: String?
    private let socialSocket = SocialSocketManager.shared
    private var cancellables = Set<AnyCancellable>()

    var preferredLanguages: [String] {
        AuthManager.shared.currentUser?.preferredContentLanguages ?? []
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

    private func refreshPost(_ postId: String) async {
        defer { isLoading = false }
        do {
            let apiPost = try await PostService.shared.getPost(postId: postId)
            let feedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
            post = feedPost
            await CacheCoordinator.shared.feed.save([feedPost], for: postId)
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
            return
        case .stale(let cached, _):
            if comments.isEmpty { comments = cached }
            await fetchCommentsFromNetwork(postId, cacheKey: cacheKey)
        case .expired, .empty:
            isLoadingComments = comments.isEmpty
            await fetchCommentsFromNetwork(postId, cacheKey: cacheKey)
        }
    }

    func loadMoreComments(_ postId: String) async {
        guard !isLoadingComments, hasMoreComments, commentCursor != nil else { return }
        await fetchCommentsFromNetwork(postId, cacheKey: "post-\(postId)")
    }

    private func fetchCommentsFromNetwork(_ postId: String, cacheKey: String) async {
        isLoadingComments = true
        defer { isLoadingComments = false }
        do {
            let response = try await PostService.shared.getComments(postId: postId, cursor: commentCursor)
            let langs = preferredLanguages
            let newComments = response.data.map { c -> FeedComment in
                let translatedContent: String? = Self.resolveCommentTranslation(
                    translations: c.translations, originalLanguage: c.originalLanguage, preferredLanguages: langs
                )
                return FeedComment(
                    id: c.id, author: c.author.name, authorId: c.author.id,
                    authorAvatarURL: c.author.avatar,
                    content: c.content, timestamp: c.createdAt,
                    likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                    parentId: c.parentId,
                    authorUsername: c.author.username, translationLanguages: Array(c.translations?.keys ?? []),
                    originalLanguage: c.originalLanguage, translatedContent: translatedContent
                )
            }
            let existingIds = Set(comments.map(\.id))
            let unique = newComments.filter { !existingIds.contains($0.id) }
            comments.append(contentsOf: unique)
            commentCursor = response.pagination?.nextCursor
            hasMoreComments = response.pagination?.hasMore ?? false
            await CacheCoordinator.shared.comments.save(comments, for: cacheKey)
        } catch {
            if comments.isEmpty {
                ToastManager.shared.showError("Erreur lors du chargement des commentaires")
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
            let response = try await PostService.shared.getCommentReplies(
                postId: postId, commentId: commentId
            )
            let langs = preferredLanguages
            let replies = response.data.map { c -> FeedComment in
                let translated = Self.resolveCommentTranslation(
                    translations: c.translations, originalLanguage: c.originalLanguage,
                    preferredLanguages: langs
                )
                return FeedComment(
                    id: c.id, author: c.author.name, authorId: c.author.id,
                    authorAvatarURL: c.author.avatar,
                    content: c.content, timestamp: c.createdAt,
                    likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                    parentId: commentId,
                    authorUsername: c.author.username, translationLanguages: Array(c.translations?.keys ?? []),
                    originalLanguage: c.originalLanguage, translatedContent: translated
                )
            }
            repliesMap[commentId] = replies
        } catch {
            expandedThreads.remove(commentId)
        }
    }

    // MARK: - Actions

    func likePost() async {
        guard var current = post else { return }
        current.isLiked.toggle()
        current.likes += current.isLiked ? 1 : -1
        post = current
        do {
            if current.isLiked {
                try await PostService.shared.like(postId: current.id)
            } else {
                try await PostService.shared.unlike(postId: current.id)
            }
        } catch {
            current.isLiked.toggle()
            current.likes += current.isLiked ? 1 : -1
            post = current
        }
    }

    func bookmarkPost() async {
        guard let post else { return }
        do {
            try await PostService.shared.bookmark(postId: post.id)
        } catch {
            ToastManager.shared.showError("Erreur lors de l'enregistrement")
        }
    }

    func sendComment(_ content: String, effectFlags: Int? = nil) async {
        guard let post else { return }
        do {
            let apiComment = try await PostService.shared.addComment(postId: post.id, content: content, effectFlags: effectFlags)
            let comment = FeedComment(
                id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
                authorAvatarURL: apiComment.author.avatar,
                content: apiComment.content, timestamp: apiComment.createdAt,
                likes: 0, replies: 0,
                effectFlags: apiComment.effectFlags ?? effectFlags ?? 0,
                authorUsername: apiComment.author.username
            )
            comments.insert(comment, at: 0)
            self.post?.commentCount += 1
            await CacheCoordinator.shared.comments.save(comments, for: "post-\(post.id)")
        } catch {
            ToastManager.shared.showError("Erreur lors de l'envoi du commentaire")
        }
    }

    func sendReply(_ content: String, effectFlags: Int? = nil) async {
        guard let post, let parent = replyingTo else { return }
        let parentId = parent.parentId ?? parent.id
        replyingTo = nil
        do {
            let apiComment = try await PostService.shared.addComment(postId: post.id, content: content, parentId: parentId, effectFlags: effectFlags)
            let reply = FeedComment(
                id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
                authorAvatarURL: apiComment.author.avatar,
                content: apiComment.content, timestamp: apiComment.createdAt,
                likes: 0, replies: 0,
                parentId: parentId,
                effectFlags: apiComment.effectFlags ?? effectFlags ?? 0,
                authorUsername: apiComment.author.username
            )
            var existing = repliesMap[parentId] ?? []
            existing.insert(reply, at: 0)
            repliesMap[parentId] = existing
            expandedThreads.insert(parentId)
            if let idx = comments.firstIndex(where: { $0.id == parentId }) {
                comments[idx].replies += 1
            }
            self.post?.commentCount += 1
            await CacheCoordinator.shared.comments.save(comments, for: "post-\(post.id)")
        } catch {
            ToastManager.shared.showError("Erreur lors de l'envoi de la r\u{00E9}ponse")
        }
    }

    func clearReply() {
        replyingTo = nil
    }

    // MARK: - Socket

    func subscribeToSocket(_ postId: String) {
        socialSocket.commentAdded
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] data in
                guard let self else { return }
                let parentId = data.comment.parentId
                let comment = FeedComment(
                    id: data.comment.id, author: data.comment.author.name,
                    authorId: data.comment.author.id,
                    authorAvatarURL: data.comment.author.avatar,
                    content: data.comment.content, timestamp: data.comment.createdAt,
                    likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0,
                    parentId: parentId,
                    authorUsername: data.comment.author.username, translationLanguages: Array(data.comment.translations?.keys ?? [])
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
            .store(in: &cancellables)

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
            .store(in: &cancellables)
    }

    // MARK: - Translation Resolution

    static func resolveCommentTranslation(
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
