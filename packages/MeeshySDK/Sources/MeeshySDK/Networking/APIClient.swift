import Foundation
import Security
import os

// MARK: - Certificate Pinning

private let pinLogger = Logger(subsystem: "me.meeshy.sdk", category: "tls-pinning")

final class CertificatePinningDelegate: NSObject, URLSessionDelegate, Sendable {

    // Log at most once per process lifetime that pinning is unconfigured. A
    // check-then-set race is acceptable here: the worst outcome is two log
    // entries, never a crash. `nonisolated(unsafe)` is required because Swift 6
    // treats mutable static stored properties as data-race-unsafe by default.
    private nonisolated(unsafe) static var didWarnUnconfigured = false

    private let pinSetProvider: @Sendable () -> Set<String>
    private let pinnedHostProvider: @Sendable () -> String

    /// Production initializer — reads pins + host from ``MeeshyConfig``.
    override convenience init() {
        self.init(
            pinSetProvider: { MeeshyConfig.shared.certificatePins },
            pinnedHostProvider: {
                URL(string: MeeshyConfig.shared.apiBaseURL)?.host ?? "gate.meeshy.me"
            }
        )
    }

    /// Designated initializer — exposed so tests can supply deterministic
    /// providers and assert pin-set wiring.
    init(
        pinSetProvider: @escaping @Sendable () -> Set<String>,
        pinnedHostProvider: @escaping @Sendable () -> String
    ) {
        self.pinSetProvider = pinSetProvider
        self.pinnedHostProvider = pinnedHostProvider
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        let pinnedHost = pinnedHostProvider()
        guard let serverTrust = challenge.protectionSpace.serverTrust,
              challenge.protectionSpace.host == pinnedHost else {
            return (.performDefaultHandling, nil)
        }

        let policies = [SecPolicyCreateSSL(true, pinnedHost as CFString)]
        SecTrustSetPolicies(serverTrust, policies as CFArray)

        var error: CFError?
        guard SecTrustEvaluateWithError(serverTrust, &error) else {
            pinLogger.fault("TLS chain rejected for \(pinnedHost, privacy: .public) — system validation failed")
            return (.cancelAuthenticationChallenge, nil)
        }

        let pinSet = pinSetProvider()
        let chain = (SecTrustCopyCertificateChain(serverTrust) as? [SecCertificate]) ?? []
        switch CertificatePinning.evaluate(chain: chain, against: pinSet) {
        case .unconfigured:
            #if !DEBUG
            if !Self.didWarnUnconfigured {
                Self.didWarnUnconfigured = true
                pinLogger.fault("TLS pinning not configured for \(pinnedHost, privacy: .public) — system chain only. Populate MeeshyConfig.certificatePins before production to prevent MITM.")
            }
            #endif
            return (.useCredential, URLCredential(trust: serverTrust))
        case .matched:
            return (.useCredential, URLCredential(trust: serverTrust))
        case .mismatch:
            pinLogger.fault("SPKI pin mismatch for \(pinnedHost, privacy: .public) — refusing to connect (no chain cert matched \(pinSet.count, privacy: .public) pins)")
            return (.cancelAuthenticationChallenge, nil)
        case .chainUnreadable:
            pinLogger.fault("SPKI pin check could not read chain for \(pinnedHost, privacy: .public) — refusing to connect")
            return (.cancelAuthenticationChallenge, nil)
        }
    }
}

// MARK: - API Response Types

public struct APIResponse<T: Decodable>: Decodable {
    public let success: Bool
    public let data: T
    public let error: String?

    enum CodingKeys: String, CodingKey {
        case success, data, error
    }
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
    public let hasMore: Bool?
    public let limit: Int?
}

public struct OffsetPagination: Decodable, Sendable {
    public let total: Int?
    public let hasMore: Bool?
    public let limit: Int?
    public let offset: Int?
}

public struct OffsetPaginatedAPIResponse<T: Decodable>: Decodable {
    public let success: Bool
    public let data: T
    public let pagination: OffsetPagination?
    public let error: String?

