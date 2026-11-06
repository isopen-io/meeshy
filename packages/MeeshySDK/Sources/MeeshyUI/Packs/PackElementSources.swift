import Foundation
import MeeshySDK

// MARK: - Ce que la vitrine montre d'un pack téléchargé (#16268)

/// **Les éléments d'un pack, d'où qu'ils viennent** : l'embarqué d'abord, puis le contrat servi
/// d'un pack d'apparence téléchargé (#16264), puis le détail d'un pack de stickers de tiers.
/// La lecture reste sur l'appareil ; `prepare` fait venir le contrat ou le détail, une fois.
@MainActor
public final class ServedPackElementDesigns: PackElementDesignProviding {
    public typealias StickerDetail = @Sendable (String) async throws -> StickerPack

    private let embedded: EmbeddedPackElementDesigns
    private let served: any ServedAppearanceProviding
    private let stickerDetail: StickerDetail
    private let appearance: AppearanceCatalog
    private let rings: AvatarRingCatalog
    private let frames: BannerFrameCatalog
    private var stickerPacks: [String: StickerPack] = [:]

    public init(embedded: EmbeddedPackElementDesigns = EmbeddedPackElementDesigns(),
                served: any ServedAppearanceProviding = ServedAppearanceStore.shared,
                stickerDetail: @escaping StickerDetail = { try await StickerPackService.shared.detail(slug: $0) },
                appearance: AppearanceCatalog = .shared, rings: AvatarRingCatalog = .shared,
                frames: BannerFrameCatalog = .shared) {
        self.embedded = embedded
        self.served = served
        self.stickerDetail = stickerDetail
        self.appearance = appearance
        self.rings = rings
        self.frames = frames
    }

    nonisolated deinit {}

    public func elements(domain: PackDomain, pack: String, language: String) -> PackElementsResolution {
        let local = embedded.elements(domain: domain, pack: pack, language: language)
        if case .ready = local { return local }
        let elements = downloaded(domain: domain, pack: pack, language: language)
        return elements.isEmpty ? .downloadRequired : .ready(elements)
    }

    public func prepare(domain: PackDomain, pack: String) async {
        guard case .downloadRequired = elements(domain: domain, pack: pack, language: "fr") else { return }
        switch domain {
        case .wallpaper, .banner, .avatarRing, .bannerFrame:
            await served.prepare(domain: domain, slug: pack)
        case .sticker:
            guard let detail = try? await stickerDetail(pack) else { return }
            seed(stickerPacks: [detail])
        case .gloryFrame, .unknown:
            return
        }
    }

    public func seed(stickerPacks packs: [StickerPack]) {
        for pack in packs where !pack.items.isEmpty {
            stickerPacks[pack.slug] = pack
        }
    }

    private func downloaded(domain: PackDomain, pack: String, language: String) -> [PackElement] {
        switch domain {
        case .wallpaper:
            appearanceElements(served.contract(domain: .wallpaper, slug: pack), pack: pack, language: language, art: PackElementArt.wallpaper)
        case .banner:
            appearanceElements(served.contract(domain: .banner, slug: pack), pack: pack, language: language, art: PackElementArt.banner)
        case .avatarRing:
            (served.contract(domain: .avatarRing, slug: pack)?.rings ?? []).map {
                PackElement(pack: pack, item: $0.key, name: rings.ringName($0.key, language: language) ?? $0.key,
                            art: .avatarRing($0))
            }
        case .bannerFrame:
            (served.contract(domain: .bannerFrame, slug: pack)?.frames ?? []).map {
                PackElement(pack: pack, item: $0.key, name: frames.frameName($0.key, language: language) ?? $0.key,
                            art: .bannerFrame($0))
            }
        case .sticker:
            (stickerPacks[pack]?.items ?? []).map {
                PackElement(pack: pack, item: $0.key, name: $0.title.isEmpty ? $0.key : $0.title, art: .stickerImage($0))
            }
        case .gloryFrame, .unknown:
            []
        }
    }

    private func appearanceElements(_ contract: ServedAppearanceContract?, pack: String, language: String,
                                    art: (AppearanceDesign) -> PackElementArt) -> [PackElement] {
        (contract?.appearanceDesigns ?? []).map {
            PackElement(pack: pack, item: $0.key, name: appearance.designName($0.key, language: language) ?? $0.key, art: art($0))
        }
    }
}
