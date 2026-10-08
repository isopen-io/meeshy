import SwiftUI
import MeeshySDK

// MARK: - Les matières du jeu (#9380)
//
// Les dégradés de la planche (`<linearGradient id="gCopper">…`), transcrits
// stop pour stop. Une matière sert à TROIS familles d'objets — les rangs
// (`RankBlasonView`), les badges (`GameBadgeView`) et les trophées
// (`TrophyView`) — d'où UN type, pas trois palettes qui divergeraient.

/// Cuivre → Prisme : les sept matières des badges, des rangs et des coupes,
/// plus la matière de la Flamme (trophée de série).
public enum GameMaterial: String, CaseIterable, Sendable, Hashable {
    case copper
    case bronze
    case silver
    case gold
    case platinum
    case obsidian
    case prism
    case flame

    /// L'encre qui se grave sur la matière — sombre sur le métal clair, claire
    /// sur l'obsidienne.
    public var ink: Color {
        switch self {
        case .copper: Color(hex: "5a2a12")
        case .bronze: Color(hex: "4a3010")
        case .silver: Color(hex: "3f4858")
        case .gold: Color(hex: "6b4610")
        case .platinum: Color(hex: "2c4459")
        case .obsidian: Color(hex: "d7d4f2")
        case .prism: Color(hex: "1c1941")
        case .flame: Color(hex: "7c2d12")
        }
    }

    /// Les arrêts du dégradé, de (0,0) à (1,1) sauf la flamme, qui monte.
    fileprivate var stops: [Gradient.Stop] {
        switch self {
        case .copper: Self.pair("f3b48a", "a5552b")
        case .bronze: Self.pair("e7c08d", "8a5a24")
        case .silver: Self.pair("f4f6fa", "8e98a8")
        case .gold: Self.pair("fde68a", "b7791f")
        case .platinum: Self.pair("e0f2fe", "5b7c99")
        case .obsidian: Self.pair("55527a", "0e0d1a")
        case .prism: GamePalette.prismStops
        case .flame: [
            .init(color: Color(hex: "ef4444"), location: 0),
            .init(color: Color(hex: "f97316"), location: 0.55),
            .init(color: Color(hex: "fde047"), location: 1),
        ]
        }
    }

    /// La couleur PLEINE d'un trait de la matière (jeton `-1` du web ; obsidienne : `-0`, prisme : `-2`) —
    /// un dégradé en boîte englobante ne peint pas un trait horizontal (#9636).
    var lineColor: Color {
        switch self {
        case .copper: Color(hex: "a5552b")
        case .bronze: Color(hex: "8a5a24")
        case .silver: Color(hex: "8e98a8")
        case .gold: Color(hex: "b7791f")
        case .platinum: Color(hex: "5b7c99")
        case .obsidian: Color(hex: "55527a")
        case .prism: Color(hex: "34d399")
        case .flame: Color(hex: "f97316")
        }
    }

    /// Les cinq couleurs du prisme, dans l'ordre (jetons `--game-prism-0…4`).
    static var prismColors: [Color] { GamePalette.prismStops.map(\.color) }

    fileprivate var direction: (from: UnitPoint, to: UnitPoint) {
        self == .flame ? (.bottom, .top) : (.topLeading, .bottomTrailing)
    }

    private static func pair(_ from: String, _ to: String) -> [Gradient.Stop] {
        [.init(color: Color(hex: from), location: 0), .init(color: Color(hex: to), location: 1)]
    }

    /// Le dégradé, tel que SVG le pose dans la boîte englobante de la forme
    /// (`gradientUnits="objectBoundingBox"`), à dessiner dans `context`.
    func shading(in box: CGRect) -> GraphicsContext.Shading {
        GamePalette.shading(stops, from: direction.from, to: direction.to, in: box)
    }

    /// Le même dégradé pour une vue SwiftUI ordinaire.
    public var gradient: LinearGradient {
        LinearGradient(stops: stops, startPoint: direction.from, endPoint: direction.to)
    }
}

