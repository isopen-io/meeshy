import Foundation

extension CacheCoordinator {
    // MARK: - Test Helpers (Task 1.3)
    //
    // The background flush test harness exercises the deadline-aware
    // `flushAll(deadline:)` path against a coordinator instance bound to
    // an in-memory database. These helpers seed and inspect the
    // `conversations` store dirty set without going through the public
    // `save()` path — which would flush synchronously via the L2 writer
    // and leave the dirty set empty by the time the test pokes at it.
    //
    // Marked `public` so tests in a separate module can call them; the
    // body is trivially side-effect-free for production callers (the
    // returned count is just an introspection).

    /// Synthesise `count` dirty conversation entries directly in the L1
    /// cache + dirty set, bypassing `save()` so the L2 writer doesn't
    /// drain the dirty bookkeeping before the flush path under test
    /// runs. Used by `CacheBackgroundFlushTests`.
    public func markDirtyForTest(count: Int) async throws {
        let entries: [(String, [MeeshyConversation])] = (0..<count).map { idx in
            let key = "test-key-\(idx)"
            let conv = MeeshyConversation(
                id: "conv-test-\(idx)",
                identifier: "test-\(idx)",
                type: .direct,
                title: "Test \(idx)",
                lastMessageAt: Date(),
                unreadCount: 0
            )
            return (key, [conv])
        }
        await conversations.seedDirtyForTest(items: entries)
    }

    /// Total dirty key count across all GRDB-backed stores driven by the
    /// deadline-aware flush. Mirrors the surfaces touched by
    /// `flushAll(deadline:)` so a test can assert "no work left to do".
    public func dirtyCountForTest() async -> Int {
        var total = 0
        for store in allGRDBStores {
            total += await store.dirtyKeyCount()
        }
        return total
    }
}
