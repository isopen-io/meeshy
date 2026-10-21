import CoreGraphics

nonisolated enum ColumnWidthLaw {
    static let minimumWidth: Double = 320
    static let maximumWidth: Double = 480
    static let defaultRatio: Double = 0.38
    static let accessibilityStep: Double = 16

    static func width(ratio: Double, windowWidth: Double) -> Double {
        guard ratio.isFinite, windowWidth.isFinite, windowWidth > 0 else { return minimumWidth }
        return clamped(ratio * windowWidth)
    }

    static func dragged(from start: Double, translation: Double, windowWidth: Double) -> Double {
        guard windowWidth.isFinite, windowWidth > 0, translation.isFinite else { return start }
        return clamped(width(ratio: start, windowWidth: windowWidth) + translation) / windowWidth
    }

    static func stepped(_ ratio: Double, by steps: Int, windowWidth: Double) -> Double {
        dragged(from: ratio, translation: Double(steps) * accessibilityStep, windowWidth: windowWidth)
    }

    private static func clamped(_ width: Double) -> Double {
        min(maximumWidth, max(minimumWidth, width))
    }
}
