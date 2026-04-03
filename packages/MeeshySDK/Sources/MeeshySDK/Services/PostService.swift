import Foundation

// MARK: - Protocol

public protocol PostServiceProviding: Sendable {
    func getFeed(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, mobileTranscription: MobileTranscriptionPayload?) async throws -> APIPost
    func update(postId: String, content: String?, visibility: String?, moodEmoji: String?) async throws -> APIPost
    func delete(postId: String) async throws
    func like(postId: String) async throws
    func unlike(postId: String) async throws
    func bookmark(postId: String) async throws
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?) async throws -> APIPostComment
    func likeComment(postId: String, commentId: String) async throws
    func repost(postId: String, quote: String?) async throws
    func share(postId: String) async throws
    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, mediaIds: [String]?) async throws -> APIPost
    func createWithType(_ type: PostType, content: String, visibility: String, moodEmoji: String?, storyEffects: StoryEffects?) async throws -> APIPost
    func requestTranslation(postId: String, targetLanguage: String) async throws
    func pinPost(postId: String) async throws
    func unpinPost(postId: String) async throws
    func viewPost(postId: String, duration: Int?) async throws
    func getPostViews(postId: String, limit: Int, offset: Int) async throws -> PostViewersResponse
    func getUserPosts(userId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func getCommentReplies(postId: String, commentId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]>
    func getCommunityPosts(communityId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
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

    public func addComment(postId: String, content: String, parentId: String? = nil, effectFlags: Int? = nil) async throws -> APIPostComment {
        let body = CreateCommentRequest(content: content, parentId: parentId, effectFlags: effectFlags)
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

    public func pinPost(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.request(endpoint: "/posts/\(postId)/pin", method: "POST")
    }

    public func unpinPost(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)/pin")
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

    // MARK: - Update Post

    public func update(postId: String, content: String? = nil, visibility: String? = nil, moodEmoji: String? = nil) async throws -> APIPost {
        let body = UpdatePostRequest(content: content, visibility: visibility, moodEmoji: moodEmoji)
        let response: APIResponse<APIPost> = try await api.put(endpoint: "/posts/\(postId)", body: body)
        return response.data
    }

    // MARK: - View Tracking

    public func viewPost(postId: String, duration: Int? = nil) async throws {
        if let duration {
            let body = ["duration": duration]
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let _: APIResponse<[String: Bool]> = try await api.request(
                endpoint: "/posts/\(postId)/view",
                method: "POST",
                body: bodyData
            )
        } else {
            let _: APIResponse<[String: Bool]> = try await api.request(
                endpoint: "/posts/\(postId)/view",
                method: "POST"
            )
        }
    }

    public func getPostViews(postId: String, limit: Int = 50, offset: Int = 0) async throws -> PostViewersResponse {
        let response: APIResponse<PostViewersResponse> = try await api.request(
            endpoint: "/posts/\(postId)/views",
            queryItems: [
                URLQueryItem(name: "limit", value: "\(limit)"),
                URLQueryItem(name: "offset", value: "\(offset)")
            ]
        )
        return response.data
    }

    // MARK: - Feed Variants

    public func getUserPosts(userId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/user/\(userId)", cursor: cursor, limit: limit)
    }

    public func getCommunityPosts(communityId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/community/\(communityId)", cursor: cursor, limit: limit)
    }

    // MARK: - Comment Replies

    public func getCommentReplies(postId: String, commentId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        try await api.paginatedRequest(endpoint: "/posts/\(postId)/comments/\(commentId)/replies", cursor: cursor, limit: limit)
    }
}
