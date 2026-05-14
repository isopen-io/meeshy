import Foundation

/// Centralized helper for generating and validating `clientMutationId` values.
///
/// Format : `cmid_<UUID v4 lowercase>` — prefix `cmid_` differentiates from
/// `clientMessageId` (`cid_*`, message-specific) and from MongoDB ObjectIds.
///
/// Used by the offline outbox for *non-message* write mutations (Wave 1 Task
/// 3.x): markAsRead, friend requests, profile updates, post likes, etc.
/// Generated on the client, persisted in the outbox row, and echoed back to
/// the gateway in the mutation envelope. The gateway looks up
/// `(userId, clientMutationId)` in `MutationLog` and replays the recorded
/// result instead of re-applying the mutation. Server regex contract:
/// `^cmid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`.
///
/// Swift's `UUID().uuidString` produces UPPERCASE hex by default; the regex
/// only accepts lowercase, so `.lowercased()` is mandatory.
public enum ClientMutationId {

    /// Generate a fresh `cmid_<uuid>` identifier (always lowercase).
    ///
    /// - Returns: a 41-char string of the form `cmid_<8>-<4>-<4>-<4>-<12>`.
    public static func generate() -> String {
        return "cmid_\(UUID().uuidString.lowercased())"
    }

    /// Regex anchored on a strict UUID v4 format with mandatory `cmid_` prefix
    /// and lowercase hex. Server side will mirror this pattern in Zod.
    public static let regexPattern =
        #"^cmid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"#

    /// Cached regex compiled once at type-init time. `isValid` is called on
    /// the hot path (every outbox flush validates the cmid), so re-compiling
    /// on each call would be wasteful.
    private static let compiledRegex: NSRegularExpression? =
        try? NSRegularExpression(pattern: regexPattern)

    /// Returns `true` when `value` matches the canonical `cmid_<uuid v4 lowercase>` format.
    public static func isValid(_ value: String) -> Bool {
        guard let regex = compiledRegex else { return false }
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return regex.firstMatch(in: value, range: range) != nil
    }
}
