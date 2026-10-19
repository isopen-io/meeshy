import XCTest
import Combine
import GRDB
@testable import MeeshySDK

actor LaneTestCounter {
    private var value = 0

    func next() -> Int {
        value += 1
        return value
    }
}

final class ConversationSyncEngineSocketOrderTests: XCTestCase {

    private func makeEngine(
        currentUserId: @escaping @Sendable @concurrent () async -> String = { "u-me" }
    ) throws -> (engine: ConversationSyncEngine, socket: MockMessageSocket, cache: CacheCoordinator) {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let socket = MockMessageSocket()
        let cache = CacheCoordinator(messageSocket: socket, socialSocket: MockSocialSocket(), db: db)
        let engine = ConversationSyncEngine(
            cache: cache,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: socket,
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet(),
            currentUserId: currentUserId
        )
        return (engine, socket, cache)
    }

    private func waitUntil(timeout: TimeInterval = 2, _ condition: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        return await condition()
    }

    private func seedListRow(in cache: CacheCoordinator) async throws {
        var row = TestFactories.makeConversation(id: "c1", lastMessageAt: Date(timeIntervalSince1970: 100))
        row.lastMessageId = "m0"
        row.lastMessagePreview = "avant"
        try await cache.conversations.save([row], for: "list")
    }

    private func journalingPersistors(
        on engine: ConversationSyncEngine, gate: LaneTestGate, journal: LaneTestJournal
    ) {
        engine.apiMessagePersistor = { messages in
            await journal.record("api:started")
            await gate.wait()
            await journal.record("api:\(messages.first?.id ?? "?")")
        }
        engine.realtimeMessagePersistor = { mutation in
            guard case let .edited(messageId, _, _, _) = mutation else { return }
            await journal.record("edited:\(messageId)")
        }
    }

    func test_newThenEdited_whilePersistingNew_listRowShowsTheEdit() async throws {
        let (engine, socket, cache) = try makeEngine()
        let gate = LaneTestGate()
        let journal = LaneTestJournal()
        try await seedListRow(in: cache)
        journalingPersistors(on: engine, gate: gate, journal: journal)
        await engine.startSocketRelay()

        socket.messageReceived.send(TestFactories.makeAPIMessage(id: "m1", conversationId: "c1", content: "v1"))
        socket.messageEdited.send(TestFactories.makeAPIMessage(id: "m1", conversationId: "c1", content: "v2"))
        _ = await waitUntil(timeout: 0.3) { await journal.entries.contains("edited:m1") }
        await gate.open()

        let shown = await waitUntil {
            await cache.conversations.load(for: "list").snapshot()?.first?.lastMessagePreview == "v2"
        }
        let entries = await journal.entries
        let row = await cache.conversations.load(for: "list").snapshot()?.first
        XCTAssertTrue(shown, "l'aperçu d'origine écrasait l'édition")
        XCTAssertEqual(entries.filter { $0 != "api:started" }, ["api:m1", "edited:m1"])
        XCTAssertEqual(row?.lastMessageId, "m1")
    }

    func test_newThenEdited_whenNewIsDelayedBeforeCaching_cachedMessageCarriesTheEdit() async throws {
        let counter = LaneTestCounter()
        let gate = LaneTestGate()
        let (engine, socket, cache) = try makeEngine(currentUserId: {
            if await counter.next() == 1 { await gate.wait() }
            return "u-me"
        })
        await engine.startSocketRelay()

        socket.messageReceived.send(TestFactories.makeAPIMessage(id: "m1", conversationId: "c1", content: "v1"))
        socket.messageEdited.send(TestFactories.makeAPIMessage(id: "m1", conversationId: "c1", content: "v2"))
        try? await Task.sleep(nanoseconds: 100_000_000)
        await gate.open()

        let edited = await waitUntil {
            await cache.messages.load(for: "c1").snapshot()?.first { $0.id == "m1" }?.content == "v2"
        }
        XCTAssertTrue(edited, "le texte d'origine s'insérait après l'édition")
    }

    func test_stopSocketRelay_dropsEventsQueuedBehindAnInFlightOne() async throws {
        let (engine, socket, cache) = try makeEngine()
        let gate = LaneTestGate()
        let journal = LaneTestJournal()
        try await seedListRow(in: cache)
        journalingPersistors(on: engine, gate: gate, journal: journal)
        await engine.startSocketRelay()

        socket.messageReceived.send(TestFactories.makeAPIMessage(id: "m1", conversationId: "c1", content: "v1"))
        let inFlight = await waitUntil { await journal.entries.contains("api:started") }
        XCTAssertTrue(inFlight)
        socket.messageEdited.send(TestFactories.makeAPIMessage(id: "m1", conversationId: "c1", content: "v2"))
        await engine.stopSocketRelay()
        await gate.open()
        try? await Task.sleep(nanoseconds: 200_000_000)

        let entries = await journal.entries
        XCTAssertFalse(entries.contains("edited:m1"), "rien du compte quitté ne s'écrit après la sortie")
    }

    func test_reconnect_stillRequestsCatchUpSynchronously() async throws {
        let (engine, socket, _) = try makeEngine()
        await engine.startSocketRelay()

        socket.didReconnect.send()

        XCTAssertTrue(engine.hasReconnectCatchUpPending)
    }
}
