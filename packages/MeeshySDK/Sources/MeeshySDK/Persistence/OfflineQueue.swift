import Foundation
import Combine
import os

// MARK: - Offline Queue Item

public struct OfflineQueueItem: Codable, Identifiable {
    public let id: String
    public let conversationId: String
    public let content: String
    public let replyToId: String?
    public let forwardedFromId: String?
    public let forwardedFromConversationId: String?
    public let attachmentIds: [String]?
    public let createdAt: Date

    public init(
        conversationId: String,
        content: String,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        attachmentIds: [String]? = nil
    ) {
        self.id = UUID().uuidString
        self.conversationId = conversationId
        self.content = content
        self.replyToId = replyToId
        self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.attachmentIds = attachmentIds
        self.createdAt = Date()
    }
}

// MARK: - Offline Queue

public actor OfflineQueue {
    public static let shared = OfflineQueue()

    private static let maxQueueSize = 100
    private static let queueFileName = "offline_queue.json"

    private var items: [OfflineQueueItem] = []
    private var isRetrying = false
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")

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

    /// Called when retrying a queued message. Set by the app layer.
    public var onRetrySend: ((OfflineQueueItem) async -> Bool)?

    private init() {
        items = loadFromDisk()
        observeConnection()
    }

    // MARK: - Queue Operations

    public func enqueue(_ item: OfflineQueueItem) {
        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        saveToDisk()
        logger.info("Enqueued offline message for conversation \(item.conversationId), queue size: \(self.items.count)")
    }

    public func dequeue(_ itemId: String) {
        items.removeAll { $0.id == itemId }
        saveToDisk()
    }

    public var pendingItems: [OfflineQueueItem] {
        items
    }

    public var count: Int {
        items.count
    }

    public var isEmpty: Bool {
        items.isEmpty
    }

    // MARK: - Retry Logic

    public func retryAll() async {
        guard !isRetrying, !items.isEmpty else { return }
        guard let retrySend = onRetrySend else {
            logger.warning("No retry handler set, skipping retry")
            return
        }

        isRetrying = true
        logger.info("Retrying \(self.items.count) queued messages")

        var successIds: [String] = []

        for item in items {
            let success = await retrySend(item)
            if success {
                successIds.append(item.id)
            } else {
                break
            }
        }

        for id in successIds {
            items.removeAll { $0.id == id }
        }

        saveToDisk()
        isRetrying = false

        if !successIds.isEmpty {
            logger.info("Successfully retried \(successIds.count) messages, \(self.items.count) remaining")
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
                    // Small delay to let the connection stabilize
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    await self.retryAll()
                }
            }
            .store(in: &cancellables)
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
            logger.error("Failed to save offline queue: \(error.localizedDescription)")
        }
    }

    private func loadFromDisk() -> [OfflineQueueItem] {
        let url = queueFileURL
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }

        do {
            let data = try Data(contentsOf: url)
            let loaded = try decoder.decode([OfflineQueueItem].self, from: data)
            logger.info("Loaded \(loaded.count) items from offline queue")
            return loaded
        } catch {
            logger.error("Failed to load offline queue: \(error.localizedDescription)")
            return []
        }
    }

    // MARK: - Clear

    public func clearAll() {
        items.removeAll()
        saveToDisk()
    }
}
