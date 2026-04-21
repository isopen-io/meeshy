import Foundation
import Combine
import os

// MARK: - Retry Queue Item

public struct RetryQueueItem: Codable, Identifiable, Sendable {
    public let id: String
    /// Optimistic message id shown in the UI while the send is being retried.
    /// Used by ``MessageRetryQueue/retrySucceeded`` and
    /// ``MessageRetryQueue/retryExhausted`` so active ViewModels can reconcile
    /// the optimistic row with the server-assigned id (success) or flip it to
    /// `.failed` (exhausted).
    public let tempId: String
    public let conversationId: String
    public let content: String
    public let originalLanguage: String
    public let replyToId: String?
    public let attachmentIds: [String]?
    public let createdAt: Date
    public var retryCount: Int
    public var lastRetryAt: Date?

    public init(
        conversationId: String,
        content: String,
        originalLanguage: String = "fr",
        replyToId: String? = nil,
        attachmentIds: [String]? = nil,
        tempId: String? = nil
    ) {
        let queueId = UUID().uuidString
        self.id = queueId
        self.tempId = tempId ?? "retry_\(queueId)"
        self.conversationId = conversationId
        self.content = content
        self.originalLanguage = originalLanguage
        self.replyToId = replyToId
        self.attachmentIds = attachmentIds
        self.createdAt = Date()
        self.retryCount = 0
        self.lastRetryAt = nil
    }
}

// MARK: - Retry Success Payload

/// Emitted when a transient-failure retry finally reaches the server. The
/// optimistic `tempId` (`"retry_<item.id>"`) and the authoritative `serverId`
/// let active ViewModels reconcile in-memory state before the socket
/// `message:new` broadcast arrives, preventing duplicates and messages stuck
/// in `.sending`.
public struct RetryQueueSuccess: Sendable {
    public let tempId: String
    public let serverId: String
    public let conversationId: String
}

/// Emitted when an item is permanently dropped after exhausting its retry
/// budget. Lets ViewModels flip their optimistic row to `.failed` and show a
/// "tap to retry" affordance instead of leaving it stuck in `.sending`.
public struct RetryQueueFailure: Sendable {
    public let tempId: String
    public let conversationId: String
}

// MARK: - Message Retry Queue

public actor MessageRetryQueue {
    public static let shared = MessageRetryQueue()

    public nonisolated let retrySucceeded = SendablePassthrough<RetryQueueSuccess>()
    public nonisolated let retryExhausted = SendablePassthrough<RetryQueueFailure>()

    private static let maxRetries = 5
    private static let retryIntervalSeconds: TimeInterval = 10
    private static let maxQueueSize = 100
    private static let maxAgeSeconds: TimeInterval = 7 * 24 * 3600 // 7 days
    private static let queueFileName = "message_retry_queue.json"

    private var items: [RetryQueueItem] = []
    private var isRetrying = false
    private var retryTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "messageretry")

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

    public var onRetrySend: ((RetryQueueItem) async -> String?)?

    public func setRetrySend(_ handler: @escaping @Sendable (RetryQueueItem) async -> String?) {
        onRetrySend = handler
    }

    private init() {
        items = Self.loadItemsFromDisk()
        Task {
            await purgeExpired()
            await observeConnection()
        }
    }

    // MARK: - Queue Operations

    public func enqueue(_ item: RetryQueueItem) {
        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        saveToDisk()
        logger.info("Enqueued message for retry: \(item.conversationId), queue size: \(self.items.count)")
        startRetryLoop()
    }

    public func dequeue(_ itemId: String) {
        items.removeAll { $0.id == itemId }
        saveToDisk()
    }

    public var pendingItems: [RetryQueueItem] {
        items
    }

    public var count: Int {
        items.count
    }

    // MARK: - Retry Loop

    private func startRetryLoop() {
        guard retryTask == nil else { return }
        retryTask = Task { [weak self] in
            defer {
                Task { [weak self] in await self?.clearRetryTask() }
            }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(Self.retryIntervalSeconds * 1_000_000_000))
                guard let self, !Task.isCancelled else { return }
                await self.retryPending()
                let remaining = await self.pendingRetryableCount
                if remaining == 0 { return }
            }
        }
    }

    private func clearRetryTask() {
        retryTask = nil
    }

    private var pendingRetryableCount: Int {
        items.filter { $0.retryCount < Self.maxRetries }.count
    }

    private func retryPending() async {
        guard !isRetrying, !items.isEmpty else { return }
        guard let retrySend = onRetrySend else { return }

        isRetrying = true
        var toRemove: [String] = []
        var updated = false
        var successPayloads: [RetryQueueSuccess] = []
        var exhaustedPayloads: [RetryQueueFailure] = []

        for i in items.indices {
            if items[i].retryCount >= Self.maxRetries {
                // Exhausted: drop and notify so the UI can surface a failure state.
                toRemove.append(items[i].id)
                exhaustedPayloads.append(RetryQueueFailure(
                    tempId: items[i].tempId,
                    conversationId: items[i].conversationId
                ))
                continue
            }

            if let serverId = await retrySend(items[i]) {
                toRemove.append(items[i].id)
                successPayloads.append(RetryQueueSuccess(
                    tempId: items[i].tempId,
                    serverId: serverId,
                    conversationId: items[i].conversationId
                ))
                logger.info("Retry succeeded for message \(self.items[i].id)")
            } else {
                items[i].retryCount += 1
                items[i].lastRetryAt = Date()
                updated = true
                logger.info("Retry \(self.items[i].retryCount)/\(Self.maxRetries) failed for message \(self.items[i].id)")
                if items[i].retryCount >= Self.maxRetries {
                    exhaustedPayloads.append(RetryQueueFailure(
                        tempId: items[i].tempId,
                        conversationId: items[i].conversationId
                    ))
                }
            }
        }

        for id in toRemove {
            items.removeAll { $0.id == id }
        }

        if !toRemove.isEmpty || updated {
            saveToDisk()
        }
        isRetrying = false

        // Remove optimistic rows from the persisted cache so an inactive
        // ConversationViewModel doesn't show a ghost `retry_<uuid>` row next
        // to the authoritative server message that arrives via `message:new`.
        for payload in successPayloads {
            await CacheCoordinator.shared.messages.mergeUpdate(for: payload.conversationId) { cached in
                cached.filter { $0.id != payload.tempId }
            }
            retrySucceeded.send(payload)
        }
        for payload in exhaustedPayloads { retryExhausted.send(payload) }
    }

    public func retryAllNow() async {
        await retryPending()
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
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                    await self.retryPending()
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
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        return cacheDir.appendingPathComponent(Self.queueFileName)
    }

    private func saveToDisk() {
        do {
            let data = try encoder.encode(items)
            try data.write(to: queueFileURL, options: .atomic)
        } catch {
            logger.error("Failed to save retry queue: \(error.localizedDescription)")
        }
    }

    private static func loadItemsFromDisk() -> [RetryQueueItem] {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let path = documents.appendingPathComponent("meeshy_cache/\(queueFileName)")
        guard FileManager.default.fileExists(atPath: path.path) else { return [] }
        do {
            let data = try Data(contentsOf: path)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode([RetryQueueItem].self, from: data)
        } catch {
            return []
        }
    }
}
