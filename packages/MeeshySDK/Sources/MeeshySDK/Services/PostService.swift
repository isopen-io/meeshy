import Foundation

// MARK: - Protocol

public protocol PostServiceProviding: Sendable {
    func getFeed(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, mobileTranscription: MobileTranscriptionPayload?) async throws -> APIPost
    func delete(postId: String) async throws
    func like(postId: String) async throws
    func unlike(postId: String) async throws
    func bookmark(postId: String) async throws
    func addComment(postId: String, content: String, parentId: String?) async throws -> APIPostComment
    func likeComment(postId: String, commentId: String) async throws
    func repost(postId: String, quote: String?) async throws
    func share(postId: String) async throws
    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, mediaIds: [String]?) async throws -> APIPost
    func createWithType(_ type: PostType, content: String, visibility: String, moodEmoji: String?, storyEffects: StoryEffects?) async throws -> APIPost
}

public final class PostService: PostServiceProviding, @unchecked Sendable {
    public static let shared = PostService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func getFeed(cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/feed", cursor: cursor, limit: limit)
    }

    public func create(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC", moodEmoji: String? = nil, mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil, mobileTranscription: MobileTranscriptionPayload? = nil) async throws -> APIPost {
        let body = CreatePostRequest(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, mobileTranscription: mobileTranscription)
        let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts", body: body)
        return response.data
    }

    public func delete(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)")
    }

    public func like(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(postId)/like", method: "POST")
    }

    public func unlike(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)/like")
    }

    public func bookmark(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(postId)/bookmark", method: "POST")
    }

    public func addComment(postId: String, content: String, parentId: String? = nil) async throws -> APIPostComment {
        let body = CreateCommentRequest(content: content, parentId: parentId)
        let response: APIResponse<APIPostComment> = try await api.post(endpoint: "/posts/\(postId)/comments", body: body)
        return response.data
    }

    public func likeComment(postId: String, commentId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(
            endpoint: "/posts/\(postId)/comments/\(commentId)/like", method: "POST"
        )
    }

    public func repost(postId: String, quote: String? = nil) async throws {
        let body = RepostRequest(content: quote, isQuote: quote != nil)
        let _: APIResponse<[String: String]> = try await api.post(endpoint: "/posts/\(postId)/repost", body: body)
    }

    public func share(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(postId)/share", method: "POST")
    }

    public func getBookmarks(cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/bookmarks", cursor: cursor, limit: limit)
    }

    public func removeBookmark(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)/bookmark")
    }

    public func getPost(postId: String) async throws -> APIPost {
        let response: APIResponse<APIPost> = try await api.request(endpoint: "/posts/\(postId)")
        return response.data
    }

    public func getComments(postId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        try await api.paginatedRequest(endpoint: "/posts/\(postId)/comments", cursor: cursor, limit: limit)
    }

    public func requestTranslation(postId: String, targetLanguage: String) async throws {
        let body = ["targetLanguage": targetLanguage]
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        let _: APIResponse<[String: String]> = try await api.request(
            endpoint: "/posts/\(postId)/translate",
            method: "POST",
            body: bodyData
        )
    }

    public func unlikeComment(postId: String, commentId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)/comments/\(commentId)/like")
    }

    public func deleteComment(postId: String, commentId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)/comments/\(commentId)")
    }

    public func createStory(content: String?, storyEffects: StoryEffects?, visibility: String = "PUBLIC", mediaIds: [String]? = nil) async throws -> APIPost {
        let body = CreateStoryRequest(content: content, storyEffects: storyEffects, visibility: visibility, mediaIds: mediaIds)
        let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts", body: body)
        return response.data
    }

    public func createWithType(_ type: PostType, content: String, visibility: String = "PUBLIC",
                                moodEmoji: String? = nil, storyEffects: StoryEffects? = nil) async throws -> APIPost {
        switch type {
        case .story:
            return try await createStory(content: content, storyEffects: storyEffects, visibility: visibility)
        case .status:
            return try await create(content: content, type: "STATUS", visibility: visibility, moodEmoji: moodEmoji)
        case .post:
            return try await create(content: content, type: "POST", visibility: visibility)
        }
    }
}
