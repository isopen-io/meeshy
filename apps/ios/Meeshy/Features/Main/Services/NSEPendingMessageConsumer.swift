import Foundation
import MeeshySDK
import os

@MainActor
final class NSEPendingMessageConsumer {
    static let shared = NSEPendingMessageConsumer()

    private static let appGroupId = "group.me.meeshy.apps"
    private static let pendingDirName = "nse_pending_messages"
    private let logger = Logger(subsystem: "me.meeshy.app", category: "nse-consumer")

    private init() {}

    func consumeAll() async {
        let pending = readPending()
        guard !pending.isEmpty else { return }

        logger.info("Consuming \(pending.count) NSE-prefetched messages")

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            // Modern Date.ISO8601FormatStyle supports fractional seconds and
            // is more efficient than legacy ISO8601DateFormatter.
            if let date = try? Date(dateStr, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) {
                return date
            }
            if let date = try? Date(dateStr, strategy: .iso8601) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }

        let userId = AuthManager.shared.currentUser?.id ?? ""
        let username = AuthManager.shared.currentUser?.username

        let fm = FileManager.default
        var decodedAPIMessages: [APIMessage] = []
        var consumedFiles: [URL] = []
        for item in pending {
            guard let apiMsg = try? decoder.decode(APIMessage.self, from: item.data) else {
                // Corrupt payload — log and drop so it isn't re-read every launch.
                logger.error("NSE prefetch decode failed for \(item.conversationId, privacy: .public) — dropping \(item.url.lastPathComponent, privacy: .public)")
                do { try fm.removeItem(at: item.url) } catch {
                    logger.error("NSE prefetch file removal failed: \(error.localizedDescription, privacy: .public)")
                }
                continue
            }
            decodedAPIMessages.append(apiMsg)
            consumedFiles.append(item.url)
            let message = apiMsg.toMessage(currentUserId: userId, currentUsername: username)

            await CacheCoordinator.shared.messages.upsert(
                item: message,
                for: item.conversationId
            ) { existing, newItem in
                guard !existing.contains(where: { $0.id == newItem.id }) else { return existing }
                return (existing + [newItem]).sorted { $0.createdAt < $1.createdAt }
            }
        }

        // The CacheCoordinator upsert above only feeds the conversation LIST
        // (preview, ordering). The conversation timeline reads GRDB — persist
        // there too, or a push-prefetched message stays invisible inside the
        // conversation until the next REST revalidation.
        //
        // Use the AWAITED `upsertFromAPIMessages` (commits before returning),
        // not the fire-and-forget `bufferIncomingAPIMessages` (yields onto an
        // async write worker). The conversation-open path calls `consumeAll`
        // right before reading its GRDB snapshot: only an awaited commit
        // guarantees the just-consumed push message is in that snapshot, so it
        // renders INSTANTLY from local data with no network round-trip.
        guard !decodedAPIMessages.isEmpty else { return }
        do {
            try await DependencyContainer.shared.messagePersistence
                .upsertFromAPIMessages(decodedAPIMessages)
            // Only drop the prefetch files once the messages are committed to GRDB,
            // so a persist failure leaves them on disk to retry next launch instead
            // of silently dropping the push-prefetched message.
            for url in consumedFiles { try? fm.removeItem(at: url) }
            logger.info("Merged \(decodedAPIMessages.count) NSE messages into cache")
        } catch {
            logger.error("NSE message persist failed, keeping \(consumedFiles.count) file(s) for retry: \(error.localizedDescription)")
        }
    }

    /// Reads (without deleting) every prefetched message blob. Deletion is deferred
    /// to ``consumeAll`` and happens only after the GRDB commit succeeds, so a
    /// transient failure never drops a push-prefetched message off disk.
    private func readPending() -> [(conversationId: String, url: URL, data: Data)] {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: Self.appGroupId
        ) else { return [] }

        let dir = container.appendingPathComponent(Self.pendingDirName, isDirectory: true)
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
            return []
        }

        var results: [(conversationId: String, url: URL, data: Data)] = []
        for file in files where file.pathExtension == "json" {
            let name = file.deletingPathExtension().lastPathComponent
            let parts = name.split(separator: "_", maxSplits: 1)
            guard parts.count == 2, let data = try? Data(contentsOf: file) else { continue }
            results.append((conversationId: String(parts[0]), url: file, data: data))
        }
        return results
    }
}
