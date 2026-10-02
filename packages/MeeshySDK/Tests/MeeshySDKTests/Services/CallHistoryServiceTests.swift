import XCTest
@testable import MeeshySDK

/// Le journal des appels (#8066) : la page suivante part avec son curseur,
/// le type et la recherche partent au serveur (#8203),
/// et l'effacement — d'une ligne ou de tout — part en `DELETE` vers les deux
/// routes qui ne masquent que pour le lecteur.
final class CallHistoryServiceTests: XCTestCase {

    private func makeSUT() -> (sut: CallHistoryService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (CallHistoryService(api: api), api)
    }

    func test_history_withCursor_sendsCursorLimitAndFilter() async throws {
        let (sut, api) = makeSUT()
        api.stub("/calls/history", result: PaginatedAPIResponse<[APICallRecord]>(
            success: true,
            data: [],
            pagination: CursorPagination(nextCursor: nil, hasMore: false, limit: 30),
            error: nil
        ))

        let page = try await sut.history(limit: 30, cursor: "c-last", filter: .missed)

        XCTAssertEqual(api.lastRequest?.method, "GET")
        let query = Dictionary(uniqueKeysWithValues: (api.lastRequest?.queryItems ?? []).map { ($0.name, $0.value) })
        XCTAssertEqual(query["cursor"], "c-last")
        XCTAssertEqual(query["limit"], "30")
        XCTAssertEqual(query["filter"], "missed")
        XCTAssertFalse(page.hasMore)
    }

    func test_history_withTypeAndSearch_sendsTypeAndTrimmedQuery() async throws {
        let (sut, api) = makeSUT()
        stubEmptyPage(api)

        _ = try await sut.history(limit: 30, cursor: nil, filter: .all, type: .video, search: "  Éloi ")

        let query = Dictionary(uniqueKeysWithValues: (api.lastRequest?.queryItems ?? []).map { ($0.name, $0.value) })
        XCTAssertEqual(query["type"], "video")
        XCTAssertEqual(query["q"], "Éloi")
        XCTAssertEqual(query["filter"], "all")
    }

    func test_history_withoutRefinement_sendsNeitherTypeNorQuery() async throws {
        let (sut, api) = makeSUT()
        stubEmptyPage(api)

        _ = try await sut.history(limit: 30, cursor: nil, filter: .missed, type: .all, search: "   ")

        let names = (api.lastRequest?.queryItems ?? []).map(\.name)
        XCTAssertEqual(names, ["limit", "filter"])
    }

    private func stubEmptyPage(_ api: MockAPIClient) {
        api.stub("/calls/history", result: PaginatedAPIResponse<[APICallRecord]>(
            success: true,
            data: [],
            pagination: CursorPagination(nextCursor: nil, hasMore: false, limit: 30),
            error: nil
        ))
    }

    func test_hide_sendsDeleteForThatCallOnly() async throws {
        let (sut, api) = makeSUT()
        api.stub("/calls/history/c1", result: APIResponse<CallHistoryHideResult>(
            success: true,
            data: CallHistoryHideResult(callId: "c1", hidden: true),
            error: nil
        ))

        try await sut.hide(callId: "c1")

        XCTAssertEqual(api.lastRequest?.path, "/calls/history/c1")
        XCTAssertEqual(api.lastRequest?.method, "DELETE")
    }

    func test_hide_propagatesRefusal() async {
        let (sut, api) = makeSUT()
        api.stubError("/calls/history/c1", error: URLError(.badServerResponse))

        do {
            try await sut.hide(callId: "c1")
            XCTFail("hide must throw when the gateway refuses")
        } catch {}
    }

    func test_clearAll_sendsDeleteOnTheJournal_andReturnsClearedCount() async throws {
        let (sut, api) = makeSUT()
        api.stub("/calls/history", result: APIResponse<CallHistoryClearResult>(
            success: true,
            data: CallHistoryClearResult(cleared: 4),
            error: nil
        ))

        let cleared = try await sut.clearAll()

        XCTAssertEqual(cleared, 4)
        XCTAssertEqual(api.lastRequest?.path, "/calls/history")
        XCTAssertEqual(api.lastRequest?.method, "DELETE")
    }
}
