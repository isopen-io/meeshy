import Foundation

/// **Les packs de stickers** (#9141 passerelle, #9190 iOS) — la PROJECTION
/// sticker de `PackServiceProviding` (#10150) : la boutique, les packs
/// installés, et l'installation, sur `/sticker-packs`, inchangé à l'octet.
///
/// Service bas niveau : il parle à la route, il ne décide de rien. Le cache,
/// la mise à jour optimiste et son retour en arrière vivent dans l'app
/// (`PackStore`, dont `StickerPackStore` est la façade sticker).
public protocol StickerPackServiceProviding: PackServiceProviding where Pack == StickerPack {}

extension StickerPackServiceProviding {
    public var domain: PackDomain { .sticker }

    /// Un double qui ne sert que la boutique et l'étagère lit le détail dans
    /// les packs installés.
    public func detail(slug: String) async throws -> StickerPack {
        guard let pack = try await installed().first(where: { $0.slug == slug }) else {
            throw URLError(.fileDoesNotExist)
        }
        return pack
    }
}

public final class StickerPackService: StickerPackServiceProviding, Sendable {
    public static let shared = StickerPackService()
    private let packs: PackService<StickerPack>

    public init(api: APIClientProviding = APIClient.shared) {
        self.packs = PackService(domain: .sticker, api: api)
    }

    public func catalogue() async throws -> [StickerPack] {
        try await packs.catalogue()
    }

    public func installed() async throws -> [StickerPack] {
        try await packs.installed()
    }

    public func detail(slug: String) async throws -> StickerPack {
        try await packs.detail(slug: slug)
    }

    public func setInstalled(_ installed: Bool, slug: String) async throws -> StickerPack {
        try await packs.setInstalled(installed, slug: slug)
    }
}
