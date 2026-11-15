import SwiftUI

// MARK: - Les formes de la Meesh (épopée § 6, #11176)
//
// Les MÊMES formules que `apps/web/src/lib/game/coin-geometry.ts`, une à une, sur la même géométrie
// (`MeeshCoinGeometry.shared`) et au même arrondi (le millième) : le web et iOS posent chaque perle, chaque glyphe,
// chaque cabochon au même point. Les témoins comparent des valeurs relevées sur le web.

enum MeeshCoinLayout {

    struct Point: Equatable, Sendable {
        let x: CGFloat
        let y: CGFloat

        var cgPoint: CGPoint { CGPoint(x: x, y: y) }
    }

    struct RingGlyph: Equatable, Sendable {
        /// La place du glyphe dans le texte répété, espaces compris.
        let index: Int
        let glyph: Character
        let isSeparator: Bool
        let point: Point
        /// En degrés : l'angle de la place, plus 90 (la tête vers l'extérieur).
        let rotate: CGFloat
    }

    struct Cabochon: Equatable, Sendable {
        let center: Point
        let outer: [Point]
        let table: [Point]
    }

    struct Ray: Equatable, Sendable {
        let from: Point
        let to: Point
    }

    static func round(_ value: CGFloat) -> CGFloat {
        (value * 1000).rounded() / 1000
    }

    static func polar(_ radius: CGFloat, _ degrees: CGFloat, around center: Point) -> Point {
        let radians = degrees * .pi / 180
        return Point(x: round(center.x + radius * cos(radians)), y: round(center.y + radius * sin(radians)))
    }

    private static func coinCenter(_ geometry: MeeshCoinGeometry) -> Point {
        Point(x: geometry.center, y: geometry.center)
    }

    /// La couronne de l'avers, glyphe par glyphe : centré sur son cercle, la tête vers l'extérieur. Les espaces ne se
    /// dessinent pas.
    static func inscription(_ geometry: MeeshCoinGeometry = .shared) -> [RingGlyph] {
        let ring = geometry.inscription
        let characters = Array(String(repeating: ring.text, count: ring.repetitions))
        let step = 360 / CGFloat(characters.count)
        return characters.enumerated().compactMap { index, glyph in
            guard glyph != " " else { return nil }
            let angle = ring.startDeg + CGFloat(index) * step
            return RingGlyph(index: index, glyph: glyph, isSeparator: String(glyph) == ring.separator,
                             point: polar(ring.radius, angle, around: coinCenter(geometry)), rotate: round(angle + 90))
        }
    }

    static func beads(_ ring: MeeshCoinDecorGeometry.BeadRing, geometry: MeeshCoinGeometry = .shared) -> [Point] {
        (0..<ring.count).map {
            polar(ring.radius, ring.startDeg + CGFloat($0) * 360 / CGFloat(ring.count), around: coinCenter(geometry))
        }
    }

    private static func polygon(_ center: Point, radius: CGFloat, sides: Int, startDeg: CGFloat) -> [Point] {
        (0..<sides).map { polar(radius, startDeg + CGFloat($0) * 360 / CGFloat(sides), around: center) }
    }

    /// Les cabochons du prisme : un octogone taillé et sa table, posés sur la tranche.
    static func cabochons(_ geometry: MeeshCoinGeometry = .shared) -> [Cabochon] {
        let spec = geometry.decor.cabochons
        return (0..<spec.count).map { index in
            let angle = spec.startDeg + CGFloat(index) * 360 / CGFloat(spec.count)
            let center = polar(spec.radius, angle, around: coinCenter(geometry))
            return Cabochon(center: center,
                            outer: polygon(center, radius: spec.size, sides: 8, startDeg: angle + 22.5),
                            table: polygon(center, radius: spec.size * spec.table, sides: 8, startDeg: angle + 22.5))
        }
    }

