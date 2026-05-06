import Foundation
import CoreGraphics
import MeeshySDK

// MARK: - Lerpable

/// Capability for linear interpolation between two values of the same type.
///
/// `t` is in `[0, 1]` and is **not** clamped by the protocol — the caller is
/// expected to clamp/ease before calling. The `KeyframeInterpolator` performs
/// clamping itself before invoking `lerp`.
public protocol Lerpable: Sendable {
    nonisolated static func lerp(from: Self, to: Self, t: Float) -> Self
}

extension Float: Lerpable {
    public nonisolated static func lerp(from: Float, to: Float, t: Float) -> Float {
        return from + (to - from) * t
    }
}

extension CGFloat: Lerpable {
    public nonisolated static func lerp(from: CGFloat, to: CGFloat, t: Float) -> CGFloat {
        return from + (to - from) * CGFloat(t)
    }
}

extension CGPoint: Lerpable {
    public nonisolated static func lerp(from: CGPoint, to: CGPoint, t: Float) -> CGPoint {
        return CGPoint(
            x: CGFloat.lerp(from: from.x, to: to.x, t: t),
            y: CGFloat.lerp(from: from.y, to: to.y, t: t)
        )
    }
}

extension CGSize: Lerpable {
    public nonisolated static func lerp(from: CGSize, to: CGSize, t: Float) -> CGSize {
        return CGSize(
            width:  CGFloat.lerp(from: from.width,  to: to.width,  t: t),
            height: CGFloat.lerp(from: from.height, to: to.height, t: t)
        )
    }
}
