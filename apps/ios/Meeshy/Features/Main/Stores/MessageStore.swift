// apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift

import Foundation
import Observation
import Combine
import GRDB
import MeeshySDK

/// Sendable weak-reference box. Used to capture a weak reference to a
/// `@MainActor`-isolated class in a `@Sendable` closure WITHOUT triggering
/// Swift 6 strict concurrency's `_swift_task_checkIsolatedSwift` assertion
/// at closure invocation (which would fire when the closure runs off-actor).
/// The box itself is `@unchecked Sendable` because the wrapped reference
/// is `weak` and access is gated by the unwrap site (callers must hop to
/// the right actor before touching the value).
private final class WeakBox<T: AnyObject>: @unchecked Sendable {
    weak var value: T?
    init(_ value: T) { self.value = value }
}

/// Holds cancellation tokens that must be accessible from `nonisolated deinit`.
/// Explicitly non-isolated so its methods can be called from any context.
private final class ObservationTokens: @unchecked Sendable {
    nonisolated(unsafe) var regionCancellable: AnyDatabaseCancellable?
    nonisolated(unsafe) var refreshTask: Task<Void, Never>?

    nonisolated func cancelAll() {
        regionCancellable?.cancel()
        refreshTask?.cancel()
    }
}

/// Describes which slice of the conversation the store is currently displaying.
public enum WindowMode: Equatable, Sendable {
    /// Latest window — show the most recent N messages.
    case latest
    /// Jumped window — show messages centered around a specific date.
    case around(date: Date)
}

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

    // MARK: - Window Mode

    /// The current display window. `.latest` shows the most recent messages;
    /// `.around(date:)` shows a centered slice used during jump-to-message UX.
    private(set) var windowMode: WindowMode = .latest

    // MARK: - Internal

    let conversationId: String
    private let persistence: MessagePersistenceActor
    private var windowAnchor: Date?
    private var _idIndex: [String: Int]?
    /// Stored as `let` so it is accessible from `nonisolated deinit` without
    /// crossing actor isolation boundaries. Mutation is via its own mutable properties,
    /// guarded by the `@MainActor` isolation of MessageStore.
    private let tokens = ObservationTokens()

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

        // Use ValueObservation with explicit `.async(onQueue: .main)` scheduling
        // instead of DatabaseRegionObservation. GRDB then runs its tracking
        // fetch on its own reader queue and DELIVERS the onChange callback to
        // us already on the main queue. Our closure never executes on the
        // GRDB writer queue, so Swift 6's `_swift_task_checkIsolatedSwift`
        // assertion (which fires when a @MainActor-context closure is invoked
        // off-actor) is structurally avoided.
        //
        // The tracked value is a trivial row-id snapshot — we only use it as
        // a "something changed" signal, then call our refreshFromDB() which
        // honors the current windowMode.
        let observation = ValueObservation.tracking { db in
            try Int.fetchOne(
                db,
                sql: "SELECT COUNT(*) FROM \(MessageRecord.databaseTableName) WHERE conversationId = ?",
                arguments: [convId]
            ) ?? 0
        }

        let tokensRef = tokens
        let weakStore = WeakBox(self)
        tokens.regionCancellable = AnyDatabaseCancellable(observation.start(
            in: dbPool,
            scheduling: .async(onQueue: .main),
            onError: { _ in },
            onChange: { _ in
                // Already on main queue (ValueObservation scheduling).
                tokensRef.refreshTask?.cancel()
                tokensRef.refreshTask = Task { @MainActor in
                    guard let store = weakStore.value else { return }
                    let delay: Duration = store.isUserScrolling
                        ? .milliseconds(200)
                        : .milliseconds(16)
                    try? await Task.sleep(for: delay)
                    guard !Task.isCancelled else { return }
                    await store.refreshFromDB()
                }
            }
        ))
    }

    func stopObserving() {
        tokens.regionCancellable = nil
        tokens.refreshTask?.cancel()
        tokens.refreshTask = nil
    }

    // MARK: - Lifecycle

    nonisolated deinit {
        // `tokens` is a `let` reference — accessible from nonisolated deinit.
        // `ObservationTokens` is `@unchecked Sendable` with internal mutation
        // guarded by MainActor at call sites. At deinit time, no concurrent
        // access is possible (the object is being destroyed).
        tokens.cancelAll()
    }

    // MARK: - Off-main DB read + progressive decrypt

    func refreshFromDB() async {
        let convId = conversationId
        let mode = windowMode
        let anchor = windowAnchor
        let windowSize = Self.windowSize
        let reader = persistence.reader

        let newRecords = await Task.detached(priority: .userInitiated) {
            switch mode {
            case .around(let centerDate):
                // Window centered on centerDate: half-window before + half-window after.
                return try? reader.read { db in
                    let half = windowSize / 2
                    let before = try MessageRecord
                        .filter(Column("conversationId") == convId)
                        .filter(Column("createdAt") <= centerDate)
                        .order(Column("createdAt").desc)
                        .limit(half)
                        .fetchAll(db)
                    let after = try MessageRecord
                        .filter(Column("conversationId") == convId)
                        .filter(Column("createdAt") > centerDate)
                        .order(Column("createdAt").asc)
                        .limit(half)
                        .fetchAll(db)
                    return Array(before.reversed()) + after
                }
            case .latest:
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

    // MARK: - Window Switching

    /// Switches the window to be centered around `date`, then refreshes from DB.
    /// Used by jump-to-message UX. Returns when the new window has been loaded.
    public func loadWindow(around date: Date) async {
        windowMode = .around(date: date)
        windowAnchor = nil
        await refreshFromDB()
    }

    /// Restores the latest window. Used when returning from a jumped state.
    public func restoreLatestWindow() async {
        windowMode = .latest
        windowAnchor = nil
        await refreshFromDB()
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
