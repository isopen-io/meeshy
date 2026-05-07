import Foundation
import os

// MARK: - Story Offline Queue Item

/// Snapshot d'une story en attente de publish (offline-first, Timeline composer).
///
/// Distinct from `StoryPublishQueueItem` (which has exponential-backoff retry logic):
/// `StoryOfflineQueueItem` is a lightweight FIFO snapshot designed for the Timeline
/// composer offline flow (Task 74). `slidePayloadJSON` contains the serialized slides
/// so the queue stays schema-agnostic if `StorySlide` evolves.
public struct StoryOfflineQueueItem: Codable, Identifiable, Sendable {
    public let id: String
    public let slideIds: [String]
    /// JSON-serialized `[StorySlide]` — decoding deferred to flush time for forward-compat.
    public let slidePayloadJSON: String
    /// mediaObjectId → file:// absolute path
    public let mediaURLPaths: [String: String]
    /// audioObjectId → file:// absolute path
    public let audioURLPaths: [String: String]
    public let originalLanguage: String?
    /// Visibility string: "PUBLIC", "FRIENDS", etc.
    public let visibility: String
    public let createdAt: Date

    public init(
        id: String = UUID().uuidString,
        slideIds: [String],
        slidePayloadJSON: String,
        mediaURLPaths: [String: String] = [:],
        audioURLPaths: [String: String] = [:],
        originalLanguage: String? = nil,
        visibility: String = "PUBLIC"
    ) {
        self.id = id
        self.slideIds = slideIds
        self.slidePayloadJSON = slidePayloadJSON
        self.mediaURLPaths = mediaURLPaths
        self.audioURLPaths = audioURLPaths
        self.originalLanguage = originalLanguage
        self.visibility = visibility
        self.createdAt = Date()
    }
}

// MARK: - OfflineQueueProviding protocol (test seam)

/// Protocol allowing `StoryOfflineQueue` to be replaced by a mock in tests.
public protocol OfflineQueueProviding: Sendable {
    func enqueue(_ item: StoryOfflineQueueItem) async
    func dequeue(_ itemId: String) async
    var pendingItems: [StoryOfflineQueueItem] { get async }
}

// MARK: - Story Offline Queue actor

/// Persists story-publish jobs while the device is offline.
///
/// Pattern mirrors `OfflineQueue` (messages) but with a schema adapted to stories.
/// Auto-flush on reconnect is wired externally (via `NetworkMonitor` observation in
/// `StoryComposerViewModel`). FIFO ordering: items are appended and flushed head-first.
///
/// Max queue size: 20 (stories are heavier than messages — keep the queue bounded).
public actor StoryOfflineQueue: OfflineQueueProviding {
    public static let shared = StoryOfflineQueue()

    private static let maxQueueSize = 20
    private static let queueFileName = "story_offline_queue.json"

    private var items: [StoryOfflineQueueItem] = []
    private var isRetrying = false
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "story-offline-queue")

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    /// Publish handler — set by `StoryOfflineQueue.shared.setOnPublish(...)`.
    /// Returns `true` on success; `false` on retryable failure.
    public var onPublish: (@Sendable (StoryOfflineQueueItem) async -> Bool)?

    public func setOnPublish(_ handler: @escaping @Sendable (StoryOfflineQueueItem) async -> Bool) {
        onPublish = handler
    }

    private init() {
        items = Self.loadFromDisk()
    }

    // MARK: - Queue operations

    public func enqueue(_ item: StoryOfflineQueueItem) {
        if items.count >= Self.maxQueueSize {
            items.removeFirst()
            logger.warning("StoryOfflineQueue full — evicted oldest item")
        }
        items.append(item)
        saveToDisk()
        logger.info("Enqueued story \(item.id), queue size: \(self.items.count)")
    }

    public func dequeue(_ itemId: String) {
        items.removeAll { $0.id == itemId }
        saveToDisk()
    }

    public var pendingItems: [StoryOfflineQueueItem] { items }

    /// Remove all items (used by tests and explicit user action).
    public func purge() {
        items.removeAll()
        saveToDisk()
    }

    /// Test seam: reloads from disk so persistence round-trips can be tested.
    public func reloadFromDisk() {
        items = Self.loadFromDisk()
    }

    // MARK: - Flush (FIFO, stop on first failure)

    /// Attempts to publish each item in FIFO order.
    /// Stops on the first failure and leaves the remainder in the queue for the
    /// next connectivity trigger.
    public func flush() async {
        guard !isRetrying, !items.isEmpty, let handler = onPublish else { return }
        isRetrying = true
        defer { isRetrying = false }

        for item in items {
            let success = await handler(item)
            if success {
                items.removeAll { $0.id == item.id }
                saveToDisk()
            } else {
                logger.error("Story publish failed for \(item.id) — pausing flush")
                return
            }
        }
    }

    // MARK: - Disk persistence

    /// Returns (and creates if needed) the queue storage directory under
    /// `.applicationSupportDirectory` — hidden from Files.app and iTunes file sharing.
    /// The directory is created with `FileProtectionType.complete` so its contents
    /// are encrypted when the device is locked.
    private static func queueDirectory() throws -> URL {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let dir = base.appendingPathComponent("StoryOfflineQueue", isDirectory: true)
        try FileManager.default.createDirectory(
            at: dir,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
        return dir
    }

    private static func queueFileURL() -> URL? {
        try? queueDirectory().appendingPathComponent(queueFileName)
    }

    private static func loadFromDisk() -> [StoryOfflineQueueItem] {
        guard let url = queueFileURL(),
              let data = try? Data(contentsOf: url) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([StoryOfflineQueueItem].self, from: data)) ?? []
    }

    private func saveToDisk() {
        guard let url = Self.queueFileURL() else { return }
        do {
            let data = try encoder.encode(items)
            try data.write(to: url, options: [.atomic, .completeFileProtection])
        } catch {
            logger.error("Failed to save StoryOfflineQueue: \(error.localizedDescription)")
        }
    }
}
