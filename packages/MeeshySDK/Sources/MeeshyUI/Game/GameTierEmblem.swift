import SwiftUI
import MeeshySDK

// MARK: - Les dix emblèmes de palier (#9481)
//
// MIROIR de `apps/web/src/lib/game/tier-emblem.ts` — un dessin par palier, Étincelle →
// Galaxie, que l'anneau de niveau imprime en filigrane dans son disque central. Chaque
// emblème est bâti AUTOUR de la Signature (les trois traits de Meeshy au cœur) et prend la
// couleur spectrale de son palier (`LevelTierPalette`) ; Galaxie est le prisme.
//
// Les formes sont celles du web, primitive pour primitive, dans une boîte de 100 centrée sur
// l'origine : deux sources du même dessin divergeraient à la première retouche. Une forme est
// un aplat ou un trait à bouts ronds ; jamais une couleur écrite ici.
//
// `filledCore` dit si le cœur est PLEIN (la Signature s'y creuse, à la couleur du disque que
// l'hôte pose derrière) ou OUVERT (la Signature y reste de la couleur du palier).

enum GameTierEmblem {

    /// Le côté de la boîte de dessin.
    static let box: CGFloat = 100
    /// Le côté de la Signature au cœur, dans la boîte.
    static let signatureSide: CGFloat = 30

    enum Paint: Equatable {
        case fill
        case stroke(width: CGFloat)
    }

    struct Primitive {
        let path: Path
        let paint: Paint
    }

    struct Design {
        let primitives: [Primitive]
        let filledCore: Bool
    }

    static func design(for tier: LevelTierKey) -> Design {
        designs[tier] ?? designs[.etincelle] ?? Design(primitives: [], filledCore: true)
    }

    // MARK: - Les primitives

