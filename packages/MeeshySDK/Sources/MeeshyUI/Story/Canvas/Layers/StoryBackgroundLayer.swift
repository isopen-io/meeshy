import UIKit
import AVFoundation
import MeeshySDK

/// Affine transform applied to the background layer (zoom + pan + rotation).
/// Mirrors `StoryBackgroundTransform` from the SDK schema, in render-space.
///
/// All members are `nonisolated` so the struct can be used freely from both
/// the MeeshyUI (defaultIsolation MainActor) and nonisolated contexts.
public struct BackgroundTransform: Sendable, Equatable {
    public nonisolated var scale: Double
    public nonisolated var offsetX: Double
    public nonisolated var offsetY: Double
    public nonisolated var rotation: Double  // degrees

    public nonisolated init(scale: Double = 1.0, offsetX: Double = 0,
                            offsetY: Double = 0, rotation: Double = 0) {
        self.scale = scale
        self.offsetX = offsetX
        self.offsetY = offsetY
        self.rotation = rotation
    }

    public nonisolated static let identity = BackgroundTransform()

    public nonisolated func caTransform() -> CATransform3D {
        let r = CGFloat(rotation * .pi / 180)
        var t = CATransform3DIdentity
        t = CATransform3DTranslate(t, CGFloat(offsetX), CGFloat(offsetY), 0)
        t = CATransform3DRotate(t, r, 0, 0, 1)
        t = CATransform3DScale(t, CGFloat(scale), CGFloat(scale), 1)
        return t
    }
}

/// Visual background of the story canvas (color/gradient/image+thumbHash/video).
/// Lives below `itemsContainer` in `StoryCanvasUIView.rootLayer`.
/// Lifecycle aware: pause/resume video on app background/foreground.
///
/// Uses `nonisolated` inits to interop with `CALayer`'s nonisolated initializers
/// (MeeshyUI module applies `defaultIsolation(MainActor)`).
public final class StoryBackgroundLayer: CALayer, @unchecked Sendable {
    public enum Kind: Sendable {
        case solidColor(UIColor)
        case gradient(colors: [UIColor], direction: GradientDirection)
        case image(postMediaId: String, thumbHash: String?)
        case video(postMediaId: String, looping: Bool, mute: Bool)
    }

    public enum GradientDirection: Sendable, Equatable {
        case topToBottom, leftToRight, topLeftToBottomRight
    }

    public private(set) nonisolated(unsafe) var kind: Kind = .solidColor(.black)
    public private(set) nonisolated(unsafe) var transform3D: BackgroundTransform = BackgroundTransform()

    nonisolated(unsafe) var contentLayer: CALayer?
    nonisolated(unsafe) var avPlayer: AVPlayer?
    nonisolated(unsafe) var avPlayerLayer: AVPlayerLayer?
    nonisolated(unsafe) var avPlayerLooper: AVPlayerLooper?

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryBackgroundLayer does not support NSCoder")
    }
}
