import Foundation
import Combine
import MeeshySDK

@MainActor
class PostDetailViewModel: ObservableObject {
    @Published var post: FeedPost?
    @Published var comments: [FeedComment] = []
    @Published var isLoading = false
    @Published var isLoadingComments = false
    @Published var hasMoreComments = true
    @Published var error: String?

    private var commentCursor: String?
    private let socialSocket = SocialSocketManager.shared
    private var cancellables = Set<AnyCancellable>()

    var preferredLanguages: [String] {
        AuthManager.shared.currentUser?.preferredContentLanguages ?? []
    }

    var userLanguage: String {
        preferredLanguages.first ?? "en"
    }

    func loadPost(_ postId: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let apiPost = try await PostService.shared.getPost(postId: postId)
            post = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func loadComments(_ postId: String) async {
        guard !isLoadingComments else { return }
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
                    originalLanguage: c.originalLanguage, translatedContent: translatedContent
                )
            }
            let existingIds = Set(comments.map(\.id))
            let unique = newComments.filter { !existingIds.contains($0.id) }
            comments.append(contentsOf: unique)
            commentCursor = response.pagination?.nextCursor
            hasMoreComments = response.pagination?.hasMore ?? false
        } catch {
            // Silent fail on comment pagination
        }
    }

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
        try? await PostService.shared.bookmark(postId: post.id)
    }

    func sendComment(_ content: String) async {
        guard let post else { return }
        do {
            let apiComment = try await PostService.shared.addComment(postId: post.id, content: content)
            let comment = FeedComment(
                id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
                authorAvatarURL: apiComment.author.avatar,
                content: apiComment.content, timestamp: apiComment.createdAt,
                likes: 0, replies: 0
            )
            comments.insert(comment, at: 0)
            self.post?.commentCount += 1
        } catch {
            // Silent
        }
    }

    func subscribeToSocket(_ postId: String) {
        socialSocket.commentAdded
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] data in
                guard let self else { return }
                let comment = FeedComment(
                    id: data.comment.id, author: data.comment.author.name,
                    authorId: data.comment.author.id,
                    authorAvatarURL: data.comment.author.avatar,
                    content: data.comment.content, timestamp: data.comment.createdAt,
                    likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0
                )
                if !self.comments.contains(where: { $0.id == comment.id }) {
                    self.comments.insert(comment, at: 0)
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

    private static func resolveCommentTranslation(
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
