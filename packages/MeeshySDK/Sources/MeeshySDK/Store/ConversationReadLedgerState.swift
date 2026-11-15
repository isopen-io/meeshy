import Foundation

struct ConversationReadLedgerState: Sendable {
    private var entries: [String: ConversationReadEntry] = [:]
    private(set) var openConversationIds: Set<String> = []

    var openConversationId: String? {
        openConversationIds.count == 1 ? openConversationIds.first : nil
    }

    func state(for conversationId: String) -> ConversationReadState? {
        guard let entry = entries[conversationId] else { return nil }
        return ConversationReadState(
            conversationId: conversationId,
            unreadCount: entry.unreadCount,
            serverLastReadAt: entry.serverLastReadAt,
            isMuted: entry.isMuted,
            isOpen: openConversationIds.contains(conversationId)
        )
    }

    func counts() -> [String: Int] {
        Dictionary(uniqueKeysWithValues: entries.map { id, entry in
            (id, openConversationIds.contains(id) ? 0 : max(0, entry.unreadCount))
        })
    }

    func total(excludingOpen: Bool, excludingMuted: Bool) -> Int {
        entries.reduce(0) { acc, element in
            if excludingOpen, openConversationIds.contains(element.key) { return acc }
            if excludingMuted, element.value.isMuted { return acc }
            return acc + max(0, element.value.unreadCount)
        }
    }

    func conversationUnreadTotal(excludingOpen: Bool) -> Int {
        entries.reduce(0) { acc, element in
            if excludingOpen, openConversationIds.contains(element.key) { return acc }
            if element.value.isMuted { return acc }
            return element.value.unreadCount > 0 ? acc + 1 : acc
        }
    }

    mutating func apply(_ event: ConversationReadEvent) -> ConversationReadEntry? {
        switch event {
        case .localOpen(let conversationId):
            openConversationIds = conversationId.map { [$0] } ?? []
            return nil

        case .localOpenSet(let conversationIds):
            openConversationIds = conversationIds
            return nil

        case .snapshot(let rows, let source):
            applySnapshot(rows: rows, source: source)
            return nil

        case .forget(let conversationId):
            let before = entries.removeValue(forKey: conversationId)
            openConversationIds.remove(conversationId)
            return before

        case .serverUnread(let conversationId, _),
             .serverReceipt(let conversationId, _, _),
             .localMarkRead(let conversationId),
             .localMarkUnread(let conversationId):
            let before = entries[conversationId] ?? ConversationReadEntry()
            entries[conversationId] = ConversationReadPrecedence.resolve(before, event: event)
            return before
        }
    }

    mutating func reset() {
        entries.removeAll()
        openConversationIds = []
    }

    private mutating func applySnapshot(rows: [ConversationReadRow], source: ConversationReadSource) {
        var known: [String: ConversationReadEntry] = [:]
        for row in rows {
            var entry = entries[row.conversationId] ?? ConversationReadEntry()
            entry.isMuted = row.isMuted
            let isTracked = entries[row.conversationId] != nil
            if source == .server || !isTracked {
                entry.unreadCount = max(0, row.unreadCount)
            }
            known[row.conversationId] = entry
        }
        if source == .server {
            entries = known
        } else {
            for (id, entry) in known { entries[id] = entry }
        }
    }
}
