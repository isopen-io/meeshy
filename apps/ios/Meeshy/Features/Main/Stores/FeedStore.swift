// apps/ios/Meeshy/Features/Main/Stores/FeedStore.swift

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
/// `@MainActor`-isolated class inside a `@Sendable` closure WITHOUT
/// triggering Swift 6 strict concurrency's `_swift_task_checkIsolatedSwift`
/// assertion at closure invocation. Mirrors the `WeakBox` pattern used in
/// `MessageStore.swift`.
///
/// NOTE — kept NON-GENERIC on purpose. The previous generic form tripped a
/// Swift 6.3.2 optimizer crash (`EarlyPerfInliner` /
/// `isCallerAndCalleeLayoutConstraintsCompatible`) on the synthesized
/// `deinit` under Release `-O -whole-module-optimization` (Xcode Cloud
/// archive). Keep typed on the concrete `FeedStore`.
private final class FeedStoreWeakBox: @unchecked Sendable {
    weak var value: FeedStore?
    init(_ value: FeedStore) { self.value = value }
}

/// Fetches the feed page synchronously on the calling actor. Declared at
/// file scope so the closure passed to `reader.read` doesn't inherit any
/// actor isolation context, which would trigger Swift 6 strict concurrency
/// runtime checks at GRDB invocation (same workaround as `MessageStore`'s
/// `fetchMessageWindow`).
private func fetchFeedPosts(reader: any DatabaseWriter, limit: Int) throws -> [PostRecord] {
    try reader.read { db in
        try PostRecord.order(Column("createdAt").desc).limit(limit).fetchAll(db)
    }
}

@Observable
@MainActor
public final class FeedStore {
    private(set) var posts: [PostRecord] = []
    private let persistence: FeedPersistenceActor
    private var regionCancellable: AnyDatabaseCancellable?

    let postsDidChange = PassthroughSubject<Void, Never>()

    init(persistence: FeedPersistenceActor) {
        self.persistence = persistence
    }

    // MARK: - Observation

    func startObserving(dbPool: any DatabaseWriter) {
        stopObserving()

        // GRDB `ValueObservation` / `DatabaseRegionObservation` crash under
        // Swift 6 strict concurrency: passing any closure to GRDB triggers
        // `_swift_task_checkIsolatedSwift` at invocation from GRDB's dispatch
        // queues, even with `@preconcurrency import GRDB`. The closure
        // inherits the `@MainActor` isolation of this store, but GRDB invokes
        // it on its writer dispatch queue, and the runtime check then aborts.
        // Symptom: crash on first write commit, frame
        // `_dispatch_assert_queue_fail` in
        // `DatabaseRegionObserver.databaseDidCommit`.
        //
        // Workaround (mirrors `MessageStore.startObserving`): subscribe to a
        // `NotificationCenter` signal that `FeedPersistenceActor` posts after
        // every commit. The handler already runs on `.main`, so the refresh
        // is dispatched safely with no GRDB closure crossing actor boundaries.
        let weakStore = FeedStoreWeakBox(self)
        let observer = NotificationCenter.default.addObserver(
            forName: .feedStoreShouldRefresh,
            object: nil,
            queue: .main
        ) { _ in
            Task { @MainActor in
                guard let store = weakStore.value else { return }
                await store.refreshFromDB()
            }
        }
        regionCancellable = AnyDatabaseCancellable {
            NotificationCenter.default.removeObserver(observer)
        }
        _ = dbPool // signature parity with previous API; pool no longer needed
    }

    func stopObserving() {
        regionCancellable = nil
    }

    private var loadedCount = 50

    // MARK: - Off-main DB read

    private func refreshFromDB() async {
        let reader = persistence.reader
        let limit = loadedCount
        // Read on the calling actor (MainActor). Direct reads via GRDB are
        // fast (a single indexed SELECT) and avoid the Swift 6 strict
        // concurrency closure-isolation crash that hit
        // `Task.detached + reader.read` combinations.
        let newPosts: [PostRecord]
        do {
            newPosts = try fetchFeedPosts(reader: reader, limit: limit)
        } catch {
            return
        }
        guard newPosts != posts else { return }
        posts = newPosts
        postsDidChange.send()
    }

    // MARK: - Load Initial

    func loadInitial() async {
        await refreshFromDB()
    }

    // MARK: - Pagination

    func loadOlder() async -> Bool {
        guard posts.last != nil else { return false }
        let previousCount = loadedCount
        loadedCount += 20
        await refreshFromDB()
        return posts.count > previousCount
    }
}
