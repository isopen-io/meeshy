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
/// Last-write-wins per `(endpoint, httpMethod)`, merged field-by-field: a
/// fresh action for the same endpoint is combined with the pending one so
/// rapid edits don't pile up, the newest value wins per JSON key, and a key
/// the fresh action omits (untouched field) still survives from the pending
/// action instead of being silently dropped.
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

    /// Mirrors `OutboxFlusher`'s exhaustion budget (5 attempts) so a
    /// permanently-failing action can't block the FIFO forever.
    private static let maxAttempts = 5

    private var items: [SettingsAction] = []
    private var isFlushing = false
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "settingsactionqueue")

    /// In-memory failure counter per `SettingsAction.id`. Deliberately not
    /// persisted alongside `items` (unlike `OutboxRecord.attempts`): a fresh
    /// `enqueue()` for the same `(endpoint, httpMethod)` already replaces the
    /// item with a new id, which naturally resets its count, and this avoids
    /// a JSON schema migration for what is otherwise best-effort bookkeeping
    /// scoped to the current process lifetime.
    private var failureCounts: [String: Int] = [:]

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
        let replaced = items.first { $0.endpoint == action.endpoint && $0.httpMethod == action.httpMethod }
        items.removeAll { $0.endpoint == action.endpoint && $0.httpMethod == action.httpMethod }
        if let replaced { failureCounts[replaced.id] = nil }

        // Field-level merge, not wholesale replace: callers (e.g.
        // `ProfileView.saveProfile`) diff each request against the pre-edit
        // snapshot and OMIT untouched fields from the JSON body. If a still-
        // pending action for this same endpoint already carries a field the
        // fresh action never re-touches (a bio cleared by save #1, then only
        // displayName edited in save #2 while still offline), a wholesale
        // replace would silently discard save #1's field — the server never
        // learns about it. Merging at the JSON-key level lets the newest
        // submission win per-field while every other still-pending key
        // survives, honouring the "most recent submission carries the
        // canonical state" contract this type documents above.
        let mergedAction: SettingsAction
        if let replaced {
            let payload = Self.mergeJSONPayloads(previous: replaced.payload, incoming: action.payload)
            mergedAction = SettingsAction(endpoint: action.endpoint, httpMethod: action.httpMethod, payload: payload)
        } else {
            mergedAction = action
        }

        if items.count >= Self.maxQueueSize {
            let evicted = items.removeFirst()
            failureCounts[evicted.id] = nil
        }
        items.append(mergedAction)
        saveToDisk()
        pendingCountChanged.send(items.count)
        logger.info("Enqueued settings action \(mergedAction.endpoint), queue size \(self.items.count)")
    }

    /// Shallow-merges two JSON object payloads key-by-key, `incoming` winning
    /// on conflicts and every key `incoming` doesn't mention falling back to
    /// `previous`. Falls back to `incoming` verbatim if either side fails to
    /// parse as a JSON object — every real settings payload is an object body
    /// (`UpdateProfileRequest` and siblings), so this only guards against a
    /// malformed/empty edge case rather than a real shape mismatch.
    private static func mergeJSONPayloads(previous: Data, incoming: Data) -> Data {
        guard let previousObject = try? JSONSerialization.jsonObject(with: previous) as? [String: Any],
              let incomingObject = try? JSONSerialization.jsonObject(with: incoming) as? [String: Any] else {
            return incoming
        }
        let merged = previousObject.merging(incomingObject) { _, new in new }
        guard let data = try? JSONSerialization.data(withJSONObject: merged) else { return incoming }
        return data
    }

    public var count: Int { items.count }
    public var isEmpty: Bool { items.isEmpty }
    public var pendingItems: [SettingsAction] { items }

    // MARK: - Flush

    public func flushIfPossible() async {
        guard !isFlushing, !items.isEmpty, let handler = onFlush else { return }
        isFlushing = true
        defer { isFlushing = false }

        var doneIds: [String] = []
        for item in items {
            if await handler(item) {
                doneIds.append(item.id)
                failureCounts[item.id] = nil
                continue
            }

            let attempts = (failureCounts[item.id] ?? 0) + 1
            failureCounts[item.id] = attempts
            if attempts >= Self.maxAttempts {
                // Structural backstop: `onFlush` has no way to signal
                // "permanent vs transient" failure to this actor, so a
                // handler that keeps failing (e.g. a 4xx it can't tell apart
                // from a 5xx) used to `break` here forever and wedge every
                // action queued behind it. After `maxAttempts` consecutive
                // failures on this item we drop it and keep processing the
                // rest of the queue, mirroring `OutboxFlusher`'s
                // maxAttempts + exhausted-drop pattern.
                logger.error("Dropping settings action \(item.endpoint) after \(attempts) failed attempts")
                doneIds.append(item.id)
                failureCounts[item.id] = nil
                continue
            }
            break // FIFO: stop on a not-yet-exhausted failure so order is preserved.
        }

        guard !doneIds.isEmpty else { return }
        for id in doneIds {
            items.removeAll { $0.id == id }
        }
        saveToDisk()
        pendingCountChanged.send(items.count)
    }

    public func clearAll() {
        items.removeAll()
        failureCounts.removeAll()
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
