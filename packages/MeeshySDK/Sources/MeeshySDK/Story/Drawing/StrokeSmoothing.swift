import Foundation
import CoreGraphics

// MARK: - CatmullRomSmoother

/// Interpolation Catmull-Rom uniforme : génère une courbe lisse qui passe par chaque
/// point d'entrée. Utilisé pour le mode `StrokeSmoothing.curve` afin d'adoucir un
/// trait capturé point-à-point. Pour le mode `.line`, voir `RamerDouglasPeucker`.
///
/// Algorithme :
/// - 0 ou 1 point : retour identique (rien à interpoler).
/// - 2 points : retour identique (déjà un segment droit ; le lissage ne change rien).
/// - 3+ points : entre chaque paire consécutive `(P_i, P_{i+1})`, on génère
///   `samplesPerSegment` points intermédiaires en utilisant `P_{i-1}` et `P_{i+2}`
///   comme contraintes de tangence (avec duplication aux bornes). Les endpoints du
///   tracé sont **toujours préservés** à l'identique.
public enum CatmullRomSmoother {

    public static func smooth(_ points: [CGPoint], samplesPerSegment: Int = 8) -> [CGPoint] {
        guard points.count >= 3 else { return points }
        guard samplesPerSegment >= 1 else { return points }

        var result: [CGPoint] = [points[0]]
        let n = points.count

        for i in 0..<(n - 1) {
            let p0 = i == 0 ? points[i] : points[i - 1]
            let p1 = points[i]
            let p2 = points[i + 1]
            let p3 = (i + 2) < n ? points[i + 2] : points[i + 1]

            for s in 1...samplesPerSegment {
                let t = CGFloat(s) / CGFloat(samplesPerSegment)
                let t2 = t * t
                let t3 = t2 * t

                let x = 0.5 * (
                    (2 * p1.x) +
                    (-p0.x + p2.x) * t +
                    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
                )
                let y = 0.5 * (
                    (2 * p1.y) +
                    (-p0.y + p2.y) * t +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
                )

                result.append(CGPoint(x: x, y: y))
            }
        }

        return result
    }

    /// Variante porteuse de largeur : applique la MÊME base Catmull-Rom au scalaire
    /// `widths` en lockstep avec x/y (mêmes `t`, mêmes indices de contrôle). Les
    /// endpoints conservent leur largeur source. Utilisée par le rendu largeur-variable
    /// (`StrokePathBuilder.renderWidthPoints`). La géométrie produite est identique à
    /// `smooth(_:samplesPerSegment:)` (overload, pas remplacement).
    public static func smooth(_ points: [CGPoint],
                              widths: [CGFloat],
                              samplesPerSegment: Int = 8) -> (points: [CGPoint], widths: [CGFloat]) {
        guard points.count >= 3, points.count == widths.count else { return (points, widths) }
        guard samplesPerSegment >= 1 else { return (points, widths) }

        var resultPoints: [CGPoint] = [points[0]]
        var resultWidths: [CGFloat] = [widths[0]]
        let n = points.count

        for i in 0..<(n - 1) {
            let p0 = i == 0 ? points[i] : points[i - 1]
            let p1 = points[i]
            let p2 = points[i + 1]
            let p3 = (i + 2) < n ? points[i + 2] : points[i + 1]

            let w0 = i == 0 ? widths[i] : widths[i - 1]
            let w1 = widths[i]
            let w2 = widths[i + 1]
            let w3 = (i + 2) < n ? widths[i + 2] : widths[i + 1]

            for s in 1...samplesPerSegment {
                let t = CGFloat(s) / CGFloat(samplesPerSegment)
                let t2 = t * t
                let t3 = t2 * t

                let x = 0.5 * (
                    (2 * p1.x) +
                    (-p0.x + p2.x) * t +
                    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
                )
                let y = 0.5 * (
                    (2 * p1.y) +
                    (-p0.y + p2.y) * t +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
                )
                let w = 0.5 * (
                    (2 * w1) +
                    (-w0 + w2) * t +
                    (2 * w0 - 5 * w1 + 4 * w2 - w3) * t2 +
                    (-w0 + 3 * w1 - 3 * w2 + w3) * t3
                )

                resultPoints.append(CGPoint(x: x, y: y))
                resultWidths.append(w)
            }
        }

        return (resultPoints, resultWidths)
    }
}

