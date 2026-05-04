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
        let pending = readAndDeletePending()
        guard !pending.isEmpty else { return }

        logger.info("Consuming \(pending.count) NSE-prefetched messages")

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            let fmtFrac = ISO8601DateFormatter()
            fmtFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fmtFrac.date(from: dateStr) { return date }
            let fmtBasic = ISO8601DateFormatter()
            fmtBasic.formatOptions = [.withInternetDateTime]
            if let date = fmtBasic.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }

        let userId = AuthManager.shared.currentUser?.id ?? ""
        let username = AuthManager.shared.currentUser?.username

        for (conversationId, data) in pending {
            guard let apiMsg = try? decoder.decode(APIMessage.self, from: data) else { continue }
            let message = apiMsg.toMessage(currentUserId: userId, currentUsername: username)

            await CacheCoordinator.shared.messages.upsert(
                item: message,
                for: conversationId
            ) { existing, newItem in
                guard !existing.contains(where: { $0.id == newItem.id }) else { return existing }
                return (existing + [newItem]).sorted { $0.createdAt < $1.createdAt }
            }
        }

        if !pending.isEmpty {
            logger.info("Merged \(pending.count) NSE messages into cache")
        }
    }

    private func readAndDeletePending() -> [(conversationId: String, data: Data)] {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: Self.appGroupId
        ) else { return [] }

        let dir = container.appendingPathComponent(Self.pendingDirName, isDirectory: true)
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
            return []
        }

        var results: [(String, Data)] = []
        for file in files where file.pathExtension == "json" {
            let name = file.deletingPathExtension().lastPathComponent
            let parts = name.split(separator: "_", maxSplits: 1)
            guard parts.count == 2, let data = try? Data(contentsOf: file) else { continue }
            results.append((String(parts[0]), data))
            try? fm.removeItem(at: file)
        }
        return results
    }
}
