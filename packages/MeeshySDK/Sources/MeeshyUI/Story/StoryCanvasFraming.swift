import Foundation
import CoreGraphics

/// Pure, `nonisolated` framing solver for the story canvas **container transform**.
/// The canvas keeps fixed intrinsic 9:16 bounds (`CanvasGeometry.aspectFitSize` of the
/// full viewport); this helper computes the `scale`/`offset`/`cornerRadius` a SwiftUI
/// container applies to place it in the free region `[headerInset … viewport.height - bottomInset]`.
/// Shared by composer and reader. No SwiftUI/UIKit/main-actor → unit-testable off-main.
public nonisolated enum StoryCanvasFraming {

    public enum Presentation: Equatable, Sendable { case free, carded, immersive }

    public struct Input: Equatable, Sendable {
        public let viewport: CGSize
        public let headerInset: CGFloat
        public let bottomInset: CGFloat
        public let state: Presentation
        public let cardedCornerRadius: CGFloat
        public init(viewport: CGSize, headerInset: CGFloat, bottomInset: CGFloat,
                    state: Presentation, cardedCornerRadius: CGFloat) {
            self.viewport = viewport; self.headerInset = headerInset
            self.bottomInset = bottomInset; self.state = state
            self.cardedCornerRadius = cardedCornerRadius
        }
    }

    public struct Result: Equatable, Sendable {
        public let scale: CGFloat
        public let offset: CGSize
        public let cornerRadius: CGFloat
        public init(scale: CGFloat, offset: CGSize, cornerRadius: CGFloat) {
            self.scale = scale; self.offset = offset; self.cornerRadius = cornerRadius
        }
        static let identity = Result(scale: 1, offset: .zero, cornerRadius: 0)
    }

    /// Truth-table helper for `canvasIsCarded`.
    public static func isCarded(bandPresent: Bool, drawingActive: Bool, textActive: Bool) -> Bool {
        bandPresent || drawingActive || textActive
    }

    public static func resolve(_ input: Input) -> Result {
        guard input.state == .carded else { return .identity }
        let intrinsic = CanvasGeometry.aspectFitSize(in: input.viewport)
        guard intrinsic.width > 0, intrinsic.height > 0,
              input.viewport.width > 0, input.viewport.height > 0 else { return .identity }

        let regionTop = max(0, input.headerInset)
        let regionBottom = max(regionTop, input.viewport.height - max(0, input.bottomInset))
        let regionHeight = max(0, regionBottom - regionTop)
        guard regionHeight > 0 else { return .identity }

        let rawScale = regionHeight / intrinsic.height
        let scale = min(1, max(0, rawScale))

        let regionCenterY = regionTop + regionHeight / 2
        let offsetY = regionCenterY - input.viewport.height / 2
        let corner = scale < 1 ? input.cardedCornerRadius : 0
        return Result(scale: scale, offset: CGSize(width: 0, height: offsetY), cornerRadius: corner)
    }
}