    /// Le guilloché en rosace de l'or : des cercles dont les centres tournent autour de celui de la pièce.
    static func rosetteCenters(_ geometry: MeeshCoinGeometry = .shared) -> [Point] {
        let spec = geometry.decor.rosette
        return (0..<spec.count).map { polar(spec.orbit, CGFloat($0) * 360 / CGFloat(spec.count), around: coinCenter(geometry)) }
    }

    /// Le guilloché en soleil du prisme, jusqu'au bord du champ moins sa marge, un rayon sur deux raccourci.
    static func sunburst(fieldRadius: CGFloat, geometry: MeeshCoinGeometry = .shared) -> [Ray] {
        let spec = geometry.decor.sunburst
        let outer = fieldRadius - spec.margin
        return (0..<spec.count).map { index in
            let angle = CGFloat(index) * 360 / CGFloat(spec.count)
            let reach = index.isMultiple(of: 2) ? outer : spec.inner + (outer - spec.inner) * spec.short
            return Ray(from: polar(spec.inner, angle, around: coinCenter(geometry)),
                       to: polar(reach, angle, around: coinCenter(geometry)))
        }
    }

    /// Une petite étoile de la couronne de l'or, centrée sur le glyphe qu'elle remplace, une branche vers l'extérieur.
    static func star(at glyph: RingGlyph, geometry: MeeshCoinGeometry = .shared) -> [Point] {
        let spec = geometry.decor.stars
        return (0..<(spec.points * 2)).map { index in
            let degrees = glyph.rotate - 90 + CGFloat(index) * 180 / CGFloat(spec.points)
            return polar(index.isMultiple(of: 2) ? spec.outer : spec.inner, degrees, around: glyph.point)
        }
    }

    /// Un éclat de diamant : une étoile à quatre branches, la gorge à `inner` × size.
    static func sparkle(_ point: MeeshCoinDecorGeometry.SparklePoint, geometry: MeeshCoinGeometry = .shared) -> [Point] {
        let g = round(point.size * geometry.decor.sparkles.inner)
        let s = point.size
        let (x, y) = (point.x, point.y)
        return [
            Point(x: x, y: round(y - s)), Point(x: round(x + g), y: round(y - g)),
            Point(x: round(x + s), y: y), Point(x: round(x + g), y: round(y + g)),
            Point(x: x, y: round(y + s)), Point(x: round(x - g), y: round(y + g)),
            Point(x: round(x - s), y: y), Point(x: round(x - g), y: round(y - g)),
        ]
    }

    struct LaurelLeaf: Equatable, Sendable {
        let base: Point
        let outerControl: Point
        let tip: Point
        let innerControl: Point

        var path: Path {
            var path = Path()
            path.move(to: base.cgPoint)
            path.addQuadCurve(to: tip.cgPoint, control: outerControl.cgPoint)
            path.addQuadCurve(to: base.cgPoint, control: innerControl.cgPoint)
            path.closeSubpath()
            return path
        }
    }

    /// Une feuille de laurier : de sa base vers `angle`, deux courbes qui se rejoignent à la pointe.
    static func leaf(_ leaf: MeeshCoinDecorGeometry.Leaf) -> LaurelLeaf {
        let radians = leaf.angle * .pi / 180
        func along(_ distance: CGFloat, _ across: CGFloat) -> Point {
            Point(x: round(leaf.x + distance * cos(radians) - across * sin(radians)),
                  y: round(leaf.y + distance * sin(radians) + across * cos(radians)))
        }
        return LaurelLeaf(base: Point(x: leaf.x, y: leaf.y), outerControl: along(leaf.length / 2, -leaf.width),
                          tip: along(leaf.length, 0), innerControl: along(leaf.length / 2, leaf.width))
    }

    /// Un polygone fermé, de ses sommets.
    static func closed(_ points: [Point]) -> Path {
        var path = Path()
        path.addLines(points.map(\.cgPoint))
        path.closeSubpath()
        return path
    }
}
