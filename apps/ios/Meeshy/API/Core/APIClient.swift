//
//  APIClient.swift
//  Meeshy
//
//  Complete API Client with type-safety, retry logic, and authentication
//  Uses pure Swift concurrency (async/await) - no Combine mixing
//

import Foundation
import SwiftUI
import os.log

// MARK: - API Configuration

struct APIConfiguration {
    static let shared = APIConfiguration()

    // Request configuration
    static let timeoutInterval: TimeInterval = 15 // seconds
    static let maxRetryAttempts = 2
    static let retryDelay: TimeInterval = 0.5 // seconds

    // Synchronous access to base URL - now thread-safe
    var currentBaseURL: String {
        EnvironmentConfig.shared.activeURL
    }

    // Async access to base URL - for async contexts
    func getCurrentBaseURL() async -> String {
        EnvironmentConfig.shared.activeURL
    }
}


// MARK: - HTTP Method

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
    case patch = "PATCH"
}

// MARK: - API Endpoint Protocol

protocol APIEndpoint: Sendable {
    var path: String { get }
    var method: HTTPMethod { get }
    var headers: [String: String]? { get }
    var queryParameters: [String: Any]? { get }
    var body: Encodable? { get }
    var requiresAuth: Bool { get }
}

extension APIEndpoint {
    var headers: [String: String]? { nil }
    var queryParameters: [String: Any]? { nil }
    var body: Encodable? { nil }
    var requiresAuth: Bool { true }
}

// MARK: - API Response

struct APIResponse<T: Decodable>: Decodable, @unchecked Sendable {
    let data: T?
    let statusCode: Int
    let headers: [AnyHashable: Any]
    let success: Bool?

    enum CodingKeys: String, CodingKey {
        case data
        case success
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.data = try container.decodeIfPresent(T.self, forKey: .data)
        self.success = try container.decodeIfPresent(Bool.self, forKey: .success)
        self.statusCode = 200 // Default status code for successful decoding
        self.headers = [:] // Headers not available during decoding
    }

    init(data: T, statusCode: Int, headers: [AnyHashable: Any]) {
        self.data = data
        self.statusCode = statusCode
        self.headers = headers
        self.success = true
    }
}

// MARK: - API Client

