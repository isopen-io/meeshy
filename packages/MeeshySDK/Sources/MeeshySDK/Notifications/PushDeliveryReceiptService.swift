import Foundation
import os

private let logger = Logger(subsystem: "com.meeshy.sdk", category: "push-receipt")

/// Contract for emitting a delivery acknowledgement ("double-check" cursor
/// in the sender's UI) when a push notification surfaces a message we have
/// not yet synced. Decoupled from the concrete implementation so
/// `AppDelegate` and tests can inject a mock.
public protocol PushReceipting: AnyObject, Sendable {
    func ack(conversationId: String, messageId: String?) async
    func flushPending() async
}

/// Concrete implementation. Strategy:
///
/// 1. If the gateway says "I'm up" via socket, the REST `mark-as-received`
///    endpoint broadcasts the event back to participants. We always prefer
///    REST here because the silent push is already an async-fetch path and
///    the REST call is idempotent on the server.
/// 2. If the REST call fails (offline, 5xx, timeout), persist the pending
///    receipt to disk so the next foreground resume or reconnect can
///    flush it. `OfflineQueue` is the right conceptual home but taking a
///    dependency on it would couple this service to its retry callback;
///    we keep a small dedicated queue in UserDefaults instead — the
///    payloads are tiny (`conversationId` + optional `messageId`).
public final class PushDeliveryReceiptService: PushReceipting, @unchecked Sendable {
    public static let shared = PushDeliveryReceiptService()

    /// Injection point for tests. Production wires through
    /// `ConversationService.shared`.
    public struct Dependencies: Sendable {
        public var markAsReceived: @Sendable (_ conversationId: String) async throws -> Void
        public var isAuthenticated: @Sendable () -> Bool

        public init(
            markAsReceived: @escaping @Sendable (_ conversationId: String) async throws -> Void,
            isAuthenticated: @escaping @Sendable () -> Bool
        ) {
            self.markAsReceived = markAsReceived
            self.isAuthenticated = isAuthenticated
        }

        public static let live = Dependencies(
            markAsReceived: { conversationId in
                try await ConversationService.shared.markAsReceived(conversationId: conversationId)
            },
            isAuthenticated: {
                APIClient.shared.authToken != nil
            }
        )
    }

    private var deps: Dependencies
    private let defaults: UserDefaults
    private let queueKey = "com.meeshy.push.pendingReceipts"
    private let lock = NSLock()

    public init(
        dependencies: Dependencies = .live,
        defaults: UserDefaults = .standard
    ) {
        self.deps = dependencies
        self.defaults = defaults
    }

    /// Acknowledge a push. Non-throwing — failures are queued for retry.
    public func ack(conversationId: String, messageId: String?) async {
        // Un push sans conversation (notification post-only, payload partiel)
        // ne doit JAMAIS entrer dans la queue : un id vide produit l'URL
        // `/conversations//mark-as-received` → 404 "Route not found" permanent,
        // et la ligne empoisonnée se re-enfile à chaque resume.
        guard !conversationId.isEmpty else { return }
        guard deps.isAuthenticated() else {
            logger.info("ack skipped: not authenticated, queuing")
            enqueue(conversationId: conversationId, messageId: messageId)
            return
        }
        do {
            try await deps.markAsReceived(conversationId)
            logger.info("Delivery receipt acknowledged (conv=\(conversationId, privacy: .public))")
        } catch {
            logger.error("ack failed, queuing for retry: \(error.localizedDescription, privacy: .public)")
            enqueue(conversationId: conversationId, messageId: messageId)
        }
    }

