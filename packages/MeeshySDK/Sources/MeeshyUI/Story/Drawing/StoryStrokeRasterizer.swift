import UIKit
import SwiftUI
import MeeshySDK

// MARK: - StoryStrokeRasterizer

/// Bake un `[StoryDrawingStroke]` en `UIImage` sur le canvas design (1080×1920).
/// Drop-in de remplacement du legacy `PKDrawing.image(from: CGRect(designSize), scale:)`
/// utilisé par les chemins de rendu (`StoryRenderer`, `StoryCanvasUIView` drawingLayer,
/// `SlideMiniPreview`). Les traits sont déjà en coords design → aucune projection ici ;
/// l'appelant place l'image dans une `CALayer.frame = renderSize` qui l'étire (comme
/// le legacy).
///
/// Atome pur (paramètres opaques, aucune dépendance aux singletons produit) → SDK-side
/// au sens SDK Purity, mais vit dans MeeshyUI car il dépend d'UIKit/`Color(hex:)`.
public enum StoryStrokeRasterizer {

    /// Rasterise les traits peignables. Les traits `.eraser` et les traits vides sont
    /// ignorés. Retourne `nil` si rien à peindre (l'appelant n'ajoute alors aucun layer).
    public static func image(strokes: [StoryDrawingStroke],
                             designSize: CGSize = CanvasGeometry.designSize,
                             scale: CGFloat) -> UIImage? {
        let paintable = strokes.filter { $0.tool != .eraser && !$0.points.isEmpty }
        guard !paintable.isEmpty else { return nil }
        guard designSize.width > 0, designSize.height > 0 else { return nil }

        let format = UIGraphicsImageRendererFormat()
        format.scale = max(1, scale)
        format.opaque = false

        let builder = VariableWidthStrokeBuilder()
        let renderer = UIGraphicsImageRenderer(size: designSize, format: format)
        return renderer.image { ctx in
            let cg = ctx.cgContext
            for stroke in paintable {
                draw(stroke, in: cg, builder: builder)
            }
        }
    }

    private static func draw(_ stroke: StoryDrawingStroke, in cg: CGContext, builder: VariableWidthStrokeBuilder) {
        let base = UIColor(Color(hex: stroke.colorHex))
        // Le marqueur est translucide (mirroir du legacy `PKInkingTool(.marker)` à 45%) ;
        // sa largeur ×2 est déjà portée par `StrokeWidthMapping.base` via le builder.
        let alpha: CGFloat = stroke.tool == .marker ? 0.45 : 1.0
        let widthPoints = StrokePathBuilder.renderWidthPoints(for: stroke)
        guard !widthPoints.isEmpty else { return }

        guard let ribbon = ribbonPath(from: builder.geometry(for: stroke).vertices,
                                      widthPoints: widthPoints) else { return }
        cg.setFillColor(base.withAlphaComponent(alpha).cgColor)
        cg.addPath(ribbon)
        cg.fillPath()
    }

    /// Construit le ruban fermé largeur-variable (même tessellation que le rendu live) :
    /// sommets gauche en avant, sommets droite en arrière, + bouchons ronds aux extrémités
    /// (rayon `firstWidth/2`, `lastWidth/2`) pour reproduire le `lineCap = .round` legacy.
    private static func ribbonPath(from vertices: [CGPoint],
                                   widthPoints: [StrokePathBuilder.StrokeWidthPoint]) -> CGPath? {
        guard !vertices.isEmpty else { return nil }
        let path = CGMutablePath()

        path.move(to: vertices[0])
        for i in stride(from: 2, to: vertices.count, by: 2) { path.addLine(to: vertices[i]) }
        for i in stride(from: vertices.count - 1, through: 1, by: -2) { path.addLine(to: vertices[i]) }
        path.closeSubpath()

        if let first = widthPoints.first {
            let r = max(0.5, first.width / 2)
            path.addEllipse(in: CGRect(x: first.point.x - r, y: first.point.y - r, width: r * 2, height: r * 2))
        }
        if let last = widthPoints.last, widthPoints.count > 1 {
            let r = max(0.5, last.width / 2)
            path.addEllipse(in: CGRect(x: last.point.x - r, y: last.point.y - r, width: r * 2, height: r * 2))
        }
        return path
    }
}