actor APIClient {

    // MARK: - Singleton

    static let shared = APIClient()

    // MARK: - Properties

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    // Dependencies
    private let authManager: AuthenticationManager

    // Logger
    private let logger = apiLogger

    // MARK: - Initialization

    private init() {
        // Configure URLSession
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = APIConfiguration.timeoutInterval
        configuration.timeoutIntervalForResource = APIConfiguration.timeoutInterval * 2
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        // Note: Content-Type is set per-request based on whether body is present
        // to avoid "Body cannot be empty when content-type is set to 'application/json'" errors
        configuration.httpAdditionalHeaders = [
            "Accept": "application/json",
            "User-Agent": "Meeshy-iOS/\(Bundle.main.appVersion)"
        ]

        self.session = URLSession(configuration: configuration)

        // Configure JSON decoder
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601WithFractionalSeconds
        self.decoder.keyDecodingStrategy = .convertFromSnakeCase

        // Configure JSON encoder
        // Note: Backend expects camelCase keys, NOT snake_case
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601WithFractionalSeconds
        // Don't convert to snake_case - backend expects camelCase (messageId, not message_id)

        // Initialize dependencies
        self.authManager = AuthenticationManager.shared
    }

    // MARK: - Network Monitor Access

    /// Access NetworkMonitor safely from MainActor
    private func isNetworkConnected() async -> Bool {
        await MainActor.run {
            NetworkMonitor.shared.isConnected
        }
    }

    // MARK: - Public API

    /// Execute API request with automatic retry and error handling
    func request<T: Decodable>(
        _ endpoint: APIEndpoint,
        retryCount: Int = 0
    ) async throws -> APIResponse<T> {

        // Check network connectivity for non-idempotent requests
        if await !NetworkMonitor.shared.isConnected && endpoint.method != .get {
            logger.warn("⚠️ No network connection available")
            throw MeeshyError.network(.noConnection)
        }

        // Build request
        guard let request = await buildRequest(endpoint) else {
            logger.error("❌ Failed to build request for endpoint: \(endpoint.path)")
            throw MeeshyError.network(.invalidRequest)
        }

        // Log the complete URL being requested
        if let url = request.url {
            logger.info("📡 [\(endpoint.method.rawValue)] → \(url.absoluteString)")
            if retryCount > 0 {
                logger.info("🔄 Retry attempt \(retryCount)/\(APIConfiguration.maxRetryAttempts)")
            }
        }

        // Execute request
        do {
            return try await executeRequest(request, endpoint: endpoint)
        } catch {
            // Handle retry logic
            let meeshyError = mapError(error, endpoint: endpoint)

            if shouldRetry(error: meeshyError, retryCount: retryCount) {
                let backoff = calculateBackoff(retryCount: retryCount)
                logger.info("🔄 Retrying request to \(request.url?.absoluteString ?? endpoint.path) after \(backoff)s (attempt \(retryCount + 1)/\(APIConfiguration.maxRetryAttempts))")

                try await Task.sleep(nanoseconds: UInt64(backoff * 1_000_000_000))
                return try await self.request(endpoint, retryCount: retryCount + 1)
            }

            logger.error("❌ Request failed for \(request.url?.absoluteString ?? endpoint.path): \(meeshyError)")
            throw meeshyError
        }
    }

    /// Execute API request for paginated endpoints
    /// API format: {"success": true, "data": [...], "pagination": {...}}
    func requestPaginated<T: Decodable>(
        _ endpoint: APIEndpoint,
        retryCount: Int = 0
    ) async throws -> PaginatedAPIResponse<T> {

        // Check network connectivity for non-idempotent requests
        if await !NetworkMonitor.shared.isConnected && endpoint.method != .get {
            logger.warn("⚠️ No network connection available")
            throw MeeshyError.network(.noConnection)
        }

        // Build request
        guard let request = await buildRequest(endpoint) else {
            logger.error("❌ Failed to build request for endpoint: \(endpoint.path)")
            throw MeeshyError.network(.invalidRequest)
        }

        // Log the complete URL being requested
        if let url = request.url {
            logger.info("📡 [\(endpoint.method.rawValue)] → \(url.absoluteString)")
        }

        // Execute request
        do {
            return try await executePaginatedRequest(request, endpoint: endpoint)
        } catch {
            let meeshyError = mapError(error, endpoint: endpoint)

            if shouldRetry(error: meeshyError, retryCount: retryCount) {
                let backoff = calculateBackoff(retryCount: retryCount)
                logger.info("🔄 Retrying paginated request after \(backoff)s")
                try await Task.sleep(nanoseconds: UInt64(backoff * 1_000_000_000))
                return try await self.requestPaginated(endpoint, retryCount: retryCount + 1)
            }

            logger.error("❌ Paginated request failed: \(meeshyError)")
            throw meeshyError
        }
    }

    private func executePaginatedRequest<T: Decodable>(
        _ request: URLRequest,
        endpoint: APIEndpoint
    ) async throws -> PaginatedAPIResponse<T> {
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw MeeshyError.network(.invalidResponse)
        }

        logger.info("⬇️ Response: \(httpResponse.statusCode) from \(request.url?.absoluteString ?? "?") (\(data.count) bytes)")

        // Handle HTTP errors
        try handleHTTPResponse(httpResponse, data: data, endpoint: endpoint)

        // Decode paginated response
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .custom { decoder in
                let container = try decoder.singleValueContainer()
                let dateString = try container.decode(String.self)

                // Try ISO8601 with fractional seconds
                let iso8601Formatter = ISO8601DateFormatter()
                iso8601Formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let date = iso8601Formatter.date(from: dateString) {
                    return date
                }

                // Try without fractional seconds
                iso8601Formatter.formatOptions = [.withInternetDateTime]
                if let date = iso8601Formatter.date(from: dateString) {
                    return date
                }

                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateString)")
            }
            let paginatedResponse = try decoder.decode(PaginatedAPIResponse<T>.self, from: data)
            return paginatedResponse
        } catch {
            logger.error("❌ Paginated decoding failed: \(error.localizedDescription)")
            if let decodingError = error as? DecodingError {
                switch decodingError {
                case .keyNotFound(let key, let context):
                    logger.error("❌ Key not found: '\(key.stringValue)' at \(context.codingPath.map { $0.stringValue }.joined(separator: "."))")
                case .typeMismatch(let type, let context):
                    logger.error("❌ Type mismatch for \(type) at \(context.codingPath): \(context.debugDescription)")
                case .valueNotFound(let type, let context):
                    logger.error("❌ Value not found for \(type) at \(context.codingPath)")
                case .dataCorrupted(let context):
                    logger.error("❌ Data corrupted: \(context.debugDescription)")
                @unknown default:
                    logger.error("❌ Unknown decoding error")
                }
            }
            throw MeeshyError.network(.decodingFailed)
        }
    }

    private func executeRequest<T: Decodable>(
        _ request: URLRequest,
        endpoint: APIEndpoint
    ) async throws -> APIResponse<T> {

        let urlString = request.url?.absoluteString ?? "unknown"
        let method = request.httpMethod ?? "?"
        
        // Log request execution
        logger.info("⬆️ Executing request: \(method) \(urlString)")
        
        // Log auth status (without exposing token)
        if request.value(forHTTPHeaderField: "Authorization") != nil {
            logger.info("🔑 Authorization: [PRESENT]")
        }

        // Execute request
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            logger.error("❌ Invalid HTTP response from \(urlString)")
            throw MeeshyError.network(.invalidResponse)
        }

        let statusCode = httpResponse.statusCode
        let dataSize = data.count
        
        // Log response status
        logger.info("⬇️ Response: \(statusCode) from \(urlString) (\(dataSize) bytes)")

        // Handle HTTP status codes
        try handleHTTPResponse(httpResponse, data: data, endpoint: endpoint)

        // Log successful response data (truncated if too long)
        if let responseString = String(data: data, encoding: .utf8) {
            let truncated = responseString.count > 500 ? String(responseString.prefix(500)) + "..." : responseString
            logger.info("✅ [\(statusCode)] Success: \(truncated)")
        }

        // Decode response
        do {
            let decoded = try decoder.decode(APIResponse<T>.self, from: data)

            // Ensure we have data or throw an error
            guard let responseData = decoded.data else {
                logger.error("❌ No data in response from \(urlString)")
                throw MeeshyError.network(.decodingFailed)
            }

            logger.info("✅ Successfully decoded response from \(urlString)")
            return APIResponse(
                data: responseData,
                statusCode: httpResponse.statusCode,
                headers: httpResponse.allHeaderFields
            )
        } catch {
            logger.error("❌ Decoding failed for \(urlString): \(error.localizedDescription)")
            if let decodingError = error as? DecodingError {
                switch decodingError {
                case .keyNotFound(let key, let context):
                    logger.error("❌ Key '\(key.stringValue)' not found at \(context.codingPath): \(context.debugDescription)")
                case .typeMismatch(let type, let context):
                    logger.error("❌ Type mismatch for \(type) at \(context.codingPath): \(context.debugDescription)")
                case .valueNotFound(let type, let context):
                    logger.error("❌ Value not found for \(type) at \(context.codingPath): \(context.debugDescription)")
                case .dataCorrupted(let context):
                    logger.error("❌ Data corrupted at \(context.codingPath): \(context.debugDescription)")
                @unknown default:
                    logger.error("❌ Unknown decoding error")
                }
            }
            throw error
        }
    }

    /// Upload file with progress tracking
    func upload<T: Decodable>(
        _ endpoint: APIEndpoint,
        fileData: Data,
        mimeType: String,
        fileName: String
    ) async throws -> APIResponse<T> {

        guard let request = await buildMultipartRequest(
            endpoint,
            fileData: fileData,
            mimeType: mimeType,
            fileName: fileName
        ) else {
            throw MeeshyError.network(.invalidRequest)
        }

        // Use native async URLSession API
        let (data, response) = try await session.upload(for: request, from: fileData)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw MeeshyError.network(.invalidResponse)
        }

        try handleHTTPResponse(httpResponse, data: data, endpoint: endpoint)

        let decoded = try decoder.decode(T.self, from: data)
        let apiResponse = APIResponse(
            data: decoded,
            statusCode: httpResponse.statusCode,
            headers: httpResponse.allHeaderFields
        )

        return apiResponse
    }

    /// Download file with progress tracking
    func download(
        _ endpoint: APIEndpoint
    ) async throws -> URL {

        guard let request = await buildRequest(endpoint) else {
            throw MeeshyError.network(.invalidRequest)
        }

        // Use native async URLSession API
        let (tempURL, response) = try await session.download(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw MeeshyError.network(.invalidResponse)
        }

        try handleHTTPResponse(httpResponse, data: Data(), endpoint: endpoint)

        // Move file to permanent location
        let destinationURL = FileManager.default
            .temporaryDirectory
            .appendingPathComponent(UUID().uuidString)

        try FileManager.default.moveItem(at: tempURL, to: destinationURL)

        return destinationURL
    }

    // MARK: - Private Methods

    private func buildRequest(_ endpoint: APIEndpoint) async -> URLRequest? {
        // Build URL
        let baseURL = await APIConfiguration.shared.getCurrentBaseURL()
        let fullPath = baseURL + endpoint.path

        logger.info("🔧 Building request - Base URL: \(baseURL), Path: \(endpoint.path)")

        guard var urlComponents = URLComponents(string: fullPath) else {
            logger.error("❌ Failed to build URL components for: \(fullPath)")
            return nil
        }

        // Add query parameters
        if let queryParameters = endpoint.queryParameters {
            urlComponents.queryItems = queryParameters.map { key, value in
                URLQueryItem(name: key, value: "\(value)")
            }
            logger.info("🔧 Added \(queryParameters.count) query parameter(s)")
        }

        guard let url = urlComponents.url else {
            logger.error("❌ Failed to create URL from components")
            return nil
        }

        logger.info("🔧 Complete URL: \(url.absoluteString)")

        // Create request with timeout
        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.timeoutInterval = APIConfiguration.timeoutInterval

        // Add headers
        if let headers = endpoint.headers {
            headers.forEach { key, value in
                request.setValue(value, forHTTPHeaderField: key)
            }
            logger.info("🔧 Added \(headers.count) custom header(s)")
        }

        // Add authentication header
        if endpoint.requiresAuth {
            if let token = authManager.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                logger.info("🔑 Added Authorization header")
            } else {
                logger.warn("⚠️ Endpoint requires auth but no token available for: \(url.absoluteString)")
            }
        }

        // Add body and Content-Type header (only when body is present)
        if let body = endpoint.body {
            do {
                request.httpBody = try encoder.encode(AnyEncodable(body))
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                if let bodyString = String(data: request.httpBody!, encoding: .utf8) {
                    let truncated = bodyString.count > 200 ? String(bodyString.prefix(200)) + "..." : bodyString
                    logger.info("📦 Request body: \(truncated)")
                }
            } catch {
                logger.error("❌ Failed to encode body: \(error.localizedDescription)")
                return nil
            }
        }

        return request
    }

    private func buildMultipartRequest(
        _ endpoint: APIEndpoint,
        fileData: Data,
        mimeType: String,
        fileName: String
    ) async -> URLRequest? {

        let baseURL = await APIConfiguration.shared.getCurrentBaseURL()
        guard let url = URL(string: baseURL + endpoint.path) else {
            return nil
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 600  // 10 minutes timeout for large uploads (like webapp)

        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        // Add authentication header
        if endpoint.requiresAuth, let token = authManager.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Build multipart body - webapp format
        var body = Data()

        // Add file data with field name "files" (webapp format, not "file")
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"files\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n".data(using: .utf8)!)

        // Add metadata_0 if endpoint is AttachmentEndpoints.upload (webapp format)
        if let attachmentEndpoint = endpoint as? AttachmentEndpoints,
           let metadata = attachmentEndpoint.uploadMetadata {
            do {
                let metadataJSON = try JSONEncoder().encode(metadata)
                if let metadataString = String(data: metadataJSON, encoding: .utf8) {
                    body.append("--\(boundary)\r\n".data(using: .utf8)!)
                    body.append("Content-Disposition: form-data; name=\"metadata_0\"\r\n\r\n".data(using: .utf8)!)
                    body.append("\(metadataString)\r\n".data(using: .utf8)!)
                }
            } catch {
                logger.error("Failed to encode metadata_0: \(error)")
            }
        } else if let bodyData = endpoint.body {
            // Fallback: Add additional fields from body for other endpoints
            do {
                let jsonData = try encoder.encode(AnyEncodable(bodyData))
                if let jsonObject = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any] {
                    for (key, value) in jsonObject {
                        body.append("--\(boundary)\r\n".data(using: .utf8)!)
                        body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
                        body.append("\(value)\r\n".data(using: .utf8)!)
                    }
                }
            } catch {
                logger.error("Failed to encode multipart body: \(error)")
            }
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body
        return request
    }

    private func handleHTTPResponse(_ response: HTTPURLResponse, data: Data, endpoint: APIEndpoint) throws {
        let url = response.url?.absoluteString ?? endpoint.path
        
        if !(200...299).contains(response.statusCode) {
            logger.error("❌ HTTP Error \(response.statusCode) for \(url)")
            if let responseString = String(data: data, encoding: .utf8) {
                let truncated = responseString.count > 300 ? String(responseString.prefix(300)) + "..." : responseString
                logger.error("❌ Error response body: \(truncated)")
            }
        }

        switch response.statusCode {
        case 200...299:
            // Success
            logger.info("✅ HTTP \(response.statusCode) - Success for \(url)")
            break

        case 401:
            // Unauthorized - try to refresh token
            logger.error("🔐 HTTP 401 - Unauthorized for \(url)")
            if endpoint.path != "/api/auth/refresh" {
                authManager.handleUnauthorized()
            }
            throw MeeshyError.auth(.tokenExpired)

        case 403:
            logger.error("🚫 HTTP 403 - Forbidden for \(url)")
            throw MeeshyError.auth(.unauthorized)

        case 400:
            logger.error("⚠️ HTTP 400 - Bad Request for \(url)")
            // Try to parse validation error
            if let errorResponse = try? decoder.decode(ErrorResponse.self, from: data) {
                throw MeeshyError.validation(.custom(errorResponse.message))
            }
            // Also try to parse generic error format { "success": false, "error": "..." }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let errorMessage = json["error"] as? String {
                throw MeeshyError.validation(.custom(errorMessage))
            }
            throw MeeshyError.validation(.invalidInput)

        case 404:
            logger.error("🔍 HTTP 404 - Not Found for \(url)")
            throw MeeshyError.network(.notFound)

        case 429:
            logger.error("🐌 HTTP 429 - Rate Limited for \(url)")
            throw MeeshyError.network(.rateLimited)

        case 500...599:
            logger.error("💥 HTTP \(response.statusCode) - Server Error for \(url)")
            throw MeeshyError.network(.serverError(response.statusCode))

        default:
            logger.error("❓ HTTP \(response.statusCode) - Unknown status for \(url)")
            throw MeeshyError.network(.unknown)
        }
    }

    private func mapError(_ error: Error, endpoint: APIEndpoint) -> MeeshyError {
        if let meeshyError = error as? MeeshyError {
            return meeshyError
        }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost:
                return MeeshyError.network(.noConnection)
            case .timedOut:
                return MeeshyError.network(.timeout)
            case .cancelled:
                return MeeshyError.network(.cancelled)
            default:
                return MeeshyError.network(.unknown)
            }
        }

        if error is DecodingError {
            return MeeshyError.network(.decodingFailed)
        }

        return MeeshyError.network(.unknown)
    }

    private func shouldRetry(error: MeeshyError, retryCount: Int) -> Bool {
        guard retryCount < APIConfiguration.maxRetryAttempts else {
            return false
        }

        switch error {
        case .network(.timeout), .network(.noConnection), .network(.serverError), .network(.cancelled):
            // Retry on transient errors including cancelled requests
            // Cancelled can happen during view transitions or duplicate request coalescing
            return true
        default:
            return false
        }
    }

    private func calculateBackoff(retryCount: Int) -> Double {
        // Exponential backoff: 1s, 2s, 4s, 8s...
        return APIConfiguration.retryDelay * pow(2.0, Double(retryCount))
    }
}

// MARK: - Helper Types

struct AnyEncodable: Encodable {
    private let encodable: Encodable

    init(_ encodable: Encodable) {
        self.encodable = encodable
    }

    func encode(to encoder: Encoder) throws {
        try encodable.encode(to: encoder)
    }
}

struct ErrorResponse: Decodable {
    let message: String
    let code: String?
    let details: [String: String]?
}

// MARK: - Bundle Extension

extension Bundle {
    var appVersion: String {
        return infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }
}

