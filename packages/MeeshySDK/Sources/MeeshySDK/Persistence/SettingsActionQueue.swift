import Foundation
import Combine
import os

// MARK: - Settings Action Item

/// Represents a single user-settings mutation (typically a `PATCH /users/me`
/// or sibling endpoint) that the user triggered while offline. The queue
/// stores the resolved endpoint, the HTTP method, and the pre-encoded JSON
/// body so the dispatcher can replay it verbatim once connectivity returns.
public struct SettingsAction: Codable, Identifiable, Sendable {
    public let id: String
    public let endpoint: String
    public let httpMethod: String
    public let payload: Data
    public let createdAt: Date

    public init(endpoint: String, httpMethod: String = "PATCH", payload: Data) {
        self.id = UUID().uuidString
        self.endpoint = endpoint
        self.httpMethod = httpMethod
        self.payload = payload
        self.createdAt = Date()
    }
}

// MARK: - Settings Action Queue

/// FIFO queue for user-settings updates (profile edits, notification
/// preferences, language switches, ...) that survive offline moments and
/// app restarts.
///
/// Last-write-wins per `(endpoint, httpMethod)`: a fresh action replaces an
/// earlier pending one for the same endpoint so that rapid edits don't pile
/// up — the most recent submission carries the canonical state.
///
/// Pairs with the optimistic UI in `ProfileView.saveProfile` and friends:
/// the local model already reflects the edit; the queue just makes sure
/// the server eventually catches up.
public actor SettingsActionQueue {
    public static let shared = SettingsActionQueue()

    /// Emits the current pending count whenever it changes. UI banners
    /// subscribe to surface "Modifications en attente (N)".
    public nonisolated let pendingCountChanged = SendablePassthrough<Int>()

    private static let maxQueueSize = 50
    private static let queueFileName = "settings_action_queue.json"

    private var items: [SettingsAction] = []
    private var isFlushing = false
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "settingsactionqueue")

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    /// Closure that runs each pending action. Return `true` if it succeeded
    /// (item is removed); `false` keeps it queued for the next attempt.
    public var onFlush: (@Sendable (SettingsAction) async -> Bool)?

    public func setFlushHandler(_ handler: @escaping @Sendable (SettingsAction) async -> Bool) {
        onFlush = handler
    }

    private init() {
        items = Self.loadFromDisk()
        Task { await self.observeConnection() }
    }

    // MARK: - Enqueue

    public func enqueue(_ action: SettingsAction) {
        items.removeAll { $0.endpoint == action.endpoint && $0.httpMethod == action.httpMethod }
        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(action)
        saveToDisk()
        pendingCountChanged.send(items.count)
        logger.info("Enqueued settings action \(action.endpoint), queue size \(self.items.count)")
    }

    public var count: Int { items.count }
    public var isEmpty: Bool { items.isEmpty }
    public var pendingItems: [SettingsAction] { items }

    // MARK: - Flush

    public func flushIfPossible() async {
        guard !isFlushing, !items.isEmpty, let handler = onFlush else { return }
        isFlushing = true
        defer { isFlushing = false }

        var successIds: [String] = []
        for item in items {
            if await handler(item) {
                successIds.append(item.id)
            } else {
                break // FIFO: stop on first failure so order is preserved.
            }
        }

        for id in successIds {
            items.removeAll { $0.id == id }
        }
        saveToDisk()
        pendingCountChanged.send(items.count)
    }

    public func clearAll() {
        items.removeAll()
        saveToDisk()
        pendingCountChanged.send(0)
    }

    // MARK: - Connection Observer

    private func observeConnection() {
        NetworkMonitor.shared.$isOffline
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.global(qos: .utility))
            .sink { [weak self] _ in
                guard let self else { return }
                Task {
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    await self.flushIfPossible()
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
            try data.write(to: queueFileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            logger.error("Failed to save settings queue: \(error.localizedDescription)")
        }
    }

    private static func loadFromDisk() -> [SettingsAction] {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        let url = cacheDir.appendingPathComponent(queueFileName)
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }

        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode([SettingsAction].self, from: data)
        } catch {
            return []
        }
    }
}
