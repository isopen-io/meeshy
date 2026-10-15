import Foundation

// MARK: - AppearanceDesign (#10631, spec § 5.1)
//
// MIROIR de `packages/shared/types/appearance-design.ts` : la donnée
// vectorielle dont web et iOS peignent le même dessin. Ce sont des DONNÉES
// (hex, chemins, nombres) : aucun balisage reçu n'est jamais interprété ; le
// client construit son dessin depuis ces champs.

public enum AppearancePaintRole: String, Codable, Sendable, Hashable {
    case ink
    case accent
    case accentNext = "accent-next"
    case accentPrev = "accent-prev"
    case soft
    case base
}

public struct AppearanceDesignPalette: Codable, Hashable, Sendable {
    public let base: String
    public let ink: String
    public let soft: String
    /// Absent ⇒ l'accent EFFECTIF du lecteur.
    public let accent: String?

    public init(base: String, ink: String, soft: String, accent: String?) {
        self.base = base
        self.ink = ink
        self.soft = soft
        self.accent = accent
    }
}

public struct AppearanceDesignStroke: Codable, Hashable, Sendable {
    public let d: String
    public let role: AppearancePaintRole
    public let opacity: Double
    /// `> 0` ⇒ trait de cette épaisseur ; absent ⇒ remplissage.
    public let width: Double?
}

public struct AppearanceDesignTile: Codable, Hashable, Sendable {
    public let width: Double
    public let height: Double
    public let scale: Double
    public let rotation: Double
    public let paths: [AppearanceDesignStroke]
}

public enum AppearanceSceneAnchor: String, Codable, Sendable, Hashable {
    case bottom
    case center
    case bottomEnd = "bottom-end"
}

public struct AppearanceDesignScene: Codable, Hashable, Sendable {
    public let viewBox: [Double]
    public let anchor: AppearanceSceneAnchor
    public let paths: [AppearanceDesignStroke]

    public var width: Double { viewBox.count == 4 ? viewBox[2] : 100 }
    public var height: Double { viewBox.count == 4 ? viewBox[3] : 100 }
}

public struct AppearanceDesignGradientStop: Codable, Hashable, Sendable {
    public let role: AppearancePaintRole
    public let at: Double
}

public struct AppearanceDesignBlob: Codable, Hashable, Sendable {
    public let x: Double
    public let y: Double
    public let r: Double
    public let role: AppearancePaintRole
    public let opacity: Double
}

public struct AppearanceDesignGradient: Codable, Hashable, Sendable {
    public let angle: Double
    public let stops: [AppearanceDesignGradientStop]
    public let blobs: [AppearanceDesignBlob]
}

public enum AppearanceDesignStyle: String, Codable, Sendable, Hashable {
    case pattern
    case illustration
    case gradient
}

public struct AppearanceDesign: Codable, Hashable, Sendable, Identifiable {
    public let key: String
    public let style: AppearanceDesignStyle
    public let light: AppearanceDesignPalette
    public let dark: AppearanceDesignPalette
    public let tile: AppearanceDesignTile?
    public let scene: AppearanceDesignScene?
    public let gradient: AppearanceDesignGradient?
    /// Couche animée facultative (D6, #10638) : un fichier de pack que le moteur Lottie joue AU-DESSUS du dessin.
    /// Illisible ⇒ ignorée : le dessin vectoriel reste la vérité, l'animation n'est qu'un plus.
    public let lottie: PackAssetRef?

    public var id: String { key }

    public func palette(_ scheme: AppearanceScheme) -> AppearanceDesignPalette {
        scheme == .dark ? dark : light
    }

    private enum CodingKeys: String, CodingKey {
        case key, style, palettes, tile, scene, gradient, lottie
    }

    private enum PaletteKeys: String, CodingKey {
        case light, dark
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        style = try c.decode(AppearanceDesignStyle.self, forKey: .style)
        let palettes = try c.nestedContainer(keyedBy: PaletteKeys.self, forKey: .palettes)
        light = try palettes.decode(AppearanceDesignPalette.self, forKey: .light)
        dark = try palettes.decode(AppearanceDesignPalette.self, forKey: .dark)
        tile = try c.decodeIfPresent(AppearanceDesignTile.self, forKey: .tile)
        scene = try c.decodeIfPresent(AppearanceDesignScene.self, forKey: .scene)
        gradient = try c.decodeIfPresent(AppearanceDesignGradient.self, forKey: .gradient)
        lottie = (try? c.decodeIfPresent(PackAssetRef.self, forKey: .lottie)) ?? nil
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(key, forKey: .key)
        try c.encode(style, forKey: .style)
        var palettes = c.nestedContainer(keyedBy: PaletteKeys.self, forKey: .palettes)
        try palettes.encode(light, forKey: .light)
        try palettes.encode(dark, forKey: .dark)
        try c.encodeIfPresent(tile, forKey: .tile)
        try c.encodeIfPresent(scene, forKey: .scene)
        try c.encodeIfPresent(gradient, forKey: .gradient)
        try c.encodeIfPresent(lottie, forKey: .lottie)
    }

    public init(
        key: String,
        style: AppearanceDesignStyle,
        light: AppearanceDesignPalette,
        dark: AppearanceDesignPalette,
        tile: AppearanceDesignTile? = nil,
        scene: AppearanceDesignScene? = nil,
        gradient: AppearanceDesignGradient? = nil,
        lottie: PackAssetRef? = nil
    ) {
        self.key = key
        self.style = style
        self.light = light
        self.dark = dark
        self.tile = tile
        self.scene = scene
        self.gradient = gradient
        self.lottie = lottie
    }
}

public struct AppearanceDesignPack: Decodable, Sendable, Hashable, Identifiable {
    public let slug: String
    public let order: Int
    public let installedByDefault: Bool
    public let removable: Bool
    public let designs: [AppearanceDesign]

    public var id: String { slug }

    private enum CodingKeys: String, CodingKey {
        case slug, order, installedByDefault, removable, designs
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        slug = try c.decode(String.self, forKey: .slug)
        order = try c.decodeIfPresent(Int.self, forKey: .order) ?? 0
        installedByDefault = try c.decodeIfPresent(Bool.self, forKey: .installedByDefault) ?? false
        removable = try c.decodeIfPresent(Bool.self, forKey: .removable) ?? true
        // Un modèle illisible (champ d'une passerelle plus récente) est écarté SEUL ;
        // il ne coûte jamais le pack, ni le catalogue.
        designs = try c.decode([LossyBox<AppearanceDesign>].self, forKey: .designs).compactMap(\.value)
    }

    public init(slug: String, order: Int = 0, installedByDefault: Bool = false, removable: Bool = true, designs: [AppearanceDesign]) {
        self.slug = slug
        self.order = order
        self.installedByDefault = installedByDefault
        self.removable = removable
        self.designs = designs
    }
}

struct LossyBox<Value: Decodable>: Decodable {
    let value: Value?

    init(from decoder: Decoder) throws {
        value = try? Value(from: decoder)
    }
}
