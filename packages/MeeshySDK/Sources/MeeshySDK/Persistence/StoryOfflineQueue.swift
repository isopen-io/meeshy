import Foundation
import os

// MARK: - Story Offline Queue Item

/// Snapshot d'une story en attente de publish (offline-first, Timeline composer).
///
/// Co-existed with `StoryPublishQueueItem` historically. Since the 2026-05-12
/// queue unification (cf. `packages/MeeshySDK/decisions.md`) this struct is
/// only kept as the wire format consumed by `TimelineViewModel` and by the
/// legacy disk file format that `StoryQueueMigrator` drains on cold start —
/// every `enqueue` call is forwarded to `StoryPublishQueue` so there is now
/// a SINGLE persisted store for pending stories.
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

// MARK: - Story Offline Queue — adapter over StoryPublishQueue

/// Thin adapter that forwards every operation to `StoryPublishQueue`.
///
/// Historically `StoryOfflineQueue` owned its own JSON file under
/// `.applicationSupportDirectory` with FIFO semantics. That created a parallel
/// persistence path next to `StoryPublishQueue` (`Documents/meeshy_cache/`)
/// and made it possible to lose items depending on which call-site enqueued
/// them. The 2026-05-12 unification kept the public surface of this type but
/// rewired the implementation so every enqueue goes through the unified
/// `StoryPublishQueue` (retry + exponential backoff + max-5 attempts).
///
/// The legacy disk file is drained on cold start by `StoryQueueMigrator` —
/// callers that still rely on the snapshot semantics (`pendingItems`,
/// `dequeue`, `flush`, `setOnPublish`, `purge`) keep working unchanged.
public actor StoryOfflineQueue: OfflineQueueProviding {
    public static let shared = StoryOfflineQueue()

    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "story-offline-queue")
    private let publishQueue: any PublishQueueForwarding

    private init() {
        self.publishQueue = StoryPublishQueue.shared
    }

    /// Internal test seam : creates an isolated adapter wired to a fake
    /// publish queue. Production code uses `StoryOfflineQueue.shared`.
    internal init(forwardingTo publishQueue: any PublishQueueForwarding) {
        self.publishQueue = publishQueue
    }

    // MARK: - Queue operations

    public func enqueue(_ item: StoryOfflineQueueItem) async {
        let converted = StoryQueueItemConverter.convert(item)
        await publishQueue.enqueue(converted)
        logger.info("Forwarded story \(item.id) to StoryPublishQueue")
    }

    public func dequeue(_ itemId: String) async {
        await publishQueue.dequeueByTempStoryId(itemId)
    }

    public var pendingItems: [StoryOfflineQueueItem] {
        get async {
            let publishItems = await publishQueue.pendingItems
            return publishItems.map(StoryQueueItemConverter.reverse)
        }
    }

    /// Replaces the legacy publish handler. The handler keeps the historical
    /// `Bool` signature ; the adapter translates `false` into a retryable
    /// error and `true` into a synthetic published id so `StoryPublishQueue`
    /// can drive its retry loop. The adapter wraps the handler before
    /// forwarding so the publish queue sees the typed signature.
    public func setOnPublish(_ handler: @escaping @Sendable (StoryOfflineQueueItem) async -> Bool) async {
        await publishQueue.setPublishHandler { item in
            let legacyItem = StoryQueueItemConverter.reverse(item)
            let succeeded = await handler(legacyItem)
            if succeeded {
                return item.tempStoryId
            }
            throw StoryOfflineRetryableError.handlerReportedFailure
        }
    }

    /// Drains the queue by triggering the unified processor.
    public func flush() async {
        await publishQueue.processNext()
    }

    /// Remove all items (used by tests and explicit user action).
    public func purge() async {
        await publishQueue.clearAll()
    }

    /// Test seam preserved for backward compatibility ; under the adapter
    /// the legacy disk file no longer exists, so reload is a no-op once
    /// `StoryQueueMigrator` has run.
    public func reloadFromDisk() {
        // No-op : the unified `StoryPublishQueue` loads its own persisted
        // items at init time. The legacy file (if any) is drained by
        // `StoryQueueMigrator.migrateLegacyOfflineQueue()`.
    }
}

// MARK: - Retry signal

/// Adapter-internal error thrown when the legacy `Bool` handler reports a
/// retryable failure. `StoryPublishQueue` treats any non-`StoryPublishUnrecoverableError`
/// throw as retryable, which is exactly the legacy `false`-return semantic.
private struct StoryOfflineRetryableError: Error, Sendable {
    static let handlerReportedFailure = StoryOfflineRetryableError()
}

// MARK: - Reverse converter

extension StoryQueueItemConverter {

    /// Rebuilds a `StoryOfflineQueueItem` from a unified `StoryPublishQueueItem`.
    /// `originalLanguage` round-trips through the publish item now that the
    /// latter persists it (Prisme Linguistique). `slideIds` are recovered from
    /// the serialized slide payload — NOT from `mediaReferences`, whose
    /// `elementId`s are media object ids, not slide ids. Callers that round-trip
    /// the same item observe the original `id` via `tempStoryId` which the
    /// forward converter carries through.
    public static func reverse(_ unified: StoryPublishQueueItem) -> StoryOfflineQueueItem {
        let payloadString = String(data: unified.slidesPayload, encoding: .utf8) ?? "{}"
        let mediaPairs = unified.mediaReferences
            .filter { $0.mediaType != "audio" }
            .map { ($0.elementId, $0.localFilePath) }
        let audioPairs = unified.mediaReferences
            .filter { $0.mediaType == "audio" }
            .map { ($0.elementId, $0.localFilePath) }
        // `item` est décodé depuis le disque → `mediaReferences` n'a AUCUN invariant
        // d'unicité (corruption, schéma futur, ou bug producteur). De plus `mediaPairs`
        // fusionne image+video (`mediaType != "audio"`), donc un `elementId` partagé
        // entre une ref image et une ref video collisionnerait. `Dictionary(uniqueKeysWithValues:)`
        // TRAPPE sur clé dupliquée → crash du chemin publish (setOnPublish appelle `reverse`
        // par item) et de `pendingItems`. Last-wins défensif au franchissement du trust boundary.
        let mediaPaths = Dictionary(mediaPairs, uniquingKeysWith: { _, last in last })
        let audioPaths = Dictionary(audioPairs, uniquingKeysWith: { _, last in last })

        return StoryOfflineQueueItem(
            id: unified.tempStoryId,
            slideIds: extractSlideIds(fromPayload: payloadString),
            slidePayloadJSON: payloadString,
            mediaURLPaths: mediaPaths,
            audioURLPaths: audioPaths,
            originalLanguage: unified.originalLanguage,
            visibility: unified.visibility
        )
    }

    /// Extracts slide identifiers from the serialized slide payload. The
    /// payload is either a `{"slides":[{"id":...}]}` object or a bare
    /// `[{"id":...}]` array — both are accepted. Returns `[]` when the payload
    /// cannot be parsed.
    private static func extractSlideIds(fromPayload payloadString: String) -> [String] {
        guard let data = payloadString.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) else {
            return []
        }
        let slideObjects: [[String: Any]]
        if let object = root as? [String: Any], let slides = object["slides"] as? [[String: Any]] {
            slideObjects = slides
        } else if let array = root as? [[String: Any]] {
            slideObjects = array
        } else {
            return []
        }
        return slideObjects.compactMap { $0["id"] as? String }
    }
}
