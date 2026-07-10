import Foundation
import os

// MARK: - PublishQueueForwarding (test seam)

/// Narrow protocol exposing only the `StoryPublishQueue` operations consumed
/// by the legacy-offline-queue migration and the `StoryOfflineQueue` adapter.
///
/// Lives next to `StoryQueueMigrator` so tests can inject a fake without
/// touching the singleton `StoryPublishQueue.shared`. The actor isolation
/// guarantees forwarded calls remain serialised even when the migration runs
/// on a background launch task.
public protocol PublishQueueForwarding: Sendable {
    @discardableResult
    func enqueue(_ item: StoryPublishQueueItem) async -> String
    func dequeueByTempStoryId(_ tempStoryId: String) async
    var pendingItems: [StoryPublishQueueItem] { get async }
    func clearAll() async
    func processNext() async
    func setPublishHandler(_ handler: @escaping @Sendable (StoryPublishQueueItem) async throws -> String) async
}

extension StoryPublishQueue: PublishQueueForwarding {

    /// Removes whichever entry currently carries the supplied `tempStoryId`.
    /// The adapter uses this to honour `StoryOfflineQueue.dequeue(itemId)`
    /// without leaking the publish-queue's UUID-based id back to callers.
    public func dequeueByTempStoryId(_ tempStoryId: String) async {
        if let match = pendingItems.first(where: { $0.tempStoryId == tempStoryId }) {
            dequeue(match.id)
        }
    }
}

// MARK: - StoryQueueMigrator

/// One-shot migration that drains the legacy `StoryOfflineQueue` JSON file
/// stored under `applicationSupportDirectory/StoryOfflineQueue/` into the
/// unified `StoryPublishQueue` (`Documents/meeshy_cache/`).
///
/// The migration is idempotent : if the source file is absent (already
/// migrated, or never existed) the call is a no-op. The source file is
/// deleted only AFTER every item has been forwarded to the publish queue,
/// so an interrupted launch retries on the next cold-start.
///
/// Corrupted JSON is logged and treated as "no migratable items" — the
/// source file is renamed with a `.corrupted-<timestamp>` suffix so it stops
/// blocking subsequent boots while preserving the bytes for forensic
/// inspection.
public enum StoryQueueMigrator {

    /// Logger category mirrors the existing `StoryOfflineQueueBootstrap`
    /// subsystem so migrator + bootstrap logs interleave cleanly.
    private static let logger = Logger(subsystem: "com.meeshy.sdk", category: "story-queue-migrator")

    /// Returns the legacy file URL when present on disk. Builds the path
    /// without creating the parent directory so the check stays side-effect
    /// free on the happy path (no legacy file).
    static func legacyQueueFileURL() -> URL? {
        guard let base = try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: false
        ) else { return nil }
        let dir = base.appendingPathComponent("StoryOfflineQueue", isDirectory: true)
        return dir.appendingPathComponent("story_offline_queue.json")
    }

    /// Walks the legacy file, decodes the items, forwards each to the
    /// supplied `PublishQueueForwarding`, then removes the source file.
    ///
    /// - Parameter publishQueue: defaults to `StoryPublishQueue.shared` ;
    ///   tests inject a fake to verify the converter without touching the
    ///   real singleton.
    /// - Returns: the number of items migrated. `0` means either the file
    ///   was absent or it could not be parsed (the file is renamed in that
    ///   case so the second run sees no work).
    @discardableResult
    public static func migrateLegacyOfflineQueue(
        publishQueue: any PublishQueueForwarding = StoryPublishQueue.shared
    ) async -> Int {
        guard let url = legacyQueueFileURL(),
              FileManager.default.fileExists(atPath: url.path) else {
            return 0
        }

        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            logger.error("Failed to read legacy offline queue file: \(error.localizedDescription)")
            return 0
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let legacyItems: [StoryOfflineQueueItem]
        do {
            legacyItems = try decoder.decode([StoryOfflineQueueItem].self, from: data)
        } catch {
            logger.error("""
                Legacy offline queue file is corrupted, renaming and skipping: \
                \(error.localizedDescription)
                """)
            quarantineCorruptedFile(at: url)
            return 0
        }

        guard !legacyItems.isEmpty else {
            removeSourceFile(at: url)
            return 0
        }

        for legacyItem in legacyItems {
            let converted = StoryQueueItemConverter.convert(legacyItem)
            await publishQueue.enqueue(converted)
        }

        removeSourceFile(at: url)
        logger.info("Migrated \(legacyItems.count) story items from legacy offline queue")
        return legacyItems.count
    }

    private static func removeSourceFile(at url: URL) {
        do {
            try FileManager.default.removeItem(at: url)
        } catch {
            logger.error("Failed to delete legacy queue file after migration: \(error.localizedDescription)")
        }
    }

    private static func quarantineCorruptedFile(at url: URL) {
        let stamp = Int(Date().timeIntervalSince1970)
        let dest = url.deletingPathExtension().appendingPathExtension("corrupted-\(stamp)")
        do {
            try FileManager.default.moveItem(at: url, to: dest)
        } catch {
            logger.error("Failed to quarantine corrupted queue file: \(error.localizedDescription)")
        }
    }
}

// MARK: - StoryQueueItemConverter

/// Pure converter between the legacy `StoryOfflineQueueItem` payload (used by
/// `StoryOfflineQueue` and the `TimelineViewModel` offline path) and the
/// unified `StoryPublishQueueItem` consumed by `StoryPublishQueue`.
///
/// The converter is intentionally `enum`-based and side-effect free so it can
/// be unit-tested in isolation and reused by both the migration entry point
/// and the live `StoryOfflineQueue` adapter.
public enum StoryQueueItemConverter {

    /// Builds a `StoryPublishQueueItem` from a legacy offline item. The
    /// legacy `id` is carried over as the publish item's `tempStoryId` so
    /// downstream callers using `StoryOfflineQueue.dequeue(itemId)` can still
    /// locate the forwarded row after the bridge.
    public static func convert(_ legacy: StoryOfflineQueueItem) -> StoryPublishQueueItem {
        let payload = Data(legacy.slidePayloadJSON.utf8)
        let references = mediaReferences(from: legacy)
        return StoryPublishQueueItem(
            visibility: legacy.visibility,
            slidesPayload: payload,
            repostOfId: nil,
            mediaReferences: references,
            tempStoryId: legacy.id
        )
    }

    /// Flattens the legacy `mediaURLPaths` + `audioURLPaths` dictionaries
    /// into a deterministic array of `StoryMediaReference` (sorted by
    /// elementId so tests can compare results stably).
    private static func mediaReferences(from legacy: StoryOfflineQueueItem) -> [StoryMediaReference] {
        let mediaRefs = legacy.mediaURLPaths
            .sorted { $0.key < $1.key }
            .map { key, path in
                StoryMediaReference(elementId: key, mediaType: "image", localFilePath: path)
            }
        let audioRefs = legacy.audioURLPaths
            .sorted { $0.key < $1.key }
            .map { key, path in
                StoryMediaReference(elementId: key, mediaType: "audio", localFilePath: path)
            }
        return mediaRefs + audioRefs
    }
}
