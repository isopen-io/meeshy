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
        mock.stub("/tracking-links/user/me", result: makeLinksResponse([link]))

        let result = try await service.listLinks()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/tracking-links/user/me")
        XCTAssertEqual(mock.lastRequest?.queryItems, [URLQueryItem(name: "offset", value: "0"), URLQueryItem(name: "limit", value: "50")])
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].token, "abc123")
    }

    func test_listLinks_customPagination_includesParams() async throws {
        mock.stub("/tracking-links/user/me", result: makeLinksResponse([]))

        let result = try await service.listLinks(offset: 10, limit: 25)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/tracking-links/user/me")
        XCTAssertEqual(mock.lastRequest?.queryItems, [URLQueryItem(name: "offset", value: "10"), URLQueryItem(name: "limit", value: "25")])
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
        let response = APIResponse<CreatedTrackingLink>(
            success: true, data: CreatedTrackingLink(link: link, existed: false), error: nil
        )
        mock.stub("/tracking-links", result: response)

        let request = CreateTrackingLinkRequest(originalUrl: "https://example.com", campaign: "summer")
        let result = try await service.createLink(request)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/tracking-links")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(result.id, "tl-1")
    }

    // MARK: - createLink — la VRAIE charge de la passerelle (#9185)

    /// Corps exact de `POST /api/v1/tracking-links` (`creation.ts`) : le lien est
    /// ENVELOPPÉ sous `data.trackingLink`, enrichi de `fullUrl`, et `existed`
    /// accompagne un lien déjà créé par l'appelant (200). Les colonnes Prisma
    /// voyagent toutes, dates à fractions de seconde comprises.
    private static func gatewayCreateBody(existed: Bool?) -> Data {
        let existedField = existed.map { ", \"existed\": \($0)" } ?? ""
        return Data("""
        {
          "success": true,
          "data": {
            "trackingLink": {
              "id": "6720f1c2a9b8c7d6e5f40312",
              "token": "rentree26",
              "targetType": "EXTERNAL",
              "targetId": null,
              "name": "Rentrée",
              "campaign": "rentree",
              "source": null,
              "medium": null,
              "originalUrl": "https://meeshy.me/",
              "shortUrl": "https://meeshy.me/l/rentree26",
              "createdBy": "6720f1c2a9b8c7d6e5f40001",
              "conversationId": null,
              "messageId": null,
              "totalClicks": 0,
              "uniqueClicks": 0,
              "isActive": true,
              "expiresAt": null,
              "createdAt": "2026-10-13T09:12:45.123Z",
              "updatedAt": "2026-10-13T09:12:45.123Z",
              "lastClickedAt": null,
              "fullUrl": "https://meeshy.me/l/rentree26"
            }\(existedField)
          }
        }
        """.utf8)
    }

    func test_createdTrackingLink_gatewayCreatedBody_decodesTheWrappedLink() throws {
        let response = try MeeshyCoders.decoder(.api).decode(
            APIResponse<CreatedTrackingLink>.self,
            from: Self.gatewayCreateBody(existed: nil)
        )

        XCTAssertEqual(response.data.link.id, "6720f1c2a9b8c7d6e5f40312")
        XCTAssertEqual(response.data.link.token, "rentree26")
        XCTAssertEqual(response.data.link.shortUrl, "https://meeshy.me/l/rentree26")
        XCTAssertFalse(response.data.existed)
    }

    func test_createdTrackingLink_gatewayExistingBody_reportsExisted() throws {
        let response = try MeeshyCoders.decoder(.api).decode(
            APIResponse<CreatedTrackingLink>.self,
            from: Self.gatewayCreateBody(existed: true)
        )

        XCTAssertEqual(response.data.link.id, "6720f1c2a9b8c7d6e5f40312")
        XCTAssertTrue(response.data.existed)
    }

    func test_createdTrackingLink_flatLegacyBody_stillDecodes() throws {
        let body = Data("""
        {"success": true, "data": {
          "id": "tl-flat", "token": "abc123", "originalUrl": "https://example.com",
          "shortUrl": "https://meeshy.me/l/abc123", "totalClicks": 1, "uniqueClicks": 1,
          "isActive": true, "createdAt": "2026-01-01T00:00:00.000Z"
        }}
        """.utf8)

        let response = try MeeshyCoders.decoder(.api).decode(
            APIResponse<CreatedTrackingLink>.self, from: body
        )

        XCTAssertEqual(response.data.link.id, "tl-flat")
        XCTAssertFalse(response.data.existed)
    }

    func test_createLink_customToken_travelsUnderTheKeyTheGatewayDeclares() async throws {
        let created = try MeeshyCoders.decoder(.api).decode(
            APIResponse<CreatedTrackingLink>.self,
            from: Self.gatewayCreateBody(existed: nil)
        )
        mock.stub("/tracking-links", result: created)

        let link = try await service.createLink(
            CreateTrackingLinkRequest(originalUrl: "https://meeshy.me/", token: "rentree26")
        )

        XCTAssertEqual(link.id, "6720f1c2a9b8c7d6e5f40312")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["customToken"] as? String, "rentree26")
        XCTAssertNil(mock.lastRequest?.bodyJSON?["token"])
    }

    // MARK: - fetchClicks

    func test_fetchClicks_success_callsCorrectEndpoint() async throws {
        let detail = makeDetail()
        let response = APIResponse<TrackingLinkDetail>(success: true, data: detail, error: nil)
        mock.stub("/tracking-links/abc123/clicks", result: response)

        let result = try await service.fetchClicks(token: "abc123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/tracking-links/abc123/clicks")
        XCTAssertEqual(mock.lastRequest?.queryItems, [URLQueryItem(name: "offset", value: "0"), URLQueryItem(name: "limit", value: "50")])
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
