import XCTest
@testable import MeeshySDK

final class TrackingLinkServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: TrackingLinkService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = TrackingLinkService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeTrackingLink(id: String = "tl-1", token: String = "abc123") -> TrackingLink {
        let json: [String: Any] = [
            "id": id,
            "token": token,
            "originalUrl": "https://example.com",
            "shortUrl": "https://mee.sh/abc123",
            "totalClicks": 42,
            "uniqueClicks": 30,
            "isActive": true,
            "createdAt": "2026-01-01T00:00:00Z"
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(TrackingLink.self, from: data)
    }

    private func makeLinksResponse(_ links: [TrackingLink]) -> APIResponse<TrackingLinkService.TrackingLinksData> {
        let linksJson: [[String: Any]] = links.map { link in
            [
                "id": link.id, "token": link.token,
                "originalUrl": link.originalUrl, "shortUrl": link.shortUrl,
                "totalClicks": link.totalClicks, "uniqueClicks": link.uniqueClicks,
                "isActive": link.isActive, "createdAt": "2026-01-01T00:00:00Z"
            ]
        }
        let json: [String: Any] = ["trackingLinks": linksJson]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let linksData = try! decoder.decode(TrackingLinkService.TrackingLinksData.self, from: data)
        return APIResponse(success: true, data: linksData, error: nil)
    }

    private func makeStats() -> TrackingLinkStats {
        let json: [String: Any] = [
            "totalLinks": 5, "totalClicks": 100,
            "uniqueClicks": 75, "activeLinks": 3
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        return try! JSONDecoder().decode(TrackingLinkStats.self, from: data)
    }

    private func makeDetail() -> TrackingLinkDetail {
        let json: [String: Any] = [
            "link": [
                "id": "tl-1", "token": "abc", "originalUrl": "https://example.com",
                "shortUrl": "https://mee.sh/abc", "totalClicks": 5, "uniqueClicks": 3,
                "isActive": true, "createdAt": "2026-01-01T00:00:00Z"
            ],
            "clicks": [] as [[String: Any]],
            "total": 0
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(TrackingLinkDetail.self, from: data)
    }

    // MARK: - listLinks

    func test_listLinks_success_returnsLinks() async throws {
        let link = makeTrackingLink()
        mock.stub("/tracking-links/user/me?offset=0&limit=50", result: makeLinksResponse([link]))

        let result = try await service.listLinks()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/tracking-links/user/me?offset=0&limit=50")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].token, "abc123")
    }

    func test_listLinks_customPagination_includesParams() async throws {
        mock.stub("/tracking-links/user/me?offset=10&limit=25", result: makeLinksResponse([]))

        let result = try await service.listLinks(offset: 10, limit: 25)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/tracking-links/user/me?offset=10&limit=25")
        XCTAssertTrue(result.isEmpty)
    }

    // MARK: - fetchStats

    func test_fetchStats_success_returnsStats() async throws {
        let stats = makeStats()
        let response = APIResponse<TrackingLinkStats>(success: true, data: stats, error: nil)
        mock.stub("/tracking-links/stats", result: response)

        let result = try await service.fetchStats()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/tracking-links/stats")
        XCTAssertEqual(result.totalLinks, 5)
        XCTAssertEqual(result.totalClicks, 100)
        XCTAssertEqual(result.activeLinks, 3)
    }

    // MARK: - createLink

    func test_createLink_success_callsPostEndpoint() async throws {
        let link = makeTrackingLink()
        let response = APIResponse<TrackingLink>(success: true, data: link, error: nil)
        mock.stub("/tracking-links", result: response)

        let request = CreateTrackingLinkRequest(originalUrl: "https://example.com", campaign: "summer")
        let result = try await service.createLink(request)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/tracking-links")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(result.id, "tl-1")
    }

    // MARK: - fetchClicks

    func test_fetchClicks_success_callsCorrectEndpoint() async throws {
        let detail = makeDetail()
        let response = APIResponse<TrackingLinkDetail>(success: true, data: detail, error: nil)
        mock.stub("/tracking-links/abc123/clicks?offset=0&limit=50", result: response)

        let result = try await service.fetchClicks(token: "abc123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/tracking-links/abc123/clicks?offset=0&limit=50")
        XCTAssertEqual(result.link.id, "tl-1")
    }

    // MARK: - setActive

    func test_setActive_success_callsPatchEndpoint() async throws {
        let link = makeTrackingLink()
        let response = APIResponse<TrackingLink>(success: true, data: link, error: nil)
        mock.stub("/tracking-links/abc123", result: response)

        try await service.setActive(token: "abc123", isActive: false)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/tracking-links/abc123")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
    }

    // MARK: - deleteLink

    func test_deleteLink_success_callsDeleteEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["deleted": true], error: nil)
        mock.stub("/tracking-links/abc123", result: response)

        try await service.deleteLink(token: "abc123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/tracking-links/abc123")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - Error handling

    func test_listLinks_networkError_throws() async {
        mock.errorToThrow = MeeshyError.network(.timeout)

        do {
            _ = try await service.listLinks()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.timeout) = error { } else {
                XCTFail("Expected network timeout, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }

    func test_createLink_serverError_throws() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 422, message: "Invalid URL")

        do {
            let req = CreateTrackingLinkRequest(originalUrl: "bad")
            _ = try await service.createLink(req)
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 422)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }
}
