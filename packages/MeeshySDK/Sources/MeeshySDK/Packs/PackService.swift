import Foundation

// MARK: - Les packs, un service par domaine (#10148 LP0, #10150 LP2)

/// **La boutique, les packs installés, le détail d'un pack et l'installation,
/// pour UN domaine** — `/sticker-packs` pour les stickers (contrat inchangé à
/// l'octet), `/packs/glory-frame` pour les cadres de gloire.
///
/// Service bas niveau : il parle à la route, il ne décide de rien. Le cache,
/// la mise à jour optimiste et son retour en arrière vivent dans l'app
/// (`PackStore`). Chaque liste se décode PAR ITEM : un pack illisible tombe
/// seul, la boutique reste.
public protocol PackServiceProviding<Pack>: Sendable {
    associatedtype Pack: InstallablePack
    var domain: PackDomain { get }
    func catalogue() async throws -> [Pack]
    func installed() async throws -> [Pack]
    func detail(slug: String) async throws -> Pack
    /// Installer (`PUT`) ou retirer (`DELETE`) un pack ; rend son résumé à jour.
    func setInstalled(_ installed: Bool, slug: String) async throws -> Pack
}

/// Les quatre adresses d'un domaine.
public struct PackRoutes: Sendable {
    public let catalogue: any MeeshyEndpoint
    public let installed: any MeeshyEndpoint
    public let detail: @Sendable (String) -> any MeeshyEndpoint
    public let install: @Sendable (String) -> any MeeshyEndpoint

    public static func of(_ domain: PackDomain) -> PackRoutes {
        switch domain {
        case .sticker:
            PackRoutes(catalogue: StickerPacksEndpoint.root, installed: StickerPacksEndpoint.installed,
                       detail: { StickerPacksEndpoint.bySlug(slug: $0) },
                       install: { StickerPacksEndpoint.bySlugInstall(slug: $0) })
        case .gloryFrame:
            PackRoutes(catalogue: PacksEndpoint.gloryFrame, installed: PacksEndpoint.gloryFrameInstalled,
                       detail: { PacksEndpoint.gloryFrameBySlug(slug: $0) },
                       install: { PacksEndpoint.gloryFrameBySlugInstall(slug: $0) })
        }
    }
}

/// **Le service d'un domaine** — le même code pour les stickers et les cadres.
public final class PackService<Pack: InstallablePack>: PackServiceProviding, @unchecked Sendable {
    public let domain: PackDomain
    private let api: APIClientProviding
    private let routes: PackRoutes

    public init(domain: PackDomain, api: APIClientProviding = APIClient.shared) {
        self.domain = domain
        self.api = api
        self.routes = PackRoutes.of(domain)
    }

    public func catalogue() async throws -> [Pack] {
        try await list(routes.catalogue)
    }

    public func installed() async throws -> [Pack] {
        try await list(routes.installed)
    }

    public func detail(slug: String) async throws -> Pack {
        let response: APIResponse<Pack> = try await api.request(
            routes.detail(slug), method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func setInstalled(_ installed: Bool, slug: String) async throws -> Pack {
        let response: APIResponse<Pack> = try await api.request(
            routes.install(slug), method: installed ? "PUT" : "DELETE", body: nil, queryItems: nil
        )
        return response.data
    }

    private func list(_ endpoint: any MeeshyEndpoint) async throws -> [Pack] {
        let response: APIResponse<LossyDecodableArray<Pack>> = try await api.request(
            endpoint, method: "GET", body: nil, queryItems: nil
        )
        return response.data.elements
    }
}

/// Les cadres de gloire : la boutique de `/packs/glory-frame`.
public enum FramePackService {
    public static let shared = PackService<FramePack>(domain: .gloryFrame)
}

extension StickerPack: InstallablePack {
    /// Mee, Meo et leurs duos sont dessinés par le client.
    public var isBundled: Bool { isBuiltin || BuiltinStickerPack(slug: slug) != nil }
}
