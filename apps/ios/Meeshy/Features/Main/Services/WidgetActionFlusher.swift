import Foundation
import MeeshySDK
import os

nonisolated private let logger = Logger(subsystem: "me.meeshy.app", category: "widget-flusher")

/// Drains actions queued by the widget extension (e.g. mark-as-read) once the
/// main app foregrounds, because the widget process can't hold the auth token
/// required for authenticated REST calls.
///
/// Flow: widget Intent.perform() → appends conversationId to the App Group
/// `pending_mark_read` array → WidgetCenter reload refreshes the tile → later,
/// main app foreground calls `flush()` which reads the queue, fires
/// `ConversationService.shared.markRead(...)` for each, and clears the queue.
@MainActor
final class WidgetActionFlusher {
    static let shared = WidgetActionFlusher()

    private let suiteName = "group.me.meeshy.app"
    private let pendingMarkReadKey = "pending_mark_read"

    private lazy var sharedDefaults: UserDefaults? = {
        UserDefaults(suiteName: suiteName)
    }()

    private init() {}

    /// Called from the `.active` scene-phase handler. Fires server-side
    /// mark-as-read for every conversation queued by widget taps. Failures are
    /// logged and their conversationId stays in the queue so the next flush
    /// retries — idempotent on the server side.
    func flush() async {
        guard let defaults = sharedDefaults else { return }
        let queued = defaults.stringArray(forKey: pendingMarkReadKey) ?? []
        guard !queued.isEmpty else { return }

        logger.info("Flushing \(queued.count) pending widget mark-as-read")

        var failed: [String] = []
        for conversationId in queued {
            do {
                try await ConversationService.shared.markRead(conversationId: conversationId)
                NotificationCoordinator.shared.markConversationRead(conversationId)
                NotificationCenter.default.post(
                    name: .conversationMarkedRead,
                    object: conversationId
                )
            } catch {
                logger.error("Widget mark-as-read failed for \(conversationId): \(error.localizedDescription)")
                failed.append(conversationId)
            }
        }

        // Keep failures for a retry; drop the successes.
        defaults.set(failed, forKey: pendingMarkReadKey)
    }
}
