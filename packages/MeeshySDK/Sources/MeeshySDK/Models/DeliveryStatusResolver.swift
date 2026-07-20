import Foundation

/// Resolves the delivery indicator (✓ sent → ✓✓ delivered → ✓✓ read) that the
/// SENDER sees for one of their own messages, applying WhatsApp-style
/// **all-or-nothing** group semantics.
///
/// ## Why this exists
/// The raw `MeeshyMessage.deliveryStatus` baked at ingestion promotes a message
/// to `.delivered` / `.read` as soon as a *single* recipient receives / reads it
/// (`deliveredCount > 0` / `readCount > 0`). That is correct for a 1:1
/// conversation — there is only one recipient — but **misleading in a group**:
/// the sender would see the indigo "read" double-check the instant one of ten
/// members opens the conversation, even though nobody else has. The indicator
/// must EXACTLY represent the real state of *all* the other interlocutors.
///
/// ## The rule
/// - `recipientCount <= 1` (direct conversation, or an unknown denominator):
///   the stored status is already accurate for the single peer — trust it. This
///   also preserves the live state-machine path, which advances the status
///   without necessarily propagating per-recipient counts.
/// - `recipientCount > 1` (group): the delivered / read tier is derived purely
///   from the recipient counts. The double-gray "delivered" lights up only once
///   EVERY recipient has received the message; the indigo "read" only once EVERY
///   recipient has read it. A partial state stays at the lower indicator.
///
/// The send lifecycle (`.sending` / `.invisible` / `.clock` / `.slow` /
/// `.failed`) is independent of how many peers have received the message and is
/// always returned verbatim.
///
/// Stateless and pure — a rule engine, safe to call from `body`.
public enum DeliveryStatusResolver {

    /// Resolves the indicator for a single own-message.
    ///
    /// - Parameters:
    ///   - status: the message's stored `deliveryStatus` (carries the send
    ///     lifecycle and a best-effort delivered/read promotion).
    ///   - deliveredCount: distinct recipients who have received the message.
    ///   - readCount: distinct recipients who have read the message.
    ///   - recipientCount: total recipients expected to receive it — the active
    ///     conversation members EXCLUDING the sender. `0` or `1` means a direct
    ///     conversation (or an unknown denominator) and the stored status is
    ///     trusted as-is.
    ///   - deliveredToAllAt / readByAllAt: unambiguous "every recipient has
    ///     received / read" markers stamped by the live all-or-nothing update
    ///     path. That path advances `state` without carrying per-row counters,
    ///     so without these a real-time group delivery/read would transiently
    ///     regress to a single check until the sibling counters write lands.
    ///     Non-nil takes precedence over the count comparison. The gateway
    ///     currently leaves these null (the cursor-based read model no longer
    ///     computes them), so at cold-start the per-message counts are
    ///     authoritative and the markers carry only locally-confirmed state.
    public static func resolve(
        status: MeeshyMessage.DeliveryStatus,
        deliveredCount: Int,
        readCount: Int,
        recipientCount: Int,
        deliveredToAllAt: Date? = nil,
        readByAllAt: Date? = nil
    ) -> MeeshyMessage.DeliveryStatus {
        // The pre-delivery send lifecycle is authoritative and independent of
        // how many peers have received the message — never reinterpret it.
        switch status {
        case .sending, .invisible, .clock, .slow, .failed:
            return status
        case .sent, .delivered, .read:
            break
        }

        // Direct conversation or unknown denominator: the stored status already
        // reflects the single peer accurately (the 1:1 "any recipient ⇒ done"
        // computation is correct there), so trust it. Also keeps the live
        // state-machine path — which promotes status without writing counts —
        // working for direct chats.
        guard recipientCount > 1 else { return status }

        // Group: the indicator must represent EVERY recipient. Trust the
        // unambiguous "all" markers first (count-blind live path), then the
        // per-message counters (authoritative at cold-start).
        if readByAllAt != nil || readCount >= recipientCount { return .read }
        if deliveredToAllAt != nil || deliveredCount >= recipientCount { return .delivered }
        return .sent
    }

    /// Status implied purely by recipient counts, with no send-lifecycle
    /// context. Used by the live read-status reducer, which applies one
    /// conversation-level summary to many of the sender's messages.
    ///
    /// `recipientCount == 0` (unknown denominator) preserves the legacy
    /// "any > 0" behaviour so 1:1 live updates — where the summary may report
    /// the single peer — still advance.
    public static func fromCounts(
        deliveredCount: Int,
        readCount: Int,
        recipientCount: Int
    ) -> MeeshyMessage.DeliveryStatus {
        guard recipientCount > 0 else {
            if readCount > 0 { return .read }
            if deliveredCount > 0 { return .delivered }
            return .sent
        }
        if readCount >= recipientCount { return .read }
        if deliveredCount >= recipientCount { return .delivered }
        return .sent
    }
}
