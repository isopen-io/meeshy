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

/// Les adresses d'un domaine ; l'achat n'existe que pour les domaines qui
/// peuvent porter un prix (§ 4.3).
public struct PackRoutes: Sendable {
    public let catalogue: any MeeshyEndpoint
    public let installed: any MeeshyEndpoint
    public let detail: @Sendable (String) -> any MeeshyEndpoint
    public let install: @Sendable (String) -> any MeeshyEndpoint
    public let purchase: (@Sendable (String) -> any MeeshyEndpoint)?

    /// `nil` pour `unknown` : un domaine que ce client ne connaît pas ne route rien.
    public static func of(_ domain: PackDomain) -> PackRoutes? {
        switch domain {
        case .sticker:
            PackRoutes(catalogue: StickerPacksEndpoint.root, installed: StickerPacksEndpoint.installed,
                       detail: { StickerPacksEndpoint.bySlug(slug: $0) },
                       install: { StickerPacksEndpoint.bySlugInstall(slug: $0) }, purchase: nil)
        case .gloryFrame:
            PackRoutes(catalogue: PacksEndpoint.gloryFrame, installed: PacksEndpoint.gloryFrameInstalled,
                       detail: { PacksEndpoint.gloryFrameBySlug(slug: $0) },
                       install: { PacksEndpoint.gloryFrameBySlugInstall(slug: $0) }, purchase: nil)
        case .wallpaper:
            PackRoutes(catalogue: PacksEndpoint.wallpaper, installed: PacksEndpoint.wallpaperInstalled,
                       detail: { PacksEndpoint.wallpaperBySlug(slug: $0) },
                       install: { PacksEndpoint.wallpaperBySlugInstall(slug: $0) },
                       purchase: { PacksEndpoint.wallpaperBySlugPurchase(slug: $0) })
        case .avatarRing:
            PackRoutes(catalogue: PacksEndpoint.avatarRing, installed: PacksEndpoint.avatarRingInstalled,
                       detail: { PacksEndpoint.avatarRingBySlug(slug: $0) },
                       install: { PacksEndpoint.avatarRingBySlugInstall(slug: $0) },
                       purchase: { PacksEndpoint.avatarRingBySlugPurchase(slug: $0) })
        case .banner:
            PackRoutes(catalogue: PacksEndpoint.banner, installed: PacksEndpoint.bannerInstalled,
                       detail: { PacksEndpoint.bannerBySlug(slug: $0) },
                       install: { PacksEndpoint.bannerBySlugInstall(slug: $0) },
                       purchase: { PacksEndpoint.bannerBySlugPurchase(slug: $0) })
        case .bannerFrame:
            PackRoutes(catalogue: PacksEndpoint.bannerFrame, installed: PacksEndpoint.bannerFrameInstalled,
                       detail: { PacksEndpoint.bannerFrameBySlug(slug: $0) },
                       install: { PacksEndpoint.bannerFrameBySlugInstall(slug: $0) },
                       purchase: { PacksEndpoint.bannerFrameBySlugPurchase(slug: $0) })
        case .unknown:
            nil
        }
    }
}

/// **Un achat refusé dit POURQUOI** : le contrat de `POST …/:slug/purchase`
/// documente quatre codes 409 (`INSUFFICIENT_MEESHES`, `PACK_ALREADY_OWNED`,
/// `PACK_IS_FREE`, `REQUEST_ID_CONFLICT`). Sans cette déclaration le transport
/// ne rend qu'une phrase (`MeeshyError.server(409, _)`) et la vitrine ne peut
/// jamais dire « il te manque des Meeshes ». Écrit ici, à la main :
/// `PacksEndpoint` est généré. Les lectures restent opaques — le repli d'un
/// ancien serveur lit leur 404.
public extension PacksEndpoint {
    var rejectionPolicy: MeeshyEndpointRejectionPolicy {
        switch self {
        case .wallpaperBySlugPurchase, .avatarRingBySlugPurchase, .bannerBySlugPurchase, .bannerFrameBySlugPurchase:
            return .structured
        default:
            return .opaque
        }
    }
}

public enum PackServiceError: Error, Equatable, Sendable {
    /// Le domaine n'est pas routable par ce client (`unknown`).
    case unroutableDomain
    /// Aucun prix possible dans ce domaine : pas d'adresse d'achat.
    case notPurchasable
}

/// **Le service d'un domaine** — le même code pour les stickers et les cadres.
public final class PackService<Pack: InstallablePack>: PackServiceProviding, @unchecked Sendable {
    public let domain: PackDomain
    private let api: APIClientProviding
    private let routes: PackRoutes?

    public init(domain: PackDomain, api: APIClientProviding = APIClient.shared) {
        self.domain = domain
        self.api = api
        self.routes = PackRoutes.of(domain)
    }

    public func catalogue() async throws -> [Pack] {
        try await list(try routable().catalogue)
    }

    public func installed() async throws -> [Pack] {
        try await list(try routable().installed)
    }

    public func detail(slug: String) async throws -> Pack {
        let response: APIResponse<Pack> = try await api.request(
            try routable().detail(slug), method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func setInstalled(_ installed: Bool, slug: String) async throws -> Pack {
        let response: APIResponse<Pack> = try await api.request(
            try routable().install(slug), method: installed ? "PUT" : "DELETE", body: nil, queryItems: nil
        )
        return response.data
    }

    /// **Acheter un pack** (`POST /packs/<domaine>/:slug/purchase`) : le
    /// `requestId` est généré par l'appelant AU GESTE et réutilisé pour tout
    /// nouvel essai du même geste — le serveur ne débite qu'une fois. Le client
    /// n'envoie jamais de prix.
    public func purchase(slug: String, requestId: String) async throws -> PackPurchaseResponse {
        guard let endpoint = try routable().purchase?(slug) else { throw PackServiceError.notPurchasable }
        let response: APIResponse<PackPurchaseResponse> = try await api.post(
            endpoint, body: PackPurchaseRequest(requestId: requestId)
        )
        return response.data
    }

    private func routable() throws -> PackRoutes {
        guard let routes else { throw PackServiceError.unroutableDomain }
        return routes
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
