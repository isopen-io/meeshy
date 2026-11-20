import XCTest
@testable import MeeshySDK

/// Les demandes d'entrée lues et tranchées par un intendant (#19877).
final class CommunityJoinRequestServiceTests: XCTestCase {

    private func makeSUT() -> (CommunityService, MockAPIClient) {
        let mock = MockAPIClient()
        return (CommunityService(api: mock), mock)
    }

    private let twoRows = """
    {"success":true,"data":[
      {"id":"r1","userId":"u1","status":"pending","country":"FR","createdAt":"2026-11-20T10:00:00.000Z",
       "user":{"id":"u1","username":"ana","displayName":"Ana B.","avatar":"https://a/1.png"}},
      {"id":"r2","userId":"u2","status":"pending","country":"Lyon","createdAt":"2026-11-19T10:00:00.000Z",
       "user":{"id":"u2","username":"bob","displayName":"  ","avatar":""}},
      {"id":"","userId":"u3","status":"pending","createdAt":"2026-11-19T10:00:00.000Z","user":{"username":"x"}},
      {"id":"r4","userId":"u4","status":"accepted","createdAt":"2026-11-19T10:00:00.000Z","user":{"username":"y"}}
    ],"pagination":{"limit":50,"hasMore":true,"nextCursor":"cur-2","form":"keyset"}}
    """

    func test_joinRequests_readsTheProjection_andSkipsUnreadableRows() async throws {
        let (sut, mock) = makeSUT()
        mock.stubWire("/communities/c1/join-requests", json: twoRows)

        let page = try await sut.joinRequests(communityId: "c1", cursor: nil, limit: 50)

        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(page.requests.map(\.id), ["r1", "r2"])
        XCTAssertEqual(page.requests[0].name, "Ana B.")
        XCTAssertEqual(page.requests[0].country, "FR")
        XCTAssertEqual(page.requests[1].name, "bob")
        XCTAssertNil(page.requests[1].avatar)
        XCTAssertNil(page.requests[1].country, "un pays n'est jamais une ville")
        XCTAssertEqual(page.nextCursor, "cur-2")
    }

    func test_joinRequests_sendsTheCursor_andEndsWithoutMore() async throws {
        let (sut, mock) = makeSUT()
        mock.stubWire("/communities/c1/join-requests", json: """
        {"success":true,"data":[],"pagination":{"limit":50,"hasMore":false,"nextCursor":"stale"}}
        """)

        let page = try await sut.joinRequests(communityId: "c1", cursor: "cur-2", limit: 50)

        let query = Dictionary(uniqueKeysWithValues: (mock.lastRequest?.queryItems ?? []).map { ($0.name, $0.value) })
        XCTAssertEqual(query["cursor"], "cur-2")
        XCTAssertEqual(query["limit"], "50")
        XCTAssertNil(page.nextCursor, "sans suite, un curseur servi ne relance pas la première page")
    }

    func test_decide_accept_postsAndReturnsTheEnteredMember() async throws {
        let (sut, mock) = makeSUT()
        mock.stubWire("/communities/c1/join-requests/r1/accept", json: """
        {"success":true,"data":{"id":"m9","communityId":"c1","userId":"u1","role":"member"}}
        """)

        let member = try await sut.decideJoinRequest(communityId: "c1", requestId: "r1", decision: .accept)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities/c1/join-requests/r1/accept")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(member?.userId, "u1")
    }

    func test_decide_reject_postsAndLetsNobodyIn() async throws {
        let (sut, mock) = makeSUT()
        mock.stubWire("/communities/c1/join-requests/r1/reject", json: """
        {"success":true,"data":{"id":"r1","status":"rejected"}}
        """)

        let member = try await sut.decideJoinRequest(communityId: "c1", requestId: "r1", decision: .reject)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities/c1/join-requests/r1/reject")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertNil(member)
    }
}
