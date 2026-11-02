import Foundation
@testable import MeeshySDK

/// Un double d'`APIClientProviding` qui répond par du JSON BRUT, décodé comme le
/// ferait le vrai client : le contrat de forme est ainsi éprouvé, pas supposé.
final class MockE2EEAPIClient: APIClientProviding, @unchecked Sendable {
    struct Sent: Equatable {
        let method: String
        let path: String
        let body: String?
        let query: [String: String]
    }

    var baseURL = "https://mock.api"
    var authToken: String?
    var anonymousSessionToken: String?

    private let lock = NSLock()
    private var responses: [String: String] = [:]
    private var log: [Sent] = []

    var sent: [Sent] { lock.withLock { log } }

    func respond(_ method: String, _ path: String, json: String) {
        lock.withLock { responses["\(method) \(path)"] = json }
    }

    enum Missing: Error { case noResponse(String) }

    private func answer<T: Decodable>(_ endpoint: any MeeshyEndpoint, method: String, body: Data?, query: [URLQueryItem]?) throws -> T {
        let path = endpoint.path
        let entry = Sent(
            method: method,
            path: path,
            body: body.map { String(decoding: $0, as: UTF8.self) },
            query: Dictionary(uniqueKeysWithValues: (query ?? []).map { ($0.name, $0.value ?? "") })
        )
        let json = lock.withLock { () -> String? in
            log.append(entry)
            return responses["\(method) \(path)"]
        }
        guard let json else { throw Missing.noResponse("\(method) \(path)") }
        return try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func encoded<U: Encodable>(_ body: U) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(body)
    }

    func request<T: Decodable>(_ endpoint: any MeeshyEndpoint, method: String, body: Data?, queryItems: [URLQueryItem]?) async throws -> T {
        try answer(endpoint, method: method, body: body, query: queryItems)
    }

    func requestWithHeaders<T: Decodable>(_ endpoint: any MeeshyEndpoint, method: String, body: Data?, queryItems: [URLQueryItem]?, headers: [String: String]?) async throws -> T {
        try answer(endpoint, method: method, body: body, query: queryItems)
    }

    func post<T: Decodable, U: Encodable>(_ endpoint: any MeeshyEndpoint, body: U) async throws -> APIResponse<T> {
        try answer(endpoint, method: "POST", body: try encoded(body), query: nil)
    }

    func put<T: Decodable, U: Encodable>(_ endpoint: any MeeshyEndpoint, body: U) async throws -> APIResponse<T> {
        try answer(endpoint, method: "PUT", body: try encoded(body), query: nil)
    }

    func patch<T: Decodable, U: Encodable>(_ endpoint: any MeeshyEndpoint, body: U) async throws -> APIResponse<T> {
        try answer(endpoint, method: "PATCH", body: try encoded(body), query: nil)
    }

    func delete(_ endpoint: any MeeshyEndpoint) async throws -> APIResponse<[String: Bool]> {
        try answer(endpoint, method: "DELETE", body: nil, query: nil)
    }

    func delete<T: Decodable, U: Encodable>(_ endpoint: any MeeshyEndpoint, body: U) async throws -> APIResponse<T> {
        try answer(endpoint, method: "DELETE", body: try encoded(body), query: nil)
    }

    func paginatedRequest<T: Decodable>(_ endpoint: any MeeshyEndpoint, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[T]> {
        try answer(endpoint, method: "GET", body: nil, query: nil)
    }

    func offsetPaginatedRequest<T: Decodable>(_ endpoint: any MeeshyEndpoint, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[T]> {
        try answer(endpoint, method: "GET", body: nil, query: nil)
    }
}
