import Foundation
import Combine
import os

// MARK: - Story Publish Queue Item

/// A pending story publication that survives app restarts and offline
/// periods. Holds a serialized slide payload plus references to the local
/// media files (image/video/audio) so the queue can hash-check that the
/// underlying assets still exist on disk before each retry.
///
/// SOTA audit Pilier 22 — covers the gap that `OfflineQueue` (messaging-only)
/// did not address, ensuring users do not lose composed stories when the
/// network is unavailable at publish time or the app crashes mid-publish.
public struct StoryPublishQueueItem: Codable, Identifiable, Sendable {
    public let id: String
    /// Optimistic id surfaced in the tray/feed while the item waits in the
    /// queue. Reconciled with the server-assigned post id on success.
    public let tempStoryId: String
    public let visibility: String
    /// JSON payload of the [StorySlide] array as produced by the composer.
    /// Decoding is deferred to the publish handler so the queue stays
    /// schema-agnostic if `StorySlide` evolves.
    public let slidesPayload: Data
    /// Optional explicit `repostOfId` for stories that are reposts.
    public let repostOfId: String?
    /// References to local media files so we can validate they still exist
    /// before each retry. Files come from `StoryDraftStore.saveMedia` or
    /// from the ephemeral Documents/tmp paths produced by the composer.
    public let mediaReferences: [StoryMediaReference]
    public let createdAt: Date
    public var retryCount: Int
    public var lastError: String?
    /// IDs d'utilisateurs ciblés (ONLY) ou exclus (EXCEPT). Optionnel pour
    /// rester rétro-compatible avec les rows persistés avant ce champ.
    public let visibilityUserIds: [String]?
    /// Langue source (Prisme Linguistique) du contenu de la story. Persistée
    /// pour que le gateway puisse router NLLB-200/TTS au flush et que le reader
    /// résolve le texte/audio dans la langue préférée du viewer. Optionnelle pour
    /// rester rétro-compatible avec les rows persistés avant ce champ (→ `nil`).
    public let originalLanguage: String?

    enum CodingKeys: String, CodingKey {
        case id, tempStoryId, visibility, slidesPayload, repostOfId
        case mediaReferences, createdAt, retryCount, lastError, visibilityUserIds
        case originalLanguage
    }

    public init(
        visibility: String,
        slidesPayload: Data,
        repostOfId: String? = nil,
        mediaReferences: [StoryMediaReference] = [],
        tempStoryId: String? = nil,
        visibilityUserIds: [String]? = nil,
        originalLanguage: String? = nil
    ) {
        let queueId = UUID().uuidString
        self.id = queueId
        self.tempStoryId = tempStoryId ?? "pending_\(queueId)"
        self.visibility = visibility
        self.slidesPayload = slidesPayload
        self.repostOfId = repostOfId
        self.mediaReferences = mediaReferences
        self.createdAt = Date()
        self.retryCount = 0
        self.lastError = nil
        self.visibilityUserIds = visibilityUserIds
        self.originalLanguage = originalLanguage
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.tempStoryId = try container.decode(String.self, forKey: .tempStoryId)
        self.visibility = try container.decode(String.self, forKey: .visibility)
        self.slidesPayload = try container.decode(Data.self, forKey: .slidesPayload)
        self.repostOfId = try container.decodeIfPresent(String.self, forKey: .repostOfId)
        self.mediaReferences = try container.decodeIfPresent([StoryMediaReference].self, forKey: .mediaReferences) ?? []
        self.createdAt = try container.decode(Date.self, forKey: .createdAt)
        self.retryCount = try container.decodeIfPresent(Int.self, forKey: .retryCount) ?? 0
        self.lastError = try container.decodeIfPresent(String.self, forKey: .lastError)
        self.visibilityUserIds = try container.decodeIfPresent([String].self, forKey: .visibilityUserIds)
        self.originalLanguage = try container.decodeIfPresent(String.self, forKey: .originalLanguage)
    }
}

/// Pointer to a local media file backing a slide. The queue validates
/// `localFilePath` exists before each retry; if missing, the item is failed
/// permanently and surfaced via `publishFailed` so the UI can ask the user
/// to retake the lost media.
public struct StoryMediaReference: Codable, Sendable {
    public let elementId: String
    /// "image", "video" or "audio" — kept as a free string for forward
    /// compatibility with future media types.
    public let mediaType: String
    /// Absolute path to the local file on disk.
    public let localFilePath: String

    public init(elementId: String, mediaType: String, localFilePath: String) {
        self.elementId = elementId
        self.mediaType = mediaType
        self.localFilePath = localFilePath
    }

