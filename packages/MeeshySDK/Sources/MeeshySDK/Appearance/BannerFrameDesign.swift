import Foundation

// MARK: - BannerFrameDesign (#10932)
//
// MIROIR de `packages/shared/types/banner-frame-design.ts` : un CADRE de bannière,
// posé SUR la photo de bannière (ou, sans photo, sur le fond), le CENTRE restant
// TRANSPARENT. Il ne remplace jamais la photo. Gabarit 0 0 300 100 : la bordure et
// ses filets se tracent à la largeur réelle, les pièces restent fixes (ancrées à
// gauche, à droite ou au centre), les frises répètent leur module.
//
// Le centre transparent est une LOI (`drawableRegion(width:)`) : le rendu (#10935)
// découpe tout ce que le cadre dessine au pourtour de `border.width` (≤ 9,6), plus
// les quatre coins et le cartouche central, qui n'entrent pas au-delà de 20.
// Fail-closed sur le dessin (couleurs, bornes) ; tolérant sur ce qui l'anime.
// Sur divergence, le TypeScript a raison.

public enum BannerFrameAnchor: String, Codable, Sendable, Hashable, CaseIterable {
    case start
    case center
    case end
}

public enum BannerFrameFit: String, Codable, Sendable, Hashable, CaseIterable {
    /// Des modules entiers.
    case `repeat`
    /// Le module recalculé pour tomber juste entre les marges.
    case justify
}

public enum BannerFrameFillRule: String, Codable, Sendable, Hashable {
    case nonzero
    case evenodd
}

public enum CartoucheEdge: String, Codable, Sendable, Hashable, CaseIterable {
    case top
    case bottom
    case both
}

public struct BannerFramePath: Codable, Sendable, Hashable {
    public let d: String
    /// Index dans `BannerFrameDesign.palette`.
    public let color: Int
    /// Index dans `BannerFrameDesign.gradients` ; `color` reste le repli.
    public let gradient: Int?
    public let opacity: Double
    /// > 0 ⇒ trait ; absent ⇒ remplissage.
    public let width: Double?
    public let fillRule: BannerFrameFillRule?
    public let group: String?
}

public struct BannerFrameFilet: Codable, Sendable, Hashable {
    public let inset: Double
    public let width: Double
    public let color: Int
    public let gradient: Int?
    public let opacity: Double
}

public struct BannerFrameBorder: Codable, Sendable, Hashable {
    public let width: Double
    public let color: Int
    public let gradient: Int?
    public let opacity: Double
    public let filets: [BannerFrameFilet]

    private enum CodingKeys: String, CodingKey { case width, color, gradient, opacity, filets }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        width = try c.decode(Double.self, forKey: .width)
        color = try c.decode(Int.self, forKey: .color)
        gradient = try c.decodeIfPresent(Int.self, forKey: .gradient)
        opacity = try c.decode(Double.self, forKey: .opacity)
        filets = try c.decodeIfPresent([BannerFrameFilet].self, forKey: .filets) ?? []
    }
}

public struct BannerFrameCartouche: Codable, Sendable, Hashable {
    public let width: Double
    public let depth: Double
    public let edge: CartoucheEdge
}

public struct BannerFrameReach: Codable, Sendable, Hashable {
    /// Le côté des quatre carrés de coin.
    public let corner: Double
    public let cartouche: BannerFrameCartouche?
}

public struct BannerFramePiece: Codable, Sendable, Hashable {
    public let anchor: BannerFrameAnchor
    public let paths: [BannerFramePath]
}

public struct BannerFrameFrieze: Codable, Sendable, Hashable {
    public let module: Double
    public let from: Double
    public let to: Double
    public let fit: BannerFrameFit
    public let paths: [BannerFramePath]
}

public struct FrameRect: Sendable, Hashable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

/// Ce que le rendu peint : `outer` privé de `hole`, plus `reserved` (coins, puis cartouche).
public struct BannerFrameDrawableRegion: Sendable, Hashable {
    public let outer: FrameRect
    public let hole: FrameRect
    public let reserved: [FrameRect]
}

public struct BannerFrameDesign: Decodable, Sendable, Hashable, Identifiable {
    public static let referenceWidth: Double = 300
    public static let height: Double = 100
    public static let maxBorderWidth = 9.6
    public static let maxReach: Double = 20
    public static let maxCartoucheWidth: Double = 80
    public static let maxColors = 8
    public static let maxPaths = 48

    public let key: String
    public let palette: [String]
    public let gradients: [FrameGradient?]
    public let border: BannerFrameBorder
    public let reach: BannerFrameReach
    public let pieces: [BannerFramePiece]
    public let friezes: [BannerFrameFrieze]
    public let motion: [FrameMotion]
    public let lottie: PackAssetRef?

    public var id: String { key }

