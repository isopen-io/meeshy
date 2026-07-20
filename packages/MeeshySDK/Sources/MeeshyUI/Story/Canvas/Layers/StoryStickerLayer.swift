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
                          mode: RenderMode) {
        self.sticker = sticker

        let designSize = CGFloat(sticker.baseSize * sticker.scale)
        let renderedSide = geometry.render(designSize)

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
        contentsScale = UIScreen.main.scale
        name = sticker.id

        // Stickers are pre-rasterized via StoryStickerRasterizer; in .play we
        // additionally flag the layer for the GPU rasterization fast path.
        shouldRasterize = mode == .play && sticker.isStatic
        if shouldRasterize { rasterizationScale = UIScreen.main.scale }
    }
}
