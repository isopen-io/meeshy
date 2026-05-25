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

    // MARK: - Helpers

    private func makeInMemoryDatabase() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }
}
