import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class APIServiceTests: XCTestCase {

    private func makeMockClient() -> MockAPIClientForApp {
        let mock = MockAPIClientForApp()
        mock.reset()
        return mock
    }

    private func makeAPIResponse<T: Codable>(success: Bool, data: T, error: String? = nil) -> APIResponse<T> {
        let wrapper: [String: Any] = [
            "success": success,
            "data": try! JSONSerialization.jsonObject(with: JSONEncoder().encode(data)),
            "error": error as Any
        ]
        let jsonData = try! JSONSerialization.data(withJSONObject: wrapper)
        return try! JSONDecoder().decode(APIResponse<T>.self, from: jsonData)
    }

    // MARK: - Request Tracking

    func test_request_tracksEndpointAndMethod() async throws {
        let mock = makeMockClient()
        mock.stub("/test", result: ["key": "value"])

        let _: [String: String] = try await mock.request(
            endpoint: "/test",
            method: "GET",
            body: nil,
            queryItems: nil
        )

        XCTAssertEqual(mock.requestEndpoints, ["/test"])
        XCTAssertEqual(mock.requestMethods, ["GET"])
        XCTAssertEqual(mock.requestCount, 1)
    }

    func test_request_multipleRequests_tracksAll() async throws {
        let mock = makeMockClient()
        mock.stub("/a", result: ["k": "v"])
        mock.stub("/b", result: ["k": "v"])

        let _: [String: String] = try await mock.request(endpoint: "/a", method: "GET", body: nil, queryItems: nil)
        let _: [String: String] = try await mock.request(endpoint: "/b", method: "POST", body: nil, queryItems: nil)

        XCTAssertEqual(mock.requestCount, 2)
        XCTAssertEqual(mock.requestEndpoints, ["/a", "/b"])
        XCTAssertEqual(mock.requestMethods, ["GET", "POST"])
    }

    // MARK: - Error Handling

    func test_request_withError_throws() async {
        let mock = makeMockClient()
        mock.errorToThrow = APIError.unauthorized

        do {
            let _: [String: String] = try await mock.request(
                endpoint: "/fail",
                method: "GET",
                body: nil,
                queryItems: nil
            )
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertEqual(mock.requestCount, 1)
        }
    }

    func test_request_noStub_throws() async {
        let mock = makeMockClient()

        do {
            let _: [String: String] = try await mock.request(
                endpoint: "/unstubbed",
                method: "GET",
                body: nil,
                queryItems: nil
            )
            XCTFail("Expected error for unstubbed endpoint")
        } catch {
            XCTAssertEqual(mock.requestCount, 1)
        }
    }

    // MARK: - POST Tracking

    func test_post_tracksCallCount() async throws {
        let mock = makeMockClient()
        let responseData = makeAPIResponse(success: true, data: ["result": true])
        mock.stub("/auth/login", result: responseData)

        struct TestBody: Encodable { let username: String }
        let _: APIResponse<[String: Bool]> = try await mock.post(
            endpoint: "/auth/login",
            body: TestBody(username: "test")
        )

        XCTAssertEqual(mock.postCount, 1)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.requestMethods, ["POST"])
    }

    // MARK: - PUT Tracking

    func test_put_tracksCallCount() async throws {
        let mock = makeMockClient()
        let responseData = makeAPIResponse(success: true, data: ["updated": true])
        mock.stub("/users/me", result: responseData)

        struct UpdateBody: Encodable { let displayName: String }
        let _: APIResponse<[String: Bool]> = try await mock.put(
            endpoint: "/users/me",
            body: UpdateBody(displayName: "New Name")
        )

        XCTAssertEqual(mock.putCount, 1)
        XCTAssertEqual(mock.requestMethods, ["PUT"])
    }

    // MARK: - DELETE Tracking

    func test_delete_tracksCallCount() async throws {
        let mock = makeMockClient()
        let responseData = makeAPIResponse(success: true, data: ["success": true])
        mock.stub("/messages/123", result: responseData)

        let _: APIResponse<[String: Bool]> = try await mock.delete(endpoint: "/messages/123")

        XCTAssertEqual(mock.deleteCount, 1)
        XCTAssertEqual(mock.requestMethods, ["DELETE"])
    }

    // MARK: - PATCH Tracking

    func test_patch_tracksCallCount() async throws {
        let mock = makeMockClient()
        let responseData = makeAPIResponse(success: true, data: ["patched": true])
        mock.stub("/settings", result: responseData)

        struct PatchBody: Encodable { let theme: String }
        let _: APIResponse<[String: Bool]> = try await mock.patch(
            endpoint: "/settings",
            body: PatchBody(theme: "dark")
        )

        XCTAssertEqual(mock.patchCount, 1)
        XCTAssertEqual(mock.requestMethods, ["PATCH"])
    }

    // MARK: - Token Injection

    func test_authToken_canBeSetAndRead() {
        let mock = makeMockClient()

        mock.authToken = "bearer-token-123"

        XCTAssertEqual(mock.authToken, "bearer-token-123")
    }

    func test_authToken_nil_byDefault() {
        let mock = makeMockClient()

        XCTAssertNil(mock.authToken)
    }

    func test_authToken_cleared_afterReset() {
        let mock = makeMockClient()
        mock.authToken = "some-token"

        mock.reset()

        XCTAssertNil(mock.authToken)
    }

    // MARK: - BaseURL

    func test_baseURL_defaultValue() {
        let mock = makeMockClient()

        XCTAssertEqual(mock.baseURL, "https://mock.api")
    }

    // MARK: - Reset

    func test_reset_clearsAllState() async throws {
        let mock = makeMockClient()
        mock.authToken = "token"
        mock.stub("/test", result: ["k": "v"])
        let _: [String: String] = try await mock.request(endpoint: "/test", method: "GET", body: nil, queryItems: nil)

        mock.reset()

        XCTAssertEqual(mock.requestCount, 0)
        XCTAssertTrue(mock.requestEndpoints.isEmpty)
        XCTAssertTrue(mock.requestMethods.isEmpty)
        XCTAssertEqual(mock.postCount, 0)
        XCTAssertEqual(mock.putCount, 0)
        XCTAssertEqual(mock.patchCount, 0)
        XCTAssertEqual(mock.deleteCount, 0)
        XCTAssertNil(mock.authToken)
        XCTAssertNil(mock.errorToThrow)
    }

    // MARK: - APIResponse Decoding

    func test_apiResponse_decodesSuccessResponse() throws {
        let json = """
        {"success": true, "data": {"name": "Test"}, "error": null}
        """
        let data = json.data(using: .utf8)!

        let response = try JSONDecoder().decode(APIResponse<[String: String]>.self, from: data)

        XCTAssertTrue(response.success)
        XCTAssertEqual(response.data["name"], "Test")
        XCTAssertNil(response.error)
    }

    func test_apiResponse_decodesErrorResponse() throws {
        let json = """
        {"success": false, "data": {}, "error": "Not found"}
        """
        let data = json.data(using: .utf8)!

        let response = try JSONDecoder().decode(APIResponse<[String: String]>.self, from: data)

        XCTAssertFalse(response.success)
        XCTAssertEqual(response.error, "Not found")
    }

    // MARK: - PaginatedAPIResponse Decoding

    func test_paginatedResponse_decodesWithPagination() throws {
        let json = """
        {
            "success": true,
            "data": [{"id": "1"}, {"id": "2"}],
            "pagination": {"nextCursor": "abc123", "hasMore": true, "limit": 20},
            "error": null
        }
        """
        let data = json.data(using: .utf8)!

        let response = try JSONDecoder().decode(PaginatedAPIResponse<[[String: String]]>.self, from: data)

        XCTAssertTrue(response.success)
        XCTAssertEqual(response.data.count, 2)
        XCTAssertEqual(response.pagination?.nextCursor, "abc123")
        XCTAssertEqual(response.pagination?.hasMore, true)
        XCTAssertEqual(response.pagination?.limit, 20)
    }

    func test_paginatedResponse_decodesWithoutPagination() throws {
        let json = """
        {"success": true, "data": [], "pagination": null, "error": null}
        """
        let data = json.data(using: .utf8)!

        let response = try JSONDecoder().decode(PaginatedAPIResponse<[[String: String]]>.self, from: data)

        XCTAssertTrue(response.success)
        XCTAssertTrue(response.data.isEmpty)
        XCTAssertNil(response.pagination)
    }

    // MARK: - OffsetPaginatedAPIResponse Decoding

    func test_offsetPaginatedResponse_decodesCorrectly() throws {
        let json = """
        {
            "success": true,
            "data": [{"id": "1"}],
            "pagination": {"total": 100, "hasMore": true, "limit": 15, "offset": 0},
            "error": null
        }
        """
        let data = json.data(using: .utf8)!

        let response = try JSONDecoder().decode(OffsetPaginatedAPIResponse<[[String: String]]>.self, from: data)

        XCTAssertEqual(response.pagination?.total, 100)
        XCTAssertEqual(response.pagination?.hasMore, true)
        XCTAssertEqual(response.pagination?.limit, 15)
        XCTAssertEqual(response.pagination?.offset, 0)
    }

    // MARK: - APIError Tests

    func test_apiError_invalidURL_description() {
        let error = APIError.invalidURL
        XCTAssertEqual(error.errorDescription, "Invalid URL")
    }

    func test_apiError_noData_description() {
        let error = APIError.noData
        XCTAssertEqual(error.errorDescription, "No data received")
    }

    func test_apiError_unauthorized_description() {
        let error = APIError.unauthorized
        XCTAssertEqual(error.errorDescription, "Authentication required")
    }

    func test_apiError_serverError_includesCodeAndMessage() {
        let error = APIError.serverError(422, "Validation failed")
        XCTAssertEqual(error.errorDescription, "Server error 422: Validation failed")
    }

    func test_apiError_serverError_nilMessage_showsUnknown() {
        let error = APIError.serverError(500, nil)
        XCTAssertEqual(error.errorDescription, "Server error 500: Unknown")
    }

    func test_apiError_networkError_wrapsUnderlying() {
        let underlying = URLError(.notConnectedToInternet)
        let error = APIError.networkError(underlying)
        XCTAssertNotNil(error.errorDescription)
        XCTAssertTrue(error.errorDescription?.contains("Network error") ?? false)
    }

    func test_apiError_decodingError_wrapsUnderlying() {
        let decodingErr = DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "bad"))
        let error = APIError.decodingError(decodingErr)
        XCTAssertTrue(error.errorDescription?.contains("Decoding error") ?? false)
    }

    // MARK: - CursorPagination Decoding

    func test_cursorPagination_decodesCorrectly() throws {
        let json = """
        {"nextCursor": "cursor123", "hasMore": false, "limit": 50}
        """
        let data = json.data(using: .utf8)!

        let pagination = try JSONDecoder().decode(CursorPagination.self, from: data)

        XCTAssertEqual(pagination.nextCursor, "cursor123")
        XCTAssertFalse(pagination.hasMore)
        XCTAssertEqual(pagination.limit, 50)
    }

    func test_cursorPagination_nullCursor() throws {
        let json = """
        {"nextCursor": null, "hasMore": false, "limit": 20}
        """
        let data = json.data(using: .utf8)!

        let pagination = try JSONDecoder().decode(CursorPagination.self, from: data)

        XCTAssertNil(pagination.nextCursor)
    }

    // MARK: - RefreshTokenData Decoding (App Model)

    func test_refreshTokenData_decodesCorrectly() throws {
        let json = """
        {"token": "new-jwt-token", "expiresIn": 3600}
        """
        let data = json.data(using: .utf8)!

        let tokenData = try JSONDecoder().decode(RefreshTokenData.self, from: data)

        XCTAssertEqual(tokenData.token, "new-jwt-token")
        XCTAssertEqual(tokenData.expiresIn, 3600)
    }
}
