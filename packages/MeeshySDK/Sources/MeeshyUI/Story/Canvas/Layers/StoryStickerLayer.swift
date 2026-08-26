import Foundation
import QuartzCore
import UIKit
import MeeshySDK

/// `CALayer` subclass that renders a `StorySticker` (single emoji glyph) as a
/// raster image cached by `StoryStickerRasterizer`.
///
/// `baseSize` is interpreted in design pixels (1080-référentiel) and projected
/// through `CanvasGeometry.render(_:)` so stickers retain identical visual
/// proportions across iPhone and iPad canvases.
public final class StoryStickerLayer: CALayer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public private(set) nonisolated(unsafe) var sticker: StorySticker?

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryStickerLayer does not support NSCoder")
    }

    @MainActor
    public func configure(with sticker: StorySticker,
                          geometry: CanvasGeometry,
                          mode: RenderMode,
                          renderScale: CGFloat = UIScreen.main.scale) {
        self.sticker = sticker

        // Règle partagée avec le composite et l'export — voir
        // `CanvasGeometry.stickerFontSize`, qui les faisait diverger.
        let renderedSide = CanvasGeometry.stickerFontSize(baseSize: sticker.baseSize,
                                                          scale: sticker.scale,
                                                          canvasWidth: geometry.renderSize.width)

        if let cg = StoryStickerRasterizer.shared.cgImage(for: sticker.emoji,
                                                           size: renderedSide) {
            contents = cg
        }

        bounds = CGRect(x: 0, y: 0, width: renderedSide, height: renderedSide)

        let designCenterX = geometry.designLength(forNormalized: CGFloat(sticker.x))
        let designCenterY = geometry.designHeightLength(forNormalized: CGFloat(sticker.y))
        position = geometry.render(CGPoint(x: designCenterX, y: designCenterY))
        anchorPoint = sticker.anchor
        transform = CATransform3DMakeRotation(CGFloat(sticker.rotation) * .pi / 180, 0, 0, 1)
        zPosition = CGFloat(sticker.zIndex)
        contentsScale = renderScale
        name = sticker.id

        // Stickers are pre-rasterized via StoryStickerRasterizer; in .play we
        // additionally flag the layer for the GPU rasterization fast path.
        shouldRasterize = mode == .play && sticker.isStatic
        if shouldRasterize { rasterizationScale = renderScale }
    }
}
