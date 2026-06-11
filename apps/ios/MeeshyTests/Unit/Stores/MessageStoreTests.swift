// apps/ios/MeeshyTests/Unit/Stores/MessageStoreTests.swift

import XCTest
import GRDB
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class MessageStoreTests: XCTestCase {

    // MARK: - Deallocation

    func test_deinit_stopsObservation() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        var store: MessageStore? = MessageStore(
            conversationId: "conv-1",
            persistence: persistence
        )
        store?.startObserving(dbPool: db)

        weak var weakStore = store
        XCTAssertNotNil(weakStore, "Store should be alive before release")

        store = nil

        try await Task.sleep(for: .milliseconds(100))
        XCTAssertNil(weakStore, "MessageStore should be deallocated after owner releases it")
    }

    // MARK: - stopObserving cancels refreshTask

    func test_stopObserving_cancelsInflightTask() throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-2", persistence: persistence)
        store.startObserving(dbPool: db)
        store.stopObserving()
        // After stopObserving(), no crash or hang should occur — the store is idle.
        // This is a smoke-test: the assertions live in the lack of test failure.
    }

    // MARK: - Atomic snapshot hydration (B1)

    func test_loadInitialSnapshot_returnsRecordsWithoutMutatingMessages() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-snap", persistence: persistence)
        // NOTE: we do NOT call startObserving — we want to drive everything by
        // hand to prove the snapshot read does not touch @Published var messages.

        // Seed 3 records via the persistence actor (auto-broadcasts a refresh
        // notification, but no observation is wired so the store stays empty).
        for i in 0..<3 {
            let record = MessageStoreObservationHelper.makeRecord(
                localId: "msg-\(i)",
                conversationId: "conv-snap",
                content: "hello \(i)",
                createdAt: Date(timeIntervalSinceNow: TimeInterval(i))
            )
            try await MessageStoreObservationHelper.insertRecord(record, into: persistence)
        }

        XCTAssertTrue(store.messages.isEmpty,
                      "precondition: store has not been refreshed yet")

        let snapshot = await store.loadInitialSnapshot()

        XCTAssertEqual(snapshot.count, 3,
                       "snapshot must include all 3 seeded records")
        XCTAssertTrue(store.messages.isEmpty,
                      "loadInitialSnapshot must NOT mutate @Published messages")
    }

    func test_apply_publishesMessagesSynchronously() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-apply", persistence: persistence)

        for i in 0..<3 {
            let record = MessageStoreObservationHelper.makeRecord(
                localId: "msg-\(i)",
                conversationId: "conv-apply",
                content: "hello \(i)",
                createdAt: Date(timeIntervalSinceNow: TimeInterval(i))
            )
            try await MessageStoreObservationHelper.insertRecord(record, into: persistence)
        }
        let snapshot = await store.loadInitialSnapshot()
        XCTAssertTrue(store.messages.isEmpty)

        // Synchronous publish — no `await` between the call site and the
        // observable change. This is the key contract that lets
        // ConversationViewModel hydrate messages + dependent metadata
        // (transcriptions / audio translations) in a single MainActor slice.
        store.apply(records: snapshot)

        XCTAssertEqual(store.messages.count, 3,
                       "apply must publish records synchronously")
        XCTAssertEqual(store.messages.map(\.localId), snapshot.map(\.localId),
                       "apply preserves snapshot order")
    }

    // MARK: - Protective merge on apply (regression — message disappearance)

    /// Regression for "the whole bubble disappears after delivery": a socket
    /// `message:new` (audio attachment) makes the bubble appear, then a
    /// later `refreshMessagesFromAPI()` runs `loadInitialSnapshot()` +
    /// `apply()`. If the REST snapshot doesn't contain that socket-recent
    /// message yet (buffered persistence, window cutoff, race), the previous
    /// REPLACE behaviour erased it from `messages`. Contract: `apply()` must
    /// preserve in-memory messages whose `localId` is absent from the
    /// snapshot, then sort the merged set by `createdAt` for a stable view.
    /// Regression guard for jump-to-message: once the store has been switched
    /// to a `.around(date:)` window, a subsequent `apply()` MUST replace
    /// entirely, NOT merge. Merging would re-inject messages from the
    /// previous `.latest` window into the jumped view, producing a mixed
    /// timeline (messages from two distinct time slices interleaved) that
    /// breaks the jump-to-message UX. The protective merge applies ONLY in
    /// `.latest` mode where preserving socket-recent messages is the goal.
    func test_apply_inAroundMode_replacesEntirelyEvenWhenMemoryHasExtraMessages() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-jump", persistence: persistence)

        let baseDate = Date(timeIntervalSince1970: 1_700_000_000)
        let r0 = MessageStoreObservationHelper.makeRecord(
            localId: "msg-old-a", conversationId: "conv-jump",
            content: "from previous latest window", createdAt: baseDate
        )
        let r1 = MessageStoreObservationHelper.makeRecord(
            localId: "msg-old-b", conversationId: "conv-jump",
            content: "from previous latest window", createdAt: baseDate.addingTimeInterval(10)
        )
        // Seed the in-memory store as if we were previously in .latest mode.
        store.apply(records: [r0, r1])
        XCTAssertEqual(store.windowMode, .latest)
        XCTAssertEqual(store.messages.count, 2)

        // Now jump to a different window — set windowMode out of band so we
        // don't depend on the `refreshFromDB` path (which would clear messages
        // via its own apply call before our assertion).
        let jumpRecord = MessageStoreObservationHelper.makeRecord(
            localId: "msg-jump-target", conversationId: "conv-jump",
            content: "jumped here", createdAt: baseDate.addingTimeInterval(1_000)
        )
        await store.loadWindow(around: jumpRecord.createdAt)
        XCTAssertEqual(store.windowMode, .around(date: jumpRecord.createdAt))

        // After loadWindow, messages was replaced with whatever GRDB held for
        // that window — empty here since we only inserted r0/r1 in memory.
        // Manually re-seed memory to simulate the "previous window still
        // visible in messages" state, which is the exact precondition the
        // bug needed to reproduce.
        store.apply(records: [r0, r1])

        // Now apply an empty snapshot (e.g. the jumped window contains no
        // messages at this anchor — pre-fix the merge would preserve r0/r1
        // from memory, polluting the jumped view).
        store.apply(records: [])

        XCTAssertTrue(
            store.messages.isEmpty,
            "In .around windowMode, apply([]) must replace entirely — no merge from memory. Got: \(store.messages.map(\.localId))"
        )
    }

    func test_apply_preservesMemoryMessagesAbsentFromSnapshot() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-merge", persistence: persistence)

        let baseDate = Date(timeIntervalSince1970: 1_700_000_000)
        let r0 = MessageStoreObservationHelper.makeRecord(
            localId: "msg-a", conversationId: "conv-merge",
            content: "first", createdAt: baseDate
        )
        let r1 = MessageStoreObservationHelper.makeRecord(
            localId: "msg-b", conversationId: "conv-merge",
            content: "second", createdAt: baseDate.addingTimeInterval(10)
        )
        let socketRecent = MessageStoreObservationHelper.makeRecord(
            localId: "msg-socket", conversationId: "conv-merge",
            content: "audio just received via socket",
            createdAt: baseDate.addingTimeInterval(20)
        )

        // Seed messages = [a, b, socketRecent] — simulates state where
        // a socket `message:new` has placed `msg-socket` in the published
        // store but `refreshMessagesFromAPI()` hasn't picked it up yet.
        store.apply(records: [r0, r1, socketRecent])
        XCTAssertEqual(store.messages.map(\.localId), ["msg-a", "msg-b", "msg-socket"])

        // Now a REST snapshot returns ONLY the older messages — the socket
        // message is absent (e.g. REST window cut it off, or async buffer
        // hasn't flushed). Pre-fix this REPLACE would erase msg-socket.
        store.apply(records: [r0, r1])

        XCTAssertEqual(
            store.messages.map(\.localId),
            ["msg-a", "msg-b", "msg-socket"],
            "apply must merge: messages present in memory but absent from the snapshot are preserved, sorted by createdAt"
        )
    }

    // MARK: - Protective merge on real-time refresh (regression — received
    // message vanishes when the NEXT one arrives, reappears on reopen — iOS)

    /// The socket inbound path persists the message then posts a refresh that
    /// drives `refreshFromDB(mergeInMemory: true)`. If a later write's window
    /// read momentarily races the commit ordering and returns a window missing
    /// an already-displayed message, the previous STRAIGHT REPLACE erased it
    /// (the bubble flashed in then vanished, but came back on reopen because
    /// GRDB held it). Contract: the real-time refresh preserves in-memory
    /// messages absent from the fresh window, exactly like `apply()`.
    func test_refreshFromDB_realtime_preservesInMemoryMessagesAbsentFromWindow() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-rt", persistence: persistence)

        let baseDate = Date(timeIntervalSince1970: 1_700_000_000)
        let r0 = MessageStoreObservationHelper.makeRecord(
            localId: "msg-a", conversationId: "conv-rt",
            content: "first", createdAt: baseDate
        )
        let r1 = MessageStoreObservationHelper.makeRecord(
            localId: "msg-b", conversationId: "conv-rt",
            content: "second", createdAt: baseDate.addingTimeInterval(10)
        )
        // GRDB holds only r0, r1.
        try await MessageStoreObservationHelper.insertRecord(r0, into: persistence)
        try await MessageStoreObservationHelper.insertRecord(r1, into: persistence)

        // An already-displayed socket-recent message not yet in the window.
        let socketRecent = MessageStoreObservationHelper.makeRecord(
            localId: "msg-socket", conversationId: "conv-rt",
            content: "received in real-time",
            createdAt: baseDate.addingTimeInterval(20)
        )
        store.apply(records: [r0, r1, socketRecent])
        XCTAssertEqual(store.messages.map(\.localId), ["msg-a", "msg-b", "msg-socket"])

        // A real-time refresh reads the window (only r0, r1) — must NOT erase
        // the already-displayed socket message.
        await store.refreshFromDB(mergeInMemory: true)

        XCTAssertEqual(
            store.messages.map(\.localId),
            ["msg-a", "msg-b", "msg-socket"],
            "real-time refreshFromDB must preserve an already-displayed message absent from the fresh window"
        )
    }

    /// Window transitions (jump / restore / paginate) call `refreshFromDB()`
    /// with the default straight replace so a stale in-memory slice from a
    /// previous window never pollutes the freshly-loaded one.
    func test_refreshFromDB_default_replacesEntirely() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-rt2", persistence: persistence)

        let baseDate = Date(timeIntervalSince1970: 1_700_000_000)
        let r0 = MessageStoreObservationHelper.makeRecord(
            localId: "msg-a", conversationId: "conv-rt2",
            content: "first", createdAt: baseDate
        )
        try await MessageStoreObservationHelper.insertRecord(r0, into: persistence)

        let stale = MessageStoreObservationHelper.makeRecord(
            localId: "msg-stale", conversationId: "conv-rt2",
            content: "stale in-memory only", createdAt: baseDate.addingTimeInterval(5)
        )
        store.apply(records: [r0, stale])
        XCTAssertEqual(store.messages.map(\.localId), ["msg-a", "msg-stale"])

        await store.refreshFromDB()  // default mergeInMemory: false

        XCTAssertEqual(
            store.messages.map(\.localId), ["msg-a"],
            "default refreshFromDB must replace entirely (window transitions)"
        )
    }

    // MARK: - Duplicate server-id collapse (publish-boundary guard)

    func test_collapsingDuplicateServerIds_noCollision_returnsInputUnchanged() {
        var a = MessageStoreObservationHelper.makeRecord(localId: "a", conversationId: "c"); a.serverId = "S1"
        var b = MessageStoreObservationHelper.makeRecord(localId: "b", conversationId: "c"); b.serverId = "S2"

        let result = MessageStore.collapsingDuplicateServerIds([a, b])

        XCTAssertEqual(result.map(\.localId), ["a", "b"])
    }

    func test_collapsingDuplicateServerIds_optimisticAndServerMirror_keepsOptimistic() {
        // The duplicate-row race: an optimistic row (localId = client cid, with
        // its serverId backfilled by serverAck) plus a second server-mirror row
        // inserted by a reconcile miss (localId == serverId). Keep the optimistic
        // /tracked row so the diffable identity + send-flow cid survive — matching
        // the successful-reconcile outcome.
        var optimistic = MessageStoreObservationHelper.makeRecord(localId: "cid_1", conversationId: "c"); optimistic.serverId = "SRV1"
        var mirror = MessageStoreObservationHelper.makeRecord(localId: "SRV1", conversationId: "c"); mirror.serverId = "SRV1"

        let result = MessageStore.collapsingDuplicateServerIds([optimistic, mirror])

        XCTAssertEqual(result.map(\.localId), ["cid_1"])
    }

    func test_collapsingDuplicateServerIds_mirrorBeforeOptimistic_stillKeepsOptimistic() {
        var mirror = MessageStoreObservationHelper.makeRecord(localId: "SRV1", conversationId: "c"); mirror.serverId = "SRV1"
        var optimistic = MessageStoreObservationHelper.makeRecord(localId: "cid_1", conversationId: "c"); optimistic.serverId = "SRV1"

        let result = MessageStore.collapsingDuplicateServerIds([mirror, optimistic])

        XCTAssertEqual(result.map(\.localId), ["cid_1"])
    }

    func test_collapsingDuplicateServerIds_multipleNilServerIds_keepsAll() {
        // Un-acked optimistic rows (serverId nil) are distinct messages — never merged.
        let a = MessageStoreObservationHelper.makeRecord(localId: "cid_a", conversationId: "c")
        let b = MessageStoreObservationHelper.makeRecord(localId: "cid_b", conversationId: "c")

        let result = MessageStore.collapsingDuplicateServerIds([a, b])

        XCTAssertEqual(result.map(\.localId), ["cid_a", "cid_b"])
    }

    func test_collapsingDuplicateServerIds_preservesOrderOfSurvivors() {
        var a = MessageStoreObservationHelper.makeRecord(localId: "cid_1", conversationId: "c"); a.serverId = "SRV1"
        var mirror = MessageStoreObservationHelper.makeRecord(localId: "SRV1", conversationId: "c"); mirror.serverId = "SRV1"
        var c = MessageStoreObservationHelper.makeRecord(localId: "cid_2", conversationId: "c"); c.serverId = "SRV2"

        let result = MessageStore.collapsingDuplicateServerIds([a, mirror, c])

        XCTAssertEqual(result.map(\.localId), ["cid_1", "cid_2"])
    }

    // MARK: - Helpers

    private func makeInMemoryDatabase() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }
}
