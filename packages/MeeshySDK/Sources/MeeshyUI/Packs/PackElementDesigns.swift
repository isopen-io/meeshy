import Foundation
import MeeshySDK

// MARK: - Ce que contient un pack, élément par élément (#16268)

/// Le dessin d'un élément de pack, dans le domaine qui le peint.
public enum PackElementArt: Hashable, Sendable {
    case avatarRing(AvatarRingDesign)
    case banner(AppearanceDesign)
    case bannerFrame(BannerFrameDesign)
    case wallpaper(AppearanceDesign)
    case sticker(MeeSticker)
}

/// **Un élément d'un pack**, tel que la fiche et le plein écran le montrent.
public struct PackElement: Identifiable, Hashable, Sendable {
    public let pack: String
    public let item: String
    public let name: String
    public let art: PackElementArt

    public init(pack: String, item: String, name: String, art: PackElementArt) {
        self.pack = pack
        self.item = item
        self.name = name
        self.art = art
    }

    public var id: String { pack + "/" + item }
    public var ref: ProfileDecorRef { ProfileDecorRef(pack: pack, item: item) }

    /// Le côté du profil que l'élément équipe ; `nil` pour ce qui ne s'équipe pas sur le profil
    /// (un fond se choisit par conversation, un sticker s'envoie).
    public var equipSide: ProfileDecorSide? {
        switch art {
        case .avatarRing: .avatarRing
        case .banner: .banner
        case .bannerFrame: .bannerFrame
        case .wallpaper, .sticker: nil
        }
    }
}

/// Ce que l'appareil sait peindre d'un pack : ses éléments, ou rien tant qu'il n'est pas téléchargé.
public enum PackElementsResolution: Hashable, Sendable {
    case ready([PackElement])
    case downloadRequired
}

/// **Résout le design des éléments d'un pack.** Aujourd'hui l'embarqué ; demain aussi le contrat servi
/// d'un pack téléchargé (#16264) — la vitrine ne change pas, seul le fournisseur s'enrichit.
public protocol PackElementDesignProviding {
    func elements(domain: PackDomain, pack: String, language: String) -> PackElementsResolution
}

/// Les éléments que l'app porte déjà : les catalogues embarqués et les films de Mee et Meo.
public struct EmbeddedPackElementDesigns: PackElementDesignProviding {
    private let appearance: AppearanceCatalog
    private let rings: AvatarRingCatalog
    private let frames: BannerFrameCatalog

    public init(appearance: AppearanceCatalog = .shared, rings: AvatarRingCatalog = .shared,
                frames: BannerFrameCatalog = .shared) {
        self.appearance = appearance
        self.rings = rings
        self.frames = frames
    }

    public func elements(domain: PackDomain, pack: String, language: String) -> PackElementsResolution {
        let elements = embedded(domain: domain, pack: pack, language: language)
        guard let elements, !elements.isEmpty else { return .downloadRequired }
        return .ready(elements)
    }

    private func embedded(domain: PackDomain, pack: String, language: String) -> [PackElement]? {
        switch domain {
        case .wallpaper:
            appearance.wallpaperPacks.first { $0.slug == pack }?.designs.map {
                PackElement(pack: pack, item: $0.key, name: appearance.designName($0.key, language: language) ?? $0.key,
                            art: .wallpaper($0))
            }
        case .banner:
            appearance.bannerPacks.first { $0.slug == pack }?.designs.map {
                PackElement(pack: pack, item: $0.key, name: appearance.designName($0.key, language: language) ?? $0.key,
                            art: .banner($0))
            }
        case .avatarRing:
            rings.packs.first { $0.slug == pack }?.rings.map {
                PackElement(pack: pack, item: $0.key, name: rings.ringName($0.key, language: language) ?? $0.key,
                            art: .avatarRing($0))
            }
        case .bannerFrame:
            frames.framePacks.first { $0.slug == pack }?.frames.map {
                PackElement(pack: pack, item: $0.key, name: frames.frameName($0.key, language: language) ?? $0.key,
                            art: .bannerFrame($0))
            }
        case .sticker:
            MeeStickerCatalog.cast(forPackSlug: pack).map { cast in
                MeeStickerCatalog.stickers(of: cast).map {
                    PackElement(pack: pack, item: $0.id, name: $0.title, art: .sticker($0))
                }
            }
        case .gloryFrame, .unknown:
            nil
        }
    }
}
