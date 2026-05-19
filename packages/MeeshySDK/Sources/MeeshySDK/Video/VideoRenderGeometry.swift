import Foundation
import CoreGraphics

/// Pure geometry for the render pass: turns a crop rect + rotation into a
/// CoreImage transform and an output canvas size.
///
/// Kept free of AVFoundation so it can be unit-tested in isolation — the
/// transform math is the single most fragile part of the export pipeline.
///
/// Coordinate space: CoreImage uses a bottom-left origin. `NormalizedRect`
/// uses a top-left origin (matches the UI / SwiftUI crop overlay), so the
/// vertical axis is flipped during conversion.
public struct VideoRenderGeometry: Sendable, Equatable {
    /// Output canvas size in pixels (always even for encoder friendliness).
    public let renderSize: CGSize
    /// Transform applied to the source `CIImage` before cropping to
    /// `[0, 0, renderSize]`.
    public let transform: CGAffineTransform

    public init(renderSize: CGSize, transform: CGAffineTransform) {
        self.renderSize = renderSize
        self.transform = transform
    }

    /// Builds the geometry for a source frame.
    ///
    /// - Parameters:
    ///   - naturalSize: display-oriented size of the source video.
    ///   - crop: visible region in 0...1, top-left origin.
    ///   - rotationQuarterTurns: extra clockwise rotation (0...3).
    public static func make(
        naturalSize: CGSize,
        crop: NormalizedRect,
        rotationQuarterTurns: Int
    ) -> VideoRenderGeometry {
        let width = max(1, naturalSize.width)
        let height = max(1, naturalSize.height)
        let safeCrop = crop.sanitized
        let turns = ((rotationQuarterTurns % 4) + 4) % 4

        // Crop rect in CoreImage space (bottom-left origin).
        let cropW = safeCrop.width * width
        let cropH = safeCrop.height * height
        let cropX = safeCrop.x * width
        let cropY = (1.0 - safeCrop.y - safeCrop.height) * height

        // 1. Translate so the crop's bottom-left corner sits at the origin.
        let cropTransform = CGAffineTransform(translationX: -cropX, y: -cropY)

        // 2. Rotate clockwise — negative angle in CoreImage's y-up space.
        let angle = -Double(turns) * .pi / 2.0
        let rotation = CGAffineTransform(rotationAngle: CGFloat(angle))

        // 3. Normalize: bring the rotated crop rectangle back into the
        //    positive quadrant and measure its bounding box.
        let corners = [
            CGPoint(x: 0, y: 0),
            CGPoint(x: cropW, y: 0),
            CGPoint(x: 0, y: cropH),
            CGPoint(x: cropW, y: cropH)
        ].map { $0.applying(rotation) }

        let minX = corners.map(\.x).min() ?? 0
        let minY = corners.map(\.y).min() ?? 0
        let maxX = corners.map(\.x).max() ?? cropW
        let maxY = corners.map(\.y).max() ?? cropH

        let normalize = CGAffineTransform(translationX: -minX, y: -minY)
        let total = cropTransform
            .concatenating(rotation)
            .concatenating(normalize)

        let rawWidth = maxX - minX
        let rawHeight = maxY - minY
        let renderSize = CGSize(
            width: evenDimension(rawWidth),
            height: evenDimension(rawHeight)
        )
        return VideoRenderGeometry(renderSize: renderSize, transform: total)
    }

    /// Rounds a dimension up to the nearest even integer — H.264 / HEVC
    /// encoders reject odd pixel dimensions.
    private static func evenDimension(_ value: CGFloat) -> CGFloat {
        let rounded = max(2, value.rounded())
        return rounded.truncatingRemainder(dividingBy: 2) == 0 ? rounded : rounded + 1
    }
}

// MARK: - Aspect-ratio cropping

extension NormalizedRect {
    /// A centered crop that fits `targetAspect` (width / height) inside a
    /// source frame whose aspect ratio is `sourceAspect`.
    public static func centered(
        targetAspect: Double,
        sourceAspect: Double
    ) -> NormalizedRect {
        guard targetAspect > 0, sourceAspect > 0 else { return .full }
        if targetAspect >= sourceAspect {
            // Constrain by width — crop top & bottom.
            let height = sourceAspect / targetAspect
            return NormalizedRect(x: 0, y: (1 - height) / 2, width: 1, height: height)
        } else {
            // Constrain by height — crop left & right.
            let width = targetAspect / sourceAspect
            return NormalizedRect(x: (1 - width) / 2, y: 0, width: width, height: 1)
        }
    }
}
