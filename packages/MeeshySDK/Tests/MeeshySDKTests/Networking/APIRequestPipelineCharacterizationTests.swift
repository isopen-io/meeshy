import XCTest
@testable import MeeshySDK

/// Le filet du pipeline de `APIClient` : ce qui part sur le fil, combien de fois,
/// et ce que l'appelant reçoit. Écrits VERTS avant la décomposition de
/// `performRequestWithHeaders` (LOT-15), ils doivent le rester à chaque incrément.
@MainActor
final class APIRequestPipelineCharacterizationTests: XCTestCase {

    private struct Pong: Decodable { let ok: Bool }

    private var originalAuthService: AuthServiceProviding!
    private var originalKeychain: (any KeychainStoring)!
    private var originalUser: MeeshyUser?
    private var originalIsAuthenticated = false
    private var originalAuthToken: String?
    private var authService: PipelineAuthService!

    override func setUp() async throws {
        try await super.setUp()
        PipelineStubProtocol.reset()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        originalAuthService = AuthManager.shared.authService
        authService = PipelineAuthService()
        AuthManager.shared.authService = authService
        originalUser = AuthManager.shared.currentUser
        originalIsAuthenticated = AuthManager.shared.isAuthenticated
        originalAuthToken = APIClient.shared.authToken
        originalKeychain = AuthManager.shared.keychain
        AuthManager.shared.keychain = PipelineKeychainStore()
        AuthManager.shared.isAuthenticated = false
    }

    override func tearDown() async throws {
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        AuthManager.shared.activeSessionExits = 0
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        AuthManager.shared.currentUser = originalUser
        AuthManager.shared.isAuthenticated = originalIsAuthenticated
        APIClient.shared.authToken = originalAuthToken
        PipelineStubProtocol.reset()
        try await super.tearDown()
    }

    // MARK: - Aides

