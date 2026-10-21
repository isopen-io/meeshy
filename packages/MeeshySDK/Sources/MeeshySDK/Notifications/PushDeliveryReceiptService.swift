import Foundation
import os

private let logger = MeeshyLog.logger(.pushReceipt, subsystem: .legacySDK)

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
public final class PushDeliveryReceiptService: PushReceipting, Sendable {
    public static let shared = PushDeliveryReceiptService()

    /// Injection point for tests. Production wires through
    /// `ConversationService.shared`.
    public struct Dependencies: Sendable {
        public var markAsReceived: @Sendable @concurrent (_ conversationId: String) async throws -> Void
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

    private static let queueKey = "com.meeshy.push.pendingReceipts"

    private struct Backing {
        var deps: Dependencies
        let defaults: UserDefaults

        func load() -> [PendingReceipt] {
            guard let data = defaults.data(forKey: PushDeliveryReceiptService.queueKey) else { return [] }
            return (try? JSONDecoder.iso8601.decode([PendingReceipt].self, from: data)) ?? []
        }

        func save(_ items: [PendingReceipt]) {
            if items.isEmpty {
                defaults.removeObject(forKey: PushDeliveryReceiptService.queueKey)
                return
            }
            if let data = try? JSONEncoder.iso8601.encode(items) {
                defaults.set(data, forKey: PushDeliveryReceiptService.queueKey)
            }
        }

        func append(_ items: [PendingReceipt]) {
            save(load() + items)
        }

        func prepend(_ items: [PendingReceipt]) {
            save(items + load())
        }

        func enqueue(conversationId: String, messageId: String?, at date: Date) {
            var current = load()
            // Deduplicate — only one pending ack per conversation is useful.
            current.removeAll { $0.conversationId == conversationId }
            current.append(PendingReceipt(conversationId: conversationId, messageId: messageId, enqueuedAt: date))
            // Cap the queue at 200 items to avoid unbounded growth in
            // pathological offline scenarios; oldest entries are dropped first.
            if current.count > 200 {
                current = Array(current.suffix(200))
            }
            save(current)
        }

        func drain() -> [PendingReceipt] {
            let current = load()
            save([])
            return current
        }
    }

    private let backing: Locked<Backing>

    public init(
        dependencies: Dependencies = .live,
        defaults: UserDefaults = .standard
    ) {
        self.backing = Locked(uncheckedState: Backing(deps: dependencies, defaults: defaults))
    }

    private var deps: Dependencies {
        backing.read { $0.deps }
    }

    /// Acknowledge a push. Non-throwing — failures are queued for retry.
    public func ack(conversationId: String, messageId: String?) async {
        // Un push sans conversation (notification post-only, payload partiel)
        // ne doit JAMAIS entrer dans la queue : un id vide produit l'URL
        // `/conversations//mark-as-received` → 404 "Route not found" permanent,
        // et la ligne empoisonnée se re-enfile à chaque resume.
        guard !conversationId.isEmpty else { return }
        let deps = self.deps
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
        let deps = self.deps
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
    /// Kept synchronous so callers inside `async` contexts never hold the lock
    /// across suspension points.
    private func requeueAppend(_ items: [PendingReceipt]) {
        backing.read { $0.append(items) }
    }

    /// Re-prepend items to the head of the queue while preserving anything
    /// enqueued in parallel at the tail. Kept synchronous so callers inside
    /// `async` contexts never hold the lock across suspension points.
    private func requeuePrepend(_ items: [PendingReceipt]) {
        backing.read { $0.prepend(items) }
    }

    // MARK: - Queue (UserDefaults)

    fileprivate struct PendingReceipt: Codable, Equatable, Sendable {
        let conversationId: String
        let messageId: String?
        let enqueuedAt: Date
    }

    private func enqueue(conversationId: String, messageId: String?) {
        let now = Date()
        backing.read { $0.enqueue(conversationId: conversationId, messageId: messageId, at: now) }
    }

    private func drainQueueSnapshot() -> [PendingReceipt] {
        backing.read { $0.drain() }
    }

    // MARK: - Testing hooks

    /// For tests only — swap the backing dependencies. Production code
    /// always uses `.live`.
    public func _setDependencies(_ dependencies: Dependencies) {
        backing.mutate { $0.deps = dependencies }
    }

    /// For tests only — inspect how many receipts are waiting.
    public func _pendingCount() -> Int {
        backing.read { $0.load().count }
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
