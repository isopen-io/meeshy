import Foundation
import CoreGraphics

/// Value type that captures the px-per-second contract used by every timeline
/// view. Pure & deterministic — never depends on UIScreen or runtime metrics.
///
/// All members are `nonisolated` so this type can be used freely from any
/// actor context despite MeeshyUI's `defaultIsolation = .mainActor`.
public struct TimelineGeometry: Equatable, Sendable {

    public nonisolated static let basePixelsPerSecond: CGFloat = 50

    public let zoomScale: CGFloat

    public nonisolated init(zoomScale: CGFloat) {
        self.zoomScale = max(0.05, zoomScale)
    }

    public nonisolated var pixelsPerSecond: CGFloat {
        Self.basePixelsPerSecond * zoomScale
    }

    public nonisolated func x(for time: Float) -> CGFloat {
        CGFloat(time) * pixelsPerSecond
    }

    public nonisolated func time(forX x: CGFloat) -> Float {
        Float(x / pixelsPerSecond)
    }

    public nonisolated func width(for duration: Float) -> CGFloat {
        CGFloat(duration) * pixelsPerSecond
    }

    /// 6 points of finger tolerance, recomputed from current zoom.
    public nonisolated var snapToleranceSeconds: Float {
        Float(6.0 / pixelsPerSecond)
    }
}
