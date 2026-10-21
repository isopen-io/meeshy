import Foundation

// MARK: - Protocol

public protocol StoryServiceProviding: Sendable {
    /// R8/G1 — `updatedSince` non-nil = delta-sync (`?updatedSince=ISO8601`) :
    /// le gateway ne renvoie que les stories créées/modifiées depuis ce
    /// timestamp. `nil` = tray complet (comportement historique).
    func list(cursor: String?, limit: Int, updatedSince: Date?) async throws -> PaginatedAPIResponse<[APIPost]>
    func delete(storyId: String) async throws
    /// #11151 — le retrait de la story d'un AUTRE porte son motif.
    func delete(storyId: String, reason: String?) async throws
    func react(storyId: String, emoji: String) async throws
    func repost(storyId: String) async throws
    func cachedPost(id: String) -> APIPost?
    func fetchPost(id: String) async throws -> APIPost
    /// Seed the in-memory by-id cache from outside (e.g. an NSE-prefetched story
    /// post drained on a cold-start notification tap), so `cachedPost(id:)` then
    /// resolves it without a network round-trip.
    func cache(post: APIPost)
    /// Évince des posts du cache by-id.
    ///
    /// Miroir de `cache(post:)` : quand une story disparaît (supprimée,
    /// périmée), la laisser dans ce cache la ferait ressusciter au premier
    /// deep-link — `cachedPost(id:)` la resservirait AVANT le `fetchPost` qui,
    /// lui, aurait dit 404.
    func invalidate(postIds: Set<String>)
    /// Archive COMPLÈTE des stories de l'appelant (en cours ET passées),
    /// paginée keyset — les stories ne sont plus jamais détruites côté serveur.
    func listMine(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    /// Republie une story de l'appelant : la MÊME story repart avec une date
    /// de publication fraîche (createdAt/expiresAt) et un engagement remis à
    /// zéro. Retourne la story rechargée.
    func republish(storyId: String) async throws -> APIPost
}

public extension StoryServiceProviding {
    func delete(storyId: String, reason: String?) async throws {
        guard reason == nil else { throw APIError.serverError(501, "delete(reason:) not implemented by \(Self.self)") }
        try await delete(storyId: storyId)
    }

    /// Compat : les call sites historiques (tray complet) restent binaires —
    /// seule l'exigence 3-params est à implémenter par les conformers.
    func list(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await list(cursor: cursor, limit: limit, updatedSince: nil)
    }
}

public final class StoryService: StoryServiceProviding, Sendable {
    public static let shared = StoryService()
    private let api: APIClientProviding

    // In-memory cache used by notification deep-links and reposts that need a
    // post by id without re-listing the feed. Stories expire after 24h so a
    // single-session dictionary is sufficient — no cross-session persistence.
    // Borné (éviction FIFO via BoundedFIFOMap) et purgé au logout : sans ça
    // les payloads de l'utilisateur A restaient résidents pendant la session
    // de l'utilisateur B.
    private let postCache = Locked(BoundedFIFOMap<String, APIPost>(capacity: 500))

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func list(cursor: String? = nil, limit: Int = 50, updatedSince: Date? = nil) async throws -> PaginatedAPIResponse<[APIPost]> {
        var queryItems = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        if let updatedSince {
            queryItems.append(URLQueryItem(
                name: "updatedSince",
                value: WireDate.string(from: updatedSince)
            ))
        }
        let response: PaginatedAPIResponse<[APIPost]> = try await api.request(
            PostsEndpoint.feedStories, method: "GET", body: nil, queryItems: queryItems
        )
        cachePosts(response.data)
        return response
    }

    public func delete(storyId: String) async throws {
        try await delete(storyId: storyId, reason: nil)
    }

    public func delete(storyId: String, reason: String?) async throws {
        try await api.deleteRemovingContent(PostsEndpoint.byPostId(postId: storyId), reason: reason)
    }

    public func react(storyId: String, emoji: String) async throws {
        // Auparavant l'emoji etait ignore — toutes les reactions iOS arrivaient au
        // gateway sans body, ce qui faisait defaulter `LikeSchema` sur ❤️. Resultat :
        // l'utilisateur tapait sur n'importe quel emoji de la palette, le serveur
        // enregistrait toujours un coeur. On envoie maintenant l'emoji explicite.
        let body = LikeRequest(emoji: emoji)
        let _: APIResponse<[String: String]> = try await api.post(PostsEndpoint.byPostIdLike(postId: storyId), body: body)
    }

    /// Interne au module : un commentaire se crée par `CommentPublisher` (#9743).
    func comment(storyId: String, content: String) async throws -> APIPostComment {
        let body = CreateCommentRequest(content: content)
        let response: APIResponse<APIPostComment> = try await api.post(PostsEndpoint.byPostIdComments(postId: storyId), body: body)
        return response.data
    }

    public func repost(storyId: String) async throws {
        let body = RepostRequest()
        let _: APIResponse<[String: String]> = try await api.post(PostsEndpoint.byPostIdRepost(postId: storyId), body: body)
    }

    public func listMine(cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        var queryItems = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        let response: PaginatedAPIResponse<[APIPost]> = try await api.request(
            PostsEndpoint.storiesMine, method: "GET", body: nil, queryItems: queryItems
        )
        cachePosts(response.data)
        return response
    }

    public func republish(storyId: String) async throws -> APIPost {
        let response: APIResponse<APIPost> = try await api.request(
            PostsEndpoint.byPostIdRepublish(postId: storyId), method: "POST"
        )
        cachePosts([response.data])
        return response.data
    }

    // MARK: - Single-post cache & fetch

    public func cachedPost(id: String) -> APIPost? {
        postCache.read { $0[id] }
    }

    public func fetchPost(id: String) async throws -> APIPost {
        let response: APIResponse<APIPost> = try await api.request(PostsEndpoint.byPostId(postId: id))
        cachePost(response.data)
        return response.data
    }

    public func cache(post: APIPost) {
        cachePost(post)
    }

    public func invalidate(postIds: Set<String>) {
        guard !postIds.isEmpty else { return }
        postCache.mutate { cache in
            for id in postIds { cache.removeValue(forKey: id) }
        }
    }

    private func cachePost(_ post: APIPost) {
        postCache.mutate { $0[post.id] = post }
    }

    private func cachePosts(_ posts: [APIPost]) {
        postCache.mutate { cache in
            for post in posts { cache[post.id] = post }
        }
    }

    /// Purge au logout (cascade `AuthManager.logout`) — isolation des données
    /// entre comptes sur le même device.
    public func reset() {
        postCache.mutate { $0.removeAll() }
    }
}