    private static func disc(_ radius: CGFloat, at center: CGPoint = .zero) -> Primitive {
        Primitive(path: Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)),
                  paint: .fill)
    }

    private static func ring(_ radius: CGFloat, width: CGFloat) -> Primitive {
        Primitive(path: Path(ellipseIn: CGRect(x: -radius, y: -radius, width: radius * 2, height: radius * 2)),
                  paint: .stroke(width: width))
    }

    private static func line(from a: CGPoint, to b: CGPoint, width: CGFloat) -> Primitive {
        var path = Path()
        path.move(to: a)
        path.addLine(to: b)
        return Primitive(path: path, paint: .stroke(width: width))
    }

    private static func svg(_ d: String, _ paint: Paint) -> Primitive {
        Primitive(path: GameSVGPath.make(d), paint: paint)
    }

    private static func polar(_ radius: CGFloat, _ degrees: CGFloat, origin: CGPoint = .zero) -> CGPoint {
        let angle = degrees * .pi / 180
        return CGPoint(x: origin.x + radius * cos(angle), y: origin.y + radius * sin(angle))
    }

    /// Un polygone en étoile : `points` pointes, de `outer` à `inner`, une pointe vers le haut.
    private static func star(points: Int, outer: CGFloat, inner: CGFloat) -> Primitive {
        var path = Path()
        for step in 0..<(points * 2) {
            let point = polar(step % 2 == 0 ? outer : inner, -90 + CGFloat(step) * 180 / CGFloat(points))
            if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return Primitive(path: path, paint: .fill)
    }

    private static func rays(count: Int, from: CGFloat, to: CGFloat, width: CGFloat) -> [Primitive] {
        (0..<count).map { step in
            let degrees = CGFloat(step) * 360 / CGFloat(count)
            return line(from: polar(from, degrees), to: polar(to, degrees), width: width)
        }
    }

    private static func fan(_ degrees: [CGFloat]) -> [Primitive] {
        let origin = CGPoint(x: 0, y: 36)
        return degrees.map { angle in
            line(from: polar(12, -90 + angle, origin: origin), to: polar(62, -90 + angle, origin: origin), width: 6)
        }
    }

    private static let constellationPoints: [CGPoint] = [
        CGPoint(x: -34, y: 18), CGPoint(x: -14, y: -14), CGPoint(x: 10, y: 4), CGPoint(x: 32, y: -26), CGPoint(x: 36, y: 24),
    ]

    private static func constellation() -> [Primitive] {
        let links = zip(constellationPoints, constellationPoints.dropFirst()).map { line(from: $0, to: $1, width: 3) }
        return links + constellationPoints.map { disc(6, at: $0) }
    }

    /// Un bras de spirale ; le second est son symétrique par rapport à l'origine.
    private static let spiralArm = "M0 0 C8 -8 22 -6 26 6 C30 22 8 36 -12 30 C-36 22 -40 -8 -22 -28 C-6 -44 24 -46 40 -28"
    private static let spiralArmMirrored = "M0 0 C-8 8 -22 6 -26 -6 C-30 -22 -8 -36 12 -30 C36 -22 40 8 22 28 C6 44 -24 46 -40 28"

    // MARK: - La table

    private static let designs: [LevelTierKey: Design] = [
        .etincelle: Design(primitives: [
            svg("M0 -46 C3 -12 12 -3 46 0 C12 3 3 12 0 46 C-3 12 -12 3 -46 0 C-12 -3 -3 -12 0 -46 Z", .fill),
            svg("M30 -44 C31 -36 34 -33 42 -32 C34 -31 31 -28 30 -20 C29 -28 26 -31 18 -32 C26 -33 29 -36 30 -44 Z", .fill),
        ], filledCore: true),
        .lueur: Design(primitives: [disc(15), ring(28, width: 4), ring(41, width: 3)], filledCore: true),
        .lumiere: Design(primitives: [disc(17)] + rays(count: 8, from: 27, to: 44, width: 5), filledCore: true),
        .eclat: Design(primitives: [star(points: 12, outer: 46, inner: 27)], filledCore: true),
        .rayon: Design(primitives: fan([-50, -25, 0, 25, 50]), filledCore: false),
        .aurore: Design(primitives: [
            svg("M-20 14 A20 20 0 0 1 20 14 Z", .fill),
            svg("M-33 14 A33 33 0 0 1 33 14", .stroke(width: 4)),
            svg("M-45 14 A45 45 0 0 1 45 14", .stroke(width: 3.5)),
            line(from: CGPoint(x: -45, y: 25), to: CGPoint(x: 45, y: 25), width: 5),
        ], filledCore: false),
        .comete: Design(primitives: [
            disc(13, at: CGPoint(x: 22, y: -20)),
            svg("M12 -10 Q-10 10 -40 24", .stroke(width: 7)),
            svg("M8 -22 Q-16 -8 -42 -6", .stroke(width: 4)),
            svg("M24 -6 Q10 18 -8 40", .stroke(width: 4)),
        ], filledCore: false),
        .etoile: Design(primitives: [star(points: 5, outer: 46, inner: 19)], filledCore: true),
        .constellation: Design(primitives: constellation(), filledCore: false),
        .galaxie: Design(primitives: [
            svg(spiralArm, .stroke(width: 5)),
            svg(spiralArmMirrored, .stroke(width: 5)),
            disc(6),
        ], filledCore: false),
    ]

    // MARK: - Le dessin

    /// La peinture du palier : une couleur franche, ou le prisme tournant de Galaxie.
    private static func shading(for tier: LevelTierKey) -> GraphicsContext.Shading {
        tier == .galaxie
            ? .conicGradient(Gradient(stops: GamePalette.prismStops), center: .zero, angle: .zero)
            : .color(LevelTierPalette.color(for: tier))
    }

    /// Dessine l'emblème centré en `center`, dans un carré de `side` (les unités du contexte).
    /// `knockout` est la couleur du disque que l'hôte pose derrière : un cœur plein y creuse la
    /// Signature. `opacity` 1 est plein ; un filigrane se pose vers 0,18.
    static func draw(in context: inout GraphicsContext, tier: LevelTierKey, center: CGPoint, side: CGFloat,
                     knockout: Color, opacity: Double = 1) {
        var inner = context
        inner.opacity = context.opacity * opacity
        inner.translateBy(x: center.x, y: center.y)
        inner.scaleBy(x: side / box, y: side / box)
        let design = design(for: tier)
        let shading = shading(for: tier)
        for primitive in design.primitives {
            switch primitive.paint {
            case .fill:
                inner.fill(primitive.path, with: shading)
            case .stroke(let width):
                inner.stroke(primitive.path, with: shading, style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
            }
        }
        GameSignature.draw(in: &inner, center: .zero, side: signatureSide,
                           color: design.filledCore ? knockout : LevelTierPalette.color(for: tier),
                           style: .flat, strokeWidth: 120)
    }
}

/// L'emblème d'un palier, seul, dans un carré qui prend toute la place offerte.
public struct TierEmblemView: View {
    private let tier: LevelTierKey
    private let knockout: Color
    private let opacity: Double
    private let accessibilityLabel: String?

    /// - Parameters:
    ///   - tier: le palier de nom — il fixe le dessin et la couleur spectrale.
    ///   - knockout: la couleur du fond sur lequel l'emblème se pose (la Signature s'y creuse
    ///     quand le cœur est plein).
    ///   - opacity: 1 plein ; vers 0,18, un filigrane.
    ///   - accessibilityLabel: `nil` ⇒ décoratif ; l'hôte dit « palier Éclat ».
    public init(tier: LevelTierKey, knockout: Color = .white, opacity: Double = 1, accessibilityLabel: String? = nil) {
        self.tier = tier
        self.knockout = knockout
        self.opacity = opacity
        self.accessibilityLabel = accessibilityLabel
    }

    public var body: some View {
        Canvas { context, size in
            GameTierEmblem.draw(
                in: &context, tier: tier, center: CGPoint(x: size.width / 2, y: size.height / 2),
                side: min(size.width, size.height), knockout: knockout, opacity: opacity
            )
        }
        .aspectRatio(1, contentMode: .fit)
        .gameAccessibility(label: accessibilityLabel)
    }
}
