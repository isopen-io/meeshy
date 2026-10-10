import Foundation

// MARK: - Le blason d'un rang : sa géométrie (#9636)
//
// MIROIR de `packages/shared/utils/game/rank-crest.ts`, recopié forme pour forme.
// Une TABLE, pas du dessin : `RankBlasonView` (MeeshyUI) la peint, le web la peint
// en SVG (`apps/web/src/components/game/rank-blason.tsx`).
//
// Repère : le cadre du blason, 200 × 184 ; l'écu y occupe x 64 → 136, y 36 → 119
// (sa pointe en (100, 119)). Angles en degrés depuis MIDI, sens horaire
// (x = cx + r·sin θ, y = cy − r·cos θ), comme la Signature unique.
//
// `tone` nomme un RÔLE, jamais une couleur : `metal` (la matière du rang), `gold`
// (l'or), `ink` (l'encre de la matière, posée SUR une pièce).

public enum CrestTone: String, Sendable, Equatable {
    case metal
    case gold
    case ink
}

public struct CrestCubic: Sendable, Equatable {
    public let c1x: Double
    public let c1y: Double
    public let c2x: Double
    public let c2y: Double
    public let x: Double
    public let y: Double
}

/// Une pièce de la décoration. Toutes ont des bouts ronds, comme la Signature.
public enum CrestPiece: Sendable, Equatable {
    case line(x1: Double, y1: Double, x2: Double, y2: Double, width: Double, tone: CrestTone)
    /// Un arc tracé dans le sens horaire de `from` à `to` (degrés depuis midi).
    case arc(cx: Double, cy: Double, r: Double, from: Double, to: Double, width: Double, tone: CrestTone)
    /// Un trait courbe : un départ, puis des Bézier cubiques.
    case curve(x: Double, y: Double, segments: [CrestCubic], width: Double, tone: CrestTone)
    /// Une feuille pleine entre deux pointes : deux Bézier quadratiques dont le contrôle
    /// s'écarte de 2 × `bulge` du milieu, perpendiculairement à l'axe.
    case leaf(x1: Double, y1: Double, x2: Double, y2: Double, bulge: Double, tone: CrestTone)
    case dot(cx: Double, cy: Double, r: Double, tone: CrestTone)

    public var tone: CrestTone {
        switch self {
        case .line(_, _, _, _, _, let tone), .arc(_, _, _, _, _, _, let tone), .curve(_, _, _, _, let tone),
             .leaf(_, _, _, _, _, let tone), .dot(_, _, _, let tone):
            tone
        }
    }
}

public struct BlasonViewport: Sendable, Equatable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
}

public struct DivisionNotch: Sendable, Equatable {
    public let x: Double
    public let y1: Double
    public let y2: Double
    public let width: Double
    public let on: Bool
}

public struct MythicHalo: Sendable, Equatable {
    public struct Point: Sendable, Equatable {
        public let x: Double
        public let y: Double
    }

    public struct Bead: Sendable, Equatable {
        public let cx: Double
        public let cy: Double
        public let r: Double
    }

    public struct Numeral: Sendable, Equatable {
        public let text: String
        public let x: Double
        public let y: Double
        public let size: Double
    }

    /// L'émission dessinée, `nil` pour le halo par défaut (ancien serveur).
    public let edition: Int?
    /// Teinte de départ du prisme (0–359) ; `nil` : le dégradé prismatique du client.
    public let hue: Int?
    public let rays: [MythicSignatureLine]
    public let rayWidth: Double
    /// Les quatre sommets du losange, de la pointe extérieure, dans le sens horaire.
    public let gem: [Point]?
    public let beads: [Bead]
    public let numeral: Numeral?
}

public enum GameRankCrest {

    public static let frame = (width: 200.0, height: 184.0)

    public static let fullFrame = BlasonViewport(x: 0, y: 0, width: 200, height: 184)
    public static let compactFrame = BlasonViewport(x: 30, y: 6, width: 140, height: 128.8)
    public static let compactMythicFrame = BlasonViewport(x: 14, y: 5, width: 172, height: 158.24)
    /// En dessous de cette largeur (pt), le blason se dessine en petit format.
    public static let compactBelow: Double = 60

    /// Le niveau gravé dans la pointe de l'écu : centre de la ligne de base et corps.
    public static let levelEngraving = (x: 100.0, y: 109.0, size: 15.0)

    /// Le corps de la gravure selon le nombre de chiffres (#9688 : les niveaux s'ouvrent au-delà de 100) — la pointe
    /// de l'écu se resserre, un niveau à 3, 4 ou 5 chiffres y tient sans déborder : 15 jusqu'à 2 chiffres, puis 12,
    /// 9,5 et 8.
    public static func levelEngravingSize(forLevel level: Int) -> Double {
        switch String(max(0, level)).count {
        case ...2: levelEngraving.size
        case 3: 12
        case 4: 9.5
        default: 8
        }
    }

