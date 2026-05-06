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
