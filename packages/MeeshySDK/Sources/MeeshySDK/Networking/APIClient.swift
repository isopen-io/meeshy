import Foundation
import Security

// MARK: - Certificate Pinning

final class CertificatePinningDelegate: NSObject, URLSessionDelegate, Sendable {
    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        guard let serverTrust = challenge.protectionSpace.serverTrust,
              challenge.protectionSpace.host == "gate.meeshy.me" else {
            return (.performDefaultHandling, nil)
        }

        let policies = [SecPolicyCreateSSL(true, "gate.meeshy.me" as CFString)]
        SecTrustSetPolicies(serverTrust, policies as CFArray)

        var error: CFError?
        guard SecTrustEvaluateWithError(serverTrust, &error) else {
            return (.cancelAuthenticationChallenge, nil)
        }

        return (.useCredential, URLCredential(trust: serverTrust))
    }
}

// MARK: - API Response Types

public struct APIResponse<T: Decodable>: Decodable {
    public let success: Bool
    public let data: T
    public let error: String?
}

public struct SimpleAPIResponse: Decodable {
    public let success: Bool
    public let message: String?
    public let error: String?
}

public struct PaginatedAPIResponse<T: Decodable>: Decodable {
    public let success: Bool
    public let data: T
    public let pagination: CursorPagination?
    public let error: String?

    public init(success: Bool, data: T, pagination: CursorPagination?, error: String?) {
        self.success = success
        self.data = data
        self.pagination = pagination
        self.error = error
    }
}

public struct CursorPagination: Decodable, Sendable {
    public let nextCursor: String?
    public let hasMore: Bool
    public let limit: Int
}

public struct OffsetPagination: Decodable, Sendable {
    public let total: Int?
    public let hasMore: Bool
    public let limit: Int
    public let offset: Int
}

public struct OffsetPaginatedAPIResponse<T: Decodable>: Decodable {
    public let success: Bool
    public let data: T
    public let pagination: OffsetPagination?
    public let error: String?
}

private struct ErrorBody: Decodable {
    let message: String?
    let error: String?
}

// MARK: - API Errors

public enum APIError: Error, LocalizedError {
    case invalidURL
    case noData
    case decodingError(Error)
    case serverError(Int, String?)
    case networkError(Error)
    case unauthorized

    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .noData: return "No data received"
        case .decodingError(let err): return "Decoding error: \(err.localizedDescription)"
        case .serverError(let code, let msg): return "Server error \(code): \(msg ?? "Unknown")"
        case .networkError(let err): return "Network error: \(err.localizedDescription)"
        case .unauthorized: return "Authentication required"
        }
    }
}

// MARK: - API Client Protocol

