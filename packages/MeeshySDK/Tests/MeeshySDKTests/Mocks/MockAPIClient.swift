import Foundation
@testable import MeeshySDK

final class MockAPIClient: APIClientProviding, @unchecked Sendable {
    var baseURL: String = "https://mock.api"
    var authToken: String?
    var anonymousSessionToken: String?

    // MARK: - Recording

    struct RecordedRequest: @unchecked Sendable {
        let endpoint: String
        let method: String
        let bodyJSON: [String: Any]?

        var path: String { endpoint }
    }

    private(set) var requests: [RecordedRequest] = []

    var lastRequest: RecordedRequest? { requests.last }
    var requestCount: Int { requests.count }

    // MARK: - Stubbing

    private var stubs: [String: Any] = [:]
    var errorToThrow: Error?

    /// Typed error thrown when a request hits an endpoint with no registered stub.
    /// Replaces the previous `fatalError` which caused process crashes when async
    /// background tasks (e.g. `ConversationSyncEngine.didReconnect → syncSinceLastCheckpoint`)
    /// fired against a mock that hadn't seeded the relevant endpoint.
    enum NoStubError: Error, CustomStringConvertible {
        case missing(endpoint: String, type: String, available: [String])
        var description: String {
            switch self {
            case .missing(let endpoint, let type, let available):
                return "MockAPIClient: no stub for '\(endpoint)' returning \(type). Available stubs: \(available)"
            }
        }
    }

    func stub<T>(_ endpoint: String, result: T) {
        stubs[endpoint] = result
    }

    // MARK: - Reset

    func reset() {
        requests.removeAll()
        stubs.removeAll()
        errorToThrow = nil
        authToken = nil
        anonymousSessionToken = nil
    }

    // MARK: - APIClientProviding

    func request<T: Decodable>(
        endpoint: String,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?
    ) async throws -> T {
        recordRequest(endpoint: endpoint, method: method, bodyData: body)
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? T else {
            throw NoStubError.missing(endpoint: endpoint, type: "\(T.self)", available: Array(stubs.keys))
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
        recordRequest(endpoint: endpoint, method: "POST", encodableBody: body)
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NoStubError.missing(endpoint: endpoint, type: "APIResponse<\(T.self)>", available: Array(stubs.keys))
        }
        return result
    }

    func put<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        recordRequest(endpoint: endpoint, method: "PUT", encodableBody: body)
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NoStubError.missing(endpoint: endpoint, type: "APIResponse<\(T.self)>", available: Array(stubs.keys))
        }
        return result
    }

    func patch<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        recordRequest(endpoint: endpoint, method: "PATCH", encodableBody: body)
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NoStubError.missing(endpoint: endpoint, type: "APIResponse<\(T.self)>", available: Array(stubs.keys))
        }
        return result
    }

    func delete(endpoint: String) async throws -> APIResponse<[String: Bool]> {
        return try await request(endpoint: endpoint, method: "DELETE", body: nil, queryItems: nil)
    }

    func delete<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        recordRequest(endpoint: endpoint, method: "DELETE", encodableBody: body)
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NoStubError.missing(endpoint: endpoint, type: "APIResponse<\(T.self)>", available: Array(stubs.keys))
        }
        return result
    }

    // MARK: - Internal recording helpers

    private func recordRequest(endpoint: String, method: String, bodyData: Data?) {
        let json = bodyData.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        requests.append(RecordedRequest(endpoint: endpoint, method: method, bodyJSON: json))
    }

    private func recordRequest<U: Encodable>(endpoint: String, method: String, encodableBody: U) {
        let data = try? JSONEncoder().encode(encodableBody)
        let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        requests.append(RecordedRequest(endpoint: endpoint, method: method, bodyJSON: json))
    }
}
