import Foundation

/// Utility for converting ISO-3166-1 alpha-2 country codes to emoji flags.
public struct CountryFlag {

    /// Convert ISO-3166-1 alpha-2 country code to emoji flag.
    /// - Parameter countryCode: Two-letter country code (e.g., "FR", "US", "GB")
    /// - Returns: Unicode emoji flag or empty string if invalid
    ///
    /// Examples:
    /// - "FR" → "🇫🇷"
    /// - "US" → "🇺🇸"
    /// - "GB" → "🇬🇧"
    public static func emoji(for countryCode: String) -> String {
        let code = countryCode.uppercased()
        guard code.count == 2,
              code.allSatisfy({ $0.isASCII && $0.isLetter }) else {
            return ""
        }

        // Unicode regional indicator symbols start at U+1F1E6 (A)
        let base: UInt32 = 127397 // 0x1F1E6 - 0x41
        let scalars = code.unicodeScalars.compactMap {
            UnicodeScalar(base + $0.value)
        }

        guard scalars.count == 2 else { return "" }
        return String(String.UnicodeScalarView(scalars))
    }

    /// Get human-readable country name from ISO code (common mappings).
    /// This is a minimal implementation. For full i18n, use Locale APIs.
    public static func name(for countryCode: String) -> String? {
        let locale = Locale.current
        return locale.localizedString(forRegionCode: countryCode.uppercased())
    }
}
