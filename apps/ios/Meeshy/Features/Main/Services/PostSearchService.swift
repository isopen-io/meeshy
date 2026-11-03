import Foundation
import MeeshySDK

// MARK: - Recherche des POSTS, RÉELS et STORIES (#14620)

/// Un contenu trouvé par la recherche globale : son genre dit comment l'ouvrir
/// (détail d'un post, lecteur de réels, lecteur de story) et son texte est
/// celui que le Prisme du lecteur sert.
nonisolated struct GlobalSearchPostResult: Identifiable, Sendable {
    let id: String
    let kind: PostType
    let authorName: String
    let authorAvatar: String?
    let text: String
    let thumbnailURL: String?
    let createdAt: Date
    let post: FeedPost
}

protocol PostSearchProviding: Sendable {
    func searchPosts(query: String, reader: MeeshyUser?) async -> GlobalSearchLeg<GlobalSearchPostResult>
}

/// `GET /api/v1/posts/search` : la passerelle applique la loi de visibilité du
/// fil (public, communauté, amis, cercles, nommés, auteurs bloqués exclus) et
/// retire ce qui a expiré ; le client ne fait que résoudre le texte.
nonisolated struct PostSearchService: PostSearchProviding {
    static let searchedKinds: [PostType] = [.post, .reel, .story]

    private let api: APIClientProviding

    init(api: APIClientProviding) {
        self.api = api
    }

    func searchPosts(query: String, reader: MeeshyUser?) async -> GlobalSearchLeg<GlobalSearchPostResult> {
        do {
            let page: PaginatedAPIResponse<[APIPost]> = try await api.request(
                PostsEndpoint.search,
                queryItems: [
                    URLQueryItem(name: "q", value: query),
                    URLQueryItem(name: "types", value: Self.searchedKinds.map(\.rawValue).joined(separator: ",")),
                    URLQueryItem(name: "limit", value: "30"),
                ]
            )
            let preferred = ReaderPrism.resolve(for: reader)
            return .served(page.data.compactMap { Self.result(from: $0, preferredLanguages: preferred) })
        } catch {
            return .failed(String(localized: "common.error.generic"))
        }
    }

    /// Un genre que la recherche ne cherche pas (une humeur) ne s'affiche pas,
    /// même si un serveur le rendait.
    static func result(from post: APIPost, preferredLanguages: [String]) -> GlobalSearchPostResult? {
        guard let kind = PostType(rawValue: (post.type ?? PostType.post.rawValue).uppercased()),
              searchedKinds.contains(kind) else { return nil }
        let feedPost = post.toFeedPost(preferredLanguages: preferredLanguages)
        let media = feedPost.media.first
        return GlobalSearchPostResult(
            id: post.id,
            kind: kind,
            authorName: feedPost.author,
            authorAvatar: feedPost.authorAvatarURL,
            text: feedPost.displayContent,
            thumbnailURL: media?.thumbnailUrl ?? (media?.type == .image ? media?.url : nil),
            createdAt: post.createdAt,
            post: feedPost
        )
    }
}
