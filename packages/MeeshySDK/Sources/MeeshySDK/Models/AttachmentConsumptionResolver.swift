import Foundation

/// Resolves the consumption status (who has VIEWED / DOWNLOADED / LISTENED /
/// WATCHED an attachment) shown in the message-info sheet, applying the same
/// WhatsApp-style **all-or-nothing** group semantics as `DeliveryStatusResolver`.
///
/// ## Why this exists
/// The backend tracks per-recipient attachment consumption and computes
/// denormalized aggregates (`viewedByAllAt`, `viewedCount`, …). The *primary*
/// action that matters depends on the media type:
/// - **image** → viewed
/// - **audio** → listened (`consumedCount` carries the listen count)
/// - **video** → watched (`consumedCount` carries the watch count)
/// - **everything else (files / documents)** → downloaded
///
/// This stateless rule picks the right action + count + "by all" marker for an
/// attachment so the UI renders one truthful consumption line per attachment.
/// It never decides UI strings — the app maps `Action` to a localized label.
public enum AttachmentConsumptionResolver {

    /// The primary consumption action for an attachment, chosen by media type.
    public enum Action: String, Sendable, Equatable {
        case viewed, downloaded, listened, watched
    }

    /// Resolved consumption state for a single attachment.
    public struct Status: Sendable, Equatable {
        /// The primary action that matters for this media type.
        public let action: Action
        /// Recipients who have completed the primary action.
        public let count: Int
        /// Total expected recipients (active members excluding the author).
        /// `0` = unknown denominator — the UI shows the bare count without an
        /// "of N" and never claims "by all" from counts alone.
        public let recipientCount: Int
        /// Non-nil ⟺ the server confirmed EVERY recipient completed the action.
        public let byAllAt: Date?

        public init(action: Action, count: Int, recipientCount: Int, byAllAt: Date?) {
            self.action = action
            self.count = count
            self.recipientCount = recipientCount
            self.byAllAt = byAllAt
        }

        /// `true` only when every recipient has completed the primary action:
        /// the unambiguous server marker, or (cold-start) the count reaching a
        /// known positive denominator. Never claims completion on an unknown
        /// denominator — soundness over coverage, mirroring the delivery rule.
        public var isCompleteByAll: Bool {
            if byAllAt != nil { return true }
            return recipientCount > 0 && count >= recipientCount
        }
    }

    /// The primary action for a MIME type.
    public static func primaryAction(forMimeType mimeType: String) -> Action {
        if mimeType.hasPrefix("audio/") { return .listened }
        if mimeType.hasPrefix("video/") { return .watched }
        if mimeType.hasPrefix("image/") { return .viewed }
        return .downloaded
    }

    /// Resolves the consumption status for one attachment.
    ///
    /// - Parameters:
    ///   - mimeType: drives which action is primary.
    ///   - recipientCount: active recipients excluding the author (`0` unknown).
    ///   - viewedCount / downloadedCount / consumedCount: server aggregates
    ///     (`consumedCount` = listen count for audio / watch count for video).
    ///   - the `…ByAllAt` markers: unambiguous "every recipient" confirmations.
    public static func resolve(
        mimeType: String,
        recipientCount: Int,
        viewedCount: Int,
        downloadedCount: Int,
        consumedCount: Int,
        viewedByAllAt: Date?,
        downloadedByAllAt: Date?,
        listenedByAllAt: Date?,
        watchedByAllAt: Date?
    ) -> Status {
        switch primaryAction(forMimeType: mimeType) {
        case .viewed:
            return Status(action: .viewed, count: viewedCount,
                          recipientCount: recipientCount, byAllAt: viewedByAllAt)
        case .downloaded:
            return Status(action: .downloaded, count: downloadedCount,
                          recipientCount: recipientCount, byAllAt: downloadedByAllAt)
        case .listened:
            return Status(action: .listened, count: consumedCount,
                          recipientCount: recipientCount, byAllAt: listenedByAllAt)
        case .watched:
            return Status(action: .watched, count: consumedCount,
                          recipientCount: recipientCount, byAllAt: watchedByAllAt)
        }
    }
}
