import XCTest
@testable import MeeshySDK

final class AffiliateServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: AffiliateService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = AffiliateService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeToken(id: String = "tok1", name: String = "Test Token") -> AffiliateToken {
        AffiliateToken(
            id: id, token: "abc123", name: name, affiliateLink: "https://meeshy.me/ref/abc123",
            maxUses: 100, currentUses: 5, isActive: true, expiresAt: nil,
            createdAt: "2026-01-01T00:00:00Z", _count: nil, clickCount: 10
        )
    }

    // MARK: - listTokens

    func test_listTokens_callsCorrectEndpoint() async throws {
        let tokens = [makeToken()]
        let response = OffsetPaginatedAPIResponse<[AffiliateToken]>(
            success: true, data: tokens, pagination: nil, error: nil
        )
        mock.stub("/affiliate/tokens", result: response)

        let result = try await service.listTokens()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/affiliate/tokens")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].name, "Test Token")
    }

    func test_listTokens_returnsEmptyArray() async throws {
        let response = OffsetPaginatedAPIResponse<[AffiliateToken]>(
            success: true, data: [], pagination: nil, error: nil
        )
        mock.stub("/affiliate/tokens", result: response)

        let result = try await service.listTokens()

        XCTAssertTrue(result.isEmpty)
    }

    func test_listTokens_propagatesError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.listTokens()
            XCTFail("Expected error to be thrown")
        } catch {
            // expected
        }
    }

    // MARK: - createToken

    func test_createToken_callsCorrectEndpoint() async throws {
        let token = makeToken(id: "new1", name: "New Token")
        let response = APIResponse<AffiliateToken>(success: true, data: token, error: nil)
        mock.stub("/affiliate/tokens", result: response)

        let result = try await service.createToken(name: "New Token")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/affiliate/tokens")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(result.name, "New Token")
        XCTAssertEqual(result.id, "new1")
    }

    func test_createToken_propagatesError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 400, message: "Bad request")

        do {
            _ = try await service.createToken(name: "Test")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 400)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }

    // MARK: - deleteToken

    func test_deleteToken_callsCorrectEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["success": true], error: nil)
        mock.stub("/affiliate/tokens/tok1", result: response)

        try await service.deleteToken(id: "tok1")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/affiliate/tokens/tok1")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    func test_deleteToken_propagatesError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 404, message: "Not found")

        do {
            try await service.deleteToken(id: "nonexistent")
            XCTFail("Expected error to be thrown")
        } catch {
            // expected
        }
    }

    // MARK: - fetchStats

    func test_fetchStats_callsCorrectEndpoint() async throws {
        let stats = AffiliateStats(totalTokens: 5, totalReferrals: 20, totalVisits: 100, conversionRate: 0.2)
        let response = APIResponse<AffiliateStats>(success: true, data: stats, error: nil)
        mock.stub("/affiliate/stats", result: response)

        let result = try await service.fetchStats()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/affiliate/stats")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.totalTokens, 5)
        XCTAssertEqual(result.totalReferrals, 20)
        XCTAssertEqual(result.conversionRate, 0.2)
    }

    func test_fetchStats_propagatesError() async {
        mock.errorToThrow = MeeshyError.network(.timeout)

        do {
            _ = try await service.fetchStats()
            XCTFail("Expected error to be thrown")
        } catch {
            // expected
        }
    }
}