    private enum CodingKeys: String, CodingKey { case key, viewBox, palette, gradients, border, reach, pieces, friezes, motion, lottie }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        guard try c.decode([Double].self, forKey: .viewBox) == [0, 0, Self.referenceWidth, Self.height] else {
            throw DecodingError.dataCorruptedError(forKey: .viewBox, in: c, debugDescription: "un cadre de bannière se dessine en 0 0 300 100")
        }
        palette = try c.decode([String].self, forKey: .palette)
        border = try c.decode(BannerFrameBorder.self, forKey: .border)
        reach = try c.decode(BannerFrameReach.self, forKey: .reach)
        pieces = try c.decodeIfPresent([BannerFramePiece].self, forKey: .pieces) ?? []
        friezes = try c.decodeIfPresent([BannerFrameFrieze].self, forKey: .friezes) ?? []
        lottie = (try? c.decodeIfPresent(PackAssetRef.self, forKey: .lottie)) ?? nil
        gradients = FrameGradient.list(from: c, forKey: .gradients, colorCount: palette.count)
        motion = FrameMotion.list(from: c, forKey: .motion)
        guard (1...Self.maxColors).contains(palette.count), palette.allSatisfy(AvatarRingStroke.isWellFormedHex) else {
            throw DecodingError.dataCorruptedError(forKey: .palette, in: c, debugDescription: "palette illisible")
        }
        guard keepsTheCenterClear else {
            throw DecodingError.dataCorruptedError(forKey: .border, in: c, debugDescription: "le cadre mord sur le centre transparent")
        }
        guard paintsFitThePalette, allPaths.count <= Self.maxPaths else {
            throw DecodingError.dataCorruptedError(forKey: .pieces, in: c, debugDescription: "un trait désigne une couleur absente, ou trop de chemins")
        }
    }

    private var allPaths: [BannerFramePath] { pieces.flatMap(\.paths) + friezes.flatMap(\.paths) }

    private var keepsTheCenterClear: Bool {
        let cartoucheFits = reach.cartouche.map { $0.width > 0 && $0.width <= Self.maxCartoucheWidth && $0.depth > 0 && $0.depth <= Self.maxReach } ?? true
        return border.width > 0 && border.width <= Self.maxBorderWidth
            && (0...Self.maxReach).contains(reach.corner)
            && cartoucheFits
            && border.filets.allSatisfy { $0.inset >= 0 && $0.inset <= border.width }
    }

    /// Une couleur désignée hors palette ferait planter le dessin ; un dégradé désigné absent retombe sur la couleur.
    private var paintsFitThePalette: Bool {
        let colors = [border.color] + border.filets.map(\.color) + allPaths.map(\.color)
        return colors.allSatisfy { $0 >= 0 && $0 < palette.count }
    }

    /// La région où le cadre peint, à une largeur LOGIQUE (`largeur × 100 / hauteur`, 300 au gabarit).
    public func drawableRegion(width: Double) -> BannerFrameDrawableRegion {
        let corner = reach.corner
        let height = Self.height
        let corners = [
            FrameRect(x: 0, y: 0, width: corner, height: corner),
            FrameRect(x: width - corner, y: 0, width: corner, height: corner),
            FrameRect(x: 0, y: height - corner, width: corner, height: corner),
            FrameRect(x: width - corner, y: height - corner, width: corner, height: corner),
        ]
        let cartouches: [FrameRect] = reach.cartouche.map { cartouche in
            let x = (width - cartouche.width) / 2
            let top = FrameRect(x: x, y: 0, width: cartouche.width, height: cartouche.depth)
            let bottom = FrameRect(x: x, y: height - cartouche.depth, width: cartouche.width, height: cartouche.depth)
            switch cartouche.edge {
            case .top: return [top]
            case .bottom: return [bottom]
            case .both: return [top, bottom]
            }
        } ?? []
        return BannerFrameDrawableRegion(
            outer: FrameRect(x: 0, y: 0, width: width, height: height),
            hole: FrameRect(x: border.width, y: border.width, width: width - 2 * border.width, height: height - 2 * border.width),
            reserved: corners + cartouches
        )
    }
}

/// Le contrat d'un pack `banner-frame` : les cadres illisibles se taisent un par un.
public struct BannerFramePackContract: Decodable, Sendable, Hashable {
    public let frames: [BannerFrameDesign]

    private enum CodingKeys: String, CodingKey { case domain, frames }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard try c.decode(String.self, forKey: .domain) == "banner-frame" else {
            throw DecodingError.dataCorruptedError(forKey: .domain, in: c, debugDescription: "ce n'est pas un pack de cadres de bannière")
        }
        frames = try c.decode([LossyBox<BannerFrameDesign>].self, forKey: .frames).compactMap(\.value)
    }
}
