import Foundation
import Combine
import os

// MARK: - Reaction Queue Item

public struct ReactionQueueItem: Codable, Identifiable, Sendable {
    public enum Action: String, Codable, Sendable {
        case add
        case remove
    }

    public let id: String
    public let messageId: String
    public let emoji: String
    public let action: Action
    public let conversationId: String
    public let createdAt: Date

    public init(
        messageId: String,
        emoji: String,
        action: Action,
        conversationId: String
    ) {
        self.id = UUID().uuidString
        self.messageId = messageId
        self.emoji = emoji
        self.action = action
        self.conversationId = conversationId
        self.createdAt = Date()
    }
}

// MARK: - Reaction Retry Payloads

/// Emitted when a queued reaction mutation finally reaches the server after a
/// reconnect. Lets active ViewModels cross off any "pending" indicator without
/// racing a socket broadcast.
public struct ReactionQueueSuccess: Sendable {
    public let messageId: String
    public let emoji: String
    public let action: ReactionQueueItem.Action
    public let conversationId: String
}

/// Emitted when a queued reaction mutation collapses (conflicting state:
/// tried to add what already exists, tried to remove what isn't there, or
/// message was deleted). Consumers revert the optimistic row.
public struct ReactionQueueFailure: Sendable {
    public let messageId: String
    public let emoji: String
    public let action: ReactionQueueItem.Action
    public let conversationId: String
}

// MARK: - Reaction Queue

/// FIFO queue for reaction add/remove operations so they survive offline
/// moments and app restarts. Reactions must remain locally consistent even
/// when the user taps hearts and then locks the phone — the optimistic UI
/// stays in place and the server learns about it on reconnect.
///
/// Pairs with ``ConversationViewModel.toggleReaction`` which applies the
/// reaction optimistically and enqueues the remote mutation, subscribing to
/// the `retrySucceeded` / `retryExhausted` publishers to reconcile when the
/// network eventually lands.
public actor ReactionQueue {
    public static let shared = ReactionQueue()

    public nonisolated let retrySucceeded = SendablePassthrough<ReactionQueueSuccess>()
    public nonisolated let retryExhausted = SendablePassthrough<ReactionQueueFailure>()

    private static let maxQueueSize = 500
    private static let queueFileName = "reaction_queue.json"
    private static let maxAgeSeconds: TimeInterval = 7 * 24 * 3600

    private var items: [ReactionQueueItem] = []
    private var isRetrying = false
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "reactionqueue")

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    /// Called when retrying a queued reaction. Return `true` on success
    /// (HTTP 2xx) or when the server replied with a benign conflict
    /// (already reacted / already removed) — both are terminal states that
    /// should drain the item. Return `false` to keep the item for the next
    /// reconnect cycle.
    public var onRetry: ((ReactionQueueItem) async -> RetryOutcome)?

    public enum RetryOutcome: Sendable {
        /// Server accepted the mutation. Drain the item.
        case succeeded
        /// Server rejected the mutation permanently (404, 410, 409 conflict
        /// with server state). Drain and emit `retryExhausted`.
        case dropped
        /// Transient failure. Keep the item.
        case transient
    }

    public func setRetry(_ handler: @escaping @Sendable (ReactionQueueItem) async -> RetryOutcome) {
        onRetry = handler
    }

    private init() {
        items = Self.loadItemsFromDisk()
        Task { await self.purgeExpired() }
        Task { await self.observeConnection() }
    }

    // MARK: - Queue Operations

    public func enqueue(_ item: ReactionQueueItem) {
        // Collapse conflicting actions on the same (message, emoji) pair: an
        // `add` followed by a `remove` (or vice versa) cancels out. Without
        // this, offline rapid toggling leaves noise that the server would
        // bounce as duplicate operations.
        let matchIndex = items.firstIndex { $0.messageId == item.messageId && $0.emoji == item.emoji }
        if let idx = matchIndex {
            if items[idx].action != item.action {
                items.remove(at: idx)
                saveToDisk()
                return
            }
            // Same action already queued: idempotent, no-op.
            return
        }
        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        saveToDisk()
        logger.info("Enqueued reaction \(item.action.rawValue) \(item.emoji) for message \(item.messageId)")
    }

    public var pendingItems: [ReactionQueueItem] { items }
    public var count: Int { items.count }
    public var isEmpty: Bool { items.isEmpty }

    // MARK: - Retry Logic

    public func retryAll() async {
        guard !isRetrying, !items.isEmpty else { return }
        guard let retry = onRetry else {
            logger.warning("No retry handler set, skipping retry")
            return
        }

        isRetrying = true
        var successfulSnapshots: [ReactionQueueSuccess] = []
        var droppedSnapshots: [ReactionQueueFailure] = []
        var remaining: [ReactionQueueItem] = []

        for item in items {
            switch await retry(item) {
            case .succeeded:
                successfulSnapshots.append(ReactionQueueSuccess(
                    messageId: item.messageId,
                    emoji: item.emoji,
                    action: item.action,
                    conversationId: item.conversationId
                ))
            case .dropped:
                droppedSnapshots.append(ReactionQueueFailure(
                    messageId: item.messageId,
                    emoji: item.emoji,
                    action: item.action,
                    conversationId: item.conversationId
                ))
            case .transient:
                remaining.append(item)
            }
        }

        items = remaining
        saveToDisk()
        isRetrying = false

        for payload in successfulSnapshots { retrySucceeded.send(payload) }
        for payload in droppedSnapshots { retryExhausted.send(payload) }

        if !successfulSnapshots.isEmpty || !droppedSnapshots.isEmpty {
            logger.info("Reaction queue drained: \(successfulSnapshots.count) ok, \(droppedSnapshots.count) dropped, \(remaining.count) remaining")
        }
    }

    // MARK: - Connection Observer

    private func observeConnection() {
        MessageSocketManager.shared.$isConnected
            .removeDuplicates()
            .dropFirst()
            .filter { $0 }
            .receive(on: DispatchQueue.global(qos: .utility))
            .sink { [weak self] _ in
                guard let self else { return }
                Task {
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    await self.retryAll()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Purge Expired

    private func purgeExpired() {
        let cutoff = Date().addingTimeInterval(-Self.maxAgeSeconds)
        let before = items.count
        items.removeAll { $0.createdAt < cutoff }
        if items.count != before {
            saveToDisk()
        }
    }

    // MARK: - Disk Persistence

    private var queueFileURL: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        if !FileManager.default.fileExists(atPath: cacheDir.path) {
            try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        }
        return cacheDir.appendingPathComponent(Self.queueFileName)
    }

    private func saveToDisk() {
        do {
            let data = try encoder.encode(items)
            try data.write(to: queueFileURL, options: .atomic)
        } catch {
            logger.error("Failed to save reaction queue: \(error.localizedDescription)")
        }
    }

    private static func loadItemsFromDisk() -> [ReactionQueueItem] {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let url = documents.appendingPathComponent("meeshy_cache/\(queueFileName)")
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }

        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode([ReactionQueueItem].self, from: data)
        } catch {
            return []
        }
    }

    public func clearAll() {
        items.removeAll()
        saveToDisk()
    }
}
