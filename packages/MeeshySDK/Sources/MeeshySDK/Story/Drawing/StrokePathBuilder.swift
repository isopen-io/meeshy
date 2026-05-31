import Foundation
import CoreGraphics

// MARK: - StrokePathBuilder

/// Construit la géométrie de rendu d'un `StoryDrawingStroke` : applique le lissage
/// (`raw` / `curve` / `line`) puis assemble un `CGPath`. Pure-function, sans état —
/// partagé par tous les chemins de rendu (`MeeshyStrokeCanvas` SwiftUI,
/// `StoryStrokeRasterizer` UIImage bake, live canvas CALayer). Garde la cohérence
/// pixel entre l'aperçu composer, la miniature et le rendu final.
///
/// Les points sont dans l'espace design 1080×1920 (cf. `StoryDrawingStroke`) ; le
/// rendu applique sa propre transform design→render. Le builder ne projette rien.
public enum StrokePathBuilder {

    /// Applique le lissage du trait et retourne les points de rendu.
    /// - `.raw`   : points capturés tels quels.
    /// - `.curve` : interpolation Catmull-Rom (`CatmullRomSmoother`).
    /// - `.line`  : simplification Ramer-Douglas-Peucker (`RamerDouglasPeucker`).
    public static func renderPoints(for stroke: StoryDrawingStroke) -> [CGPoint] {
        let raw = stroke.points.map { CGPoint(x: $0.x, y: $0.y) }
        switch stroke.smoothing {
        case .raw:   return raw
        case .curve: return CatmullRomSmoother.smooth(raw)
        case .line:  return RamerDouglasPeucker.straighten(raw)
        }
    }

    /// Assemble un `CGPath` passant par les points de rendu.
    /// - 0 point  : chemin vide.
    /// - 1 point  : un point dégénéré (`move` + `addLine` sur lui-même) — rendu en
    ///   pastille pleine par le `lineCap = .round` du contexte de dessin.
    /// - 2+ points: polyligne.
    public static func path(for stroke: StoryDrawingStroke) -> CGPath {
        let points = renderPoints(for: stroke)
        let path = CGMutablePath()
        guard let first = points.first else { return path }
        path.move(to: first)
        guard points.count > 1 else {
            path.addLine(to: first)
            return path
        }
        for point in points.dropFirst() {
            path.addLine(to: point)
        }
        return path
    }
}
