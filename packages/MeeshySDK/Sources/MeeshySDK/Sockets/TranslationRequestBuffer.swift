import Foundation

/// Buffered user-triggered emits that the socket layer must NOT silently
/// drop on disconnect. Translation requests are at the top of that list:
/// the user explicitly tapped a flag to ask for a target-language
/// rendering, and without buffering the request vanishes the instant the
/// socket is offline (the user blames the app, retries the same tap,
/// gets the same nothing). Capped + TTL-bounded so a long disconnect
/// cannot turn this into a memory leak.
struct PendingTranslationRequest: Equatable, Sendable {
    let messageId: String
    let targetLanguage: String
    let queuedAt: Date
}

struct TranslationRequestBuffer: Sendable {
    static let maxSize = 50
    static let timeToLive: TimeInterval = 60

    private(set) var pending: [PendingTranslationRequest] = []

    mutating func enqueue(_ request: PendingTranslationRequest) {
        // De-dup: if the same (messageId, targetLanguage) is already queued,
        // refresh its timestamp rather than enqueue twice — the user re-tapped.
        pending.removeAll {
            $0.messageId == request.messageId && $0.targetLanguage == request.targetLanguage
        }
        pending.append(request)
        // Cap from the front: oldest pending requests are the least useful
        // when the user is staring at the screen.
        if pending.count > Self.maxSize {
            let dropCount = pending.count - Self.maxSize
            pending.removeFirst(dropCount)
        }
    }

    /// Empties the buffer and returns the requests that are still fresh enough to matter.
    mutating func drainFresh(now: Date) -> [PendingTranslationRequest] {
        guard !pending.isEmpty else { return [] }
        let cutoff = now.addingTimeInterval(-Self.timeToLive)
        let toReplay = pending.filter { $0.queuedAt >= cutoff }
        pending.removeAll()
        return toReplay
    }
}
