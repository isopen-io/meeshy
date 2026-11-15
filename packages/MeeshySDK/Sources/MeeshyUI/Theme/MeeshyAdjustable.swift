import SwiftUI

public nonisolated enum MeeshyAdjustStep {

    public static let seconds: Double = 0.1
    public static let fraction: Double = 0.01

    public static func signed(_ step: Double, _ direction: AccessibilityAdjustmentDirection) -> Double? {
        switch direction {
        case .increment: return step
        case .decrement: return -step
        @unknown default: return nil
        }
    }

    public static func nudgedFraction(_ value: Double, _ direction: AccessibilityAdjustmentDirection) -> Double? {
        guard let delta = signed(fraction, direction) else { return nil }
        let next = min(1, max(0, ((value + delta) * 100).rounded() / 100))
        return next == value ? nil : next
    }
}

public nonisolated enum MeeshyAccessibleValue {

    public static func seconds(_ value: Double, locale: Locale = .autoupdatingCurrent) -> String {
        Measurement(value: value, unit: UnitDuration.seconds).formatted(
            .measurement(
                width: .wide,
                usage: .asProvided,
                numberFormatStyle: FloatingPointFormatStyle<Double>.number.precision(.fractionLength(0...1))
            )
            .locale(locale)
        )
    }

    public static func percent(_ fraction: Double, locale: Locale = .autoupdatingCurrent) -> String {
        fraction.formatted(.percent.precision(.fractionLength(0)).locale(locale))
    }
}