    private static func jwt(_ userId: String, _ tag: String) -> String {
        let payload = Data(#"{"userId":"\#(userId)","exp":4102444800,"t":"\#(tag)"}"#.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "=", with: "")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
        return "eyJhbGciOiJIUzI1NiJ9.\(payload).sig"
    }

    private static let tokenOne = jwt("user-pipeline", "one")
    private static let tokenTwo = jwt("user-pipeline", "two")

    private func makeUser() -> MeeshyUser {
        MeeshyUser(
            id: "user-pipeline", username: "pipeline", email: "pipeline@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
    }

    private func makeClient(token: String? = nil) -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [PipelineStubProtocol.self]
        let client = APIClient(urlSession: URLSession(configuration: config))
        client.authToken = token
        return client
    }

    private static let okBody = #"{"ok":true}"#

    private func serverMessage(of error: Error) -> (status: Int, message: String)? {
        guard case MeeshyError.server(let status, let message) = error else { return nil }
        return (status, message)
    }

    // MARK: - (a) Ce qui part sur le fil

    func test_request_emitsExactURLMethodBodyAndHeaders() async throws {
        let client = makeClient(token: Self.tokenOne)
        PipelineStubProtocol.script = [.http(200, [:], Self.okBody)]

        let _: Pong = try await client.stringRequest(
            endpoint: "/conversations", method: "POST", body: Data(#"{"x":1}"#.utf8),
            queryItems: [URLQueryItem(name: "a", value: "1")],
            headers: ["X-Client-Mutation-Id": "m-1"]
        )

        let sent = PipelineStubProtocol.requests
        XCTAssertEqual(sent.count, 1)
        let request = try XCTUnwrap(sent.first)
        XCTAssertEqual(request.url, "\(client.baseURL)/conversations?a=1")
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.body, Data(#"{"x":1}"#.utf8))
        XCTAssertEqual(request.headers["Content-Type"], "application/json")
        XCTAssertEqual(request.headers["Authorization"], "Bearer \(Self.tokenOne)")
        XCTAssertEqual(request.headers["X-Client-Mutation-Id"], "m-1")
        let clientInfo = await ClientInfoProvider.shared.buildHeaders()
        XCTAssertFalse(clientInfo.isEmpty)
        for (key, value) in clientInfo {
            XCTAssertEqual(request.headers[key], value, "l'en-tête d'identité \(key) doit partir tel quel")
        }
    }

    func test_request_callerHeadersOverrideAuthorizationAndContentType() async throws {
        let client = makeClient(token: Self.tokenOne)
        PipelineStubProtocol.script = [.http(200, [:], Self.okBody)]

        let _: Pong = try await client.stringRequest(
            endpoint: "/conversations", method: "POST", body: Data("hello".utf8),
            headers: ["Authorization": "Bearer caller", "Content-Type": "text/plain"]
        )

        let request = try XCTUnwrap(PipelineStubProtocol.requests.first)
        XCTAssertEqual(request.headers["Authorization"], "Bearer caller")
        XCTAssertEqual(request.headers["Content-Type"], "text/plain")
    }

    // MARK: - (b) (c) Les tentatives

    func test_request_threeConsecutive503_sendsExactlyThreeRequests_thenGivesUp() async throws {
        let client = makeClient()
        PipelineStubProtocol.script = Array(repeating: .http(503, ["Retry-After": "0"], "{}"), count: 6)

        do {
            let _: Pong = try await client.stringRequest(endpoint: "/conversations")
            XCTFail("trois 503 de suite doivent lever")
        } catch {
            let verdict = serverMessage(of: error)
            XCTAssertEqual(verdict?.status, 503)
            XCTAssertEqual(verdict?.message, "Requete echouee apres 3 tentatives (status 503)")
        }
        XCTAssertEqual(PipelineStubProtocol.requests.count, 3)
    }

    func test_request_503ThenOK_retriesOnceAndDecodes() async throws {
        let client = makeClient()
        PipelineStubProtocol.script = [.http(503, ["Retry-After": "0"], "{}"), .http(200, [:], Self.okBody)]

        let pong: Pong = try await client.stringRequest(endpoint: "/conversations")

        XCTAssertTrue(pong.ok)
        XCTAssertEqual(PipelineStubProtocol.requests.count, 2)
    }

    // MARK: - (d) La limite quotidienne ne se rejoue pas

    func test_request_dailyLimit429_isSentOnce_andRejected() async throws {
        let client = makeClient()
        PipelineStubProtocol.script = [.http(429, [:], #"{"code":"DAILY_COMMENT_LIMIT","limit":50,"error":"Trop"}"#)]

        do {
            let _: Pong = try await client.stringRequest(endpoint: "/conversations")
            XCTFail("la limite du jour doit lever")
        } catch MeeshyError.rejected(let rejection) {
            XCTAssertEqual(rejection.statusCode, 429)
            XCTAssertEqual(rejection.code, "DAILY_COMMENT_LIMIT")
            XCTAssertEqual(rejection.limit, 50)
        }
        XCTAssertEqual(PipelineStubProtocol.requests.count, 1)
    }

    // MARK: - (e) (f) (g) Les refus locaux et les normalisations

    func test_request_emptyPathSegment_throwsInvalidURL_withoutAnyRequest() async throws {
        let client = makeClient()

        do {
            let _: Pong = try await client.stringRequest(endpoint: "/conversations//messages")
            XCTFail("un segment vide doit lever")
        } catch {
            XCTAssertEqual(serverMessage(of: error)?.status, 0)
            XCTAssertEqual(serverMessage(of: error)?.message, "URL invalide")
        }
        XCTAssertEqual(PipelineStubProtocol.requests.count, 0)
    }

    func test_request_invalidJSONOn200_throwsDecodingServerError() async throws {
        let client = makeClient()
        PipelineStubProtocol.script = [.http(200, [:], #"{"nope":1}"#)]

        do {
            let _: Pong = try await client.stringRequest(endpoint: "/conversations")
            XCTFail("un JSON sans `ok` doit lever")
        } catch {
            let verdict = serverMessage(of: error)
            XCTAssertEqual(verdict?.status, 0)
            XCTAssertTrue(verdict?.message.hasPrefix("Erreur de decodage") == true, "\(String(describing: verdict))")
        }
    }

    func test_request_notConnected_throwsNoConnection() async throws {
        let client = makeClient()
        PipelineStubProtocol.script = [.failure(.notConnectedToInternet)]

        do {
            let _: Pong = try await client.stringRequest(endpoint: "/conversations")
            XCTFail("l'absence de réseau doit lever")
        } catch MeeshyError.network(let network) {
            guard case .noConnection = network else { return XCTFail("attendu .noConnection, reçu \(network)") }
        }
    }

    // MARK: - (h) Un 401 ne se rejoue qu'une fois

    func test_request_401ThenSecond401_sendsTwoRequests_thenSessionExpired() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.tokenOne, sessionToken: "sess-pipeline", user: makeUser())
        authService.served = [Self.tokenOne: (Self.tokenTwo, makeUser())]
        let client = makeClient(token: Self.tokenOne)
        PipelineStubProtocol.script = [.http(401, [:], #"{"error":"x"}"#), .http(401, [:], #"{"error":"x"}"#)]

        do {
            let _: Pong = try await client.stringRequest(endpoint: "/conversations")
            XCTFail("deux 401 de suite doivent lever")
        } catch MeeshyError.auth(let authError) {
            guard case .sessionExpired = authError else { return XCTFail("attendu .sessionExpired, reçu \(authError)") }
        }

        XCTAssertEqual(PipelineStubProtocol.authorizations, ["Bearer \(Self.tokenOne)", "Bearer \(Self.tokenTwo)"])
    }

    // MARK: - (i) Le signal 426 part

    func test_request_426_postsTheUpgradeGateNotification_andThrows() async throws {
        let client = makeClient()
        PipelineStubProtocol.script = [.http(426, [:], #"{"error":"Mise a jour"}"#)]
        let posted = expectation(description: "la porte de mise à jour est signalée")
        let observer = NotificationCenter.default.addObserver(
            forName: .meeshyUpgradeRequired, object: nil, queue: nil
        ) { _ in posted.fulfill() }
        defer { NotificationCenter.default.removeObserver(observer) }

        do {
            let _: Pong = try await client.stringRequest(endpoint: "/conversations")
            XCTFail("un 426 doit lever")
        } catch {
            XCTAssertEqual(serverMessage(of: error)?.status, 426)
            XCTAssertEqual(serverMessage(of: error)?.message, "Mise a jour")
        }
        await fulfillment(of: [posted], timeout: 5)
    }
}

// MARK: - Doublures

private final class PipelineStubProtocol: URLProtocol {
    enum Reply {
        case http(Int, [String: String], String)
        case failure(URLError.Code)
    }

    struct Recorded {
        let url: String
        let method: String
        let headers: [String: String]
        let body: Data?
    }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var _script: [Reply] = []
    nonisolated(unsafe) private static var _requests: [Recorded] = []

    private static func locked<T>(_ body: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body()
    }

    static var script: [Reply] {
        get { locked { _script } }
        set { locked { _script = newValue } }
    }
    static var requests: [Recorded] { locked { _requests } }
    static var authorizations: [String] { requests.map { $0.headers["Authorization"] ?? "" } }
    static func reset() { locked { _script = []; _requests = [] } }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    private nonisolated static func bodyData(of request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4_096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }

    override nonisolated func startLoading() {
        let recorded = Recorded(
            url: request.url?.absoluteString ?? "",
            method: request.httpMethod ?? "",
            headers: request.allHTTPHeaderFields ?? [:],
            body: Self.bodyData(of: request)
        )
        let reply: Reply = Self.locked {
            Self._requests.append(recorded)
            return Self._script.isEmpty ? .http(500, [:], "{}") : Self._script.removeFirst()
        }
        switch reply {
        case .failure(let code):
            client?.urlProtocol(self, didFailWithError: URLError(code))
        case .http(let status, let headers, let body):
            let response = HTTPURLResponse(
                url: request.url ?? URL(string: "https://stub.meeshy.test")!,
                statusCode: status, httpVersion: nil,
                headerFields: headers.merging(["Content-Type": "application/json"]) { given, _ in given })!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(body.utf8))
            client?.urlProtocolDidFinishLoading(self)
        }
    }

    override nonisolated func stopLoading() {}
}

private final class PipelineAuthService: AuthServiceProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var _served: [String: (String, MeeshyUser)] = [:]

    var served: [String: (String, MeeshyUser)] {
        get { lock.lock(); defer { lock.unlock() }; return _served }
        set { lock.lock(); _served = newValue; lock.unlock() }
    }

    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        guard let (token, user) = served[currentToken] else { throw MeeshyError.network(.noConnection) }
        return LoginResponseData(user: user, token: token, sessionToken: "sess-\(user.id)",
                                 expiresIn: 3600, requires2FA: nil, twoFactorToken: nil)
    }

    func login(username: String, password: String, rememberDevice: Bool) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func completeLoginWith2FA(twoFactorToken: String, code: String) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func register(request: RegisterRequest) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func logoutThrowing(token: String) async throws {}
    func me() async throws -> MeeshyUser { throw MeeshyError.network(.noConnection) }
    func requestMagicLink(email: String, deviceFingerprint: String?) async throws -> Int { 0 }
    func validateMagicLink(token: String) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func requestPasswordReset(email: String) async throws {}
    func resetPassword(token: String, newPassword: String) async throws {}
    func sendPhoneCode(phoneNumber: String) async throws {}
    func verifyPhone(phoneNumber: String, code: String) async throws -> VerifyPhoneResponse {
        throw MeeshyError.network(.noConnection)
    }
    func verifyEmail(code: String) async throws {}
    func verifyEmailWithCode(code: String, email: String) async throws {}
    func resendVerificationEmail(email: String) async throws {}
    func checkAvailability(username: String?, email: String?, phone: String?) async throws -> AvailabilityResponse {
        throw MeeshyError.network(.noConnection)
    }
    func logout() async {}
}

private final class PipelineKeychainStore: KeychainStoring, @unchecked Sendable {
    private var store: [String: String] = [:]
    func save(_ value: String, forKey key: String, account: String?) throws { store[key] = value }
    func load(forKey key: String, account: String?) -> String? { store[key] }
    func delete(forKey key: String, account: String?) { store.removeValue(forKey: key) }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws {
        try save(value, forKey: key, account: account)
    }
    func loadAsync(forKey key: String, account: String?) async -> String? {
        load(forKey: key, account: account)
    }
}
