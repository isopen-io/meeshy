// apps/ios/Meeshy/Features/Main/Stores/FeedStore.swift

import Foundation
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    weak var value: FeedStore?
    init(_ value: FeedStore) { self.value = value }
}

/// Fetches the feed page. Declared at file scope AND `nonisolated` so the
/// closure passed to `reader.read` inherits no actor isolation — under the
/// app's default MainActor isolation a plain file-scope function is still
/// MainActor, which both pinned the read to the main thread and is what
/// tripped the Swift 6 runtime isolation check GRDB invocations used to hit.
/// Same shape as `MessageStore`'s `fetchMessageWindow`, read detached.
private nonisolated func fetchFeedPosts(reader: any DatabaseWriter, limit: Int) throws -> [PostRecord] {
    try reader.read { db in
        try PostRecord.order(Column("createdAt").desc).limit(limit).fetchAll(db)
    }
}

@MainActor
public final class FeedStore: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    private(set) var posts: [PostRecord] = []
    private let persistence: FeedPersistenceActor
    private var regionCancellable: AnyDatabaseCancellable?

    let postsDidChange = PassthroughSubject<Void, Never>()

    init(persistence: FeedPersistenceActor) {
        self.persistence = persistence
    }

    // MARK: - Observation

    func startObserving() {
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
    }

    func stopObserving() {
        regionCancellable = nil
    }

    private var loadedCount = 50
    private var refreshGeneration = 0

    // MARK: - Off-main DB read

    /// Runs after EVERY feed commit (likes, comments, translations) and on each
    /// pagination step, re-reading and decoding the whole loaded window — off
    /// the main thread, so a socket burst no longer hitches the feed scroll.
    /// Generation guard: refreshes can now interleave across the await, and
    /// only the most recent request may publish.
    private func refreshFromDB() async {
        let reader = persistence.reader
        let limit = loadedCount
        refreshGeneration &+= 1
        let generation = refreshGeneration
        let fetched: Result<[PostRecord], any Error> = await Task.detached(priority: .userInitiated) {
            Result { try fetchFeedPosts(reader: reader, limit: limit) }
        }.value
        guard generation == refreshGeneration, case .success(let newPosts) = fetched else { return }
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
