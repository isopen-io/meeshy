import Foundation

struct OpenConversationLedger: Sendable {
    /// Conversations actuellement affichées, avec leur nombre d'ouvertures (iPad multi-fenêtre).
    var openCounts: [String: Int] = [:]
    /// Ordre d'ouverture, la plus récente en dernier.
    var openOrder: [String] = []
    /// Le compte à REDONNER à chaque conversation ouverte quand elle se ferme (#7350, I-2).
    var unreadToRestoreOnClose: [String: Int] = [:]
    /// Miroir SYNCHRONE du `unreadCount` de chaque conversation en cache.
    var unreadByConversation: [String: Int] = [:]
    /// Une entrée présente EST la fenêtre d'accusé de réception ouverte de cette conversation.
    var markAsReceivedTasks: [String: Task<Void, Never>] = [:]

    var currentlyOpenId: String? { openOrder.last }

    mutating func open(_ id: String) -> Bool {
        let count = openCounts[id, default: 0]
        openCounts[id] = count + 1
        openOrder.removeAll { $0 == id }
        openOrder.append(id)
        guard count == 0 else { return false }
        unreadToRestoreOnClose[id] = unreadByConversation[id]
        unreadByConversation[id] = 0
        return true
    }

    mutating func close(_ id: String) -> (closed: Bool, restore: Int?) {
        guard let count = openCounts[id] else { return (false, nil) }
        guard count == 1 else {
            openCounts[id] = count - 1
            return (false, nil)
        }
        openCounts.removeValue(forKey: id)
        openOrder.removeAll { $0 == id }
        return (true, unreadToRestoreOnClose.removeValue(forKey: id))
    }

    mutating func replaceAll(except id: String?) -> [String] {
        let others = openOrder.filter { $0 != id }
        for other in others { openCounts[other] = 1 }
        return others
    }

    mutating func noteUnreadRemaining(_ id: String, _ remaining: Int) {
        guard openCounts[id] != nil else { return }
        unreadToRestoreOnClose[id] = max(0, remaining)
    }

    func aggregateUnread() -> Int {
        unreadByConversation.reduce(0) { acc, entry in
            guard openCounts[entry.key] == nil else { return acc }
            return acc + max(0, entry.value)
        }
    }

    @discardableResult
    mutating func armReceiptWindow(_ id: String, make: () -> Task<Void, Never>) -> Bool {
        guard markAsReceivedTasks[id] == nil else { return false }
        markAsReceivedTasks[id] = make()
        return true
    }

    mutating func closeReceiptWindow(_ id: String) {
        markAsReceivedTasks.removeValue(forKey: id)
    }

    mutating func takeAllReceiptTasks() -> [Task<Void, Never>] {
        let tasks = Array(markAsReceivedTasks.values)
        markAsReceivedTasks.removeAll()
        return tasks
    }
}