// MARK: - RamerDouglasPeucker

/// Simplification Ramer-Douglas-Peucker : réduit une polyligne à son squelette
/// minimal en supprimant les points dont la distance perpendiculaire à la corde
/// approximante est inférieure à `tolerance`. Utilisé pour le mode
/// `StrokeSmoothing.line` afin de transformer un trait tremblant en segments droits
/// nets (les coins sont préservés tant qu'ils dévient plus que la tolérance).
///
/// - Tolérance 0 ⇒ retour identique (algorithme désactivé).
/// - Tolérance immense ⇒ collapse aux deux endpoints (ligne droite pure).
/// - Endpoints **toujours** préservés.
public enum RamerDouglasPeucker {

    public static func straighten(_ points: [CGPoint], tolerance: CGFloat = 8) -> [CGPoint] {
        guard points.count > 2 else { return points }
        guard tolerance > 0 else { return points }
        return simplify(points, tolerance: tolerance)
    }

    /// Variante porteuse de largeur : simplifie sur la GÉOMÉTRIE uniquement (mêmes points
    /// conservés que `straighten(_:tolerance:)`) en transportant un index à travers la
    /// récursion, si bien que chaque point conservé garde sa largeur source. Overload, pas
    /// remplacement.
    public static func straighten(_ points: [CGPoint],
                                  widths: [CGFloat],
                                  tolerance: CGFloat = 8) -> (points: [CGPoint], widths: [CGFloat]) {
        guard points.count > 2, points.count == widths.count else { return (points, widths) }
        guard tolerance > 0 else { return (points, widths) }
        let keptIndices = simplifyIndices(points, indices: Array(points.indices), tolerance: tolerance)
        return (keptIndices.map { points[$0] }, keptIndices.map { widths[$0] })
    }

    /// Variante de `simplify` qui opère sur des indices (référant `points` global) afin de
    /// transporter la largeur des points conservés sans la recalculer.
    private static func simplifyIndices(_ points: [CGPoint],
                                        indices: [Int],
                                        tolerance: CGFloat) -> [Int] {
        let n = indices.count
        guard n > 2 else { return indices }

        let first = points[indices[0]]
        let last = points[indices[n - 1]]

        var maxDistance: CGFloat = 0
        var maxIndex = 0

        for i in 1..<(n - 1) {
            let d = perpendicularDistance(points[indices[i]], from: first, to: last)
            if d > maxDistance {
                maxDistance = d
                maxIndex = i
            }
        }

        if maxDistance > tolerance {
            let left = simplifyIndices(points, indices: Array(indices[0...maxIndex]), tolerance: tolerance)
            let right = simplifyIndices(points, indices: Array(indices[maxIndex..<n]), tolerance: tolerance)
            return left + right.dropFirst()
        } else {
            return [indices[0], indices[n - 1]]
        }
    }

    private static func simplify(_ points: [CGPoint], tolerance: CGFloat) -> [CGPoint] {
        let n = points.count
        guard n > 2 else { return points }

        let first = points[0]
        let last = points[n - 1]

        var maxDistance: CGFloat = 0
        var maxIndex = 0

        for i in 1..<(n - 1) {
            let d = perpendicularDistance(points[i], from: first, to: last)
            if d > maxDistance {
                maxDistance = d
                maxIndex = i
            }
        }

        if maxDistance > tolerance {
            let left = simplify(Array(points[0...maxIndex]), tolerance: tolerance)
            let right = simplify(Array(points[maxIndex..<n]), tolerance: tolerance)
            return left + right.dropFirst()
        } else {
            return [first, last]
        }
    }

    /// Distance perpendiculaire d'un point `p` à la droite (a, b).
    /// Si `a == b`, la "droite" dégénère en un point — on retourne la distance euclidienne.
    private static func perpendicularDistance(_ p: CGPoint, from a: CGPoint, to b: CGPoint) -> CGFloat {
        let dx = b.x - a.x
        let dy = b.y - a.y
        if dx == 0 && dy == 0 {
            return hypot(p.x - a.x, p.y - a.y)
        }
        let numerator = abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x)
        let denominator = hypot(dx, dy)
        return numerator / denominator
    }
}
