import Foundation

extension PostService {
    public func getFeed(cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        listed(try await api.paginatedRequest(PostsEndpoint.feed, cursor: cursor, limit: limit), on: .feed)
    }

    public func getPostsByHashtag(tag: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        listed(try await api.paginatedRequest(PostsEndpoint.hashtagByTag(tag: tag), cursor: cursor, limit: limit), on: .hashtag)
    }

    public func getTrendingHashtags(limit: Int = 20) async throws -> [APIHashtag] {
        try await api.request(
            HashtagsEndpoint.trending,
            queryItems: [URLQueryItem(name: "limit", value: String(limit))]
        )
    }

    public func getReels(seedReelId: String? = nil, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        var queryItems = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor { queryItems.append(URLQueryItem(name: "cursor", value: cursor)) }
        if let seedReelId { queryItems.append(URLQueryItem(name: "seed", value: seedReelId)) }
        return listed(try await api.request(PostsEndpoint.feedReels, queryItems: queryItems), on: .reels)
    }

    public func getBookmarks(cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        listed(try await api.paginatedRequest(PostsEndpoint.bookmarks, cursor: cursor, limit: limit), on: .bookmarks)
    }

    public func getPost(postId: String) async throws -> APIPost {
        let response: APIResponse<APIPost> = try await api.request(PostsEndpoint.byPostId(postId: postId))
        return response.data
    }

    // MARK: - View Tracking

    /// **La liste « vu par » d'une story ou d'un post — réservée à l'auteur.**
    ///
    /// La route sert l'enveloppe paginée ordinaire du dépôt : les spectateurs
    /// dans `data`, la pagination en SŒUR (`sendSuccess(reply, result.items,
    /// { pagination })`, `routes/posts/interactions.ts`). Le SDK en attendait
    /// un objet `{ items, pagination }` sous `data` — une forme qu'aucune route
    /// ne sert : chaque appel aurait échoué au décodage. Aucun appelant de
    /// production ne l'avait vu, faute d'appelant.
    public func getPostViews(
        postId: String, limit: Int = 50, offset: Int = 0
    ) async throws -> OffsetPaginatedAPIResponse<[APIPostViewer]> {
        try await api.request(
            PostsEndpoint.byPostIdViews(postId: postId),
            queryItems: [
                URLQueryItem(name: "limit", value: "\(limit)"),
                URLQueryItem(name: "offset", value: "\(offset)")
            ]
        )
    }

    // MARK: - Feed Variants

    public func getUserPosts(userId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        listed(try await api.paginatedRequest(PostsEndpoint.userByUserId(userId: userId), cursor: cursor, limit: limit), on: .profile)
    }

    public func getCommunityPosts(communityId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        listed(try await api.paginatedRequest(PostsEndpoint.communityByCommunityId(communityId: communityId), cursor: cursor, limit: limit), on: .community)
    }
}
