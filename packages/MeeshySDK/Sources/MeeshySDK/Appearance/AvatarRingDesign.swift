import Foundation

// MARK: - AvatarRingDesign (#10632, spec §§ 5.2, 6)
//
// MIROIR de `packages/shared/types/avatar-ring-design.ts` : un contour d'avatar.
// Il se voit des AUTRES, donc ses couleurs sont FIXES (aucun rôle `accent`).
// Les traits d'ornement désignent leur couleur par l'INDEX dans `stroke.colors` (1 à 8,
// #10936) ; `none` ne trace aucun trait de base : l'ornement dessine tout.
// Ce sont des DONNÉES (hex, chemins, nombres) : rien de reçu n'est interprété.
// Dégradés et mouvements déclarés (#10932, `FrameDecor.swift`) : FACULTATIFS et
// tolérants — un contour de l'ancien format se lit sans eux, un mouvement inconnu
// est ignoré.

public enum RingStrokeStyle: String, Codable, Sendable, Hashable {
    case solid
    case double
    case dotted
    case dashed
    case gradient
    /// Aucun trait de base : l'ornement dessine tout (#10936).
    case none
}

public struct AvatarRingStroke: Codable, Hashable, Sendable {
    public let style: RingStrokeStyle
    /// Fraction du diamètre.
    public let width: Double
    public let colors: [String]

    /// `#RGB`, `#RRGGBB` ou `#RRGGBBAA`, dièse facultatif — rien d'autre ne se dessine.
    public static func isWellFormedHex(_ value: String) -> Bool {
        let digits = value.hasPrefix("#") ? value.dropFirst() : Substring(value)
        return [3, 6, 8].contains(digits.count) && digits.allSatisfy(\.isHexDigit)
    }
}

public struct AvatarRingOrnamentPath: Codable, Hashable, Sendable {
    public let d: String
    /// Index dans `AvatarRingStroke.colors`.
    public let color: Int
    public let opacity: Double
    public let width: Double?
    /// Index dans `AvatarRingDesign.gradients` ; `color` reste le repli.
    public let gradient: Int?
    /// Le groupe que les mouvements désignent.
    public let group: String?

    public init(d: String, color: Int, opacity: Double, width: Double? = nil, gradient: Int? = nil, group: String? = nil) {
        self.d = d
        self.color = color
        self.opacity = opacity
        self.width = width
        self.gradient = gradient
        self.group = group
    }
}

public struct AvatarRingDesign: Codable, Hashable, Sendable, Identifiable {
    /// Le rayon du cercle de l'avatar dans le viewBox 0 0 100 100.
    public static let avatarRadius: Double = 42
    /// La palette d'un contour : huit couleurs au plus, comme un cadre de bannière (#10936, `RING_MAX_COLORS`).
    public static let maxColors = 8

    public let key: String
    public let stroke: AvatarRingStroke
    public let ornament: [AvatarRingOrnamentPath]
    /// Couche animée facultative (D6, #10638), jouée au-dessus du contour ; illisible ⇒ ignorée.
    public let lottie: PackAssetRef?
    /// Les dégradés que les traits désignent par index ; un dégradé illisible garde sa place (`nil`).
    public let gradients: [FrameGradient?]
    /// Les mouvements déclarés (#10932) ; un mouvement inconnu ou hors bornes est ignoré.
    public let motion: [FrameMotion]

    public var id: String { key }

    private enum CodingKeys: String, CodingKey { case key, stroke, ornament, lottie, gradients, motion }
    private enum OrnamentKeys: String, CodingKey { case paths }

    public init(key: String, stroke: AvatarRingStroke, ornament: [AvatarRingOrnamentPath] = [], lottie: PackAssetRef? = nil,
                gradients: [FrameGradient?] = [], motion: [FrameMotion] = []) {
        self.key = key
        self.stroke = stroke
        self.ornament = ornament
        self.lottie = lottie
        self.gradients = gradients
        self.motion = motion
    }

