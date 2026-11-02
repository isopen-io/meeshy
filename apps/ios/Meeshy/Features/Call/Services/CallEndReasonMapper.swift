@preconcurrency import CallKit

/// Maps the gateway's raw `call:ended` reason string to the CallKit
/// `CXCallEndedReason` (drives the Recents UX) and the local `CallEndReason`
/// (drives analytics + in-app UI). Pure + `nonisolated` so the mapping is unit
/// tested at behaviour instead of by string-matching the switch source — a
/// wrong mapping (e.g. `"missed" → .rejected`) previously slipped past the
/// source-string tests. Handles both camelCase and snake_case gateway variants;
/// any unknown/`nil` reason is a plain remote hang-up.
nonisolated enum CallEndReasonMapper {
    static func map(_ raw: String?) -> (cx: CXCallEndedReason, local: CallEndReason) {
        switch raw?.lowercased() {
        case "missed", "no_answer", "unanswered":
            return (.unanswered, .missed)
        case "rejected", "declined":
            return (.declinedElsewhere, .rejected)
        case "answeredelsewhere", "answered_elsewhere":
            return (.answeredElsewhere, .remote)
        case "failed", "connectionlost":
            return (.failed, .connectionLost)
        default:
            return (.remoteEnded, .remote)
        }
    }
}
