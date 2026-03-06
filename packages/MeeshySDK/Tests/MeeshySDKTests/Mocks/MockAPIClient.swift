import Foundation
@testable import MeeshySDK

final class MockAPIClient: APIClientProviding, @unchecked Sendable {
    var baseURL: String = "https://mock.api"
    var authToken: String?

    // MARK: - Recording

    struct RecordedRequest: Sendable {
        let endpoint: String
        let method: String
    }

    private(set) var requests: [RecordedRequest] = []

    var lastRequest: RecordedRequest? { requests.last }
    var requestCount: Int { requests.count }

    // MARK: - Stubbing

    private var stubs: [String: Any] = [:]
    var errorToThrow: Error?

    func stub<T>(_ endpoint: String, result: T) {
        stubs[endpoint] = result
    }

    // MARK: - Reset

    func reset() {
        requests.removeAll()
        stubs.removeAll()
        errorToThrow = nil
        authToken = nil
    }

    // MARK: - APIClientProviding

    func request<T: Decodable>(
        endpoint: String,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?
    ) async throws -> T {
        requests.append(RecordedRequest(endpoint: endpoint, method: method))
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? T else {
            fatalError("MockAPIClient: no stub for '\(endpoint)' returning \(T.self). Available stubs: \(Array(stubs.keys))")
        }
        return result
    }

    func paginatedRequest<T: Decodable>(
        endpoint: String,
        cursor: String?,
        limit: Int
    ) async throws -> PaginatedAPIResponse<[T]> {
        return try await request(endpoint: endpoint, method: "GET", body: nil, queryItems: nil)
    }

    func offsetPaginatedRequest<T: Decodable>(
        endpoint: String,
        offset: Int,
        limit: Int
    ) async throws -> OffsetPaginatedAPIResponse<[T]> {
        return try await request(endpoint: endpoint, method: "GET", body: nil, queryItems: nil)
    }

    func post<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        return try await request(endpoint: endpoint, method: "POST", body: nil, queryItems: nil)
    }

    func put<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        return try await request(endpoint: endpoint, method: "PUT", body: nil, queryItems: nil)
    }

    func patch<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        return try await request(endpoint: endpoint, method: "PATCH", body: nil, queryItems: nil)
    }

    func delete(endpoint: String) async throws -> APIResponse<[String: Bool]> {
        return try await request(endpoint: endpoint, method: "DELETE", body: nil, queryItems: nil)
    }

    func delete<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        return try await request(endpoint: endpoint, method: "DELETE", body: nil, queryItems: nil)
    }
}
