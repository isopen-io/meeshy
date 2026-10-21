import SwiftUI

// MARK: - Les décors de la Meesh, en coordonnées (épopée § 6, #11176)
//
// La branche `decor` de `packages/shared/design/meesh-coin.json` : argent SOBRE (les veines d'or), or RAFFINÉ (grènetis,
// rosace, étoiles, lauriers), prisme ROYAL (double grènetis, cabochons, soleil, couronne, éclats). Rien ne s'y dessine :
// `MeeshCoinLayout` en tire les formes, `MeeshCoinDecorPainter` les peint.

struct MeeshCoinDecorGeometry: Decodable, Equatable, Sendable {

    struct Veins: Decodable, Equatable, Sendable {
        let width: CGFloat
        let opacity: Double
        let paths: [String]
    }

    struct BeadRing: Decodable, Equatable, Sendable {
        let radius: CGFloat
        let count: Int
        let dot: CGFloat
        let startDeg: CGFloat
    }

    struct Beads: Decodable, Equatable, Sendable {
        let gold: [BeadRing]
        let prism: [BeadRing]
    }

    struct Cabochons: Decodable, Equatable, Sendable {
        let count: Int
        let radius: CGFloat
        let startDeg: CGFloat
        let size: CGFloat
        let table: CGFloat
    }

    struct Rosette: Decodable, Equatable, Sendable {
        let count: Int
        let orbit: CGFloat
        let radius: CGFloat
        let width: CGFloat
        let opacity: Double
    }

    struct Sunburst: Decodable, Equatable, Sendable {
        let count: Int
        let inner: CGFloat
        let margin: CGFloat
        let short: CGFloat
        let width: CGFloat
        let opacity: Double
    }

    struct Stars: Decodable, Equatable, Sendable {
        let points: Int
        let outer: CGFloat
        let inner: CGFloat
    }

    struct Leaf: Decodable, Equatable, Sendable {
        let x: CGFloat
        let y: CGFloat
        let angle: CGFloat
        let length: CGFloat
        let width: CGFloat
    }

    struct Laurels: Decodable, Equatable, Sendable {
        let mirrorX: CGFloat
        let stem: String
        let stemWidth: CGFloat
        let leaves: [Leaf]
    }

    struct Jewel: Decodable, Equatable, Sendable {
        let x: CGFloat
        let y: CGFloat
        let r: CGFloat
    }

    struct Crown: Decodable, Equatable, Sendable {
        let body: String
        let band: String
        let width: CGFloat
        let jewels: [Jewel]
    }

    struct SparklePoint: Decodable, Equatable, Sendable {
        let x: CGFloat
        let y: CGFloat
        let size: CGFloat
        let tint: Int
        let delay: Double
    }

    struct Sparkles: Decodable, Equatable, Sendable {
        let inner: CGFloat
        let points: [SparklePoint]
    }

    let veins: Veins
    let beads: Beads
    let cabochons: Cabochons
    let rosette: Rosette
    let sunburst: Sunburst
    let stars: Stars
    let laurels: Laurels
    let crown: Crown
    let sparkles: Sparkles
}

extension MeeshCoinDecorGeometry {

    static let shared = MeeshCoinDecorGeometry(
        veins: Veins(width: 0.4, opacity: 0.42, paths: [
            "M4 52 C22 46 36 56 54 50 C72 44 88 40 116 46",
            "M10 86 C30 80 48 88 66 82 C84 76 98 80 112 72",
            "M44 6 C50 18 46 28 56 38",
        ]),
        beads: Beads(
            gold: [BeadRing(radius: 49.8, count: 96, dot: 0.55, startDeg: 0)],
            prism: [
                BeadRing(radius: 49.6, count: 90, dot: 0.5, startDeg: 2),
                BeadRing(radius: 55.6, count: 120, dot: 0.45, startDeg: 0),
            ]
        ),
        cabochons: Cabochons(count: 8, radius: 53, startDeg: 22.5, size: 2.5, table: 0.5),
        rosette: Rosette(count: 24, orbit: 13, radius: 13, width: 0.22, opacity: 0.45),
        sunburst: Sunburst(count: 64, inner: 4, margin: 2, short: 0.74, width: 0.3, opacity: 0.4),
        stars: Stars(points: 5, outer: 2.1, inner: 0.85),
        laurels: Laurels(
            mirrorX: 60,
            stem: "M43.2 96.8 Q34 95 31.8 81.5",
            stemWidth: 0.7,
            leaves: [
                Leaf(x: 41.43, y: 96.32, angle: 159.3, length: 4.4, width: 1.5),
                Leaf(x: 41.43, y: 96.32, angle: 239.3, length: 4.4, width: 1.5),
                Leaf(x: 38.31, y: 94.67, angle: 176.8, length: 4.2, width: 1.46),
                Leaf(x: 38.31, y: 94.67, angle: 256.8, length: 4.2, width: 1.46),
                Leaf(x: 35.75, y: 92.08, angle: 193.3, length: 4.0, width: 1.42),
                Leaf(x: 35.75, y: 92.08, angle: 273.3, length: 4.0, width: 1.42),
                Leaf(x: 33.75, y: 88.55, angle: 206.7, length: 3.8, width: 1.38),
                Leaf(x: 33.75, y: 88.55, angle: 286.7, length: 3.8, width: 1.38),
                Leaf(x: 31.8, y: 81.5, angle: 260.7, length: 3.6, width: 1.25),
            ]
        ),
        crown: Crown(
            body: "M49 42.5 L48 33.0 L53.5 37.0 L56.5 31.0 L60 35.0 L63.5 31.0 L66.5 37.0 L72 33.0 L71 42.5 Z",
            band: "M48.6 42.5 L71.4 42.5 L71.4 45.1 L48.6 45.1 Z",
            width: 0.5,
            jewels: [
                Jewel(x: 48, y: 33.0, r: 0.9),
                Jewel(x: 56.5, y: 31.0, r: 0.9),
                Jewel(x: 63.5, y: 31.0, r: 0.9),
                Jewel(x: 72, y: 33.0, r: 0.9),
                Jewel(x: 60, y: 43.8, r: 1.05),
                Jewel(x: 54, y: 43.8, r: 0.7),
                Jewel(x: 66, y: 43.8, r: 0.7),
            ]
        ),
        sparkles: Sparkles(inner: 0.22, points: [
            SparklePoint(x: 38, y: 44, size: 3.2, tint: 0, delay: 0),
            SparklePoint(x: 82, y: 30, size: 2.6, tint: 1, delay: 0.37),
            SparklePoint(x: 88, y: 74, size: 3.4, tint: 0, delay: 0.74),
            SparklePoint(x: 33, y: 80, size: 2.4, tint: 2, delay: 1.11),
            SparklePoint(x: 70, y: 88, size: 2.8, tint: 0, delay: 1.48),
            SparklePoint(x: 94, y: 52, size: 2, tint: 3, delay: 1.85),
            SparklePoint(x: 26, y: 58, size: 2.2, tint: 1, delay: 2.22),
            SparklePoint(x: 52, y: 22, size: 1.8, tint: 4, delay: 2.59),
        ])
    )
}
