import Foundation
import CoreGraphics
import MeeshySDK

// MARK: - Canvas Reprojector

/// Reprojects canvas object positions from one aspect ratio to another.
/// Positions are normalized [0,1] in both source and target.
/// The center (0.5, 0.5) is always preserved; objects outside [0,1] in the target
/// are clamped with a `.clamped` warning. Scale, aspectRatio, and rotation are invariant.
public struct CanvasReprojector: Sendable {
    public let sourceSize: CGSize
    public let targetSize: CGSize

    public init(from sourceSize: CGSize, to targetSize: CGSize) {
        self.sourceSize = sourceSize
        self.targetSize = targetSize
    }

    // MARK: - Projected result

    public struct ReprojectedItem<T>: Sendable where T: Sendable {
        public let value: T
        public let warning: ReprojectionWarning?
    }

    public enum ReprojectionWarning: Sendable, Equatable {
        case clamped(originalX: Double, originalY: Double)
    }

    // MARK: - Reproject typed objects

    public func reproject(text: StoryTextObject) -> ReprojectedItem<StoryTextObject> {
        let (nx, ny, w) = reprojectNormalized(x: text.x, y: text.y)
        var copy = text
        copy.x = nx
        copy.y = ny
        return ReprojectedItem(value: copy, warning: w)
    }

    public func reproject(sticker: StorySticker) -> ReprojectedItem<StorySticker> {
        let (nx, ny, w) = reprojectNormalized(x: sticker.x, y: sticker.y)
        var copy = sticker
        copy.x = nx
        copy.y = ny
        return ReprojectedItem(value: copy, warning: w)
    }

    public func reproject(media: StoryMediaObject) -> ReprojectedItem<StoryMediaObject> {
        let (nx, ny, w) = reprojectNormalized(x: media.x, y: media.y)
        var copy = media
        copy.x = nx
        copy.y = ny
        return ReprojectedItem(value: copy, warning: w)
    }

    /// Audio has no spatial position — pass-through identity.
    public func reproject(audio: StoryAudioPlayerObject) -> ReprojectedItem<StoryAudioPlayerObject> {
        ReprojectedItem(value: audio, warning: nil)
    }

    // MARK: - Core geometry

    /// Maps a normalized position from source space to target space,
    /// anchored at center (0.5, 0.5). Returns the clamped result and an
    /// optional `.clamped` warning when the projected value falls outside [0,1].
    private func reprojectNormalized(x: Double, y: Double) -> (Double, Double, ReprojectionWarning?) {
        let scaleX = sourceSize.width / targetSize.width
        let scaleY = sourceSize.height / targetSize.height
        let projectedX = 0.5 + (x - 0.5) * scaleX
        let projectedY = 0.5 + (y - 0.5) * scaleY
        let needsClamp = projectedX < 0 || projectedX > 1 || projectedY < 0 || projectedY > 1
        let clampedX = min(max(projectedX, 0), 1)
        let clampedY = min(max(projectedY, 0), 1)
        return (clampedX, clampedY, needsClamp ? .clamped(originalX: x, originalY: y) : nil)
    }
}
