import Foundation

// MARK: - API Response Types

struct APIResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T
    let error: String?
}

struct PaginatedAPIResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T
    let pagination: CursorPagination?
    let error: String?
}

struct CursorPagination: Decodable {
    let nextCursor: String?
    let hasMore: Bool
    let limit: Int
}

struct OffsetPagination: Decodable {
    let total: Int?
    let hasMore: Bool
    let limit: Int
    let offset: Int
}

struct OffsetPaginatedAPIResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T
    let pagination: OffsetPagination?
    let error: String?
}

// MARK: - API Errors

enum APIError: Error, LocalizedError {
    case invalidURL
    case noData
    case decodingError(Error)
    case serverError(Int, String?)
    case networkError(Error)
    case unauthorized

    var errorDescription: String? {
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

// MARK: - API Client

final class APIClient {
    static let shared = APIClient()

    static let remoteBaseURL = "https://gate.meeshy.me/api/v1"
    static let localBaseURL = "http://localhost:3000/api/v1"

    var baseURL: String {
        UserDefaults.standard.string(forKey: "meeshy_api_base_url") ?? Self.remoteBaseURL
    }

    /// Switch between remote and local gateway
    func setUseLocalGateway(_ local: Bool) {
        UserDefaults.standard.set(local ? Self.localBaseURL : Self.remoteBaseURL, forKey: "meeshy_api_base_url")
    }

    private let session: URLSession
    private let decoder: JSONDecoder

    // Auth token — set after login
    var authToken: String? {
        get { UserDefaults.standard.string(forKey: "meeshy_auth_token") }
        set { UserDefaults.standard.set(newValue, forKey: "meeshy_auth_token") }
    }

    // Session token — persisted for trusted device refresh (365 days)
    var sessionToken: String? {
        get { UserDefaults.standard.string(forKey: "meeshy_session_token") }
        set { UserDefaults.standard.set(newValue, forKey: "meeshy_session_token") }
    }

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            // Try ISO 8601 with fractional seconds first
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso.date(from: dateStr) { return date }
            // Fallback without fractional seconds
            iso.formatOptions = [.withInternetDateTime]
            if let date = iso.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }
    }

    // MARK: - Generic Request

    func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil,
        queryItems: [URLQueryItem]? = nil
    ) async throws -> T {
        guard var components = URLComponents(string: "\(baseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }

        if let queryItems, !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = authToken {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let session = sessionToken {
            urlRequest.setValue(session, forHTTPHeaderField: "x-session-token")
        }

        if let body {
            urlRequest.httpBody = body
        }

        do {
            let (data, response) = try await session.data(for: urlRequest)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.noData
            }

            if httpResponse.statusCode == 401 {
                if let currentToken = authToken {
                    do {
                        let refreshed = try await refreshAuthToken(currentToken: currentToken)
                        authToken = refreshed.token
                        urlRequest.setValue("Bearer \(refreshed.token)", forHTTPHeaderField: "Authorization")
                        let (retryData, retryResponse) = try await self.session.data(for: urlRequest)
                        guard let retryHttp = retryResponse as? HTTPURLResponse else { throw APIError.noData }
                        if retryHttp.statusCode == 401 {
                            Task { @MainActor in AuthManager.shared.handleUnauthorized() }
                            throw APIError.unauthorized
                        }
                        guard (200...299).contains(retryHttp.statusCode) else {
                            let errorMsg = try? decoder.decode(APIResponse<String>.self, from: retryData).error
                            throw APIError.serverError(retryHttp.statusCode, errorMsg)
                        }
                        return try decoder.decode(T.self, from: retryData)
                    } catch {
                        Task { @MainActor in AuthManager.shared.handleUnauthorized() }
                        throw APIError.unauthorized
                    }
                }
                Task { @MainActor in AuthManager.shared.handleUnauthorized() }
                throw APIError.unauthorized
            }

            guard (200...299).contains(httpResponse.statusCode) else {
                let errorMsg = try? decoder.decode(APIResponse<String>.self, from: data).error
                throw APIError.serverError(httpResponse.statusCode, errorMsg)
            }

            return try decoder.decode(T.self, from: data)
        } catch let error as APIError {
            throw error
        } catch let error as DecodingError {
            throw APIError.decodingError(error)
        } catch {
            throw APIError.networkError(error)
        }
    }

    // MARK: - Paginated Request (cursor-based)

    func paginatedRequest<T: Decodable>(
        endpoint: String,
        cursor: String? = nil,
        limit: Int = 20
    ) async throws -> PaginatedAPIResponse<[T]> {
        var queryItems = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }

        return try await request(
            endpoint: endpoint,
            queryItems: queryItems
        )
    }

    // MARK: - Offset Paginated Request

    func offsetPaginatedRequest<T: Decodable>(
        endpoint: String,
        offset: Int = 0,
        limit: Int = 15
    ) async throws -> OffsetPaginatedAPIResponse<[T]> {
        let queryItems = [
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "offset", value: "\(offset)"),
        ]

        return try await request(
            endpoint: endpoint,
            queryItems: queryItems
        )
    }

    // MARK: - POST with Encodable body

    func post<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        let data = try JSONEncoder().encode(body)
        return try await request(endpoint: endpoint, method: "POST", body: data)
    }

    // MARK: - PUT with Encodable body

    func put<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        let data = try JSONEncoder().encode(body)
        return try await request(endpoint: endpoint, method: "PUT", body: data)
    }

    // MARK: - DELETE

    func delete(endpoint: String) async throws -> APIResponse<[String: Bool]> {
        return try await request(endpoint: endpoint, method: "DELETE")
    }

    // MARK: - Token Refresh (direct URLRequest, bypasses request() to avoid recursion)

    func refreshAuthToken(currentToken: String) async throws -> RefreshTokenData {
        guard let url = URL(string: "\(baseURL)/auth/refresh") else {
            throw APIError.invalidURL
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let session = sessionToken {
            urlRequest.setValue(session, forHTTPHeaderField: "x-session-token")
        }

        struct RefreshBody: Encodable {
            let token: String
            let sessionToken: String?
        }

        let body = RefreshBody(token: currentToken, sessionToken: sessionToken)
        urlRequest.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: urlRequest)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.unauthorized
        }

        return try decoder.decode(APIResponse<RefreshTokenData>.self, from: data).data
    }
}
