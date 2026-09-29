import XCTest
import GRDB
@testable import MeeshySDK

final class CallNetworkJournalStoreTests: XCTestCase {

    private func makeCache() throws -> CacheCoordinator {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        return CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
    }

    private func event(_ seconds: TimeInterval, _ kind: CallNetworkEventKind) -> CallNetworkEvent {
        CallNetworkEvent(at: Date(timeIntervalSince1970: seconds), kind: kind)
    }

    func test_append_thenJournal_returnsEventsInOrder() async throws {
        let store = CallNetworkJournalStore(cache: try makeCache())

        await store.append(event(1, .link(state: "connected")), callId: "call-1", startedAt: Date(timeIntervalSince1970: 0))
        await store.append(event(2, .route(relayed: true)), callId: "call-1", startedAt: Date(timeIntervalSince1970: 0))
        let journal = await store.journal(for: "call-1")

        XCTAssertEqual(journal?.events.map(\.kind), [.link(state: "connected"), .route(relayed: true)])
        XCTAssertEqual(journal?.startedAt, Date(timeIntervalSince1970: 0))
    }

    func test_journal_survivesANewStoreOnTheSameCache() async throws {
        let cache = try makeCache()
        let first = CallNetworkJournalStore(cache: cache)
        await first.append(event(1, .reconnected), callId: "call-1", startedAt: Date(timeIntervalSince1970: 0))

        let relaunched = CallNetworkJournalStore(cache: cache)
        let journal = await relaunched.journal(for: "call-1")

        XCTAssertEqual(journal?.events.map(\.kind), [.reconnected])
    }

    func test_append_afterRelaunch_mergesWithTheStoredJournal() async throws {
        let cache = try makeCache()
        let first = CallNetworkJournalStore(cache: cache)
        await first.append(event(1, .link(state: "connected")), callId: "call-1", startedAt: Date(timeIntervalSince1970: 0))

        let relaunched = CallNetworkJournalStore(cache: cache)
        await relaunched.append(event(5, .reconnected), callId: "call-1", startedAt: Date(timeIntervalSince1970: 4))
        let journal = await relaunched.journal(for: "call-1")

        XCTAssertEqual(journal?.events.map(\.kind), [.link(state: "connected"), .reconnected])
        XCTAssertEqual(journal?.startedAt, Date(timeIntervalSince1970: 0))
    }

    func test_journals_areKeptPerCall() async throws {
        let store = CallNetworkJournalStore(cache: try makeCache())
        await store.append(event(1, .reconnected), callId: "call-1", startedAt: Date(timeIntervalSince1970: 0))
        await store.append(event(2, .route(relayed: false)), callId: "call-2", startedAt: Date(timeIntervalSince1970: 0))

        let first = await store.journal(for: "call-1")
        let second = await store.journal(for: "call-2")

        XCTAssertEqual(first?.events.map(\.kind), [.reconnected])
        XCTAssertEqual(second?.events.map(\.kind), [.route(relayed: false)])
    }

    func test_remove_forgetsTheJournal() async throws {
        let store = CallNetworkJournalStore(cache: try makeCache())
        await store.append(event(1, .reconnected), callId: "call-1", startedAt: Date(timeIntervalSince1970: 0))

        await store.remove(callId: "call-1")
        let journal = await store.journal(for: "call-1")

        XCTAssertNil(journal)
    }

    func test_journal_neverRecorded_returnsNil() async throws {
        let store = CallNetworkJournalStore(cache: try makeCache())
        let journal = await store.journal(for: "unknown")
        XCTAssertNil(journal)
    }

    func test_cacheReset_purgesJournals() async throws {
        let cache = try makeCache()
        let store = CallNetworkJournalStore(cache: cache)
        await store.append(event(1, .reconnected), callId: "call-1", startedAt: Date(timeIntervalSince1970: 0))

        await cache.reset()
        let result = await cache.callNetworkJournals.load(for: "call-1")

        guard case .empty = result else {
            return XCTFail("A logout reset must purge the call network journals, got \(result)")
        }
    }
}
