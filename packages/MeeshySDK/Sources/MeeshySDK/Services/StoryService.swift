import Foundation

// MARK: - Protocol

public protocol StoryServiceProviding: Sendable {
    /// R8/G1 — `updatedSince` non-nil = delta-sync (`?updatedSince=ISO8601`) :
    /// le gateway ne renvoie que les stories créées/modifiées depuis ce
    /// timestamp. `nil` = tray complet (comportement historique).
    func list(cursor: String?, limit: Int, updatedSince: Date?) async throws -> PaginatedAPIResponse<[APIPost]>
    func markViewed(storyId: String) async throws
    func delete(storyId: String) async throws
    func react(storyId: String, emoji: String) async throws
    func comment(storyId: String, content: String) async throws -> APIPostComment
    func repost(storyId: String) async throws
    func cachedPost(id: String) -> APIPost?
    func fetchPost(id: String) async throws -> APIPost
    /// Seed the in-memory by-id cache from outside (e.g. an NSE-prefetched story
    /// post drained on a cold-start notification tap), so `cachedPost(id:)` then
    /// resolves it without a network round-trip.
    func cache(post: APIPost)
}

public extension StoryServiceProviding {
    /// Compat : les call sites historiques (tray complet) restent binaires —
    /// seule l'exigence 3-params est à implémenter par les conformers.
    func list(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await list(cursor: cursor, limit: limit, updatedSince: nil)
    }
}

public final class StoryService: StoryServiceProviding, @unchecked Sendable {
    public static let shared = StoryService()
    private let api: APIClientProviding

    // In-memory cache used by notification deep-links and reposts that need a
    // post by id without re-listing the feed. Stories expire after 24h so a
    // single-session dictionary is sufficient — no cross-session persistence.
    // Borné (éviction FIFO via BoundedFIFOMap) et purgé au logout : sans ça
    // les payloads de l'utilisateur A restaient résidents pendant la session
    // de l'utilisateur B.
    private let cacheLock = NSLock()
    private var postCache = BoundedFIFOMap<String, APIPost>(capacity: 500)

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
                value: ISO8601DateFormatter().string(from: updatedSince)
            ))
        }
        let response: PaginatedAPIResponse<[APIPost]> = try await api.request(
            endpoint: "/posts/feed/stories", method: "GET", body: nil, queryItems: queryItems
        )
        cachePosts(response.data)
        return response
    }

    public func markViewed(storyId: String) async throws {
        // Le gateway renvoie `{ viewed: true }` — une valeur **Bool**. Décoder en
        // `[String: String]` faisait échouer le décodage à CHAQUE vue (Bool ≠
        // String) ; l'exception était avalée par le `catch` silencieux côté
        // ViewModel, masquant du même coup les vrais échecs réseau (la story
        // pouvait alors réapparaître non-vue au prochain `list()`). On décode
        // donc la forme réelle. (2026-06-01)
        let _: APIResponse<[String: Bool]> = try await api.request(endpoint: "/posts/\(storyId)/view", method: "POST")
    }

    public func delete(storyId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(storyId)")
    }

    public func react(storyId: String, emoji: String) async throws {
        // Auparavant l'emoji etait ignore — toutes les reactions iOS arrivaient au
        // gateway sans body, ce qui faisait defaulter `LikeSchema` sur ❤️. Resultat :
        // l'utilisateur tapait sur n'importe quel emoji de la palette, le serveur
        // enregistrait toujours un coeur. On envoie maintenant l'emoji explicite.
        let body = LikeRequest(emoji: emoji)
        let _: APIResponse<[String: String]> = try await api.post(endpoint: "/posts/\(storyId)/like", body: body)
    }

    public func comment(storyId: String, content: String) async throws -> APIPostComment {
        let body = CreateCommentRequest(content: content)
        let response: APIResponse<APIPostComment> = try await api.post(endpoint: "/posts/\(storyId)/comments", body: body)
        return response.data
    }

    public func repost(storyId: String) async throws {
        let body = RepostRequest()
        let _: APIResponse<[String: String]> = try await api.post(endpoint: "/posts/\(storyId)/repost", body: body)
    }

    // MARK: - Single-post cache & fetch

    public func cachedPost(id: String) -> APIPost? {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        return postCache[id]
    }

    public func fetchPost(id: String) async throws -> APIPost {
        let response: APIResponse<APIPost> = try await api.request(endpoint: "/posts/\(id)")
        cachePost(response.data)
        return response.data
    }

    public func cache(post: APIPost) {
        cachePost(post)
    }

    private func cachePost(_ post: APIPost) {
        cacheLock.lock()
        postCache[post.id] = post
        cacheLock.unlock()
    }

    private func cachePosts(_ posts: [APIPost]) {
        cacheLock.lock()
        for post in posts { postCache[post.id] = post }
        cacheLock.unlock()
    }

    /// Purge au logout (cascade `AuthManager.logout`) — isolation des données
    /// entre comptes sur le même device.
    public func reset() {
        cacheLock.lock()
        postCache.removeAll()
        cacheLock.unlock()
    }
}
