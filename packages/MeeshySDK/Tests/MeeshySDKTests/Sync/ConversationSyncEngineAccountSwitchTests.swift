import XCTest
import GRDB
@testable import MeeshySDK

/// #8651 — un changement de compte PENDANT une synchronisation.
///
/// Incident de production du 2026-09-29 : un appareil enchaîne six comptes en
/// neuf minutes. La synchronisation du compte quitté, encore en vol, écrivait
/// SA liste dans le cache du compte suivant (fraîchement purgé) ; le compte
/// suivant voyait sa propre synchronisation absorbée par le verrou `isSyncing`
/// de l'ancienne, rendue `true` sans avoir rien lu.
final class ConversationSyncEngineAccountSwitchTests: XCTestCase {

    private func makeCache() throws -> CacheCoordinator {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        return CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
    }

    private func makeEngine(
        cache: CacheCoordinator,
        service: MockConversationService,
        session: AccountSwitchSession
    ) -> ConversationSyncEngine {
        ConversationSyncEngine(
            cache: cache,
            conversationService: service,
            messageService: MockMessageService(),
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet(),
            currentUserId: { session.userId }
        )
    }

    private static func page(_ ids: [String]) -> OffsetPaginatedAPIResponse<[APIConversation]> {
        OffsetPaginatedAPIResponse(
            success: true,
            data: ids.map(conversation),
            pagination: OffsetPagination(total: ids.count, hasMore: false, limit: 100, offset: 0),
            error: nil
        )
    }

    private static func conversation(_ id: String) -> APIConversation {
        let json: [String: Any] = [
            "id": id,
            "identifier": "test-\(id)",
            "type": "DIRECT",
            "createdAt": "2026-09-29T09:00:00.000Z",
            "updatedAt": "2026-09-29T09:00:00.000Z",
            "isActive": true,
            "unreadCount": 0
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        return try! APIClient.makeAPIPayloadDecoder().decode(APIConversation.self, from: data)
    }

    func test_fullSync_whenTheAccountChangesDuringTheRequest_writesNothingAndReportsFailure() async throws {
        let cache = try makeCache()
        let session = AccountSwitchSession(userId: "user-A")
        let service = MockConversationService()
        service.listResponder = { _ in
            session.userId = "user-B"
            return Self.page(["conv-of-A"])
        }
        let engine = makeEngine(cache: cache, service: service, session: session)

        let ok = await engine.fullSync()

        let cached = await cache.conversations.load(for: "list").snapshot() ?? []
        XCTAssertTrue(cached.isEmpty,
                      "la liste du compte QUITTÉ ne doit jamais atterrir dans le cache du compte suivant")
        XCTAssertFalse(ok, "une synchronisation dont le compte a changé n'a rien livré")
    }

    func test_fullSync_forTheNextAccount_isNotAbsorbedByThePreviousAccountsSyncInFlight() async throws {
        let cache = try makeCache()
        let session = AccountSwitchSession(userId: "user-A")
        let gate = AccountSwitchGate()
        let service = MockConversationService()
        service.listResponder = { _ in
            if session.userId == "user-A" {
                await gate.enterAndWait()
                return Self.page(["conv-of-A"])
            }
            return Self.page(["conv-of-B"])
        }
        let engine = makeEngine(cache: cache, service: service, session: session)

        let previous = Task { await engine.fullSync() }
        await gate.waitUntilEntered()
        session.userId = "user-B"

        let ok = await engine.fullSync()
        let afterNext = await cache.conversations.load(for: "list").snapshot()?.map(\.id) ?? []

        await gate.release()
        let previousOk = await previous.value
        let afterBoth = await cache.conversations.load(for: "list").snapshot()?.map(\.id) ?? []

        XCTAssertTrue(ok)
        XCTAssertEqual(afterNext, ["conv-of-B"],
                       "le compte suivant doit lire SA liste, pas hériter du verrou de l'ancien")
        XCTAssertFalse(previousOk)
        XCTAssertEqual(afterBoth, ["conv-of-B"],
                       "la synchronisation de l'ancien compte, arrivée en retard, n'écrase rien")
    }

    func test_fullSync_forTheSameAccount_stillCoalescesOntoTheSyncInFlight() async throws {
        let cache = try makeCache()
        let session = AccountSwitchSession(userId: "user-A")
        let gate = AccountSwitchGate()
        let service = MockConversationService()
        service.listResponder = { _ in
            await gate.enterAndWait()
            return Self.page(["conv-of-A"])
        }
        let engine = makeEngine(cache: cache, service: service, session: session)

        let first = Task { await engine.fullSync() }
        await gate.waitUntilEntered()
        _ = await engine.fullSync()
        await gate.release()
        _ = await first.value

        XCTAssertEqual(service.listCallCount, 1, "deux appels du MÊME compte ne doublent pas la synchronisation")
    }
}

private final class AccountSwitchSession: @unchecked Sendable {
    private let lock = NSLock()
    private var _userId: String
    init(userId: String) { _userId = userId }
    var userId: String {
        get { lock.withLock { _userId } }
        set { lock.withLock { _userId = newValue } }
    }
}

private actor AccountSwitchGate {
    private var entered = false
    private var released = false
    private var enteredWaiters: [CheckedContinuation<Void, Never>] = []
    private var releaseWaiters: [CheckedContinuation<Void, Never>] = []

    func enterAndWait() async {
        entered = true
        enteredWaiters.forEach { $0.resume() }
        enteredWaiters = []
        guard !released else { return }
        await withCheckedContinuation { releaseWaiters.append($0) }
    }

    func waitUntilEntered() async {
        guard !entered else { return }
        await withCheckedContinuation { enteredWaiters.append($0) }
    }

    func release() {
        released = true
        releaseWaiters.forEach { $0.resume() }
        releaseWaiters = []
    }
}
