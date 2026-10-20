import UIKit

nonisolated public struct DisplayMetrics: Equatable, Sendable {
    public let points: CGSize
    public let scale: CGFloat

    public init(points: CGSize, scale: CGFloat) {
        self.points = points
        self.scale = scale
    }
}

nonisolated public enum DecodeBudget {
    nonisolated public enum Surface: Equatable, Sendable {
        case fullscreen
        case fitting(CGSize)
        case fullBleed(height: CGFloat)
    }

    nonisolated public static func maxPixelWidth(for surface: Surface, on display: DisplayMetrics) -> CGFloat {
        switch surface {
        case .fullscreen:
            return display.points.width * display.scale
        case .fitting(let size):
            return max(size.width, size.height) * display.scale
        case .fullBleed(let height):
            return max(display.points.width, height) * display.scale
        }
    }

    nonisolated public static func targetWidthPx(for surface: Surface, on display: DisplayMetrics) -> Int {
        Int(maxPixelWidth(for: surface, on: display).rounded())
    }
}

extension DecodeBudget {
    @MainActor public static func maxPixelWidth(for surface: Surface) -> CGFloat {
        maxPixelWidth(for: surface, on: WindowMetrics.physicalDisplay)
    }

    @MainActor public static func targetWidthPx(for surface: Surface) -> Int {
        targetWidthPx(for: surface, on: WindowMetrics.physicalDisplay)
    }
}