    public static let notchLayout = (cx: 100.0, y1: 124.0, y2: 131.0, gap: 9.0, width: 4.0, slots: 5)

    /// Où la Signature unique se pose en halo : son centre et l'échelle de son carré de 1 024.
    public static let mythicHaloPlacement = (cx: 100.0, cy: 84.0, scale: 0.155)
    public static let mythicHaloDefaultRays = 12

    // MARK: Les pièces

    private static func line(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ width: Double, _ tone: CrestTone) -> CrestPiece {
        .line(x1: x1, y1: y1, x2: x2, y2: y2, width: width, tone: tone)
    }

    private static func arc(_ cx: Double, _ cy: Double, _ r: Double, _ from: Double, _ to: Double, _ width: Double, _ tone: CrestTone) -> CrestPiece {
        .arc(cx: cx, cy: cy, r: r, from: from, to: to, width: width, tone: tone)
    }

    private static func leaf(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ bulge: Double, _ tone: CrestTone) -> CrestPiece {
        .leaf(x1: x1, y1: y1, x2: x2, y2: y2, bulge: bulge, tone: tone)
    }

    private static func dot(_ cx: Double, _ cy: Double, _ r: Double, _ tone: CrestTone) -> CrestPiece {
        .dot(cx: cx, cy: cy, r: r, tone: tone)
    }

    private static func cubic(_ c1x: Double, _ c1y: Double, _ c2x: Double, _ c2y: Double, _ x: Double, _ y: Double) -> CrestCubic {
        CrestCubic(c1x: c1x, c1y: c1y, c2x: c2x, c2y: c2y, x: x, y: y)
    }

    static let laurel: [CrestPiece] = [
        .curve(x: 62, y: 131, segments: [cubic(48, 123.7, 42.3, 110, 45, 90)], width: 3, tone: .gold),
        .curve(x: 138, y: 131, segments: [cubic(152, 123.7, 157.7, 110, 155, 90)], width: 3, tone: .gold),
        leaf(54.6, 125.8, 45.9, 128, 3.2, .gold),
        leaf(49.2, 119.2, 53.1, 111.1, 3.2, .gold),
        leaf(45.8, 111, 37.3, 108.1, 3.2, .gold),
        leaf(44.4, 101.2, 51.7, 96, 3.2, .gold),
        leaf(45, 90, 46.2, 81.1, 3.2, .gold),
        leaf(145.4, 125.8, 154.1, 128, 3.2, .gold),
        leaf(150.8, 119.2, 146.9, 111.1, 3.2, .gold),
        leaf(154.2, 111, 162.7, 108.1, 3.2, .gold),
        leaf(155.6, 101.2, 148.3, 96, 3.2, .gold),
        leaf(155, 90, 153.8, 81.1, 3.2, .gold),
    ]

    /// La décoration de chaque rang, dessinée DERRIÈRE l'écu ; le Mythe n'en a pas (son halo vient de l'émission).
    public static func pieces(for rank: GloryRank) -> [CrestPiece] {
        switch rank {
        case .murmure:
            [line(90, 26, 110, 26, 6, .metal)]
        case .echo:
            [arc(100, 40, 12, -55, 55, 4.5, .metal), arc(100, 40, 22, -50, 50, 4.5, .metal)]
        case .voix:
            [line(91, 29.3, 82, 18.6, 5.5, .metal), line(100, 26, 100, 12, 5.5, .metal), line(109, 29.3, 118, 18.6, 5.5, .metal)]
        case .conteur:
            [leaf(100, 31, 86, 22, 3.5, .metal), leaf(100, 31, 114, 22, 3.5, .metal), leaf(100, 33, 100, 10, 7, .metal),
             line(100, 29, 100, 15, 1.6, .ink)]
        case .passeur:
            [arc(100, 44, 32, -72, 72, 6, .metal), arc(100, 44, 24, -66, 66, 3, .metal), dot(100, 12, 4.5, .gold),
             dot(69.6, 34.1, 3.5, .gold), dot(130.4, 34.1, 3.5, .gold)]
        case .polyglotte:
            [
                line(72, 22, 128, 22, 3, .metal),
                .curve(x: 72, y: 22, segments: [cubic(81, 11, 91, 11, 100, 22), cubic(109, 33, 119, 33, 128, 22)], width: 4.5, tone: .metal),
                .curve(x: 72, y: 22, segments: [cubic(81, 33, 91, 33, 100, 22), cubic(109, 11, 119, 11, 128, 22)], width: 4.5, tone: .gold),
                dot(72, 22, 3.2, .gold), dot(100, 22, 3.2, .gold), dot(128, 22, 3.2, .gold),
            ]
        case .ambassadeur:
            laurel
        case .orateur:
            laurel + [
                line(82.2, 33.1, 75.7, 28.4, 4.5, .metal), line(88.2, 29.8, 80, 18.5, 4.5, .metal),
                line(93.2, 25.1, 90.7, 17.5, 4.5, .metal), line(100, 26, 100, 12, 4.5, .metal),
                line(106.8, 25.1, 109.3, 17.5, 4.5, .metal), line(111.8, 29.8, 120, 18.5, 4.5, .metal),
                line(117.8, 33.1, 124.3, 28.4, 4.5, .metal),
            ]
        case .oracle:
            laurel + [
                line(100, 10, 100, 32, 5, .metal), line(109.5, 15.5, 90.5, 26.5, 5, .metal),
                line(109.5, 26.5, 90.5, 15.5, 5, .metal), dot(100, 21, 3, .gold),
                dot(85, 12, 1.8, .gold), dot(115, 12, 1.8, .gold), dot(84, 30, 1.8, .gold), dot(116, 30, 1.8, .gold),
            ]
        case .legende:
            laurel + [
                line(78, 33, 122, 33, 5, .gold), line(80, 33, 80, 23, 4.5, .gold), line(90, 33, 90, 17, 4.5, .gold),
                line(100, 33, 100, 12, 4.5, .gold), line(110, 33, 110, 17, 4.5, .gold), line(120, 33, 120, 23, 4.5, .gold),
                dot(90, 17, 3.4, .metal), dot(100, 12, 3.4, .metal), dot(110, 17, 3.4, .metal),
            ]
        case .mythe:
            []
        }
    }

