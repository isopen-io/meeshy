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
        let queryItems: [URLQueryItem]?
        /// Extra headers passed via `requestWithHeaders` (e.g. `X-Client-Mutation-Id`,
        /// an explicit `Authorization` override). `nil` for requests made via the
        /// headerless `request`/`post`/... entry points.
        let headers: [String: String]?

        var path: String { endpoint }
    }

    private(set) var requests: [RecordedRequest] = []

    var lastRequest: RecordedRequest? { requests.last }
    var requestCount: Int { requests.count }

    // MARK: - Stubbing

    private var stubs: [String: Any] = [:]
    var errorToThrow: Error?

    /// Per-endpoint errors — take precedence over `errorToThrow` when set.
    private var endpointErrors: [String: Error] = [:]

    /// Stub a specific endpoint to throw `error` instead of returning a stub value.
    /// Used to simulate structured error responses (e.g. 403 consent payloads).
    func stubError(_ endpoint: String, error: Error) {
        endpointErrors[endpoint] = error
    }

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
        endpointErrors.removeAll()
        authToken = nil
        anonymousSessionToken = nil
    }

    // MARK: - APIClientProviding

    func request<T: Decodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?
    ) async throws -> T {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        recordRequest(endpoint: endpoint, method: method, bodyData: body, queryItems: queryItems)
        if let error = endpointErrors[endpoint] { throw error }
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? T else {
            throw NoStubError.missing(endpoint: endpoint, type: "\(T.self)", available: Array(stubs.keys))
        }
        return result
    }

    /// Overrides the protocol's default (header-dropping) fallback so tests
    /// can assert on explicit headers (`X-Client-Mutation-Id`, an explicit
    /// `Authorization` override) instead of silently losing them.
    func requestWithHeaders<T: Decodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?,
        headers: [String: String]?
    ) async throws -> T {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        recordRequest(endpoint: endpoint, method: method, bodyData: body, queryItems: queryItems, headers: headers)
        if let error = endpointErrors[endpoint] { throw error }
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? T else {
            throw NoStubError.missing(endpoint: endpoint, type: "\(T.self)", available: Array(stubs.keys))
        }
        return result
    }

    func paginatedRequest<T: Decodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        cursor: String?,
        limit: Int
    ) async throws -> PaginatedAPIResponse<[T]> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        return try await request(typedEndpoint, method: "GET", body: nil, queryItems: nil)
    }

    func offsetPaginatedRequest<T: Decodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        offset: Int,
        limit: Int
    ) async throws -> OffsetPaginatedAPIResponse<[T]> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        return try await request(typedEndpoint, method: "GET", body: nil, queryItems: nil)
    }

    func post<T: Decodable, U: Encodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        recordRequest(endpoint: endpoint, method: "POST", encodableBody: body)
        if let error = endpointErrors[endpoint] { throw error }
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NoStubError.missing(endpoint: endpoint, type: "APIResponse<\(T.self)>", available: Array(stubs.keys))
        }
        return result
    }

    func put<T: Decodable, U: Encodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        recordRequest(endpoint: endpoint, method: "PUT", encodableBody: body)
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NoStubError.missing(endpoint: endpoint, type: "APIResponse<\(T.self)>", available: Array(stubs.keys))
        }
        return result
    }

    func patch<T: Decodable, U: Encodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        recordRequest(endpoint: endpoint, method: "PATCH", encodableBody: body)
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NoStubError.missing(endpoint: endpoint, type: "APIResponse<\(T.self)>", available: Array(stubs.keys))
        }
        return result
    }

    func delete(_ typedEndpoint: any MeeshyEndpoint) async throws -> APIResponse<[String: Bool]> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        return try await request(typedEndpoint, method: "DELETE", body: nil, queryItems: nil)
    }

    func delete<T: Decodable, U: Encodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        recordRequest(endpoint: endpoint, method: "DELETE", encodableBody: body)
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NoStubError.missing(endpoint: endpoint, type: "APIResponse<\(T.self)>", available: Array(stubs.keys))
        }
        return result
    }

    // MARK: - Internal recording helpers

    private func recordRequest(
        endpoint: String, method: String, bodyData: Data?,
        queryItems: [URLQueryItem]? = nil, headers: [String: String]? = nil
    ) {
        let json = bodyData.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        requests.append(RecordedRequest(endpoint: endpoint, method: method, bodyJSON: json, queryItems: queryItems, headers: headers))
    }

    private func recordRequest<U: Encodable>(endpoint: String, method: String, encodableBody: U) {
        let data = try? JSONEncoder().encode(encodableBody)
        let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        requests.append(RecordedRequest(endpoint: endpoint, method: method, bodyJSON: json, queryItems: nil, headers: nil))
    }
}