    /// Fail-closed : un contour sans couleur, ou dont un trait désigne une couleur absente, ne se lit pas.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        stroke = try c.decode(AvatarRingStroke.self, forKey: .stroke)
        guard (1...Self.maxColors).contains(stroke.colors.count) else {
            throw DecodingError.dataCorruptedError(forKey: .stroke, in: c, debugDescription: "un contour porte de 1 à 8 couleurs")
        }
        // Données d'un pack, parfois d'un vendeur tiers : une couleur illisible ferait planter le dessin.
        guard stroke.colors.allSatisfy(AvatarRingStroke.isWellFormedHex) else {
            throw DecodingError.dataCorruptedError(forKey: .stroke, in: c, debugDescription: "une couleur n'est pas un hexadécimal")
        }
        let nested = try? c.nestedContainer(keyedBy: OrnamentKeys.self, forKey: .ornament)
        ornament = try nested?.decode([AvatarRingOrnamentPath].self, forKey: .paths) ?? []
        lottie = (try? c.decodeIfPresent(PackAssetRef.self, forKey: .lottie)) ?? nil
        gradients = FrameGradient.list(from: c, forKey: .gradients, colorCount: stroke.colors.count)
        motion = FrameMotion.list(from: c, forKey: .motion)
        guard ornament.allSatisfy({ $0.color >= 0 && $0.color < stroke.colors.count }) else {
            throw DecodingError.dataCorruptedError(forKey: .ornament, in: c, debugDescription: "un trait désigne une couleur absente")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(key, forKey: .key)
        try c.encode(stroke, forKey: .stroke)
        if !ornament.isEmpty {
            var nested = c.nestedContainer(keyedBy: OrnamentKeys.self, forKey: .ornament)
            try nested.encode(ornament, forKey: .paths)
        }
        try c.encodeIfPresent(lottie, forKey: .lottie)
        // Un dégradé illisible ne se réencode pas : compacter décalerait les index des traits.
        let readable = gradients.compactMap { $0 }
        if !readable.isEmpty, readable.count == gradients.count { try c.encode(readable, forKey: .gradients) }
        if !motion.isEmpty { try c.encode(motion, forKey: .motion) }
    }
}

public struct AvatarRingPack: Decodable, Sendable, Hashable, Identifiable {
    public let slug: String
    public let order: Int
    public let installedByDefault: Bool
    public let removable: Bool
    public let rings: [AvatarRingDesign]

    public var id: String { slug }

    private enum CodingKeys: String, CodingKey { case slug, order, installedByDefault, removable, rings }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        slug = try c.decode(String.self, forKey: .slug)
        order = try c.decodeIfPresent(Int.self, forKey: .order) ?? 0
        installedByDefault = try c.decodeIfPresent(Bool.self, forKey: .installedByDefault) ?? false
        removable = try c.decodeIfPresent(Bool.self, forKey: .removable) ?? true
        rings = try c.decode([LossyBox<AvatarRingDesign>].self, forKey: .rings).compactMap(\.value)
    }

    public init(slug: String, order: Int = 0, installedByDefault: Bool = false, removable: Bool = true, rings: [AvatarRingDesign]) {
        self.slug = slug
        self.order = order
        self.installedByDefault = installedByDefault
        self.removable = removable
        self.rings = rings
    }
}

/// Les contours `builtin` : la copie embarquée du catalogue (`AppearanceCatalogData`), lisible hors réseau.
public struct AvatarRingCatalog: Sendable {
    public let packs: [AvatarRingPack]
    private let names: [String: [String: String]]

    public static let empty = AvatarRingCatalog(packs: [], names: [:])

    public static let shared: AvatarRingCatalog = (try? decode(Data(AppearanceCatalogData.json.utf8))) ?? .empty

    static func decode(_ data: Data) throws -> AvatarRingCatalog {
        struct Raw: Decodable {
            struct Text: Decodable {
                let rings: [String: String]?
                let packs: [String: PackText]?
                struct PackText: Decodable { let name: String }
            }
            let rings: [AvatarRingPack]
            let strings: [String: Text]?
        }
        let raw = try JSONDecoder().decode(Raw.self, from: data)
        var names: [String: [String: String]] = [:]
        for (language, text) in raw.strings ?? [:] {
            var table = text.rings ?? [:]
            for (slug, pack) in text.packs ?? [:] { table["pack:" + slug] = pack.name }
            names[language] = table
        }
        return AvatarRingCatalog(packs: raw.rings.sorted { $0.order < $1.order }, names: names)
    }

    private init(packs: [AvatarRingPack], names: [String: [String: String]]) {
        self.packs = packs
        self.names = names
    }

    public func ring(pack: String, item: String) -> AvatarRingDesign? {
        packs.first { $0.slug == pack }?.rings.first { $0.key == item }
    }

    /// Langue demandée, puis français (la source), puis rien.
    public func ringName(_ key: String, language: String) -> String? {
        localized(key, language: language)
    }

    public func packName(_ slug: String, language: String) -> String? {
        localized("pack:" + slug, language: language)
    }

    private func localized(_ key: String, language: String) -> String? {
        let code = String(language.prefix(2)).lowercased()
        return names[code]?[key] ?? names["fr"]?[key]
    }
}
