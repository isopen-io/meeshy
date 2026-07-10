import Foundation

/// Centralized number formatting for Meeshy UI (k/M/B suffixes).
/// Matches HIG expectations for dense UI elements like view counts and likes.
public enum MeeshyNumberFormatter {

    /// Formats a number with k/M/B suffixes and 1 decimal place if needed.
    /// Example: 1000 -> "1k", 1234 -> "1.2k", 1234567 -> "1.2M"
    /// Fully localized through String Catalogs.
    public static func formatCompact(_ value: Int) -> String {
        if value < 1000 { return "\(value)" }
        let doubleValue = Double(value)

        let divisor: Double
        let key: String
        let defaultSuffix: String

        if value >= 1_000_000_000 {
            divisor = 1_000_000_000.0
            key = "unit.billions"
            defaultSuffix = "B"
        } else if value >= 1_000_000 {
            divisor = 1_000_000.0
            key = "unit.millions"
            defaultSuffix = "M"
        } else {
            divisor = 1_000.0
            key = "unit.thousands"
            defaultSuffix = "k"
        }

        let normalized = doubleValue / divisor
        let formattedVal: String
        if normalized.truncatingRemainder(dividingBy: 1) == 0 {
            formattedVal = String(format: "%.0f", normalized)
        } else {
            formattedVal = String(format: "%.1f", normalized)
        }

        let format = String(localized: String.LocalizationValue(key), defaultValue: "%@\(defaultSuffix)", bundle: .main)
        return String(format: format, formattedVal)
    }
}