public protocol APIClientProviding: Sendable {
    var baseURL: String { get }
    var authToken: String? { get set }
    var anonymousSessionToken: String? { get set }
    func request<T: Decodable>(endpoint: String, method: String, body: Data?, queryItems: [URLQueryItem]?) async throws -> T
    func paginatedRequest<T: Decodable>(endpoint: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[T]>
    func offsetPaginatedRequest<T: Decodable>(endpoint: String, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[T]>
    func post<T: Decodable, U: Encodable>(endpoint: String, body: U) async throws -> APIResponse<T>
    func put<T: Decodable, U: Encodable>(endpoint: String, body: U) async throws -> APIResponse<T>
    func patch<T: Decodable, U: Encodable>(endpoint: String, body: U) async throws -> APIResponse<T>
    func delete(endpoint: String) async throws -> APIResponse<[String: Bool]>
    func delete<T: Decodable, U: Encodable>(endpoint: String, body: U) async throws -> APIResponse<T>
}

extension APIClientProviding {
    public func request<T: Decodable>(endpoint: String) async throws -> T {
        try await request(endpoint: endpoint, method: "GET", body: nil, queryItems: nil)
    }

    public func request<T: Decodable>(endpoint: String, method: String) async throws -> T {
        try await request(endpoint: endpoint, method: method, body: nil, queryItems: nil)
    }

    public func request<T: Decodable>(endpoint: String, method: String, body: Data?) async throws -> T {
        try await request(endpoint: endpoint, method: method, body: body, queryItems: nil)
    }

    public func request<T: Decodable>(endpoint: String, queryItems: [URLQueryItem]?) async throws -> T {
        try await request(endpoint: endpoint, method: "GET", body: nil, queryItems: queryItems)
    }

    public func request<T: Decodable>(endpoint: String, method: String, queryItems: [URLQueryItem]?) async throws -> T {
        try await request(endpoint: endpoint, method: method, body: nil, queryItems: queryItems)
    }

    public func paginatedRequest<T: Decodable>(endpoint: String) async throws -> PaginatedAPIResponse<[T]> {
        try await paginatedRequest(endpoint: endpoint, cursor: nil, limit: 20)
    }

    public func offsetPaginatedRequest<T: Decodable>(endpoint: String) async throws -> OffsetPaginatedAPIResponse<[T]> {
        try await offsetPaginatedRequest(endpoint: endpoint, offset: 0, limit: 15)
    }
}

// MARK: - API Client

public final class APIClient: APIClientProviding, @unchecked Sendable {
    public static let shared = APIClient()

    public var baseURL: String {
        MeeshyConfig.shared.apiBaseURL
    }

    private let session: URLSession
    private let decoder: JSONDecoder

    public var authToken: String?
    public var anonymousSessionToken: String?

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 120
        self.session = URLSession(
            configuration: config,
            delegate: CertificatePinningDelegate(),
            delegateQueue: nil
        )

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso.date(from: dateStr) { return date }
            iso.formatOptions = [.withInternetDateTime]
            if let date = iso.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }
    }

    // MARK: - Generic Request

