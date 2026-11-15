import Foundation
import QuartzCore
import PencilKit
import UIKit
import MeeshySDK

// MARK: - Le calque de dessin d'une slide

extension StoryRenderer {
    /// Le dessin persisté de la slide, en UN calque au-dessus des objets
    /// (zPosition 9999), ou `nil` quand la slide n'en a pas ou qu'il est
    /// `suppressed`.
    ///
    /// Les traits sont dans l'espace design (1080×1920) et l'image s'étire au
    /// `renderSize`. Rastériser coûte une image pleine taille × l'échelle de
    /// l'écran : avec un `cache`, le MÊME calque est resservi tant que les
    /// traits, les données legacy, l'échelle et la taille ne changent pas — une
    /// fois par lecture au lieu d'une fois par image (#9865), et une fois par
    /// export au lieu d'une fois par image encodée. Masqué (le composer pendant
    /// que l'auteur dessine), il rend son bitmap au lieu de le garder retenu.
    @MainActor
    static func drawingOverlay(for effects: StoryEffects,
                               geometry: CanvasGeometry,
                               contentsScale: CGFloat,
                               cache: StoryRendererCache?,
                               suppressed: Bool) -> CALayer? {
        guard !suppressed else {
            cache?.releaseDrawing()
            return nil
        }
        let build = { () -> CALayer? in
            guard let image = bakedDrawingImage(for: effects, scale: contentsScale) else { return nil }
            let layer = CALayer()
            layer.frame = CGRect(origin: .zero, size: geometry.renderSize)
            layer.contents = image.cgImage
            layer.contentsScale = contentsScale
            layer.zPosition = 9999
            return layer
        }
        guard let cache else { return build() }
        return cache.drawingLayer(strokes: effects.drawingStrokes, data: effects.drawingData,
                                  scale: contentsScale, renderSize: geometry.renderSize, build: build)
    }

    /// Bake du dessin d'un slide en image (espace design 1080×1920). Privilégie
    /// `drawingStrokes` (moderne, rasterisé) ; fallback `drawingData` (legacy
    /// PKDrawing) seulement quand aucun trait moderne n'est présent (stories
    /// publiées avant la refonte du 2026-05-30, jamais re-décodées côté client).
    private static func bakedDrawingImage(for effects: StoryEffects, scale: CGFloat) -> UIImage? {
        if let strokes = effects.drawingStrokes, !strokes.isEmpty {
            return StoryStrokeRasterizer.image(strokes: strokes,
                                               designSize: CanvasGeometry.designSize,
                                               scale: scale)
        }
        if let data = effects.drawingData, let drawing = try? PKDrawing(data: data) {
            return drawing.image(
                from: CGRect(origin: .zero, size: CanvasGeometry.designSize),
                scale: scale
            )
        }
        return nil
    }
}
