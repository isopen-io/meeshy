// apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift

import Foundation
import Observation
import Combine
import GRDB
import MeeshySDK

@Observable
@MainActor
public final class MessageStore {
    static let windowSize = 200
    static let prefetchThreshold = 30

    // MARK: - Public State

    private(set) var messages: [MessageRecord] = []
    private(set) var sections: [MessageSection] = []
    private(set) var unreadBelowCount: Int = 0
    var currentVisibleMessageIds: Set<String> = []
    var isUserScrolling = false

    // MARK: - Internal

    let conversationId: String
    private let persistence: MessagePersistenceActor
    private var windowAnchor: Date?
    private var _idIndex: [String: Int]?
    private var regionCancellable: AnyDatabaseCancellable?

    // Change signal for UICollectionView observation
    let messagesDidChange = PassthroughSubject<Void, Never>()

    struct MessageSection: Sendable {
        let date: DateComponents
        let messageIds: [String]
    }

    init(conversationId: String, persistence: MessagePersistenceActor) {
        self.conversationId = conversationId
        self.persistence = persistence
    }

    // MARK: - Observation

    func startObserving(dbPool: any DatabaseWriter) {
        stopObserving()
        let convId = conversationId
        let request = MessageRecord
            .filter(Column("conversationId") == convId)

        var refreshTask: Task<Void, Never>?

        regionCancellable = DatabaseRegionObservation(tracking: request)
            .start(in: dbPool, onError: { _ in }) { [weak self] _ in
                refreshTask?.cancel()
                refreshTask = Task { [weak self] in
                    guard let self else { return }
                    let delay: Duration = self.isUserScrolling
                        ? .milliseconds(200)
                        : .milliseconds(16)
                    try? await Task.sleep(for: delay)
                    guard !Task.isCancelled else { return }
                    await self.refreshFromDB()
                }
            }
    }

    func stopObserving() {
        regionCancellable = nil
    }

    // MARK: - Off-main DB read + progressive decrypt

    private func refreshFromDB() async {
        let convId = conversationId
        let anchor = windowAnchor
        let windowSize = Self.windowSize
        let reader = persistence.reader

        let newRecords = await Task.detached(priority: .userInitiated) {
            if let anchor {
                return try? reader.read { db in
                    try MessageRecord
                        .filter(Column("conversationId") == convId)
                        .filter(Column("createdAt") >= anchor)
                        .order(Column("createdAt").asc)
                        .limit(windowSize)
                        .fetchAll(db)
                }
            } else {
                return try? reader.read { db in
                    try Array(MessageRecord
                        .filter(Column("conversationId") == convId)
                        .order(Column("createdAt").desc)
                        .limit(windowSize)
                        .fetchAll(db)
                        .reversed())
                }
            }
        }.value

        guard let newRecords, newRecords != messages else { return }

        messages = newRecords
        _idIndex = nil
        recomputeSections()
        messagesDidChange.send()
    }

    // MARK: - Load Initial

    func loadInitial() async {
        await refreshFromDB()
    }

    // MARK: - Pagination

    func loadOlder(before: Date) async -> Bool {
        let convId = conversationId
        let reader = persistence.reader

        let older = await Task.detached(priority: .userInitiated) {
            try? reader.read { db in
                try MessageRecord
                    .filter(Column("conversationId") == convId)
                    .filter(Column("createdAt") < before)
                    .order(Column("createdAt").desc)
                    .limit(50)
                    .fetchAll(db)
            }
        }.value

        guard let older, !older.isEmpty else { return false }
        windowAnchor = older.last?.createdAt
        await refreshFromDB()
        return true
    }

    // MARK: - Lookup

    func index(of localId: String) -> Int? {
        if _idIndex == nil {
            var idx = [String: Int](minimumCapacity: messages.count)
            for (i, m) in messages.enumerated() { idx[m.localId] = i }
            _idIndex = idx
        }
        return _idIndex?[localId]
    }

    func message(for localId: String) -> MessageRecord? {
        guard let i = index(of: localId) else { return nil }
        return messages[i]
    }

    func post(for id: String) -> MessageRecord? {
        message(for: id)
    }

    // MARK: - Sections

    private func recomputeSections() {
        let calendar = Calendar.current
        var grouped: [(DateComponents, [String])] = []
        var currentDate: DateComponents?
        var currentIds: [String] = []

        for msg in messages {
            let components = calendar.dateComponents([.year, .month, .day], from: msg.createdAt)
            if components == currentDate {
                currentIds.append(msg.localId)
            } else {
                if let date = currentDate {
                    grouped.append((date, currentIds))
                }
                currentDate = components
                currentIds = [msg.localId]
            }
        }
        if let date = currentDate {
            grouped.append((date, currentIds))
        }

        sections = grouped.map { MessageSection(date: $0.0, messageIds: $0.1) }
    }
}
