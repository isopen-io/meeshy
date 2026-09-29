import XCTest
import GRDB
@testable import MeeshySDK

/// #8656 — une page de messages demandée pour un compte ne s'écrit jamais sous
/// un autre. Le relevé du #8651 couvrait la LISTE ; la fenêtre de messages
/// (`ensureMessages`, `fetchOlderMessages`) partait sous le jeton du compte
/// quitté et atterrissait, au retour, dans le cache ET la base locale du
/// compte suivant — une conversation partagée par les deux comptes y mêlait
/// leurs auteurs.
final class ConversationSyncEngineMessageOwnerTests: XCTestCase {

    private func makeCache() throws -> CacheCoordinator {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        return CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
    }

    private func makeEngine(
        cache: CacheCoordinator,
        service: OwnerSwitchingMessageService,
        session: MessageOwnerSession
    ) -> ConversationSyncEngine {
        ConversationSyncEngine(
            cache: cache,
            conversationService: MockConversationService(),
            messageService: service,
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet(),
            currentUserId: { session.userId }
        )
    }

    private static func response(conversationId: String) -> MessagesAPIResponse {
        MessagesAPIResponse(
            success: true,
            data: [TestFactories.makeAPIMessage(conversationId: conversationId)],
            pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil
        )
    }

    func test_ensureMessages_whenTheAccountChangesDuringTheRequest_neitherCachesNorPersistsThePage() async throws {
        let cache = try makeCache()
        let session = MessageOwnerSession(userId: "user-A")
        let service = OwnerSwitchingMessageService { session.userId = "user-B"; return Self.response(conversationId: "shared") }
        let engine = makeEngine(cache: cache, service: service, session: session)
        let persisted = PersistedPages()
        engine.apiMessagePersistor = { messages in await persisted.append(messages.count) }

        await engine.ensureMessages(for: "shared", force: true)

        let cached = await cache.messages.load(for: "shared").snapshot() ?? []
        let pages = await persisted.counts
        XCTAssertTrue(cached.isEmpty, "la page du compte QUITTÉ ne doit pas atterrir dans le cache du compte suivant")
        XCTAssertTrue(pages.isEmpty, "ni dans sa base locale")
    }

    func test_fetchOlderMessages_whenTheAccountChangesDuringTheRequest_persistsNothing() async throws {
        let cache = try makeCache()
        let session = MessageOwnerSession(userId: "user-A")
        let service = OwnerSwitchingMessageService { session.userId = "user-B"; return Self.response(conversationId: "shared") }
        let engine = makeEngine(cache: cache, service: service, session: session)
        let persisted = PersistedPages()
        engine.apiMessagePersistor = { messages in await persisted.append(messages.count) }

        await engine.fetchOlderMessages(for: "shared", before: "m-0")

        let pages = await persisted.counts
        XCTAssertTrue(pages.isEmpty)
    }

    func test_ensureMessages_forTheSameAccount_persistsThePageUnderItsOwner() async throws {
        let cache = try makeCache()
        let session = MessageOwnerSession(userId: "user-A")
        let service = OwnerSwitchingMessageService { Self.response(conversationId: "shared") }
        let engine = makeEngine(cache: cache, service: service, session: session)
        let persisted = PersistedPages()
        engine.apiMessagePersistor = { messages in
            await persisted.append(messages.count, owner: ConversationSyncEngine.currentSyncOwner)
        }

        await engine.ensureMessages(for: "shared", force: true)

        let pages = await persisted.counts
        let owners = await persisted.owners
        XCTAssertEqual(pages, [1])
        XCTAssertEqual(owners, ["user-A"],
                       "le persisteur doit savoir à QUEL compte la page appartient, pour l'écrire dans SA base")
    }
}

private final class MessageOwnerSession: @unchecked Sendable {
    private let lock = NSLock()
    private var _userId: String
    init(userId: String) { _userId = userId }
    var userId: String {
        get { lock.withLock { _userId } }
        set { lock.withLock { _userId = newValue } }
    }
}

private actor PersistedPages {
    private(set) var counts: [Int] = []
    private(set) var owners: [String?] = []
    func append(_ count: Int, owner: String? = nil) {
        counts.append(count)
        owners.append(owner)
    }
}

private final class OwnerSwitchingMessageService: MessageServiceProviding, @unchecked Sendable {
    private let responder: @Sendable () -> MessagesAPIResponse
    init(responder: @escaping @Sendable () -> MessagesAPIResponse) { self.responder = responder }

    func list(conversationId: String, offset: Int, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        responder()
    }
    func listBefore(conversationId: String, before: String, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        responder()
    }
    func listAfter(conversationId: String, after: Date, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil)
    }
    func listAround(conversationId: String, around: String, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse { fatalError("Not used") }
    func listMedia(conversationId: String, kinds: [ConversationMediaKind], query: String?, before: String?, limit: Int, languages: [String]?) async throws -> MessagesAPIResponse { fatalError("Not used") }
    func send(conversationId: String, request: SendMessageRequest) async throws -> SendMessageResponseData { fatalError("Not used") }
    func edit(messageId: String, content: String) async throws -> APIMessage { fatalError("Not used") }
    func delete(conversationId: String, messageId: String) async throws {}
    func pin(conversationId: String, messageId: String) async throws {}
    func unpin(conversationId: String, messageId: String) async throws {}
    func consumeViewOnce(conversationId: String, messageId: String) async throws -> ConsumeViewOnceResponse { fatalError("Not used") }
    func search(conversationId: String, query: String, limit: Int) async throws -> MessagesAPIResponse { fatalError("Not used") }
    func searchWithCursor(conversationId: String, query: String, cursor: String) async throws -> MessagesAPIResponse { fatalError("Not used") }
}
