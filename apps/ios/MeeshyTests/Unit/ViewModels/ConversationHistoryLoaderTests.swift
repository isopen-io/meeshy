import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationHistoryLoaderTests: XCTestCase {

    private let conversationId = "000000000000000000000071"

    private func makeLoader(service: MockMessageService = MockMessageService()) throws -> ConversationHistoryLoader {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        return ConversationHistoryLoader(
            conversationId: conversationId,
            messageService: service,
            persistence: MessagePersistenceActor(dbWriter: pool)
        )
    }

    private func response(ids: [String], nextCursor: String? = nil, hasMore: Bool? = nil, withCursor: Bool = false) -> MessagesAPIResponse {
        let items = ids.enumerated().map { index, id in
            """
            {"id":"\(id)","conversationId":"\(conversationId)","senderId":"000000000000000000000099","createdAt":"2026-01-01T00:00:0\(index % 10).000Z"}
            """
        }.joined(separator: ",")
        let cursor = withCursor
            ? "{\"nextCursor\":\(nextCursor.map { "\"\($0)\"" } ?? "null"),\"hasMore\":\(hasMore.map(String.init) ?? "null"),\"limit\":50}"
            : "null"
        return JSONStub.decode("""
        {"success":true,"data":[\(items)],"pagination":null,"cursorPagination":\(cursor),"hasNewer":null}
        """)
    }

    private func ids(_ count: Int, prefix: String = "0000000000000000000001") -> [String] {
        (0..<count).map { String(format: "%@%02d", prefix, $0) }
    }

    func test_refreshLatest_warmCache_requestsWithoutTranslations() async throws {
        let service = MockMessageService()
        let loader = try makeLoader(service: service)

        _ = await loader.refreshLatest(warmCache: true, readerPrism: ["fr"])

        XCTAssertEqual(service.lastListIncludeTranslations, false)
        XCTAssertEqual(service.lastListLimit, 30)
        XCTAssertEqual(service.lastListOffset, 0)
    }

    func test_refreshLatest_coldCache_requestsTranslations() async throws {
        let service = MockMessageService()
        let loader = try makeLoader(service: service)

        _ = await loader.refreshLatest(warmCache: false, readerPrism: ["fr"])

        XCTAssertEqual(service.lastListIncludeTranslations, true)
    }

    func test_refreshLatest_success_returnsThePageServed() async throws {
        let service = MockMessageService()
        service.listResult = .success(response(ids: ids(3)))
        let loader = try makeLoader(service: service)

        let result = await loader.refreshLatest(warmCache: false, readerPrism: [])

        guard case .page(let messages) = result else { return XCTFail("une page est attendue") }
        XCTAssertEqual(messages.count, 3)
    }

    func test_refreshLatest_forbidden_returnsAccessRevokedWithServerReason() async throws {
        let service = MockMessageService()
        service.listResult = .failure(MeeshyError.forbidden(reason: "Exclu du groupe", body: nil))
        let loader = try makeLoader(service: service)

        let result = await loader.refreshLatest(warmCache: false, readerPrism: [])

        guard case .accessRevoked(let reason) = result else { return XCTFail("accès retiré attendu") }
        XCTAssertEqual(reason, "Exclu du groupe")
    }

    func test_refreshLatest_404or410_returnsGoneReason() async throws {
        for status in [404, 410] {
            let service = MockMessageService()
            service.listResult = .failure(MeeshyError.server(statusCode: status, message: ""))
            let loader = try makeLoader(service: service)

            let result = await loader.refreshLatest(warmCache: false, readerPrism: [])

            guard case .accessRevoked(let reason) = result else { return XCTFail("accès retiré attendu pour \(status)") }
            XCTAssertFalse(reason?.isEmpty ?? true)
        }
    }

    func test_refreshLatest_404WithServerMessage_keepsTheServerMessage() async throws {
        let service = MockMessageService()
        service.listResult = .failure(MeeshyError.server(statusCode: 404, message: "Lien expiré"))
        let loader = try makeLoader(service: service)

        let result = await loader.refreshLatest(warmCache: false, readerPrism: [])

        guard case .accessRevoked(let reason) = result else { return XCTFail("accès retiré attendu") }
        XCTAssertEqual(reason, "Lien expiré")
    }

    func test_refreshLatest_otherError_returnsUnavailable() async throws {
        let service = MockMessageService()
        service.listResult = .failure(MeeshyError.server(statusCode: 500, message: "boom"))
        let loader = try makeLoader(service: service)

        let result = await loader.refreshLatest(warmCache: false, readerPrism: [])

        guard case .unavailable = result else { return XCTFail("indisponible attendu") }
    }

    func test_fetchOlder_usesTheCursor_andReadsPaginationFromTheServer() async throws {
        let service = MockMessageService()
        service.listBeforeResult = .success(response(ids: ids(2), nextCursor: "c2", hasMore: true, withCursor: true))
        let loader = try makeLoader(service: service)

        let page = try await loader.fetchOlder(before: "c1")

        XCTAssertEqual(service.lastListBeforeCursor, "c1")
        XCTAssertEqual(page.nextCursor, "c2")
        XCTAssertTrue(page.hasMore)
    }

    func test_fetchOlder_withoutPaginationInfo_hasMoreFallsBackToFullPageSize() async throws {
        let service = MockMessageService()
        service.listBeforeResult = .success(response(ids: ids(50)))
        let loader = try makeLoader(service: service)

        let full = try await loader.fetchOlder(before: "c1")
        service.listBeforeResult = .success(response(ids: ids(49)))
        let partial = try await loader.fetchOlder(before: "c1")

        XCTAssertTrue(full.hasMore)
        XCTAssertFalse(partial.hasMore)
    }

    func test_fetchMissedPages_stopsOnPartialPage() async throws {
        let service = MockMessageService()
        service.listAfterResults = [response(ids: ids(100, prefix: "00000000000000000001")), response(ids: ids(3, prefix: "00000000000000000002"))]

        let collected = try await ConversationHistoryLoader.fetchMissedPages(
            service: service, conversationId: conversationId, after: Date(timeIntervalSince1970: 0)
        )

        XCTAssertEqual(collected.count, 103)
        XCTAssertEqual(service.listAfterCallCount, 2)
    }

    func test_fetchMissedPages_capsAtOneThousand() async throws {
        let service = MockMessageService()
        service.listAfterResults = (0..<12).map { page in
            response(ids: ids(100, prefix: String(format: "0000000000000%03d", page)))
        }

        let collected = try await ConversationHistoryLoader.fetchMissedPages(
            service: service, conversationId: conversationId, after: Date(timeIntervalSince1970: 0)
        )

        XCTAssertEqual(collected.count, 1000)
        XCTAssertEqual(service.listAfterCallCount, 10)
    }

    func test_restoreAround_skipsIdsCoveredByAPreviousWindow() async throws {
        let service = MockMessageService()
        let window = ids(5)
        service.listAroundResult = .success(response(ids: window))
        let loader = try makeLoader(service: service)

        let served = await loader.restoreAround(ids: [window[0], window[3]], limit: 30, readerPrism: [])

        XCTAssertEqual(service.listAroundCallCount, 1)
        XCTAssertEqual(served.count, 5)
    }

    func test_restoreAround_aFailingWindow_doesNotCarryItsNeighbours() async throws {
        let service = MockMessageService()
        service.listAroundResult = .failure(MeeshyError.server(statusCode: 500, message: "x"))
        let loader = try makeLoader(service: service)

        let served = await loader.restoreAround(ids: ["a", "b"], limit: 30, readerPrism: [])

        XCTAssertTrue(served.isEmpty)
        XCTAssertEqual(service.listAroundCallCount, 2)
    }

    func test_openingGapCursor_noWatermark_nil() {
        XCTAssertNil(ConversationHistoryLoader.openingGapCursor(heldUpTo: nil, refreshReachedBackTo: Date()))
    }

    func test_openingGapCursor_refreshReachedBack_nil() {
        let held = Date(timeIntervalSince1970: 100)
        XCTAssertNil(ConversationHistoryLoader.openingGapCursor(heldUpTo: held, refreshReachedBackTo: held))
    }

    func test_openingGapCursor_refreshShort_returnsWatermark() {
        let held = Date(timeIntervalSince1970: 100)
        XCTAssertEqual(
            ConversationHistoryLoader.openingGapCursor(heldUpTo: held, refreshReachedBackTo: held.addingTimeInterval(60)),
            held
        )
        XCTAssertEqual(ConversationHistoryLoader.openingGapCursor(heldUpTo: held, refreshReachedBackTo: nil), held)
    }

    // MARK: - Le filigrane de contiguïté (#18929)

    /// 2025-06-01T00:00:00Z — la fin du fil détenu.
    private let t1 = Date(timeIntervalSince1970: 1_748_736_000)

    private func makeLoaderAndStore(service: MockMessageService) throws -> (ConversationHistoryLoader, MessagePersistenceActor) {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        return (ConversationHistoryLoader(conversationId: conversationId, messageService: service, persistence: persistence), persistence)
    }

    /// Une page servie, un message par instant ISO.
    private func page(_ instants: [String], prefix: String) -> MessagesAPIResponse {
        let items = instants.enumerated().map { index, instant in
            #"{"id":"\#(prefix)\#(index)","conversationId":"\#(conversationId)","senderId":"000000000000000000000098","createdAt":"\#(instant)"}"#
        }.joined(separator: ",")
        return JSONStub.decode(#"{"success":true,"data":[\#(items)],"pagination":null,"cursorPagination":null,"hasNewer":null}"#)
    }

    private func watermark(in persistence: MessagePersistenceActor) async throws -> Date? {
        try await ConversationContiguity.base(of: conversationId, on: persistence).watermark
    }

    /// Le fil tenu jusqu'à T1 par une première ouverture, base vide.
    private func holdThreadUpToT1(_ loader: ConversationHistoryLoader, service: MockMessageService) async {
        service.listResult = .success(page(["2025-05-31T23:59:00.000Z", "2025-06-01T00:00:00.000Z"], prefix: "held-"))
        _ = await loader.refreshLatest(warmCache: false, readerPrism: [])
    }

    func test_refreshLatest_rienNEtaitDetenu_ouvreLeFilAuPlusRecentServi() async throws {
        let service = MockMessageService()
        let (loader, persistence) = try makeLoaderAndStore(service: service)

        await holdThreadUpToT1(loader, service: service)

        let held = try await watermark(in: persistence)
        XCTAssertEqual(held, t1)
    }

    func test_refreshLatest_quiRejointLeFil_lEtendAuPlusRecentServi() async throws {
        let service = MockMessageService()
        let (loader, persistence) = try makeLoaderAndStore(service: service)
        await holdThreadUpToT1(loader, service: service)
        service.listResult = .success(page(["2025-06-01T00:00:00.000Z", "2025-06-01T01:00:00.000Z"], prefix: "join-"))

        _ = await loader.refreshLatest(warmCache: true, readerPrism: [])

        let held = try await watermark(in: persistence)
        XCTAssertEqual(held, t1.addingTimeInterval(3_600))
    }

    /// Le message de T9 entre SEUL (NSE, push) ; la page des trente plus récents
    /// commence après T1 : un écart la sépare du fil, le filigrane n'en dit rien.
    func test_refreshLatest_separeeDuFilParUnEcart_laisseLeFiligrane() async throws {
        let service = MockMessageService()
        let (loader, persistence) = try makeLoaderAndStore(service: service)
        await holdThreadUpToT1(loader, service: service)
        let pushed = page(["2025-06-01T02:00:00.000Z"], prefix: "pushed-").data
        try await persistence.upsertFromAPIMessages(pushed)
        service.listResult = .success(page(["2025-06-01T01:00:00.000Z", "2025-06-01T02:00:00.000Z"], prefix: "gap-"))

        _ = await loader.refreshLatest(warmCache: true, readerPrism: [])

        let held = try await watermark(in: persistence)
        XCTAssertEqual(held, t1)
    }

    func test_catchUpCursor_unMessageEntreSeul_repartDeLaFinDuFil() async throws {
        let service = MockMessageService()
        let (loader, persistence) = try makeLoaderAndStore(service: service)
        await holdThreadUpToT1(loader, service: service)
        try await persistence.upsertFromAPIMessages(page(["2025-06-01T02:00:00.000Z"], prefix: "pushed-").data)

        let cursor = await loader.catchUpCursor(newestHeld: t1.addingTimeInterval(7_200))

        XCTAssertEqual(cursor, t1)
    }

    /// Sans filigrane — conversation née après la migration, nourrie par la NSE ou
    /// le socket —, le rattrapage repart du plus ANCIEN message serveur détenu :
    /// repartir du plus récent, entré seul, laissait le trou entre les deux.
    func test_catchUpCursor_sansFiligrane_repartDuPlusAncienMessageServeurDetenu() async throws {
        let service = MockMessageService()
        let (loader, persistence) = try makeLoaderAndStore(service: service)
        try await persistence.upsertFromAPIMessages(page(["2025-06-01T00:00:00.000Z"], prefix: "seul-a-").data)
        try await persistence.upsertFromAPIMessages(page(["2025-06-01T02:00:00.000Z"], prefix: "seul-b-").data)

        let cursor = await loader.catchUpCursor(newestHeld: t1.addingTimeInterval(7_200))

        XCTAssertEqual(cursor, t1)
    }

    /// Et la page des trente plus récents qui ne rejoint que le message de 02:00
    /// n'ouvre pas le fil : elle laisserait l'écart d'avant invisible à jamais.
    func test_refreshLatest_sansFiligrane_neRejoignantQueLePlusRecent_laisseLeFilOuvert() async throws {
        let service = MockMessageService()
        let (loader, persistence) = try makeLoaderAndStore(service: service)
        try await persistence.upsertFromAPIMessages(page(["2025-06-01T00:00:00.000Z"], prefix: "seul-a-").data)
        try await persistence.upsertFromAPIMessages(page(["2025-06-01T02:00:00.000Z"], prefix: "seul-b-").data)
        service.listResult = .success(page(["2025-06-01T01:59:00.000Z", "2025-06-01T02:30:00.000Z"], prefix: "recent-"))

        _ = await loader.refreshLatest(warmCache: true, readerPrism: [])

        let held = try await watermark(in: persistence)
        XCTAssertNil(held)
    }

    func test_fetchMissed_partiDeLaFinDuFil_graveLesPagesPuisEtendLeFiligrane() async throws {
        let service = MockMessageService()
        let (loader, persistence) = try makeLoaderAndStore(service: service)
        await holdThreadUpToT1(loader, service: service)
        service.listAfterResults = [page(["2025-06-01T00:01:00.000Z", "2025-06-01T00:02:00.000Z"], prefix: "missed-")]

        let collected = try await loader.fetchMissed(after: t1, readerPrism: [])

        XCTAssertEqual(collected.count, 2)
        let base = try await ConversationContiguity.base(of: conversationId, on: persistence)
        XCTAssertEqual(base.newestHeld, t1.addingTimeInterval(120), "le balayage est gravé avant d'avancer le filigrane")
        XCTAssertEqual(base.watermark, t1.addingTimeInterval(120))
    }

    func test_forgetConversation_oublieLeFilDetenu() async throws {
        let service = MockMessageService()
        let (loader, persistence) = try makeLoaderAndStore(service: service)
        await holdThreadUpToT1(loader, service: service)

        await loader.forgetConversation()

        let held = try await watermark(in: persistence)
        XCTAssertNil(held)
    }
}
