import Foundation

/// Centralized helper for generating and validating `clientMessageId` values.
///
/// Format : `cid_<UUID v4 lowercase>` — prefix `cid_` differentiates from MongoDB
/// ObjectIds (24 hex chars) and from any legacy `temp_/offline_/retry_*` ids.
///
/// Swift's `UUID().uuidString` produces UPPERCASE hex by default; the gateway
/// regex `^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`
/// only accepts lowercase, so `.lowercased()` is mandatory.
///
/// Mirror of `packages/shared/utils/client-message-id.ts` (single source of truth
/// for the format across web + gateway + iOS).
public enum ClientMessageId {

    /// Generate a fresh `cid_<uuid>` identifier (always lowercase).
    ///
    /// - Returns: a 40-char string of the form `cid_<8>-<4>-<4>-<4>-<12>`.
    public static func generate() -> String {
        return "cid_\(UUID().uuidString.lowercased())"
    }

    /// Regex anchored on a strict UUID v4 format with mandatory `cid_` prefix
    /// and lowercase hex. Identical to `CLIENT_MESSAGE_ID_REGEX` in shared/utils.
    public static let regexPattern =
        #"^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"#

    /// Returns `true` when `value` matches the canonical `cid_<uuid v4 lowercase>` format.
    public static func isValid(_ value: String) -> Bool {
        guard let regex = try? NSRegularExpression(pattern: regexPattern) else { return false }
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return regex.firstMatch(in: value, range: range) != nil
    }
}
