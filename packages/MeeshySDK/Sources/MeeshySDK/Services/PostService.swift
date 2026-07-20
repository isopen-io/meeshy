import Foundation

// MARK: - Share Result

/// Server payload returned by `POST /posts/:postId/share`. The counter is
/// always populated; `shortUrl` and `token` are only present when the
/// caller asked the gateway to mint a TrackingLink alongside the share.
public struct PostShareResult: Decodable, Sendable {
    public let shared: Bool
    public let shareCount: Int
    public let shortUrl: String?
    public let token: String?

    public init(shared: Bool, shareCount: Int, shortUrl: String?, token: String?) {
        self.shared = shared
        self.shareCount = shareCount
        self.shortUrl = shortUrl
        self.token = token
    }
}

// MARK: - Protocol

public protocol PostServiceProviding: Sendable {
    func getFeed(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    /// Thread de découverte de réels (`GET /posts/feed/reels`). `seedReelId` = le
    /// réel d'entrée touché dans le feed → le serveur classe par affinité à ce réel
    /// (et l'exclut, comme il exclut les réels de l'utilisateur). Sans seed → « Pour toi ».
    /// Contrairement à `getFeed`, la réponse est déjà filtrée `type: REEL` et porte
    /// `isBookmarkedByMe` (cf. `enrichReelsForViewer`).
    func getReels(seedReelId: String?, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?) async throws -> APIPost
    func update(postId: String, content: String?, visibility: String?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?) async throws -> APIPost
    func delete(postId: String) async throws
    func like(postId: String) async throws
    func unlike(postId: String) async throws
    func bookmark(postId: String) async throws
    func getBookmarks(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func removeBookmark(postId: String) async throws
    func getPost(postId: String) async throws -> APIPost
    func getComments(postId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]>
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?) async throws -> APIPostComment
    /// Idempotent variant — sends `clientMutationId` as the
    /// `X-Client-Mutation-Id` header so the gateway `MutationLog` replays the
    /// recorded result instead of duplicating the comment on retry (offline
    /// outbox flush, notification quick-comment). A default implementation
    /// forwards to the headerless `addComment` so existing conformers stay
    /// source-compatible.
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?, clientMutationId: String?) async throws -> APIPostComment
    func likeComment(postId: String, commentId: String) async throws
    func unlikeComment(postId: String, commentId: String) async throws
    func repost(postId: String, targetType: PostType?, content: String?, isQuote: Bool) async throws -> APIPost
    func share(postId: String) async throws
    func share(postId: String, platform: String?, generateLink: Bool) async throws -> PostShareResult
    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?) async throws -> APIPost
    func createWithType(_ type: PostType, content: String, visibility: String, moodEmoji: String?, storyEffects: StoryEffects?) async throws -> APIPost
    func requestTranslation(postId: String, targetLanguage: String) async throws
    func pinPost(postId: String) async throws
    func unpinPost(postId: String) async throws
    func viewPost(postId: String, duration: Int?) async throws
    func getPostViews(postId: String, limit: Int, offset: Int) async throws -> PostViewersResponse
    func getUserPosts(userId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func getCommentReplies(postId: String, commentId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]>
    func getCommunityPosts(communityId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func recordImpressions(postIds: [String], source: String) async throws
    func recordImpression(postId: String, source: String) async throws
    func recordEngagement(_ sessions: [EngagementSession]) async throws
}

extension PostServiceProviding {
    /// Default: drop the mutation id and fall through to the headerless
    /// `addComment`. `PostService` overrides this to send the
    /// `X-Client-Mutation-Id` header; mocks may override to record it.
    public func addComment(
        postId: String,
        content: String,
        parentId: String?,
        effectFlags: Int?,
        clientMutationId: String?
    ) async throws -> APIPostComment {
        try await addComment(
            postId: postId,
            content: content,
            parentId: parentId,
            effectFlags: effectFlags
        )
    }
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

    public func getReels(seedReelId: String? = nil, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        var queryItems = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor { queryItems.append(URLQueryItem(name: "cursor", value: cursor)) }
        if let seedReelId { queryItems.append(URLQueryItem(name: "seed", value: seedReelId)) }
        return try await api.request(endpoint: "/posts/feed/reels", queryItems: queryItems)
    }

    public func create(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC", moodEmoji: String? = nil, mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil, originalLanguage: String? = nil, mobileTranscription: MobileTranscriptionPayload? = nil, repostOfId: String? = nil) async throws -> APIPost {
        let body = CreatePostRequest(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId)
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

    public func addComment(
        postId: String,
        content: String,
        parentId: String? = nil,
        effectFlags: Int? = nil,
        clientMutationId: String? = nil
    ) async throws -> APIPostComment {
        guard let clientMutationId, !clientMutationId.isEmpty else {
            return try await addComment(
                postId: postId,
                content: content,
                parentId: parentId,
                effectFlags: effectFlags
            )
        }
        let body = CreateCommentRequest(content: content, parentId: parentId, effectFlags: effectFlags)
        let response: APIResponse<APIPostComment> = try await api.requestWithHeaders(
            endpoint: "/posts/\(postId)/comments",
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": clientMutationId]
        )
        return response.data
    }

    public func likeComment(postId: String, commentId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(
            endpoint: "/posts/\(postId)/comments/\(commentId)/like", method: "POST"
        )
    }

    public func repost(
        postId: String,
        targetType: PostType? = nil,
        content: String? = nil,
        isQuote: Bool = false
    ) async throws -> APIPost {
        let body = RepostRequest(
            content: content,
            isQuote: isQuote,
            targetType: targetType?.rawValue
        )
        let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts/\(postId)/repost", body: body)
        return response.data
    }

    public func share(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(postId)/share", method: "POST")
    }

    /// Records a share and (optionally) mints a TrackingLink. When
    /// `generateLink` is `true` the response carries an absolute
    /// `meeshy.me/l/<token>` URL the caller can hand to a system share
    /// sheet — the gateway owns the link creation, the client only
    /// surfaces the result. Counter-only callers can keep using
    /// `share(postId:)`.
    public func share(
        postId: String,
        platform: String? = nil,
        generateLink: Bool = false
    ) async throws -> PostShareResult {
        var body: [String: Any] = [:]
        if let platform { body["platform"] = platform }
        if generateLink { body["generateLink"] = true }
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        let response: APIResponse<PostShareResult> = try await api.request(
            endpoint: "/posts/\(postId)/share",
            method: "POST",
            body: bodyData
        )
        return response.data
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

    public func createStory(content: String?, storyEffects: StoryEffects?, visibility: String = "PUBLIC", originalLanguage: String? = nil, mediaIds: [String]? = nil, repostOfId: String? = nil) async throws -> APIPost {
        // Strip composer-local `file://` paths from mediaObjects before the
        // payload hits the wire — they only resolve in the author's sandbox
        // and break the canvas for every reader (cf. StoryEffects+Sanitization
        // and StoryMediaLayer.swift:132-134).
        let sanitizedEffects = storyEffects?.sanitizedForServerPublish()
        let body = CreateStoryRequest(content: content, storyEffects: sanitizedEffects, visibility: visibility, originalLanguage: originalLanguage, mediaIds: mediaIds, repostOfId: repostOfId)
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
        case .reel:
            return try await create(content: content, type: "REEL", visibility: visibility)
        }
    }

    // MARK: - Update Post

    public func update(postId: String, content: String? = nil, visibility: String? = nil, moodEmoji: String? = nil, originalLanguage: String? = nil, type: String? = nil, removeMediaIds: [String]? = nil) async throws -> APIPost {
        let body = UpdatePostRequest(content: content, visibility: visibility, moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type, removeMediaIds: removeMediaIds)
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

    // MARK: - Impression Tracking

    public func recordImpressions(postIds: [String], source: String = "feed") async throws {
        guard !postIds.isEmpty else { return }
        struct BatchBody: Encodable { let postIds: [String]; let source: String }
        let _: APIResponse<[String: Int]> = try await api.post(
            endpoint: "/posts/impressions/batch",
            body: BatchBody(postIds: postIds, source: source)
        )
    }

    /// Records a single impression for one post. Unlike `recordImpressions`
    /// (feed batch, deduped client-side per session), this is NOT deduped —
    /// every Detail open is one more impression (`source: "detail"`).
    public func recordImpression(postId: String, source: String = "detail") async throws {
        struct Body: Encodable { let source: String }
        let _: APIResponse<[String: Bool]> = try await api.post(
            endpoint: "/posts/\(postId)/impression",
            body: Body(source: source)
        )
    }

    public func recordEngagement(_ sessions: [EngagementSession]) async throws {
        guard !sessions.isEmpty else { return }
        struct BatchBody: Encodable { let sessions: [EngagementSession] }
        let _: APIResponse<[String: Int]> = try await api.post(
            endpoint: "/posts/engagement/batch",
            body: BatchBody(sessions: sessions)
        )
    }
}
