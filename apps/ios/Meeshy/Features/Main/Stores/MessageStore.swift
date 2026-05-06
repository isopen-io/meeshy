// apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift

import Foundation
import Observation
import Combine
// `@preconcurrency` relaxes Swift 6 strict concurrency interop checks for the
// GRDB module. Without it, the runtime injects `_swift_task_checkIsolatedSwift`
// at the invocation of @Sendable closures we pass to GRDB observation APIs,
// which then aborts because GRDB calls the closure from its own reader/writer
// dispatch queue (not from any actor's executor).
@preconcurrency import GRDB
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

// Notification.Name `messageStoreShouldRefresh` is defined in
// `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift`
// so both MessageStore (iOS app) and MessagePersistenceActor (SDK) can use it.

/// Fetches the message window from GRDB based on `WindowMode`. Declared at
/// file scope so the closure(s) passed to `reader.read` don't inherit any
/// actor isolation context (which would trigger Swift 6 strict concurrency
/// runtime checks at GRDB invocation).
private func fetchMessageWindow(
    reader: any DatabaseWriter,
    convId: String,
    mode: WindowMode,
    anchor: Date?,
    windowSize: Int
) throws -> [MessageRecord] {
    switch mode {
    case .around(let centerDate):
        return try reader.read { db in
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
            return try reader.read { db in
                try MessageRecord
                    .filter(Column("conversationId") == convId)
                    .filter(Column("createdAt") >= anchor)
                    .order(Column("createdAt").asc)
                    .limit(windowSize)
                    .fetchAll(db)
            }
        } else {
            return try reader.read { db in
                try Array(MessageRecord
                    .filter(Column("conversationId") == convId)
                    .order(Column("createdAt").desc)
                    .limit(windowSize)
                    .fetchAll(db)
                    .reversed())
            }
        }
    }
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

        // GRDB ValueObservation / DatabaseRegionObservation crash under Swift 6
        // strict concurrency: passing any @Sendable closure to GRDB triggers
        // _swift_task_checkIsolatedSwift at invocation from GRDB's dispatch
        // queues, even with @preconcurrency import GRDB and zero isolated
        // captures. Workaround: subscribe to a NotificationCenter signal that
        // MessagePersistenceActor posts after every write. The notification
        // handler already runs on .main queue, so the refresh is dispatched
        // safely. Real-time updates lose nothing — every code path that
        // mutates GRDB now also posts the notification.
        let weakStore = WeakBox(self)
        let observer = NotificationCenter.default.addObserver(
            forName: .messageStoreShouldRefresh,
            object: nil,
            queue: .main
        ) { notif in
            guard let notifConvId = notif.userInfo?["conversationId"] as? String,
                  notifConvId == convId else { return }
            Task { @MainActor in
                guard let store = weakStore.value else { return }
                await store.refreshFromDB()
            }
        }
        // Wrap the NotificationCenter observer in an AnyDatabaseCancellable so
        // stopObserving() cleans it up via the same `regionCancellable` slot.
        tokens.regionCancellable = AnyDatabaseCancellable {
            NotificationCenter.default.removeObserver(observer)
        }
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

        // Read on the calling actor (MainActor). Direct reads via GRDB are
        // fast (a single SELECT) and avoid the Swift 6 strict concurrency
        // closure-isolation crash that hit Task.detached + reader.read
        // combinations.
        let newRecords: [MessageRecord]?
        do {
            newRecords = try fetchMessageWindow(
                reader: reader, convId: convId, mode: mode,
                anchor: anchor, windowSize: windowSize
            )
        } catch {
            print("[MessageStore] refreshFromDB failed: \(error.localizedDescription)")
            return
        }

        guard let newRecords, newRecords != messages else { return }

        // Yield to a fresh runloop iteration before publishing the @Observable
        // mutation. When refreshFromDB is invoked from a view's .task /
        // .onAppear hook (initial conversation load), we are still inside
        // SwiftUI's view update cycle. Mutating the @Observable `messages`
        // property here trips "Publishing changes from within view updates is
        // not allowed", which prevents the view from rendering the new state
        // and silently shows an empty bubble list. The dispatch hop forces
        // the mutation onto a fresh runloop tick AFTER the current view
        // update completes.
        await yieldToRunLoop()

        // Re-check: state could have changed during the runloop yield (e.g.,
        // a socket message arrived and another refresh wrote first).
        guard newRecords != messages else { return }

        messages = newRecords
        _idIndex = nil
        recomputeSections()
        messagesDidChange.send()
    }

    /// Awaits the next main runloop tick. Used to escape the synchronous view
    /// update cycle before mutating @Observable state.
    private func yieldToRunLoop() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            DispatchQueue.main.async {
                cont.resume()
            }
        }
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