    /// Retry every queued receipt. Called on foreground resume and during
    /// the background transition (best-effort). Each success is removed
    /// from the queue; failures remain for the next attempt.
    public func flushPending() async {
        // Purge défensive des lignes corrompues persistées par d'anciens
        // builds (conversationId vide → 404 permanent à chaque tentative).
        let pending = drainQueueSnapshot().filter { !$0.conversationId.isEmpty }
        guard !pending.isEmpty else { return }
        guard deps.isAuthenticated() else {
            // Put it back untouched — we cannot authenticate right now.
            requeueAppend(pending)
            return
        }

        var failed: [PendingReceipt] = []
        for item in pending {
            do {
                try await deps.markAsReceived(item.conversationId)
            } catch {
                logger.error("flushPending failed for \(item.conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                // Seules les erreurs TRANSITOIRES méritent un retry. Un 4xx
                // (validation, route inconnue, conversation supprimée/quittée)
                // est permanent : re-enfiler garantit le même échec à chaque
                // resume, pour toujours. 401 (session à rafraîchir), 408 et
                // 429 restent retryables.
                if Self.isRetryable(error) {
                    failed.append(item)
                }
            }
        }

        if !failed.isEmpty {
            // Preserve order: failures go back to the front, anything that
            // was enqueued in parallel remains at the tail.
            requeuePrepend(failed)
        }
    }

    /// `false` pour les erreurs serveur permanentes (4xx hors 401/408/429,
    /// et 403 `.forbidden` — l'utilisateur n'a plus accès à la conversation) —
    /// celles-là sont abandonnées au lieu d'être re-enfilées indéfiniment.
    static func isRetryable(_ error: Error) -> Bool {
        switch error {
        case MeeshyError.forbidden:
            return false
        case let MeeshyError.server(statusCode, _):
            guard (400...499).contains(statusCode) else { return true }
            return [401, 408, 429].contains(statusCode)
        default:
            return true
        }
    }

    /// Re-append drained items to the tail of whatever is currently queued.
    /// Kept synchronous so callers inside `async` contexts don't acquire
    /// `NSLock` across suspension points.
    private func requeueAppend(_ items: [PendingReceipt]) {
        lock.lock()
        defer { lock.unlock() }
        let current = loadQueueLocked()
        saveQueueLocked(current + items)
    }

    /// Re-prepend items to the head of the queue while preserving anything
    /// enqueued in parallel at the tail. Kept synchronous so callers inside
    /// `async` contexts don't acquire `NSLock` across suspension points.
    private func requeuePrepend(_ items: [PendingReceipt]) {
        lock.lock()
        defer { lock.unlock() }
        let current = loadQueueLocked()
        saveQueueLocked(items + current)
    }

    // MARK: - Queue (UserDefaults)

    fileprivate struct PendingReceipt: Codable, Equatable, Sendable {
        let conversationId: String
        let messageId: String?
        let enqueuedAt: Date
    }

    private func enqueue(conversationId: String, messageId: String?) {
        lock.lock()
        defer { lock.unlock() }
        var current = loadQueueLocked()
        // Deduplicate — only one pending ack per conversation is useful.
        current.removeAll { $0.conversationId == conversationId }
        current.append(PendingReceipt(
            conversationId: conversationId,
            messageId: messageId,
            enqueuedAt: Date()
        ))
        // Cap the queue at 200 items to avoid unbounded growth in
        // pathological offline scenarios; oldest entries are dropped first.
        if current.count > 200 {
            current = Array(current.suffix(200))
        }
        saveQueueLocked(current)
    }

    private func drainQueueSnapshot() -> [PendingReceipt] {
        lock.lock()
        defer { lock.unlock() }
        let current = loadQueueLocked()
        saveQueueLocked([])
        return current
    }

    private func loadQueueLocked() -> [PendingReceipt] {
        guard let data = defaults.data(forKey: queueKey) else { return [] }
        return (try? JSONDecoder.iso8601.decode([PendingReceipt].self, from: data)) ?? []
    }

    private func saveQueueLocked(_ items: [PendingReceipt]) {
        if items.isEmpty {
            defaults.removeObject(forKey: queueKey)
            return
        }
        if let data = try? JSONEncoder.iso8601.encode(items) {
            defaults.set(data, forKey: queueKey)
        }
    }

    // MARK: - Testing hooks

    /// For tests only — swap the backing dependencies. Production code
    /// always uses `.live`.
    public func _setDependencies(_ dependencies: Dependencies) {
        deps = dependencies
    }

    /// For tests only — inspect how many receipts are waiting.
    public func _pendingCount() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return loadQueueLocked().count
    }
}

// MARK: - JSONCoder helpers

private extension JSONEncoder {
    static let iso8601: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}

private extension JSONDecoder {
    static let iso8601: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}
