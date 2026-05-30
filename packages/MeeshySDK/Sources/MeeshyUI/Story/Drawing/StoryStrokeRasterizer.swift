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

        let renderer = UIGraphicsImageRenderer(size: designSize, format: format)
        return renderer.image { ctx in
            let cg = ctx.cgContext
            cg.setLineCap(.round)
            cg.setLineJoin(.round)
            for stroke in paintable {
                draw(stroke, in: cg)
            }
        }
    }

    private static func draw(_ stroke: StoryDrawingStroke, in cg: CGContext) {
        let base = UIColor(Color(hex: stroke.colorHex))
        // Le marqueur est translucide et plus large (mirroir du legacy
        // `PKInkingTool(.marker, width: w*2)`). Le stylo est opaque.
        let alpha: CGFloat = stroke.tool == .marker ? 0.45 : 1.0
        let widthMultiplier: CGFloat = stroke.tool == .marker ? 2.0 : 1.0

        cg.setStrokeColor(base.withAlphaComponent(alpha).cgColor)
        cg.setLineWidth(max(1, CGFloat(stroke.width) * widthMultiplier))
        cg.addPath(StrokePathBuilder.path(for: stroke))
        cg.strokePath()
    }
}