    // MARK: Divisions

    /// Les cinq encoches d'une division, pleines de gauche à droite ; `nil` (le Mythe) : aucune.
    public static func notches(_ division: GloryDivision5?) -> [DivisionNotch] {
        guard let division else { return [] }
        let layout = notchLayout
        return (0..<layout.slots).map { k in
            DivisionNotch(x: layout.cx + (Double(k) - Double(layout.slots - 1) / 2) * layout.gap,
                          y1: layout.y1, y2: layout.y2, width: layout.width, on: k < division.notches)
        }
    }

    // MARK: Le halo du Mythe

    private static func place(_ x: Double, _ y: Double) -> MythicHalo.Point {
        let half = GameMythe.signatureBox / 2
        let p = mythicHaloPlacement
        return .init(x: GameMythe.tenth(p.cx + (x - half) * p.scale), y: GameMythe.tenth(p.cy + (y - half) * p.scale))
    }

    private static func placed(_ ray: MythicSignatureLine) -> MythicSignatureLine {
        let from = place(ray.x1, ray.y1)
        let to = place(ray.x2, ray.y2)
        return MythicSignatureLine(x1: from.x, y1: from.y, x2: to.x, y2: to.y)
    }

    /// La Signature unique d'une émission posée en HALO autour de l'écu ; sans émission :
    /// douze rayons, sans gemme, ni perle, ni numéro.
    public static func mythicHalo(edition: Int?) -> MythicHalo {
        let scale = mythicHaloPlacement.scale
        guard let edition, let design = GameMythe.signature(edition: edition) else {
            let count = mythicHaloDefaultRays
            let rays = (0..<count).map { k -> MythicSignatureLine in
                let radians = 2 * Double.pi * Double(k) / Double(count)
                let from = place(512 + 380 * sin(radians), 512 - 380 * cos(radians))
                let to = place(512 + 430 * sin(radians), 512 - 430 * cos(radians))
                return MythicSignatureLine(x1: from.x, y1: from.y, x2: to.x, y2: to.y)
            }
            return MythicHalo(edition: nil, hue: nil, rays: rays, rayWidth: GameMythe.tenth(28 * scale),
                              gem: nil, beads: [], numeral: nil)
        }
        let radians = design.gem.angle * .pi / 180
        let along = (x: sin(radians), y: -cos(radians))
        let across = (x: -along.y, y: along.x)
        let r = design.gem.r
        let g = design.gem
        let gem = [
            place(g.cx + along.x * r, g.cy + along.y * r),
            place(g.cx + across.x * r, g.cy + across.y * r),
            place(g.cx - along.x * r, g.cy - along.y * r),
            place(g.cx - across.x * r, g.cy - across.y * r),
        ]
        let beads = design.beads.map { bead -> MythicHalo.Bead in
            let at = place(bead.cx, bead.cy)
            return .init(cx: at.x, cy: at.y, r: GameMythe.tenth(bead.r * scale))
        }
        let engraving = place(design.engraving.x, design.engraving.y)
        return MythicHalo(
            edition: design.edition, hue: design.hue, rays: design.rays.map(placed),
            rayWidth: GameMythe.tenth(design.halo.strokeWidth * scale), gem: gem, beads: beads,
            numeral: .init(text: design.numeral, x: engraving.x, y: engraving.y,
                           size: GameMythe.tenth(design.engraving.size * scale))
        )
    }
}
