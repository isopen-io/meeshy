import Foundation

public actor ReconnectionGapDetector {
    private let persistence: MessagePersistenceActor
    private let messageService: any MessageServiceProviding
    private var lastReceivedTimestamps: [String: Date] = [:]
    private var activeConversations: Set<String> = []
    private let syncSemaphore = AsyncSemaphore(limit: 3)

    private static let userDefaultsKey = "gap_detector_timestamps"
    private static let maxTotalMessages = 1000
    private static let pageSize = 100

    public init(persistence: MessagePersistenceActor, messageService: any MessageServiceProviding) {
        self.persistence = persistence
        self.messageService = messageService
        lastReceivedTimestamps = Self.loadTimestamps()
    }

    public func activate(conversationId: String) {
        activeConversations.insert(conversationId)
    }

    public func deactivate(conversationId: String) {
        activeConversations.remove(conversationId)
    }

    public func recordReceived(conversationId: String, at date: Date) {
        let current = lastReceivedTimestamps[conversationId]
        guard current == nil || date > current! else { return }
        lastReceivedTimestamps[conversationId] = date
        persistTimestamps()
    }

    public func onReconnected() async {
        await withTaskGroup(of: Void.self) { group in
            for convId in activeConversations {
                group.addTask { await self.syncGap(for: convId) }
            }
        }
    }

    private func syncGap(for conversationId: String) async {
        await syncSemaphore.wait()
        defer { Task { await syncSemaphore.signal() } }

        var totalFetched = 0

        while totalFetched < Self.maxTotalMessages {
            guard let response = try? await messageService.list(
                conversationId: conversationId,
                offset: totalFetched,
                limit: Self.pageSize,
                includeReplies: false
            ) else { break }

            let messages = response.data
            guard !messages.isEmpty else { break }

            let incoming = messages.map {
                MessagePersistenceActor.IncomingMessageData(
                    id: $0.id,
                    conversationId: $0.conversationId,
                    senderId: $0.senderId,
                    content: $0.content,
                    createdAt: $0.createdAt,
                    computedState: .sent
                )
            }
            await persistence.bufferIncoming(incoming)

            totalFetched += messages.count

            if let last = messages.last {
                lastReceivedTimestamps[conversationId] = last.createdAt
            }

            if messages.count < Self.pageSize { break }
        }

        persistTimestamps()
    }

    nonisolated(unsafe) private static let appGroupDefaults = UserDefaults(suiteName: "group.me.meeshy.apps") ?? .standard

    private func persistTimestamps() {
        let data = try? JSONEncoder().encode(lastReceivedTimestamps)
        Self.appGroupDefaults.set(data, forKey: Self.userDefaultsKey)
    }

    private static func loadTimestamps() -> [String: Date] {
        guard let data = appGroupDefaults.data(forKey: userDefaultsKey),
              let decoded = try? JSONDecoder().decode([String: Date].self, from: data) else {
            return [:]
        }
        return decoded
    }
}

/// Simple async semaphore for concurrency limiting
public actor AsyncSemaphore {
    private var count: Int
    private var waiters: [CheckedContinuation<Void, Never>] = []

    public init(limit: Int) {
        self.count = limit
    }

    public func wait() async {
        if count > 0 {
            count -= 1
        } else {
            await withCheckedContinuation { waiters.append($0) }
        }
    }

    public func signal() {
        if let waiter = waiters.first {
            waiters.removeFirst()
            waiter.resume()
        } else {
            count += 1
        }
    }
}
