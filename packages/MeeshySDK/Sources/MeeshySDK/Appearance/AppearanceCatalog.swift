import Foundation

// MARK: - Le catalogue embarqué (#10631, spec § 8.2)
//
// `Resources/appearance-catalog.json` est une copie OCTET POUR OCTET de la
// source partagée (`packages/shared/scripts/sync-appearance-catalog-ios.ts`,
// témoin vitest `appearance-catalog-ios-copy.test.ts`). Les modèles `builtin`
// sont donc disponibles sans réseau : le premier rendu du fil a déjà son fond.

public struct AppearanceCatalog: Sendable {
    public let gamut: AppearanceGamut
    public let wallpaperPacks: [AppearanceDesignPack]
    public let bannerPacks: [AppearanceDesignPack]
    private let strings: [String: AppearanceCatalogStrings]

    public static let empty = AppearanceCatalog(gamut: AppearanceGamut(entries: []), wallpaperPacks: [], bannerPacks: [], strings: [:])

    /// Le catalogue de la copie embarquée (`AppearanceCatalogData`, GÉNÉRÉ depuis la source partagée) ;
    /// vide (jamais un plantage) s'il est illisible.
    public static let shared: AppearanceCatalog = (try? AppearanceCatalog.decode(Data(AppearanceCatalogData.json.utf8))) ?? .empty

    static func decode(_ data: Data) throws -> AppearanceCatalog {
        let raw = try JSONDecoder().decode(Raw.self, from: data)
        return AppearanceCatalog(
            gamut: AppearanceGamut(entries: raw.gamut),
            wallpaperPacks: raw.wallpapers.sorted { $0.order < $1.order },
            bannerPacks: raw.banners.sorted { $0.order < $1.order },
            strings: raw.strings
        )
    }

    private init(gamut: AppearanceGamut, wallpaperPacks: [AppearanceDesignPack], bannerPacks: [AppearanceDesignPack], strings: [String: AppearanceCatalogStrings]) {
        self.gamut = gamut
        self.wallpaperPacks = wallpaperPacks
        self.bannerPacks = bannerPacks
        self.strings = strings
    }

    private struct Raw: Decodable {
        let gamut: [AppearanceGamutEntry]
        let wallpapers: [AppearanceDesignPack]
        let banners: [AppearanceDesignPack]
        let strings: [String: AppearanceCatalogStrings]
    }

    // MARK: Recherche

    /// Un modèle de fond par (pack, clé) ; `nil` pour un modèle inconnu (⇒ Signature).
    public func wallpaper(pack: String, design: String) -> AppearanceDesign? {
        wallpaperPacks.first { $0.slug == pack }?.designs.first { $0.key == design }
    }

    /// Les modèles à présenter d'emblée : packs installés par défaut.
    public var defaultWallpapers: [(pack: AppearanceDesignPack, design: AppearanceDesign)] {
        wallpaperPacks.filter(\.installedByDefault).flatMap { pack in pack.designs.map { (pack: pack, design: $0) } }
    }

    // MARK: Noms (7 langues)

    public func designName(_ key: String, language: String) -> String? {
        localized(language) { $0.designs[key] }
    }

    public func packName(_ slug: String, language: String) -> String? {
        localized(language) { $0.packs[slug]?.name }
    }

    public func gamutName(_ key: String, language: String) -> String? {
        localized(language) { $0.gamut[key] }
    }

    /// Langue demandée, puis français (la source), puis rien.
    private func localized(_ language: String, _ pick: (AppearanceCatalogStrings) -> String?) -> String? {
        let code = String(language.prefix(2)).lowercased()
        return strings[code].flatMap(pick) ?? strings["fr"].flatMap(pick)
    }
}

struct AppearanceCatalogStrings: Decodable, Sendable {
    struct PackText: Decodable, Sendable {
        let name: String
    }

    let packs: [String: PackText]
    let designs: [String: String]
    let gamut: [String: String]

    private enum CodingKeys: String, CodingKey {
        case packs, designs, gamut
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        packs = try c.decodeIfPresent([String: PackText].self, forKey: .packs) ?? [:]
        designs = try c.decodeIfPresent([String: String].self, forKey: .designs) ?? [:]
        gamut = try c.decodeIfPresent([String: String].self, forKey: .gamut) ?? [:]
    }
}