    /// File extensions (case-insensitive) treated as video containers.
    private static let videoFileExtensions: Set<String> = ["mp4", "mov", "m4v"]

    /// Infers a visual `mediaType` ("video" or "image") from a file path's
    /// extension. The offline-queue converters only know a flat disk path (not
    /// the original media kind), so without this a queued `.mp4` would be
    /// re-tagged as "image" and replay via `UIImage(contentsOfFile:)` → nil →
    /// unrecoverable failure (or the video never uploads). Pure, side-effect
    /// free atom; audio refs are tagged explicitly by callers and never routed
    /// through here.
    ///
    /// CLOSED-SET ASSUMPTION (F4): the extension is lowercased before lookup so
    /// `.MP4`/`.MOV` resolve correctly. The set `{mp4, mov, m4v}` is the single
    /// point deciding offline-replay recoverability; it is sound because every
    /// caller feeds a clean local DISK path — `TimelineViewModel+OfflinePublish`
    /// and `StoryQueueMigrator` pass `URL.path`, which already strips any query
    /// string / fragment — so a URL-shaped path (e.g. `clip.mp4?token=…`) cannot
    /// reach here. Anything outside the set (unknown / empty / dotfile-without-
    /// extension) defaults to "image": images dominate and a mis-tagged image is
    /// harmless, whereas a mis-tagged video fails loudly via the disk-existence /
    /// decode path rather than corrupting silently. Update the set in lockstep if
    /// the composer ever exports a new video container.
    public static func inferVisualMediaType(forPath path: String) -> String {
        let ext = (path as NSString).pathExtension.lowercased()
        return videoFileExtensions.contains(ext) ? "video" : "image"
    }
}

// MARK: - Publish Result Payloads

public struct StoryPublishSuccess: Sendable {
    public let queueId: String
    public let tempStoryId: String
    /// Server-assigned post id for the newly published story.
    public let publishedStoryId: String
}

public enum StoryPublishFailureReason: Sendable, Equatable {
    /// Retry budget exhausted (max retries reached).
    case maxRetriesReached
    /// One or more local media files referenced by the item have disappeared
    /// from disk. The item is moved to a permanent-failure state and the user
    /// must retake the missing media.
    case missingLocalMedia(elementIds: [String])
    /// The publish handler threw a non-retryable error (4xx HTTP, validation
    /// failure, story expired, etc.). Caller should surface to the user.
    case unrecoverable(message: String)
}

public struct StoryPublishFailure: Sendable {
    public let queueId: String
    public let tempStoryId: String
    public let reason: StoryPublishFailureReason
}

// MARK: - Story Publish Queue