    public func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil,
        queryItems: [URLQueryItem]? = nil
    ) async throws -> T {
        guard var components = URLComponents(string: "\(baseURL)\(endpoint)") else {
            throw MeeshyError.server(statusCode: 0, message: "URL invalide")
        }

        if let queryItems, !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let url = components.url else {
            throw MeeshyError.server(statusCode: 0, message: "URL invalide")
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method

        // Client identification headers (version, device, locale, geo)
        let clientHeaders = await ClientInfoProvider.shared.buildHeaders()
        for (key, value) in clientHeaders {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }

        if let token = authToken {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else if let token = anonymousSessionToken {
            urlRequest.setValue(token, forHTTPHeaderField: "X-Session-Token")
        }

        if let body {
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            urlRequest.httpBody = body
        }

        do {
            let networkStart = CFAbsoluteTimeGetCurrent()
            let (data, response) = try await session.data(for: urlRequest)
            let networkMs = (CFAbsoluteTimeGetCurrent() - networkStart) * 1000

            guard let httpResponse = response as? HTTPURLResponse else {
                throw MeeshyError.server(statusCode: 0, message: "Aucune donnee recue")
            }

            let statusCode = httpResponse.statusCode

            let decodeStart = CFAbsoluteTimeGetCurrent()

            guard (200...299).contains(statusCode) else {
                let errBody = try? decoder.decode(ErrorBody.self, from: data)
                let errorMsg = errBody?.message ?? errBody?.error

                if statusCode == 401 {
                    Task { @MainActor in
                        AuthManager.shared.handleUnauthorized()
                    }
                    throw MeeshyError.auth(.sessionExpired)
                }

                if statusCode == 403 {
                    throw MeeshyError.auth(.accountLocked)
                }

                if statusCode == 429 {
                    throw MeeshyError.server(statusCode: 429, message: "Trop de requetes")
                }

                if statusCode >= 500 {
                    throw MeeshyError.server(statusCode: statusCode, message: errorMsg ?? "Erreur serveur")
                }

                throw MeeshyError.server(statusCode: statusCode, message: errorMsg ?? "Erreur inconnue")
            }

            let result = try decoder.decode(T.self, from: data)
            let decodeMs = (CFAbsoluteTimeGetCurrent() - decodeStart) * 1000
            let totalMs = networkMs + decodeMs
            if totalMs > 1000 {
                print("⏱️ [APIClient] \(method) \(endpoint) → \(statusCode) network=\(Int(networkMs))ms decode=\(Int(decodeMs))ms total=\(Int(totalMs))ms size=\(data.count)B")
            }
            return result
        } catch let error as MeeshyError {
            throw error
        } catch let error as DecodingError {
            var debugInfo = "Erreur de decodage: "
            switch error {
            case .typeMismatch(let type, let context):
                debugInfo += "Type mismatch for type \(type) at path \(context.codingPath.map { $0.stringValue }.joined(separator: "."))"
            case .valueNotFound(let type, let context):
                debugInfo += "Value not found for type \(type) at path \(context.codingPath.map { $0.stringValue }.joined(separator: "."))"
            case .keyNotFound(let key, let context):
                debugInfo += "Key '\(key.stringValue)' not found at path \(context.codingPath.map { $0.stringValue }.joined(separator: "."))"
            case .dataCorrupted(let context):
                debugInfo += "Data corrupted at path \(context.codingPath.map { $0.stringValue }.joined(separator: ".")) - \(context.debugDescription)"
            @unknown default:
                debugInfo += error.localizedDescription
            }
            print("APIClient DecodingError:", debugInfo)
            throw MeeshyError.server(statusCode: 0, message: debugInfo)
        } catch let error as URLError {
            switch error.code {
            case .notConnectedToInternet, .networkConnectionLost:
                throw MeeshyError.network(.noConnection)
            case .timedOut:
                throw MeeshyError.network(.timeout)
            case .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed:
                throw MeeshyError.network(.serverUnreachable)
            default:
                throw MeeshyError.network(.noConnection)
            }
        } catch {
            throw MeeshyError.unknown(error)
        }
    }

    // MARK: - Paginated Request (cursor-based)

    public func paginatedRequest<T: Decodable>(
        endpoint: String,
        cursor: String? = nil,
        limit: Int = 20
    ) async throws -> PaginatedAPIResponse<[T]> {
        var queryItems = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await request(endpoint: endpoint, queryItems: queryItems)
    }

    // MARK: - Offset Paginated Request

    public func offsetPaginatedRequest<T: Decodable>(
        endpoint: String,
        offset: Int = 0,
        limit: Int = 15
    ) async throws -> OffsetPaginatedAPIResponse<[T]> {
        let queryItems = [
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "offset", value: "\(offset)"),
        ]
        return try await request(endpoint: endpoint, queryItems: queryItems)
    }

    // MARK: - JSON Encoder (shared, ISO 8601 dates)

    private static let jsonEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    // MARK: - POST with Encodable body

    public func post<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        let data = try APIClient.jsonEncoder.encode(body)
        return try await request(endpoint: endpoint, method: "POST", body: data)
    }

    // MARK: - PUT with Encodable body

    public func put<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        let data = try APIClient.jsonEncoder.encode(body)
        return try await request(endpoint: endpoint, method: "PUT", body: data)
    }

    // MARK: - PATCH with Encodable body

    public func patch<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        let data = try APIClient.jsonEncoder.encode(body)
        return try await request(endpoint: endpoint, method: "PATCH", body: data)
    }

    // MARK: - DELETE

    public func delete(endpoint: String) async throws -> APIResponse<[String: Bool]> {
        return try await request(endpoint: endpoint, method: "DELETE")
    }

    // MARK: - DELETE with Encodable body

    public func delete<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        let data = try APIClient.jsonEncoder.encode(body)
        return try await request(endpoint: endpoint, method: "DELETE", body: data)
    }
}
