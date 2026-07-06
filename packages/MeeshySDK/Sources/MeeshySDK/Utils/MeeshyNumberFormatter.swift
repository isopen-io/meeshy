import Foundation

/// Centralized number formatting for Meeshy UI (k/M/B suffixes).
/// Matches HIG expectations for dense UI elements like view counts and likes.
public enum MeeshyNumberFormatter {

    /// Formats a number with k/M/B suffixes and 1 decimal place if needed.
    /// Example: 1234 -> "1.2k", 1234567 -> "1.2M"
    /// Fully localized through String Catalogs.
    public static func formatCompact(_ value: Int) -> String {
        let doubleValue = Double(value)

        if value >= 1_000_000_000 {
            let val = String(format: "%.1f", doubleValue / 1_000_000_000.0)
            return String(format: String(localized: "unit.billions", defaultValue: "%@B", bundle: .main), val)
        }

        if value >= 1_000_000 {
            let val = String(format: "%.1f", doubleValue / 1_000_000.0)
            return String(format: String(localized: "unit.millions", defaultValue: "%@M", bundle: .main), val)
        }

        if value >= 1_000 {
            let val = String(format: "%.1f", doubleValue / 1_000.0)
            return String(format: String(localized: "unit.thousands", defaultValue: "%@k", bundle: .main), val)
        }

        return "\(value)"
    }
}