/// Singleton actor that owns the disk-persisted queue of pending story
/// publications, drives the retry loop, and emits success/failure events
/// to the rest of the app via Combine publishers.
public actor StoryPublishQueue {
    public static let shared = StoryPublishQueue()

    /// Emitted when a pending publication reaches the server and is assigned
    /// a real post id. ViewModels listen to swap their optimistic
    /// `pending_<uuid>` row with the authoritative server row.
    public nonisolated let publishSucceeded = SendablePassthrough<StoryPublishSuccess>()

    /// Emitted when a pending publication fails permanently (max retries,
    /// missing media, unrecoverable error). The UI should surface this to the
    /// user with an explicit "retry" or "delete draft" action.
    public nonisolated let publishFailed = SendablePassthrough<StoryPublishFailure>()

    private static let maxQueueSize = 50
    private static let maxRetries = 5
    /// Exponential backoff schedule (seconds). Index = retryCount before
    /// next attempt. Beyond `maxRetries` the item is failed permanently.
    private static let retryDelays: [TimeInterval] = [30, 120, 600, 3600, 7200]
    private static let queueFileName = "story_publish_queue.json"

    private var items: [StoryPublishQueueItem] = []
    private var isProcessing = false
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "story-publish-queue")

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

    /// Publish handler injected by the consuming app. Receives a queue item
    /// and either:
    ///   - returns the server-assigned story id on success
    ///   - throws an `Error` to signal a retryable failure (network, 5xx)
    ///   - throws `StoryPublishUnrecoverableError` to signal a permanent
    ///     failure (4xx, validation) that should NOT be retried
    public var onPublish: ((StoryPublishQueueItem) async throws -> String)?

    /// Registers the publish handler and immediately drains any items that
    /// were restored from disk at init time. Without this trigger there is
    /// a startup window where the connection observer may have fired before
    /// the handler is set, leaving pending items untouched until the next
    /// connectivity flip — which on a stable network may never come, so the
    /// items would sit forever despite being publishable.
    ///
    /// This trigger is fire-and-forget : the caller does not need to await
    /// the drain. processNext is idempotent and gated by `isProcessing` so
    /// double-trigger is safe.
    public func setPublishHandler(_ handler: @escaping @Sendable (StoryPublishQueueItem) async throws -> String) {
        let wasEmpty = items.isEmpty
        onPublish = handler
        if !wasEmpty {
            logger.info("Publish handler registered with \(self.items.count) restored items, draining now")
            Task { await self.processNext() }
        }
    }

    private init() {
        items = Self.loadItemsFromDisk()
        Task { await self.observeConnection() }
    }

    // MARK: - Queue Operations

    /// Enqueues a new pending story publish. Returns the assigned `tempStoryId`
    /// so the caller can show an optimistic row in the UI and reconcile via
    /// `publishSucceeded` once the publish reaches the server.
    @discardableResult
    public func enqueue(_ item: StoryPublishQueueItem) -> String {
        if items.count >= Self.maxQueueSize {
            // Drop the oldest pending item to make room. The dropped item is
            // surfaced as a permanent failure so the user is aware that their
            // long-stale draft was abandoned.
            let dropped = items.removeFirst()
            publishFailed.send(StoryPublishFailure(
                queueId: dropped.id,
                tempStoryId: dropped.tempStoryId,
                reason: .maxRetriesReached
            ))
        }
        items.append(item)
        saveToDisk()
        logger.info("Enqueued story publish \(item.id), queue size: \(self.items.count)")
        return item.tempStoryId
    }

    public func dequeue(_ itemId: String) {
        items.removeAll { $0.id == itemId }
        inFlightIds.remove(itemId)
        saveToDisk()
    }

    // MARK: - In-flight marking (E5 write-ahead)

    /// E5 — ids des items dont l'upload est piloté EN CE MOMENT par le chemin
    /// online de l'UI (write-ahead). VOLATILE à dessein : jamais persisté.
    /// Pendant la vie du process, `processNext()` saute ces items (pas de
    /// double publication pendant que l'upload UI tourne) ; après un kill le
    /// marqueur disparaît et l'item persisté redevient naturellement éligible
    /// au drain de boot — la sémantique « inflight orphelin → pending » sans
    /// champ persisté ni migration de format.
    private var inFlightIds: Set<String> = []

    public func markInFlight(_ itemId: String) {
        inFlightIds.insert(itemId)
    }

    public func clearInFlight(_ itemId: String) {
        inFlightIds.remove(itemId)
    }

    public func isInFlight(_ itemId: String) -> Bool {
        inFlightIds.contains(itemId)
    }

    public var pendingItems: [StoryPublishQueueItem] {
        items
    }

    /// Draft recovery — the most recent queued story that has been stuck
    /// (unpublished) for longer than `olderThan` seconds, so the composer can
    /// pre-fill it as a draft (the "pas envoyé dans la minute → offline" rule).
    /// `items` is append-ordered oldest→newest, so `.last(where:)` is the most
    /// recent match. `nil` when nothing has been stuck long enough.
    public func recoverLastStuckItem(olderThan threshold: TimeInterval) -> StoryPublishQueueItem? {
        let cutoff = Date().addingTimeInterval(-threshold)
        return items.last { $0.createdAt <= cutoff }
    }

    public var count: Int {
        items.count
    }

    public var isEmpty: Bool {
        items.isEmpty
    }

    public func clearAll() {
        items.removeAll()
        saveToDisk()
    }

    // MARK: - Processing Loop

    /// Walks the queue and attempts to publish each pending item via the
    /// injected `onPublish` handler. Successful items are removed and the
    /// associated `publishSucceeded` event is emitted. Failed items are
    /// retried according to the exponential backoff schedule, or moved to
    /// permanent failure once the retry budget is exhausted.
    public func processNext() async {
        guard !isProcessing, !items.isEmpty else { return }
        guard let publish = onPublish else {
            logger.warning("No publish handler set, skipping process")
            return
        }

        isProcessing = true
        defer { isProcessing = false }

        logger.info("Processing \(self.items.count) pending story publications")

        var successPayloads: [StoryPublishSuccess] = []
        var failurePayloads: [StoryPublishFailure] = []
        var permanentFailureIds: [String] = []
        var successIds: [String] = []

        for (index, item) in items.enumerated() {
            // E5 — un item write-ahead dont l'upload online est en cours dans
            // CE process ne doit pas être double-publié par le drain.
            if inFlightIds.contains(item.id) { continue }
            // Backoff between consecutive retries within the same processing
            // pass — small jitter to avoid thundering-herd on reconnect.
            if index > 0 {
                let jitter = UInt64(Double.random(in: 200...700) * 1_000_000)
                try? await Task.sleep(nanoseconds: jitter)
            }

            // Hash-check : every referenced local media must still exist.
            let missing = item.mediaReferences.filter {
                !FileManager.default.fileExists(atPath: $0.localFilePath)
            }
            if !missing.isEmpty {
                permanentFailureIds.append(item.id)
                failurePayloads.append(StoryPublishFailure(
                    queueId: item.id,
                    tempStoryId: item.tempStoryId,
                    reason: .missingLocalMedia(elementIds: missing.map(\.elementId))
                ))
                continue
            }

            do {
                let publishedId = try await publish(item)
                successIds.append(item.id)
                successPayloads.append(StoryPublishSuccess(
                    queueId: item.id,
                    tempStoryId: item.tempStoryId,
                    publishedStoryId: publishedId
                ))
            } catch is StoryPublishUnrecoverableError {
                permanentFailureIds.append(item.id)
                failurePayloads.append(StoryPublishFailure(
                    queueId: item.id,
                    tempStoryId: item.tempStoryId,
                    reason: .unrecoverable(message: "Server rejected the story (validation, expiry, or visibility constraint)")
                ))
            } catch {
                // Retryable failure : bump retryCount and stop processing the
                // queue (the next reconnect or scheduled retry will pick up
                // where we left off).
                if let idx = items.firstIndex(where: { $0.id == item.id }) {
                    items[idx].retryCount += 1
                    items[idx].lastError = error.localizedDescription

                    if items[idx].retryCount >= Self.maxRetries {
                        permanentFailureIds.append(item.id)
                        failurePayloads.append(StoryPublishFailure(
                            queueId: item.id,
                            tempStoryId: item.tempStoryId,
                            reason: .maxRetriesReached
                        ))
                    }
                }
                break
            }
        }

        // Apply the dispositions atomically before notifying observers.
        // E10 — une disposition TERMINALE (succès OU échec permanent) emporte
        // ses copies média locales : sans ce cleanup, chaque publication via
        // la queue laissait son dossier `meeshy_offline_queue/<tempStoryId>/`
        // orphelin sur disque (fuite confirmée it.12).
        for id in successIds + permanentFailureIds {
            if let item = items.first(where: { $0.id == id }) {
                removeLocalMedia(of: item)
            }
            items.removeAll { $0.id == id }
        }
        saveToDisk()

        for payload in successPayloads {
            publishSucceeded.send(payload)
        }
        for payload in failurePayloads {
            publishFailed.send(payload)
        }

        if !successIds.isEmpty || !permanentFailureIds.isEmpty {
            logger.info("Processed: \(successIds.count) succeeded, \(permanentFailureIds.count) permanently failed, \(self.items.count) still pending")
        }
    }

    /// E10 — supprime les copies média locales d'un item en disposition
    /// terminale puis chaque répertoire parent devenu VIDE (prudent : on ne
    /// touche jamais un dossier qui contient encore autre chose). Best-effort
    /// et agnostique du produit : la queue ne connaît que ses `mediaReferences`.
    private func removeLocalMedia(of item: StoryPublishQueueItem) {
        let fm = FileManager.default
        var parents: Set<URL> = []
        for ref in item.mediaReferences {
            let url = URL(fileURLWithPath: ref.localFilePath)
            try? fm.removeItem(at: url)
            parents.insert(url.deletingLastPathComponent())
        }
        for parent in parents {
            if let contents = try? fm.contentsOfDirectory(atPath: parent.path), contents.isEmpty {
                try? fm.removeItem(at: parent)
            }
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
                    // Stabilization delay matches OfflineQueue's pattern.
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    await self.processNext()
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
            logger.error("Failed to save story publish queue: \(error.localizedDescription)")
        }
    }

    private static func loadItemsFromDisk() -> [StoryPublishQueueItem] {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        let url = cacheDir.appendingPathComponent(queueFileName)
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }

        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode([StoryPublishQueueItem].self, from: data)
        } catch {
            return []
        }
    }
}

// MARK: - Unrecoverable Error Marker

/// Throw this from the `onPublish` handler to mark a publish failure as
/// permanent (4xx HTTP, validation rejected, story expired) so the queue
/// stops retrying and surfaces the failure to the user via `publishFailed`.
public struct StoryPublishUnrecoverableError: Error, Sendable {
    public let message: String

    public init(_ message: String = "Permanent publish failure") {
        self.message = message
    }
}

// MARK: - Test Helpers (internal)

#if DEBUG
extension StoryPublishQueue {
    /// Replaces the in-memory items wholesale. Used by tests to seed a known
    /// state without round-tripping through the disk persistence layer.
    func _testSetItems(_ items: [StoryPublishQueueItem]) {
        self.items = items
    }
}
#endif
