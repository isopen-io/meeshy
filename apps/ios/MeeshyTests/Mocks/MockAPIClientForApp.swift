import Foundation
import MeeshySDK
import XCTest

final class MockAPIClientForApp: APIClientProviding, @unchecked Sendable {

    // MARK: - State

    var baseURL: String = "https://mock.api"
    var authToken: String?

    // MARK: - Stubbing

    private var stubs: [String: Any] = [:]
    var errorToThrow: Error?

    // MARK: - Call Tracking

    var requestCount = 0
    var requestEndpoints: [String] = []
    var requestMethods: [String] = []
    var postCount = 0
    var putCount = 0
    var patchCount = 0
    var deleteCount = 0

    // MARK: - Stub Registration

    func stub<T>(_ endpoint: String, result: T) {
        stubs[endpoint] = result
    }

    // MARK: - Protocol Methods

    func request<T: Decodable>(
        endpoint: String,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?
    ) async throws -> T {
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append(method)
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? T else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for endpoint '\(endpoint)' returning \(T.self)"])
        }
        return result
    }

    func paginatedRequest<T: Decodable>(
        endpoint: String,
        cursor: String?,
        limit: Int
    ) async throws -> PaginatedAPIResponse<[T]> {
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("GET")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? PaginatedAPIResponse<[T]> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for paginated endpoint '\(endpoint)'"])
        }
        return result
    }

    func offsetPaginatedRequest<T: Decodable>(
        endpoint: String,
        offset: Int,
        limit: Int
    ) async throws -> OffsetPaginatedAPIResponse<[T]> {
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("GET")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? OffsetPaginatedAPIResponse<[T]> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for offset paginated endpoint '\(endpoint)'"])
        }
        return result
    }

    func post<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        postCount += 1
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("POST")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for POST endpoint '\(endpoint)'"])
        }
        return result
    }

    func put<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        putCount += 1
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("PUT")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for PUT endpoint '\(endpoint)'"])
        }
        return result
    }

    func patch<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        patchCount += 1
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("PATCH")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for PATCH endpoint '\(endpoint)'"])
        }
        return result
    }

    func delete(endpoint: String) async throws -> APIResponse<[String: Bool]> {
        deleteCount += 1
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("DELETE")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<[String: Bool]> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for DELETE endpoint '\(endpoint)'"])
        }
        return result
    }

    func delete<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        deleteCount += 1
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("DELETE")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for DELETE endpoint '\(endpoint)'"])
        }
        return result
    }

    // MARK: - Reset

    func reset() {
        baseURL = "https://mock.api"
        authToken = nil
        stubs.removeAll()
        errorToThrow = nil
        requestCount = 0
        requestEndpoints.removeAll()
        requestMethods.removeAll()
        postCount = 0
        putCount = 0
        patchCount = 0
        deleteCount = 0
    }
}
