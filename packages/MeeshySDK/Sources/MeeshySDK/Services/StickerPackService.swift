import Foundation

/// **Les packs de stickers** (#9141 passerelle, #9190 iOS) — la boutique, les
/// packs installés, et l'installation.
///
/// Service bas niveau : il parle à la route, il ne décide de rien. Le cache,
/// la mise à jour optimiste et son retour en arrière vivent dans l'app
/// (`StickerPackStore`).
public protocol StickerPackServiceProviding: Sendable {
    /// La boutique : les packs intégrés puis les packs publiés, résumés, avec
    /// leur état d'installation.
    func catalogue() async throws -> [StickerPack]
    /// Les packs installés et leurs stickers — ce que la feuille montre.
    func installed() async throws -> [StickerPack]
    /// Installer (`PUT`) ou retirer (`DELETE`) un pack ; rend son résumé à jour.
    func setInstalled(_ installed: Bool, slug: String) async throws -> StickerPack
}

public final class StickerPackService: StickerPackServiceProviding, @unchecked Sendable {
    public static let shared = StickerPackService()
    private let api: APIClientProviding

    public init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func catalogue() async throws -> [StickerPack] {
        let response: APIResponse<[StickerPack]> = try await api.request(
            StickerPacksEndpoint.root, method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func installed() async throws -> [StickerPack] {
        let response: APIResponse<[StickerPack]> = try await api.request(
            StickerPacksEndpoint.installed, method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func setInstalled(_ installed: Bool, slug: String) async throws -> StickerPack {
        let response: APIResponse<StickerPack> = try await api.request(
            StickerPacksEndpoint.bySlugInstall(slug: slug),
            method: installed ? "PUT" : "DELETE", body: nil, queryItems: nil
        )
        return response.data
    }
}
