// apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift

import Foundation
import Combine
import os
// `@preconcurrency` relaxes Swift 6 strict concurrency interop checks for the
// GRDB module. Without it, the runtime injects `_swift_task_checkIsolatedSwift`
// at the invocation of @Sendable closures we pass to GRDB observation APIs,
// which then aborts because GRDB calls the closure from its own reader/writer
// dispatch queue (not from any actor's executor).
@preconcurrency import GRDB
import MeeshySDK

/// Sendable weak-reference box. Used to capture a weak reference to the
/// `@MainActor`-isolated `MessageStore` inside a `@Sendable` closure WITHOUT
/// triggering Swift 6 strict concurrency's `_swift_task_checkIsolatedSwift`
/// assertion at closure invocation (which would fire when the closure runs
/// off-actor). The box itself is `@unchecked Sendable` because the wrapped
/// reference is `weak` and access is gated by the unwrap site (callers must
/// hop to the right actor before touching the value).
///
/// NOTE — kept NON-GENERIC on purpose. A previous generic version
/// (`WeakBox<T: AnyObject>`) tripped a Swift 6.3.2 optimizer crash in
/// `EarlyPerfInliner` / `isCallerAndCalleeLayoutConstraintsCompatible` on
/// the synthesized `deinit` under Release `-O -whole-module-optimization`
/// (Xcode Cloud archive). The single concrete instantiation makes the
/// generic gratuitous. If a future call site needs a different concrete
/// type, copy the pattern with that type rather than re-introducing the
/// generic.
private final class WeakBox: @unchecked Sendable {
    weak var value: MessageStore?
    init(_ value: MessageStore) { self.value = value }
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
    initialWindowSize: Int
) throws -> [MessageRecord] {
    switch mode {
    case .search(let ids):
        // Filtered-conversation search: show ONLY the matched messages
        // (chronological), regardless of how far back they are. Matches are
        // identified by their SERVER id (the search API works server-side);
        // offline messages without a serverId are intentionally excluded.
        guard !ids.isEmpty else { return [] }
        return try reader.read { db in
            // SQLite caps `IN (…)` at ~999 bound variables. Chunk to stay safe
            // on very large match sets (deep search pagination), then re-sort
            // the union chronologically. The common case (≤ a page of results)
            // is a single query + a trivial sort.
            let chunks = stride(from: 0, to: ids.count, by: 900).map {
                Array(ids[$0 ..< min($0 + 900, ids.count)])
            }
            var collected: [MessageRecord] = []
            for chunk in chunks {
                let rows = try MessageRecord
                    .filter(Column("conversationId") == convId)
                    .filter(chunk.contains(Column("serverId")))
                    .fetchAll(db)
                collected.append(contentsOf: rows)
            }
            return collected.sorted { $0.createdAt < $1.createdAt }
        }
    case .around(let centerDate):
        return try reader.read { db in
        let half = initialWindowSize / 2
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
            // Dynamic window: when the user has scrolled up, load ALL
            // messages from the anchor to the newest. No cap — the window
            // grows as the user paginates deeper into history.
            return try reader.read { db in
                try MessageRecord
                    .filter(Column("conversationId") == convId)
                    .filter(Column("createdAt") >= anchor)
                    .order(Column("createdAt").asc)
                    .fetchAll(db)
            }
        } else {
            // Initial load: fetch the most recent N messages.
            return try reader.read { db in
                try Array(MessageRecord
                    .filter(Column("conversationId") == convId)
                    .order(Column("createdAt").desc)
                    .limit(initialWindowSize)
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
    /// Search filter — show ONLY the messages whose `serverId` is in `ids`,
    /// in chronological order, independent of any time window. Drives the
    /// in-situ filtered-conversation search UX. `ids` are server message IDs;
    /// the caller must have persisted the matches in GRDB beforehand (e.g.
    /// via `upsertFromAPIMessages`).
    case search(ids: [String])
}

@MainActor
public final class MessageStore: ObservableObject {
    /// Number of messages fetched on initial load (no anchor). Once the user
    /// scrolls and an anchor is set, the window grows dynamically without cap.
    static let initialWindowSize = 200
    static let prefetchThreshold = 30

    // MARK: - Public State

    @Published private(set) var messages: [MessageRecord] = []
    @Published private(set) var sections: [MessageSection] = []
    @Published private(set) var unreadBelowCount: Int = 0
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
    /// Cache des conversions `MessageRecord → MeeshyMessage`, clé `localId`,
    /// invalidé par `changeVersion` (la MÊME clé que l'Equatable O(1) du
    /// record). Évite de refaire jusqu'à 5 décodages JSON par message à chaque
    /// reconfigure de cellule et à chaque ré-émission du store (le ViewModel
    /// re-mappait toute la fenêtre à chaque `messagesDidChange`). Borné à la
    /// fenêtre chargée (pruné dans `publish`).
    private var _domainCache: [String: (version: Int64, message: MeeshyMessage)] = [:]
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
                // Real-time refresh (socket insert / delivery / read / reaction
                // write). Merge in-memory messages absent from the fresh GRDB
                // window so a bubble that just rendered from a previous write
                // never vanishes when the NEXT write triggers a window read
                // that momentarily races the commit ordering. Mirrors the
                // protective merge `apply(records:)` already performs on the
                // REST-refresh path. Window transitions (jump / restore /
                // paginate) bypass this notification and call refreshFromDB()
                // directly with a straight replace.
                await store.refreshFromDB(mergeInMemory: true, skipRunLoopYield: true)
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

    func refreshFromDB(mergeInMemory: Bool = false, skipRunLoopYield: Bool = false) async {
        let convId = conversationId
        let mode = windowMode
        let anchor = windowAnchor
        let initialWindowSize = Self.initialWindowSize
        let reader = persistence.reader

        // Read on the calling actor (MainActor). Direct reads via GRDB are
        // fast (a single SELECT) and avoid the Swift 6 strict concurrency
        // closure-isolation crash that hit Task.detached + reader.read
        // combinations.
        let newRecords: [MessageRecord]?
        do {
            newRecords = try fetchMessageWindow(
                reader: reader, convId: convId, mode: mode,
                anchor: anchor, initialWindowSize: initialWindowSize
            )
        } catch {
            Logger.messages.error("[MessageStore] refreshFromDB failed: \(error.localizedDescription)")
            return
        }

        guard let newRecords, newRecords != messages else { return }

        // Yield to a fresh runloop iteration before publishing the @Published
        // mutation. When refreshFromDB is invoked from a view's .task /
        // .onAppear hook (initial conversation load), we are still inside
        // SwiftUI's view update cycle. Mutating the @Published `messages`
        // property here trips "Publishing changes from within view updates is
        // not allowed", which prevents the view from rendering the new state
        // and silently shows an empty bubble list. The dispatch hop forces
        // the mutation onto a fresh runloop tick AFTER the current view
        // update completes.
        // skipRunLoopYield: notification-driven paths already run inside a
        // `Task { @MainActor in }` that was created outside any view-update
        // cycle — the yield is unnecessary there and adds ~16ms per event.
        if !skipRunLoopYield {
            await yieldToRunLoop()
            // Re-check: state could have changed during the runloop yield (e.g.,
            // a socket message arrived and another refresh wrote first).
            guard newRecords != messages else { return }
        }

        publish(records: newRecords, mergeInMemory: mergeInMemory)
    }

    /// Publishes a freshly-read window into `@Published messages` and fires the
    /// downstream side-effects (id index reset, section recompute, change
    /// signal). Shared by `refreshFromDB` (real-time) and `apply` (REST/cold
    /// load) so both paths agree on the protective-merge rule.
    ///
    /// Protective merge (`mergeInMemory == true` AND `.latest` window only):
    /// any in-memory record whose `localId` is absent from `records` is
    /// preserved and re-sorted by `createdAt`. This guards the "vanish after
    /// delivery" race — a row already displayed from a prior write must not be
    /// erased by a later window read that races the commit ordering. Disabled
    /// in `.around(date:)` mode (jump-to-message) and on explicit straight
    /// replaces (window transitions) so a stale slice never pollutes the view.
    private func publish(records: [MessageRecord], mergeInMemory: Bool) {
        // BUG1 diagnostics — capture the pre-state to detect any publish that
        // DROPS currently-displayed messages (the suspected "all sent messages
        // vanish while one is pending" path). Cheap: only sets/array maps.
        let beforeCount = messages.count
        let beforeById = Dictionary(messages.map { ($0.localId, $0) }, uniquingKeysWith: { a, _ in a })

        let next: [MessageRecord]
        if mergeInMemory, windowMode == .latest {
            let snapshotIds = Set(records.map(\.localId))
            let preserved = messages.filter { !snapshotIds.contains($0.localId) }
            next = preserved.isEmpty
                ? records
                : (records + preserved).sorted { $0.createdAt < $1.createdAt }
        } else {
            next = records
        }

        // Collapse any duplicate physical rows that share a server id — an
        // optimistic row (localId = client cid) plus a second server-mirror row
        // (localId == serverId) left by a reconcile-miss race in the persistence
        // actor. The diffable list keys on localId, so both would otherwise
        // render as a "message en double" the moment a later event re-snapshots.
        // Applied before the drop diagnostic so a collapsed mirror is never
        // mistaken for an unintended drop (the prior publish was deduped too).
        let published = Self.collapsingDuplicateServerIds(next)

        let afterIds = Set(published.map(\.localId))
        let droppedIds = Set(beforeById.keys).subtracting(afterIds)
        if !droppedIds.isEmpty {
            // Classify each dropped row: when its serverId survives in the
            // published set under ANOTHER localId, the logical message is
            // still on screen — the drop is the duplicate-mirror collapse
            // (publish-boundary dedup or the persistence actor deleting a
            // mirror GRDB row) and is the DESIRED behaviour, not a loss.
            // Only rows whose content truly leaves the screen are the bug.
            let publishedServerIds = Set(published.compactMap(\.serverId))
            let trulyLost = droppedIds.compactMap { beforeById[$0] }.filter { record in
                guard let serverId = record.serverId else { return true }
                return !publishedServerIds.contains(serverId)
            }
            // Was any truly-lost row still in-flight / failed? That separates
            // a benign window scroll from the worst case (losing a
            // sent/pending row the user can see).
            let droppedInFlight = trulyLost
                .filter { ["sending", "queued", "failed", "sent"].contains(String(describing: $0.state)) }
            if trulyLost.isEmpty {
                Logger.messages.info("""
                [MessageStore][BUG1-benign] publish collapsed \(droppedIds.count) duplicate-server-id row(s) \
                before=\(beforeCount) records=\(records.count) result=\(next.count) \
                merge=\(mergeInMemory) window=\(String(describing: self.windowMode)) \
                ids=\(droppedIds.sorted().prefix(8).joined(separator: ","))
                """)
            } else {
                Logger.messages.error("""
                [MessageStore][BUG1] publish DROPPED \(trulyLost.count) displayed row(s) \
                (collapsedMirrors=\(droppedIds.count - trulyLost.count)) \
                before=\(beforeCount) records=\(records.count) result=\(next.count) \
                merge=\(mergeInMemory) window=\(String(describing: self.windowMode)) \
                droppedInFlightOrSent=\(droppedInFlight.count) \
                ids=\(trulyLost.map(\.localId).sorted().prefix(8).joined(separator: ","))
                """)
            }
        } else if next.count != beforeCount {
            Logger.messages.debug("[MessageStore] publish before=\(beforeCount) -> after=\(next.count) records=\(records.count) merge=\(mergeInMemory) window=\(String(describing: self.windowMode))")
        }

        messages = published
        _idIndex = nil
        // Prune le cache domain aux messages encore chargés (les entrées
        // périmées sont de toute façon contournées par la clé changeVersion ;
        // ce prune ne sert qu'à borner la mémoire à la fenêtre courante).
        if !_domainCache.isEmpty {
            let liveIds = Set(published.map(\.localId))
            if _domainCache.count > liveIds.count {
                _domainCache = _domainCache.filter { liveIds.contains($0.key) }
            }
        }
        recomputeSections()
        messagesDidChange.send()
    }

    /// Collapses physical rows that share a server id down to a single survivor.
    /// Under a write-ordering race the persistence reconcile can leave two GRDB
    /// rows for one logical message — the optimistic row (localId = client cid,
    /// serverId backfilled by `serverAck`) plus a second server-mirror row
    /// (localId == serverId) inserted because the 4-way match missed. The
    /// diffable list keys on localId, so both render: the "message en double".
    ///
    /// Keeps the optimistic/tracked row (localId != serverId) so the diffable
    /// identity and the send flow's cid tracking survive — matching the
    /// successful-reconcile outcome. Rows without a serverId (un-acked) are
    /// distinct messages and never merged; survivor order is preserved.
    static func collapsingDuplicateServerIds(_ records: [MessageRecord]) -> [MessageRecord] {
        // Fast path: bail out unless a serverId actually repeats.
        var seen = Set<String>()
        var hasCollision = false
        for record in records {
            guard let serverId = record.serverId else { continue }
            if !seen.insert(serverId).inserted { hasCollision = true; break }
        }
        guard hasCollision else { return records }

        // Per serverId, elect the survivor: prefer the row whose localId differs
        // from the serverId (the optimistic/tracked row), else keep the first.
        var survivorLocalId: [String: String] = [:]
        for record in records {
            guard let serverId = record.serverId else { continue }
            if let current = survivorLocalId[serverId] {
                if current == serverId, record.localId != serverId {
                    survivorLocalId[serverId] = record.localId
                }
            } else {
                survivorLocalId[serverId] = record.localId
            }
        }

        return records.filter { record in
            guard let serverId = record.serverId else { return true }
            return survivorLocalId[serverId] == record.localId
        }
    }

    /// Awaits the next main runloop tick. Used to escape the synchronous view
    /// update cycle before mutating @Published state.
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

    // MARK: - Atomic Snapshot Hydration
    //
    // Splits the legacy `loadInitial()` flow into two phases so the caller
    // (ConversationViewModel) can apply messages + dependent metadata
    // (transcriptions / audio translations) in a single MainActor.run with
    // no `await` in between. Closes the audio-bubble pop-in race documented
    // in `docs/superpowers/specs/2026-05-25-audio-instant-render-and-attachment-size-design.md`.

    /// Reads the current window from GRDB and returns the records without
    /// touching `@Published var messages`. The async hop yields the current
    /// runloop tick (matching `refreshFromDB`'s safety hop) so callers can
    /// then invoke `apply(records:)` synchronously without tripping the
    /// "Publishing changes from within view updates is not allowed" warning.
    public func loadInitialSnapshot() async -> [MessageRecord] {
        let convId = conversationId
        let mode = windowMode
        let anchor = windowAnchor
        let initialWindow = Self.initialWindowSize
        let reader = persistence.reader

        let records: [MessageRecord]
        do {
            records = try fetchMessageWindow(
                reader: reader, convId: convId, mode: mode,
                anchor: anchor, initialWindowSize: initialWindow
            )
        } catch {
            Logger.messages.error("[MessageStore] loadInitialSnapshot failed: \(error.localizedDescription)")
            return []
        }

        // Yield off the current SwiftUI view update cycle so the caller's
        // subsequent `apply` (which mutates @Published) lands on a fresh
        // tick. Mirrors `refreshFromDB`'s yieldToRunLoop guard.
        await yieldToRunLoop()
        return records
    }

    /// Synchronously publishes previously-fetched records into the store.
    /// Recomputes sections, clears the id index, fires `messagesDidChange` —
    /// the same side-effects as `refreshFromDB`'s publish phase. Safe to
    /// call inside a single `Task { @MainActor }` block after `await`-ing
    /// `loadInitialSnapshot()`, with no other `await` in between.
    ///
    /// Protective merge (`.latest` window only): any in-memory record whose
    /// `localId` is absent from the incoming snapshot is preserved. This
    /// guards the bubble against the "vanish after delivery" race — a
    /// socket `message:new` (especially audio with async enrichment) lands
    /// in `messages` before its row is reflected in a subsequent REST
    /// snapshot. A straight REPLACE would erase it. The merged set is
    /// sorted by `createdAt` for a stable, monotonic display order.
    ///
    /// In `.around(date:)` window mode (jump-to-message UX), the merge is
    /// disabled : preserving messages from a previous `.latest` view would
    /// pollute the jumped window with messages from a different time slice,
    /// breaking the search-result navigation. Replace strictly instead.
    public func apply(records: [MessageRecord]) {
        publish(records: records, mergeInMemory: true)
    }

    // MARK: - Pagination

    func loadOlder(before: Date) async -> Bool {
        // Temporal pagination is disabled in search-filter mode: the window is
        // an explicit set of matched IDs, not an extensible chronological slice.
        if case .search = windowMode { return false }
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

    /// Enters search-filter mode: the window shows ONLY the messages whose
    /// `serverId` is in `ids`, in chronological order. The caller must have
    /// persisted the matching messages in GRDB beforehand (e.g. via
    /// `upsertFromAPIMessages`) so they are fetchable. Exit via
    /// `restoreLatestWindow()`.
    public func enterSearchMode(ids: [String]) async {
        windowMode = .search(ids: ids)
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

    /// Version MÉMOÏSÉE de `record.toMessage(currentUserId:)`. Retourne la
    /// conversion cachée si `changeVersion` n'a pas bougé, sinon la recalcule
    /// et la cache. `currentUserId` est constant pour la durée du store, donc
    /// pas besoin de l'inclure dans la clé.
    func domainMessage(for localId: String, currentUserId: String) -> MeeshyMessage? {
        guard let i = index(of: localId) else { return nil }
        return cachedDomain(for: messages[i], currentUserId: currentUserId)
    }

    /// Snapshot de toute la fenêtre en `MeeshyMessage`, mémoïsé par message.
    /// Remplace le `messages.map { $0.toMessage(...) }` du ViewModel qui
    /// re-décodait tout à chaque émission. Cache-hit ⇒ zéro décodage JSON.
    func domainMessages(currentUserId: String) -> [MeeshyMessage] {
        messages.map { cachedDomain(for: $0, currentUserId: currentUserId) }
    }

    private func cachedDomain(for record: MessageRecord, currentUserId: String) -> MeeshyMessage {
        if let cached = _domainCache[record.localId], cached.version == record.changeVersion {
            return cached.message
        }
        let msg = record.toMessage(currentUserId: currentUserId)
        _domainCache[record.localId] = (record.changeVersion, msg)
        return msg
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