/// Les vingt couleurs de palier, du rouge Étincelle au prisme de Galaxie, puis le ciel profond jusqu'à Singularité.
public enum LevelTierPalette {
    public static func color(for tier: LevelTierKey) -> Color {
        switch tier {
        case .etincelle: Color(hex: "f87171")
        case .lueur: Color(hex: "fb923c")
        case .lumiere: Color(hex: "fbbf24")
        case .eclat: Color(hex: "a3e635")
        case .rayon: Color(hex: "34d399")
        case .aurore: Color(hex: "22d3ee")
        case .comete: Color(hex: "60a5fa")
        case .etoile: Color(hex: "818cf8")
        case .constellation: Color(hex: "a855f7")
        case .galaxie: Color(hex: "a855f7")
        // Au-delà du niveau 100 (#9688) : les teintes du ciel profond, mêmes valeurs que le web (`--game-tier-*`).
        case .nebuleuse: Color(hex: "f472b6")
        case .pulsar: Color(hex: "38bdf8")
        case .quasar: Color(hex: "818cf8")
        case .supernova: Color(hex: "fbbf24")
        case .magnetar: Color(hex: "e879f9")
        case .amas: Color(hex: "2dd4bf")
        case .superamas: Color(hex: "60a5fa")
        case .cosmos: Color(hex: "c084fc")
        case .infini: Color(hex: "f0abfc")
        case .singularite: Color(hex: "a855f7")
        }
    }

    /// Le trait de l'arc : une couleur franche, ou le prisme tournant de Galaxie et de Singularité.
    static func style(for tier: LevelTierKey) -> AnyShapeStyle {
        tier.isSpectral
            ? AnyShapeStyle(AngularGradient(stops: GamePalette.prismStops, center: .center))
            : AnyShapeStyle(color(for: tier))
    }
}

/// Les autres dégradés et couleurs de la planche, nommés une fois.
enum GamePalette {
    static let prismStops: [Gradient.Stop] = [
        .init(color: Color(hex: "f87171"), location: 0),
        .init(color: Color(hex: "fbbf24"), location: 0.25),
        .init(color: Color(hex: "34d399"), location: 0.5),
        .init(color: Color(hex: "60a5fa"), location: 0.75),
        .init(color: Color(hex: "a855f7"), location: 1),
    ]

    /// Les pièces : l'argent de la frappe, le métal de l'édition or, le revers.
    static let coinSilver: [Gradient.Stop] = [
        .init(color: Color(hex: "f3f5f9"), location: 0),
        .init(color: Color(hex: "a8b1bf"), location: 0.45),
        .init(color: Color(hex: "5f6a7d"), location: 1),
    ]
    static let coinSilverInner: [Gradient.Stop] = [
        .init(color: Color(hex: "e3e7ee"), location: 0),
        .init(color: Color(hex: "8f99aa"), location: 1),
    ]
    static let coinGold: [Gradient.Stop] = [
        .init(color: Color(hex: "fff1b8"), location: 0),
        .init(color: Color(hex: "e2a72e"), location: 0.5),
        .init(color: Color(hex: "8a5a10"), location: 1),
    ]
    static let indigo: [Gradient.Stop] = [
        .init(color: Color(hex: "6366f1"), location: 0),
        .init(color: Color(hex: "312e81"), location: 1),
    ]

    static let ink = Color(hex: "1c1941")
    static let coinInk = Color(hex: "3f4858")
    static let coinRim = Color(hex: "5f6a7d")
    static let coinHighlight = Color(hex: "f3f5f9")
    static let violet = Color(hex: "8b5cf6")
    static let gold = Color(hex: "fbbf24")
    static let laurel = Color(hex: "10b981")
    /// L'ombre portée de la Signature frappée ou gravée.
    static let signatureShadow = Color(hex: "2b3342")

    static func shading(_ stops: [Gradient.Stop], from: UnitPoint, to: UnitPoint, in box: CGRect) -> GraphicsContext.Shading {
        .linearGradient(
            Gradient(stops: stops),
            startPoint: CGPoint(x: box.minX + from.x * box.width, y: box.minY + from.y * box.height),
            endPoint: CGPoint(x: box.minX + to.x * box.width, y: box.minY + to.y * box.height)
        )
    }

    /// (0,0) → (1,1), la direction par défaut de SVG pour ces dégradés.
    static func diagonal(_ stops: [Gradient.Stop], in box: CGRect) -> GraphicsContext.Shading {
        shading(stops, from: .topLeading, to: .bottomTrailing, in: box)
    }
}

// MARK: - Les rangs portent leur matière

extension GloryRank {
    /// La matière de l'écu : cuivre aux deux premiers rangs, puis bronze, argent,
    /// or, platine, obsidienne, et le prisme pour Mythe.
    public var material: GameMaterial {
        switch self {
        case .murmure, .echo: .copper
        case .voix, .conteur: .bronze
        case .passeur, .polyglotte: .silver
        case .ambassadeur, .orateur: .gold
        case .oracle: .platinum
        case .legende: .obsidian
        case .mythe: .prism
        }
    }
}