    public init(success: Bool, data: T, pagination: OffsetPagination?, error: String?) {
        self.success = success
        self.data = data
        self.pagination = pagination
        self.error = error
    }
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
    /// Wave 1 Task 3.x — variant that lets callers (the offline outbox dispatcher)
    /// inject extra request headers such as `X-Client-Mutation-Id`. Default
    /// implementation falls through to the headerless `request` so existing
    /// mocks/conformers stay binary-compatible without code changes.
    func requestWithHeaders<T: Decodable>(endpoint: String, method: String, body: Data?, queryItems: [URLQueryItem]?, headers: [String: String]?) async throws -> T
    func paginatedRequest<T: Decodable>(endpoint: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[T]>
    func offsetPaginatedRequest<T: Decodable>(endpoint: String, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[T]>
    func post<T: Decodable, U: Encodable>(endpoint: String, body: U) async throws -> APIResponse<T>
    func put<T: Decodable, U: Encodable>(endpoint: String, body: U) async throws -> APIResponse<T>
    func patch<T: Decodable, U: Encodable>(endpoint: String, body: U) async throws -> APIResponse<T>
    func delete(endpoint: String) async throws -> APIResponse<[String: Bool]>
    func delete<T: Decodable, U: Encodable>(endpoint: String, body: U) async throws -> APIResponse<T>
}

extension APIClientProviding {
    /// Default implementation drops `headers` and falls through to the
    /// headerless `request`. Real `APIClient` overrides this to forward
    /// the headers onto the underlying `URLRequest`. Test mocks can
    /// either rely on this default (and skip header verification) or
    /// override locally if they want to assert header presence.
    public func requestWithHeaders<T: Decodable>(
        endpoint: String,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?,
        headers: [String: String]?
    ) async throws -> T {
        try await request(endpoint: endpoint, method: method, body: body, queryItems: queryItems)
    }

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

    // MARK: - 401 Mapping (pure)

    /// How a 401 response on `endpoint` should be surfaced. Extracted as a
    /// pure decision so the credential-vs-session distinction is unit
    /// testable without driving a real `URLSession` — see
    /// `APIClientAuthMappingTests`.
    enum UnauthorizedMapping: Equatable {
        /// Wrong password / 2FA code / stale magic link — NOT a session
        /// problem, so callers must NOT tear down or refresh anything.
        case invalidCredentials(message: String)
        /// A real session-expiry: refresh-token rejected, or a regular
        /// endpoint whose retried-refresh attempt also 401'd.
        case sessionExpired
    }

    /// P1 — a 401 on `/auth/login`, `/auth/login/2fa`, `/auth/register`, or
    /// `/auth/magic-link/*` means "these credentials are wrong", never
    /// "your session expired" (there is no session yet on these endpoints).
    /// `/auth/refresh` is deliberately EXCLUDED: a 401 there means the
    /// refresh token itself is dead, which is genuinely `.sessionExpired`.
    nonisolated static func mapUnauthorized(endpoint: String, serverMessage: String?) -> UnauthorizedMapping {
        let isCredentialEndpoint = endpoint.hasPrefix("/auth/login")
            || endpoint.hasPrefix("/auth/register")
            || endpoint.hasPrefix("/auth/magic-link")
        guard isCredentialEndpoint else { return .sessionExpired }
        return .invalidCredentials(message: serverMessage ?? "Identifiants invalides")
    }

    public var baseURL: String {
        MeeshyConfig.shared.apiBaseURL
    }

    /// Exposed for tests and for the upload pipeline that needs custom delegate hooks.
    /// Uses a custom configuration with `assumesHTTP3Capable = true` (SOTA P11).
    public let urlSession: URLSession

    private var session: URLSession { urlSession }
    private let decoder: JSONDecoder
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "network")

    private nonisolated(unsafe) static let isoFormatterWithFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private nonisolated(unsafe) static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    // Responses are decoded OFF the main thread. APIClient lives in a module built
    // with SE-0461 (NonisolatedNonsendingByDefault), so a nonisolated async request
    // method runs on its caller — typically a @MainActor view model — and the
    // JSONDecoder work would otherwise land on the main thread for every list
    // payload (conversations / messages / feed): a real hitch during loads and
    // pagination. The serial queue + single reused decoder are race-free; the value
    // is smuggled back through an unchecked box so callers keep plain `Decodable`
    // (non-Sendable) response types.
    private static let offMainDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            if let date = APIClient.isoFormatterWithFractional.date(from: dateStr) { return date }
            if let date = APIClient.isoFormatter.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }
        return decoder
    }()
    private static let decodeQueue = DispatchQueue(label: "me.meeshy.api.decode", qos: .userInitiated)
    private struct DecodeBox<V>: @unchecked Sendable { let value: V }

    /// Encapsule TOUTE l'opération de décodage (décodage générique + reprise de la
    /// `continuation`, qui matérialisent le métatype `T.Type` non-`Sendable`) dans
    /// une box `@unchecked Sendable`. `run` est non-`@Sendable` : ses captures ne
    /// sont pas soumises au contrôle de concurrence, et le `decodeQueue.async` ne
    /// capture QUE la box (`Sendable`) en appelant `run()` (Void) — aucun métatype
    /// ne franchit la frontière `@Sendable`.
    private struct DecodeWork: @unchecked Sendable { let run: () -> Void }

    private static func decodeOffMain<T: Decodable>(_ type: T.Type, from data: Data) async throws -> T {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<DecodeBox<T>, Error>) in
            // Tout le décodage générique ET la reprise de la `continuation`
            // (qui matérialisent le métatype `T.Type`, non-`Sendable`) sont
            // enfermés dans `run` — closure non-`@Sendable` stockée dans la box
            // `@unchecked Sendable`. Le `decodeQueue.async` ne capture donc QUE la
            // box et appelle `run()` (Void) : aucun `T.Type` ne franchit la frontière.
            let work = DecodeWork {
                do {
                    continuation.resume(returning: DecodeBox(value: try offMainDecoder.decode(type, from: data)))
                } catch {
                    continuation.resume(throwing: error)
                }
            }
            decodeQueue.async { work.run() }
        }.value
    }

    public var authToken: String?
    public var anonymousSessionToken: String?

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 120
        // HTTP RFC 7234 cache: exploite les ETag/304 renvoyés par le gateway pour
        // éviter les re-fetches inutiles. 10 MB mémoire + 50 MB disque.
        // iter-4: active le cache HTTP — la politique par défaut laisse NSURLCache inactif
        // pour les sessions authentifiées (Authorization header) sans ce paramétrage.
        config.urlCache = URLCache(
            memoryCapacity: 10 * 1_024 * 1_024,
            diskCapacity: 50 * 1_024 * 1_024,
            diskPath: "meeshy_http_cache"
        )
        config.requestCachePolicy = .useProtocolCachePolicy
        // SOTA P11: HTTP/3 is enabled by default on iOS 15+. The optimistic HTTP/3 flag lives on
        // URLRequest (assumesHTTP3Capable), not on URLSessionConfiguration. Apply per-request
        // via makeRequest() to skip the HTTP/2 → HTTP/3 upgrade negotiation on first upload.
        self.urlSession = URLSession(
            configuration: config,
            delegate: CertificatePinningDelegate(),
            delegateQueue: nil
        )

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            if let date = Self.isoFormatterWithFractional.date(from: dateStr) { return date }
            if let date = Self.isoFormatter.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }
    }

    /// T15b — purge le cache HTTP de la session (bodies ETag/304 des réponses
    /// REST). Appelé au logout : aucun payload d'un compte ne doit survivre
    /// sur disque à travers les sessions (même contrat que
    /// `CacheCoordinator.reset` / `clearAllMessagesForLogout`).
    public func clearHTTPCache() {
        urlSession.configuration.urlCache?.removeAllCachedResponses()
    }

    // MARK: - Retry Helper

    private static let maxRetryAttempts = 3
    private static let retryableStatusCodes: Set<Int> = [429, 503]

    private func retryDelay(statusCode: Int, attempt: Int, response: HTTPURLResponse) -> TimeInterval? {
        guard Self.retryableStatusCodes.contains(statusCode), attempt < Self.maxRetryAttempts else { return nil }
        if let retryAfter = response.value(forHTTPHeaderField: "Retry-After"),
           let seconds = Double(retryAfter) {
            return min(seconds, 30)
        }
        return Double(1 << attempt)
    }

    // MARK: - Generic Request

    public func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil,
        queryItems: [URLQueryItem]? = nil
    ) async throws -> T {
        try await requestWithHeaders(
            endpoint: endpoint,
            method: method,
            body: body,
            queryItems: queryItems,
            headers: nil
        )
    }

    /// Header-aware variant — see `APIClientProviding.requestWithHeaders`.
    /// Used by the offline outbox dispatcher to inject `X-Client-Mutation-Id`
    /// so the gateway `MutationLog` can dedup replayed mutations. Caller-
    /// provided headers OVERRIDE auth/content-type headers if the keys collide,
    /// so the dispatcher should not set `Authorization` or `Content-Type`.
    public func requestWithHeaders<T: Decodable>(
        endpoint: String,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?,
        headers: [String: String]?
    ) async throws -> T {
        var hasRefreshedOn401 = false
        guard var components = URLComponents(string: "\(baseURL)\(endpoint)") else {
            throw MeeshyError.server(statusCode: 0, message: "URL invalide")
        }

        if let queryItems, !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        // We declare isRefreshOrAuth and shouldAttemptRefresh here because they are needed for both proactive and reactive refresh
        let isRefreshOrAuth = endpoint == "/auth/refresh" || endpoint.hasPrefix("/auth/login") || endpoint.hasPrefix("/auth/register") || endpoint.hasPrefix("/auth/magic-link")
        let shouldAttemptRefresh = !isRefreshOrAuth

        guard let url = components.url else {
            throw MeeshyError.server(statusCode: 0, message: "URL invalide")
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method
        // SOTA P11: skip HTTP/2 → HTTP/3 upgrade discovery on the first request to this host.
        // Saves ~150-300ms on the user's first upload after app launch.
        urlRequest.assumesHTTP3Capable = true

        // Compression (E1, bandwidth sprint): deliberately NO explicit
        // `Accept-Encoding` header. URLSession advertises gzip/br on its own
        // and transparently decompresses the response; setting the header by
        // hand flips URLSession into manual-decompression mode (Foundation
        // can't decode brotli natively), so the gateway's @fastify/compress
        // output would arrive still-compressed and fail to decode. The gateway
        // honours the automatic header, so JSON is already compressed on the
        // wire. Never add `Accept-Encoding` here, in ClientInfoProvider, or in
        // per-request `headers`.

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

        if let token = authToken, shouldAttemptRefresh && AuthManager.isTokenExpired(token, now: Date()) {
            do {
                let freshToken = try await AuthManager.shared.refreshSession()
                urlRequest.setValue("Bearer \(freshToken)", forHTTPHeaderField: "Authorization")
            } catch {
                throw MeeshyError.auth(.sessionExpired)
            }
        }

        if let body {
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            urlRequest.httpBody = body
        }

        // Caller-provided headers are applied last so they win over defaults
        // (relevant for `X-Client-Mutation-Id` which has no built-in setter).
        if let headers {
            for (key, value) in headers {
                urlRequest.setValue(value, forHTTPHeaderField: key)
            }
        }

        do {
            var lastHTTPResponse: HTTPURLResponse?
            var lastStatusCode = 0
            // Signal Protocol endpoints answer 503 for a permanent "Signal
            // Protocol not available" state, never a transient overload —
            // retrying just burns the 2 s + 4 s back-off and can never
            // succeed. Opt them out of the retry loop so the caller fails
            // fast and falls back (e.g. a plaintext message send).
            let endpointAllowsRetry = !endpoint.hasPrefix("/signal/")

            for attempt in 0..<(Self.maxRetryAttempts + 1) {
                if attempt > 0 {
                    guard let previousResponse = lastHTTPResponse,
                          let delay = retryDelay(statusCode: lastStatusCode, attempt: attempt, response: previousResponse) else {
                        break
                    }
                    logger.warning("Retryable status \(lastStatusCode) on \(method) \(endpoint), retry \(attempt)/\(Self.maxRetryAttempts) after \(String(format: "%.1f", delay))s")
                    try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                    guard !Task.isCancelled else { throw CancellationError() }
                }

                let networkStart = CFAbsoluteTimeGetCurrent()
                let (data, response) = try await session.data(for: urlRequest)
                let networkMs = (CFAbsoluteTimeGetCurrent() - networkStart) * 1000

                guard let httpResponse = response as? HTTPURLResponse else {
                    throw MeeshyError.server(statusCode: 0, message: "Aucune donnee recue")
                }

                let statusCode = httpResponse.statusCode
                lastHTTPResponse = httpResponse
                lastStatusCode = statusCode

                if endpointAllowsRetry && Self.retryableStatusCodes.contains(statusCode) && attempt < Self.maxRetryAttempts {
                    continue
                }

                let decodeStart = CFAbsoluteTimeGetCurrent()

                guard (200...299).contains(statusCode) else {
                    let errBody = try? decoder.decode(ErrorBody.self, from: data)
                    let errorMsg = errBody?.message ?? errBody?.error

                    if statusCode == 401 {
                        if case .invalidCredentials(let message) = Self.mapUnauthorized(endpoint: endpoint, serverMessage: errorMsg) {
                            // P1 — wrong password / 2FA code / stale magic
                            // link. There is no active session here, so we
                            // must NOT call `handleUnauthorized()` (which
                            // would kick off a pointless background refresh
                            // of a DIFFERENT, still-valid session if one
                            // exists) and must NOT show "Session expirée".
                            throw MeeshyError.auth(.invalidCredentialsWithMessage(message))
                        }
                        if shouldAttemptRefresh && !hasRefreshedOn401 {
                            hasRefreshedOn401 = true
                            do {
                                let freshToken = try await AuthManager.shared.refreshSession(force: true)
                                urlRequest.setValue("Bearer \(freshToken)", forHTTPHeaderField: "Authorization")
                                let (retryData, retryResponse) = try await session.data(for: urlRequest)
                                guard let retryHTTPResponse = retryResponse as? HTTPURLResponse else {
                                    throw MeeshyError.server(statusCode: 0, message: "Aucune donnee recue")
                                }
                                let retryStatusCode = retryHTTPResponse.statusCode
                                if (200...299).contains(retryStatusCode) {
                                    let result = try await Self.decodeOffMain(T.self, from: retryData)
                                    return result
                                } else {
                                    if retryStatusCode == 401 {
                                        await AuthManager.shared.handleUnauthorized()
                                        throw MeeshyError.auth(.sessionExpired)
                                    }
                                    let retryErrBody = try? decoder.decode(ErrorBody.self, from: retryData)
                                    let retryErrorMsg = retryErrBody?.message ?? retryErrBody?.error
                                    throw MeeshyError.server(statusCode: retryStatusCode, message: retryErrorMsg ?? "Erreur après rafraichissement")
                                }
                            } catch {
                                await AuthManager.shared.handleUnauthorized()
                                throw MeeshyError.auth(.sessionExpired)
                            }
                        } else {
                            await AuthManager.shared.handleUnauthorized()
                            throw MeeshyError.auth(.sessionExpired)
                        }
                    }

                    if statusCode == 403 {
                        // Resource-level forbidden. NOT an auth/session
                        // problem (the JWT is valid) — surfaced as a
                        // distinct case so AuthManager doesn't treat it
                        // as a logout signal. Callers handle access loss
                        // per-feature (e.g. purge a stale conversation
                        // and dismiss its view).
                        // The raw body is forwarded so callers that need
                        // structured 403 payloads (e.g. consent-required
                        // errors) can decode them without a second request.
                        throw MeeshyError.forbidden(reason: errorMsg, body: data)
                    }

                    if statusCode == 429 {
                        throw MeeshyError.server(statusCode: 429, message: "Trop de requetes")
                    }

                    if statusCode >= 500 {
                        throw MeeshyError.server(statusCode: statusCode, message: errorMsg ?? "Erreur serveur")
                    }

                    throw MeeshyError.server(statusCode: statusCode, message: errorMsg ?? "Erreur inconnue")
                }

                let result = try await Self.decodeOffMain(T.self, from: data)
                let decodeMs = (CFAbsoluteTimeGetCurrent() - decodeStart) * 1000
                let totalMs = networkMs + decodeMs
                if totalMs > 1000 {
                    // Append the query string so a "slow request" line is
                    // enough to disambiguate `/conversations?offset=0` from
                    // `/conversations?updatedSince=...` from `/conversations?before=...`.
                    // Without it, a runaway pagination loop is invisible —
                    // every line looks like the same endpoint.
                    let qs = url.query.map { "?\($0)" } ?? ""
                    logger.warning("Slow request: \(method) \(endpoint)\(qs) → \(statusCode) network=\(Int(networkMs))ms decode=\(Int(decodeMs))ms total=\(Int(totalMs))ms size=\(data.count)B")
                }
                return result
            }

            throw MeeshyError.server(statusCode: lastStatusCode, message: "Requete echouee apres \(Self.maxRetryAttempts) tentatives (status \(lastStatusCode))")
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
            // Endpoint + method are logged so a `DecodingError` line is
            // self-sufficient to locate the failing call — without it a
            // `data.message` mismatch could be any of a dozen requests.
            logger.error("DecodingError on \(method, privacy: .public) \(endpoint, privacy: .public): \(debugInfo)")
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

#if DEBUG
extension APIClient {
    /// Test seam — reproduces the header pipeline used by `request(...)` so
    /// suites can assert that `X-Device-Locale` (and any other `ClientInfo`
    /// header) is present on every outgoing request, without actually
    /// hitting the network.
    ///
    /// Internal-only on purpose: production code MUST go through
    /// `request(...)` to benefit from retry / auth refresh / error mapping.
    public func _buildURLRequestForTesting(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil,
        headers: [String: String]? = nil,
        authToken: String? = nil
    ) async throws -> URLRequest {
        guard let url = URL(string: "https://example.test\(endpoint)") else {
            throw MeeshyError.server(statusCode: 0, message: "URL invalide")
        }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method

        let clientHeaders = await ClientInfoProvider.shared.buildHeaders()
        for (key, value) in clientHeaders {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }

        if let authToken {
            urlRequest.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            urlRequest.httpBody = body
        }
        headers?.forEach { urlRequest.setValue($1, forHTTPHeaderField: $0) }
        return urlRequest
    }
}
#endif
