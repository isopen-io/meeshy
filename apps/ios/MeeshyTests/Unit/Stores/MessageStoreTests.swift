// apps/ios/MeeshyTests/Unit/Stores/MessageStoreTests.swift

import XCTest
import Combine
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

    // MARK: - Search filter window (in-situ filtered-conversation search)

    func test_enterSearchMode_showsOnlyMatchedServerIdsChronologically() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-search", persistence: persistence)

        let base = Date(timeIntervalSince1970: 1_700_000_000)
        for i in 0..<3 {
            var r = MessageStoreObservationHelper.makeRecord(
                localId: "msg-\(i)", conversationId: "conv-search",
                content: "hit \(i)", createdAt: base.addingTimeInterval(TimeInterval(i * 10))
            )
            r.serverId = "S\(i)"
            try await MessageStoreObservationHelper.insertRecord(r, into: persistence)
        }

        // IDs order is irrelevant — the window is chronological. Only S0 and S2
        // match, so msg-1 must be filtered out.
        await store.enterSearchMode(ids: ["S2", "S0"])

        XCTAssertEqual(store.windowMode, .search(ids: ["S2", "S0"]))
        XCTAssertEqual(
            store.messages.map(\.localId), ["msg-0", "msg-2"],
            "search mode shows ONLY the matched serverIds, in chronological order"
        )

        // Temporal pagination is disabled while filtered.
        let paged = await store.loadOlder(before: base.addingTimeInterval(1_000))
        XCTAssertFalse(paged, "loadOlder must be a no-op in search mode")

        // Exiting restores the full latest window.
        await store.restoreLatestWindow()
        XCTAssertEqual(store.windowMode, .latest)
        XCTAssertEqual(store.messages.map(\.localId), ["msg-0", "msg-1", "msg-2"])
    }

    func test_enterSearchMode_emptyIds_showsNothing() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-search-empty", persistence: persistence)

        var r = MessageStoreObservationHelper.makeRecord(
            localId: "m", conversationId: "conv-search-empty",
            content: "x", createdAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        r.serverId = "S"
        try await MessageStoreObservationHelper.insertRecord(r, into: persistence)

        await store.enterSearchMode(ids: [])

        XCTAssertTrue(store.messages.isEmpty, "empty match set surfaces no bubbles")
    }

    func test_enterSearchMode_excludesMessagesWithoutServerId() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-search-nil", persistence: persistence)

        let base = Date(timeIntervalSince1970: 1_700_000_000)
        var acked = MessageStoreObservationHelper.makeRecord(
            localId: "msg-acked", conversationId: "conv-search-nil",
            content: "acked", createdAt: base
        )
        acked.serverId = "S1"
        // Offline / un-acked message: serverId nil → never matchable server-side.
        let offline = MessageStoreObservationHelper.makeRecord(
            localId: "msg-offline", conversationId: "conv-search-nil",
            content: "offline", createdAt: base.addingTimeInterval(5)
        )
        try await MessageStoreObservationHelper.insertRecord(acked, into: persistence)
        try await MessageStoreObservationHelper.insertRecord(offline, into: persistence)

        await store.enterSearchMode(ids: ["S1"])

        XCTAssertEqual(store.messages.map(\.localId), ["msg-acked"])
    }

    /// The critical contract: while filtered, a real-time refresh (a new message
    /// arriving) must NOT inject the non-matching message into the search view.
    /// `publish` only merges in-memory in `.latest` mode, so search does a
    /// strict replace from the (stable) matched-ids window.
    func test_refreshFromDB_realtime_inSearchMode_doesNotInjectNonMatchingMessage() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-search-rt", persistence: persistence)

        let base = Date(timeIntervalSince1970: 1_700_000_000)
        var matched = MessageStoreObservationHelper.makeRecord(
            localId: "msg-match", conversationId: "conv-search-rt",
            content: "match", createdAt: base
        )
        matched.serverId = "S1"
        try await MessageStoreObservationHelper.insertRecord(matched, into: persistence)

        await store.enterSearchMode(ids: ["S1"])
        XCTAssertEqual(store.messages.map(\.localId), ["msg-match"])

        // A new message lands in GRDB (different serverId, not in the match set).
        var incoming = MessageStoreObservationHelper.makeRecord(
            localId: "msg-new", conversationId: "conv-search-rt",
            content: "new realtime", createdAt: base.addingTimeInterval(60)
        )
        incoming.serverId = "S2"
        try await MessageStoreObservationHelper.insertRecord(incoming, into: persistence)

        await store.refreshFromDB(mergeInMemory: true)

        XCTAssertEqual(
            store.messages.map(\.localId), ["msg-match"],
            "search mode must NOT inject a non-matching real-time message"
        )
    }

    // MARK: - Coalescence des refreshes temps réel

    /// Une rafale de notifications d'écriture (lot d'accusés de lecture,
    /// burst de livraisons) ne doit pas déclencher une lecture de fenêtre
    /// complète PAR écriture : la première part immédiatement, celles qui
    /// tombent pendant la lecture en vol fusionnent en UNE lecture de queue.
    /// Le contrat observable : après la rafale, la fenêtre publiée est
    /// FRAÎCHE (rien n'est perdu par la fusion).
    func test_requestRealtimeRefresh_burst_servesFreshWindow() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-coalesce", persistence: persistence)

        let r0 = MessageStoreObservationHelper.makeRecord(
            localId: "m0", conversationId: "conv-coalesce",
            content: "premier", createdAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        try await MessageStoreObservationHelper.insertRecord(r0, into: persistence)

        // Rafale synchrone — simule huit écritures GRDB coup sur coup.
        for _ in 0..<8 { store.requestRealtimeRefresh() }

        try await Task.sleep(for: .milliseconds(400))
        XCTAssertEqual(
            store.messages.map(\.localId), ["m0"],
            "la fusion des refreshes ne doit jamais perdre l'état le plus frais"
        )
    }

    /// Un événement arrivé PENDANT la lecture en vol n'est pas perdu : la
    /// lecture de queue relit l'état postérieur à l'écriture tardive.
    func test_requestRealtimeRefresh_writeDuringInFlightRefresh_isPickedUpByTrailingRefresh() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-trail", persistence: persistence)

        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let r0 = MessageStoreObservationHelper.makeRecord(
            localId: "m0", conversationId: "conv-trail",
            content: "premier", createdAt: base
        )
        try await MessageStoreObservationHelper.insertRecord(r0, into: persistence)

        store.requestRealtimeRefresh()
        // Seconde écriture + refresh demandé pendant que le premier est
        // (probablement) encore en vol — le trailing doit la ramasser.
        let r1 = MessageStoreObservationHelper.makeRecord(
            localId: "m1", conversationId: "conv-trail",
            content: "second", createdAt: base.addingTimeInterval(10)
        )
        try await MessageStoreObservationHelper.insertRecord(r1, into: persistence)
        store.requestRealtimeRefresh()

        try await Task.sleep(for: .milliseconds(500))
        XCTAssertEqual(
            store.messages.map(\.localId), ["m0", "m1"],
            "une écriture pendant la lecture en vol doit être servie par la lecture de queue"
        )
    }

    // MARK: - Idempotence de la publication (#4943, D-OPEN-01)

    /// Ouvrir une conversation déjà en cache lisait la MÊME fenêtre deux fois
    /// (le `loadInitial()` de `start()` et le `loadInitialSnapshot()` de
    /// `loadMessages()`) et republiait à chaque fois : la liste se re-disposait
    /// deux à trois fois dans la seconde qui suivait le tap, pour un contenu
    /// IDENTIQUE. `refreshFromDB` s'en gardait déjà (`newRecords != messages`),
    /// `apply` pas du tout. Contrat : appliquer deux fois la même fenêtre
    /// n'émet qu'UNE fois — et ce qui suit n'est pas une optimisation
    /// invisible, c'est ce que voit l'utilisateur (chaque émission réveille le
    /// sink du ViewModel ET un `applySnapshot()` O(n) de la liste).
    func test_apply_twiceWithTheSameRecords_publishesOnce() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-idem", persistence: persistence)

        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let records = (0..<3).map { i in
            MessageStoreObservationHelper.makeRecord(
                localId: "msg-\(i)", conversationId: "conv-idem",
                content: "hello \(i)", createdAt: base.addingTimeInterval(TimeInterval(i))
            )
        }

        var publications = 0
        let token = store.messagesDidChange.sink { publications += 1 }
        defer { token.cancel() }

        store.apply(records: records)
        XCTAssertEqual(publications, 1, "la première fenêtre doit être publiée")

        store.apply(records: records)

        XCTAssertEqual(
            publications, 1,
            "appliquer la MÊME fenêtre ne doit rien republier — sinon la liste se re-dispose pour un contenu identique"
        )
        XCTAssertEqual(store.messages.map(\.localId), ["msg-0", "msg-1", "msg-2"])
    }

    /// La moitié négative, et elle porte la garde : une fenêtre qui a CHANGÉ
    /// doit toujours passer. Un `changeVersion` qui bouge (accusé de lecture,
    /// réaction, édition) est le cas nominal du temps réel — le rater
    /// figerait la bulle.
    func test_apply_withABumpedRecord_publishesAgain() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-idem-2", persistence: persistence)

        var record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-a", conversationId: "conv-idem-2",
            content: "hello", createdAt: Date(timeIntervalSince1970: 1_700_000_000)
        )

        var publications = 0
        let token = store.messagesDidChange.sink { publications += 1 }
        defer { token.cancel() }

        store.apply(records: [record])
        record.changeVersion += 1
        store.apply(records: [record])

        XCTAssertEqual(
            publications, 2,
            "une fenêtre dont une ligne a bougé doit être republiée"
        )
    }

    // MARK: - Borne de la relecture ancrée (#4943, D-RT-02)

    /// Après une remontée PROFONDE, la fenêtre `.latest` ancrée n'avait aucune
    /// borne haute : chaque écriture GRDB (message entrant, accusé, réaction,
    /// tick de retry) rematérialisait toute la profondeur paginée. Contrat :
    /// la relecture TEMPS RÉEL s'arrête au plafond, et la fusion protectrice
    /// garde le reste à l'écran — la borne ne doit RIEN faire disparaître.
    func test_refreshFromDB_realtime_afterDeepPagination_readsAtMostTheCap() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-deep", persistence: persistence)

        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let seeded = (0..<1_500).map { i in
            MessageStoreObservationHelper.makeRecord(
                localId: "m-\(i)", conversationId: "conv-deep",
                content: "msg \(i)", createdAt: base.addingTimeInterval(TimeInterval(i))
            )
        }
        try await db.write { db in
            for record in seeded { try record.insert(db) }
        }

        // Remontée profonde : l'ancre recule jusqu'au tout premier message, la
        // fenêtre couvre alors les 1 500 lignes.
        let paginated = await store.loadOlder(before: base.addingTimeInterval(50))
        XCTAssertTrue(paginated, "précondition : la pagination doit ramener une page")
        XCTAssertEqual(store.messages.count, 1_500,
                       "précondition : la fenêtre ancrée couvre toute la profondeur")

        var publications = 0
        let token = store.messagesDidChange.sink { publications += 1 }
        defer { token.cancel() }

        // Un refresh temps réel (le chemin de `requestRealtimeRefresh`).
        await store.refreshFromDB(mergeInMemory: true, skipRunLoopYield: true)

        XCTAssertEqual(
            store.lastWindowRowsReadForTesting, MessageStore.realtimeAnchoredWindowCap,
            "la relecture temps réel doit s'arrêter au plafond, pas suivre la profondeur paginée"
        )
        XCTAssertEqual(
            store.messages.count, 1_500,
            "la fusion protectrice garde à l'écran ce que la lecture plafonnée n'a pas relu"
        )
        XCTAssertEqual(store.messages.first?.localId, "m-0")
        XCTAssertEqual(store.messages.last?.localId, "m-1499")
        XCTAssertEqual(
            publications, 0,
            "rien n'a changé : une lecture plafonnée égale à la queue de la fenêtre ne doit pas republier"
        )
    }

    /// Et la borne ne coûte AUCUN message entrant : la ligne neuve tombe dans
    /// les lignes les plus récentes, donc dans la lecture plafonnée.
    func test_refreshFromDB_realtime_cappedRead_stillSurfacesANewMessage() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-deep-new", persistence: persistence)

        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let seeded = (0..<1_500).map { i in
            MessageStoreObservationHelper.makeRecord(
                localId: "m-\(i)", conversationId: "conv-deep-new",
                content: "msg \(i)", createdAt: base.addingTimeInterval(TimeInterval(i))
            )
        }
        try await db.write { db in
            for record in seeded { try record.insert(db) }
        }
        _ = await store.loadOlder(before: base.addingTimeInterval(50))
        XCTAssertEqual(store.messages.count, 1_500)

        let incoming = MessageStoreObservationHelper.makeRecord(
            localId: "m-new", conversationId: "conv-deep-new",
            content: "arrivé en direct", createdAt: base.addingTimeInterval(2_000)
        )
        try await db.write { db in try incoming.insert(db) }

        await store.refreshFromDB(mergeInMemory: true, skipRunLoopYield: true)

        XCTAssertEqual(store.lastWindowRowsReadForTesting,
                       MessageStore.realtimeAnchoredWindowCap)
        XCTAssertEqual(store.messages.count, 1_501)
        XCTAssertEqual(store.messages.last?.localId, "m-new",
                       "le message entrant doit apparaître malgré la lecture plafonnée")
        XCTAssertEqual(store.messages.first?.localId, "m-0",
                       "et rien ne doit être amputé en haut de la fenêtre")
    }

    /// La transition de fenêtre REMPLACE (aucune fusion ne rattraperait une
    /// troncature) : elle relit donc sans plafond, sinon remonter le fil
    /// amputerait le fil au lieu de l'étendre.
    func test_refreshFromDB_windowTransition_afterDeepPagination_readsTheWholeWindow() async throws {
        let db = try makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-deep-replace", persistence: persistence)

        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let seeded = (0..<1_500).map { i in
            MessageStoreObservationHelper.makeRecord(
                localId: "m-\(i)", conversationId: "conv-deep-replace",
                content: "msg \(i)", createdAt: base.addingTimeInterval(TimeInterval(i))
            )
        }
        try await db.write { db in
            for record in seeded { try record.insert(db) }
        }
        _ = await store.loadOlder(before: base.addingTimeInterval(50))

        await store.refreshFromDB()

        XCTAssertEqual(
            store.lastWindowRowsReadForTesting, 1_500,
            "un remplacement sec doit relire la fenêtre entière — le plafond ne vaut que pour la fusion"
        )
        XCTAssertEqual(store.messages.count, 1_500)
    }

    // MARK: - Helpers

    private func makeInMemoryDatabase() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }
}
