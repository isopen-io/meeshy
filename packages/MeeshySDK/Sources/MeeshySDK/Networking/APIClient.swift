import Foundation

// MARK: - API Response Types

public struct APIResponse<T: Decodable>: Decodable {
    public let success: Bool
    public let data: T
    public let error: String?
}

public struct PaginatedAPIResponse<T: Decodable>: Decodable {
    public let success: Bool
    public let data: T
    public let pagination: CursorPagination?
    public let error: String?
}

public struct CursorPagination: Decodable {
    public let nextCursor: String?
    public let hasMore: Bool
    public let limit: Int
}

public struct OffsetPagination: Decodable {
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

// MARK: - API Client

public final class APIClient {
    public static let shared = APIClient()

    public var baseURL: String {
        MeeshyConfig.shared.apiBaseURL
    }

    private let session: URLSession
    private let decoder: JSONDecoder

    // Auth token — set after login
    public var authToken: String? {
        get { UserDefaults.standard.string(forKey: "meeshy_auth_token") }
        set { UserDefaults.standard.set(newValue, forKey: "meeshy_auth_token") }
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

        if let body {
            urlRequest.httpBody = body
        }

        do {
            let (data, response) = try await session.data(for: urlRequest)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.noData
            }

            if httpResponse.statusCode == 401 {
                Task { @MainActor in
                    AuthManager.shared.handleUnauthorized()
                }
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

    // MARK: - POST with Encodable body

    public func post<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        let data = try JSONEncoder().encode(body)
        return try await request(endpoint: endpoint, method: "POST", body: data)
    }

    // MARK: - PUT with Encodable body

    public func put<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        let data = try JSONEncoder().encode(body)
        return try await request(endpoint: endpoint, method: "PUT", body: data)
    }

    // MARK: - DELETE

    public func delete(endpoint: String) async throws -> APIResponse<[String: Bool]> {
        return try await request(endpoint: endpoint, method: "DELETE")
    }
}
