import XCTest
@testable import MeeshySDK

/// #10904 — un 401 ne rafraîchit et ne rejoue que sous le compte et la session
/// qui ont ENVOYÉ la requête.
///
/// Trois défauts de l'ancien chemin, chacun avec son témoin :
/// - un 401 tardif du compte A, arrivé après une bascule vers B, rafraîchissait
///   la session de B et rejouait la requête de A sous le jeton de B ;
/// - le rafraîchissement de B rejoignait celui de A encore en vol, et héritait
///   de son abandon ;
/// - un 401 tardif d'un jeton déjà renouvelé relançait un rafraîchissement.
@MainActor
final class UnauthorizedReplayOwnershipTests: XCTestCase {

    private var originalKeychain: (any KeychainStoring)!
    private var originalUser: MeeshyUser?
    private var originalIsAuthenticated = false
    private var originalAuthToken: String?
    private var originalAuthService: AuthServiceProviding!
    private var authService: OwnershipAuthService!

    override func setUp() async throws {
        try await super.setUp()
        OwnershipStubProtocol.reset()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        originalAuthService = AuthManager.shared.authService
        authService = OwnershipAuthService()
        AuthManager.shared.authService = authService
        originalUser = AuthManager.shared.currentUser
        originalIsAuthenticated = AuthManager.shared.isAuthenticated
        originalAuthToken = APIClient.shared.authToken
        originalKeychain = AuthManager.shared.keychain
        AuthManager.shared.keychain = OwnershipKeychainStore()
        AuthManager.shared.isAuthenticated = false
    }

    override func tearDown() async throws {
        authService.release()
        OwnershipStubProtocol.release()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        AuthManager.shared.activeSessionExits = 0
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        AuthManager.shared.currentUser = originalUser
        AuthManager.shared.isAuthenticated = originalIsAuthenticated
        APIClient.shared.authToken = originalAuthToken
        OwnershipStubProtocol.reset()
        try await super.tearDown()
    }

    // MARK: - Aides

    private static func jwt(_ userId: String, _ tag: String) -> String {
        // `exp` lointain : seul le 401 déclenche le rafraîchissement, jamais l'expiration.
        let payload = Data(#"{"userId":"\#(userId)","exp":4102444800,"t":"\#(tag)"}"#.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "=", with: "")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
        return "eyJhbGciOiJIUzI1NiJ9.\(payload).sig"
    }

    private static func expiredJWT(_ userId: String) -> String {
        let payload = Data(#"{"userId":"\#(userId)","exp":1600000000}"#.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "=", with: "")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
        return "eyJhbGciOiJIUzI1NiJ9.\(payload).sig"
    }

    private static let tokenA1 = jwt("user-a", "a1")
    private static let tokenA2 = jwt("user-a", "a2")
    private static let tokenB1 = jwt("user-b", "b1")
    private static let tokenB2 = jwt("user-b", "b2")

    private func makeUser(_ id: String) -> MeeshyUser {
        MeeshyUser(
            id: id, username: id, email: "\(id)@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
    }

    private func makeStubbedClient(token: String) -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [OwnershipStubProtocol.self]
        let client = APIClient(urlSession: URLSession(configuration: config))
        client.authToken = token
        return client
    }

    /// La bascule telle que `switchAccount` la laisse, sans ses purges :
    /// génération changée, B posé, le client porte le jeton de B.
    private func switchToB(client: APIClient) throws {
        let auth = AuthManager.shared
        auth.sessionGeneration &+= 1
        auth.isAuthenticated = false
        try auth.applySession(token: Self.tokenB1, sessionToken: "sess-b", user: makeUser("user-b"))
        client.authToken = Self.tokenB1
    }

    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<2_000 where !condition() {
            try? await Task.sleep(nanoseconds: 2_000_000)
        }
    }

    // MARK: - Le jeton remis à un autre transport (#10927)

    func test_freshAuthToken_whenTheJWTIsExpired_refreshesItBeforeHandingItOver() async throws {
        let auth = AuthManager.shared
        let expired = Self.expiredJWT("user-a")
        try auth.applySession(token: expired, sessionToken: "sess-a", user: makeUser("user-a"))
        authService.served = [expired: (Self.tokenA2, makeUser("user-a"))]
        let client = makeStubbedClient(token: expired)

        let handed = await client.freshAuthToken()

        XCTAssertEqual(handed, Self.tokenA2, "un jeton échu ne part jamais sur /sync")
        XCTAssertEqual(authService.presentedTokens, [expired])
    }

    func test_freshAuthToken_whenTheJWTIsLive_handsItOverWithoutRefreshing() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.tokenA1, sessionToken: "sess-a", user: makeUser("user-a"))
        let client = makeStubbedClient(token: Self.tokenA1)

        let handed = await client.freshAuthToken()

        XCTAssertEqual(handed, Self.tokenA1)
        XCTAssertEqual(authService.presentedTokens, [])
    }

    func test_freshAuthToken_whenTheRefreshFails_handsOverTheTokenItHolds() async throws {
        let auth = AuthManager.shared
        let expired = Self.expiredJWT("user-a")
        try auth.applySession(token: expired, sessionToken: "sess-a", user: makeUser("user-a"))
        let client = makeStubbedClient(token: expired)

        let handed = await client.freshAuthToken()

        XCTAssertEqual(handed, expired, "hors ligne, le repli REST garde la main sur le verdict")
    }

    // MARK: - Un 401 de A après la bascule vers B

    func test_late401FromAccountA_afterSwitchingToB_isAbandoned_neverRefreshesNorReplaysUnderB() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.tokenA1, sessionToken: "sess-a", user: makeUser("user-a"))
        let client = makeStubbedClient(token: Self.tokenA1)
        OwnershipStubProtocol.script = [.held(401)]

        let request = Task { try await AuthService(api: client, pinned: client).me() }
        await waitUntil { OwnershipStubProtocol.authorizations.count == 1 }
        try switchToB(client: client)
        OwnershipStubProtocol.release()

        do {
            _ = try await request.value
            XCTFail("la requête de A ne rend rien une fois B actif")
        } catch {
            XCTAssertTrue(error is CancellationError, "attendu : l'abandon, reçu \(error)")
        }
        XCTAssertEqual(OwnershipStubProtocol.authorizations, ["Bearer \(Self.tokenA1)"],
                       "aucun rejeu, et surtout pas sous le jeton de B")
        XCTAssertEqual(authService.presentedTokens, [], "la session de B n'est pas rafraîchie pour un 401 de A")
        XCTAssertEqual(auth.keychain.load(forKey: auth.tokenKey(for: "user-b"), account: nil), Self.tokenB1)
        XCTAssertTrue(auth.isAuthenticated, "la session de B reste ouverte")
    }

    // MARK: - B ne rejoint pas le rafraîchissement de A

    func test_refreshForB_whileAccountAsRefreshIsInFlight_runsItsOwn_andAsAbandonDoesNotReachB() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.tokenA1, sessionToken: "sess-a", user: makeUser("user-a"))
        authService.holds = true
        authService.served = [Self.tokenA1: (Self.tokenA2, makeUser("user-a")),
                              Self.tokenB1: (Self.tokenB2, makeUser("user-b"))]

        let refreshA = Task { try await auth.refreshSession(force: true) }
        await waitUntil { self.authService.presentedTokens.count == 1 }
        let client = makeStubbedClient(token: Self.tokenA1)
        try switchToB(client: client)

        let refreshB = Task { try await auth.refreshSession(force: true) }
        await waitUntil { self.authService.presentedTokens.count == 2 }
        authService.release()

        do {
            _ = try await refreshA.value
            XCTFail("le rafraîchissement de A ne pose rien une fois B actif")
        } catch {
            XCTAssertTrue(error is CancellationError, "attendu : l'abandon de A, reçu \(error)")
        }
        let tokenOfB = try await refreshB.value
        XCTAssertEqual(authService.presentedTokens, [Self.tokenA1, Self.tokenB1],
                       "B rafraîchit SA session, il n'attend pas celle de A")
        XCTAssertEqual(tokenOfB, Self.tokenB2)
        XCTAssertEqual(auth.keychain.load(forKey: auth.tokenKey(for: "user-b"), account: nil), Self.tokenB2)
    }

    // MARK: - Un 401 tardif d'un jeton déjà renouvelé

    func test_late401OfARotatedToken_replaysUnderTheCurrentToken_withoutASecondRefresh() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.tokenA1, sessionToken: "sess-a", user: makeUser("user-a"))
        authService.served = [Self.tokenA1: (Self.tokenA2, makeUser("user-a"))]
        let client = makeStubbedClient(token: Self.tokenA1)
        OwnershipStubProtocol.script = [.held(401), .immediate(500)]

        let request = Task { try await AuthService(api: client, pinned: client).me() }
        await waitUntil { OwnershipStubProtocol.authorizations.count == 1 }
        // Une autre requête a déjà fait renouveler le jeton de la session.
        _ = try await auth.refreshSession(force: true)
        client.authToken = Self.tokenA2
        OwnershipStubProtocol.release()

        _ = try? await request.value

        XCTAssertEqual(authService.presentedTokens, [Self.tokenA1],
                       "le 401 d'un jeton déjà renouvelé ne relance aucun rafraîchissement")
        XCTAssertEqual(OwnershipStubProtocol.authorizations,
                       ["Bearer \(Self.tokenA1)", "Bearer \(Self.tokenA2)"],
                       "la requête se rejoue sous le jeton courant de la MÊME session")
    }

    // MARK: - Un 401 de A après un aller-retour A → B → A

    func test_late401FromAnEarlierSessionOfTheSameAccount_isAbandoned() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.tokenA1, sessionToken: "sess-a", user: makeUser("user-a"))
        let client = makeStubbedClient(token: Self.tokenA1)
        OwnershipStubProtocol.script = [.held(401)]

        let request = Task { try await AuthService(api: client, pinned: client).me() }
        await waitUntil { OwnershipStubProtocol.authorizations.count == 1 }
        try switchToB(client: client)
        // Retour sur A, jetons gardés au trousseau : même jeton, autre session.
        auth.sessionGeneration &+= 1
        auth.isAuthenticated = false
        try auth.applySession(token: Self.tokenA1, sessionToken: "sess-a", user: makeUser("user-a"))
        client.authToken = Self.tokenA1
        OwnershipStubProtocol.release()

        do {
            _ = try await request.value
            XCTFail("une requête d'une session quittée ne se rejoue pas")
        } catch {
            XCTAssertTrue(error is CancellationError, "attendu : l'abandon, reçu \(error)")
        }
        XCTAssertEqual(OwnershipStubProtocol.authorizations, ["Bearer \(Self.tokenA1)"])
        XCTAssertEqual(authService.presentedTokens, [])
    }

    // MARK: - Audit adversarial (#10904)

    /// Le client a lu « A1 encore installé », puis le rafraîchissement d'une
    /// autre requête a posé A2 pendant le saut vers l'acteur : rejoué sous A2,
    /// pas abandonné.
    func test_401ReadAsLiveJustBeforeTheRefreshLanded_replaysUnderTheFreshToken() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.tokenA1, sessionToken: "sess-a", user: makeUser("user-a"))
        authService.served = [Self.tokenA1: (Self.tokenA2, makeUser("user-a"))]
        _ = try await auth.refreshSession(force: true)

        let token = try await auth.refreshSession(presentedToken: Self.tokenA1, stillInstalled: true, force: true)

        XCTAssertEqual(token, Self.tokenA2)
        XCTAssertEqual(authService.presentedTokens, [Self.tokenA1], "aucun second rafraîchissement")
    }

    /// Un jeton remplacé par la session de A ne vaut plus rien une fois B ouvert.
    func test_late401OfATokenRetiredByA_afterSwitchingToB_isAbandoned() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.tokenA1, sessionToken: "sess-a", user: makeUser("user-a"))
        authService.served = [Self.tokenA1: (Self.tokenA2, makeUser("user-a"))]
        _ = try await auth.refreshSession(force: true)
        let client = makeStubbedClient(token: Self.tokenA2)
        try switchToB(client: client)

        do {
            _ = try await auth.refreshSession(presentedToken: Self.tokenA1, stillInstalled: false, force: true)
            XCTFail("le jeton remplacé de A ne se rejoue pas sous B")
        } catch {
            XCTAssertTrue(error is CancellationError, "attendu : l'abandon, reçu \(error)")
        }
        XCTAssertEqual(authService.presentedTokens, [Self.tokenA1])
    }

    /// Le `defer` du rafraîchissement abandonné de A n'efface pas celui de B :
    /// une troisième demande de B le rejoint, elle n'en relance pas un autre.
    func test_aThirdRequestOfB_joinsBsRefresh_evenAfterAsAbandonedRefreshEnded() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.tokenA1, sessionToken: "sess-a", user: makeUser("user-a"))
        authService.holds = true
        authService.served = [Self.tokenA1: (Self.tokenA2, makeUser("user-a")),
                              Self.tokenB1: (Self.tokenB2, makeUser("user-b"))]
        let refreshA = Task { try await auth.refreshSession(force: true) }
        await waitUntil { self.authService.presentedTokens.count == 1 }
        try switchToB(client: makeStubbedClient(token: Self.tokenA1))
        authService.holdsByToken = [Self.tokenB1]
        let refreshB = Task { try await auth.refreshSession(force: true) }
        await waitUntil { self.authService.presentedTokens.count == 2 }
        authService.holds = false
        _ = try? await refreshA.value

        let refreshB2 = Task { try await auth.refreshSession(force: true) }
        try await Task.sleep(nanoseconds: 50_000_000)
        authService.holdsByToken = []
        let first = try await refreshB.value
        let second = try await refreshB2.value

        XCTAssertEqual(authService.presentedTokens, [Self.tokenA1, Self.tokenB1], "B ne rafraîchit qu'une fois")
        XCTAssertEqual(first, Self.tokenB2)
        XCTAssertEqual(second, Self.tokenB2)
    }

    /// Une écriture ratée au trousseau ne bloque pas la session : la référence
    /// est le jeton installé, celui que le client présente.
    func test_401OfTheInstalledToken_afterAKeychainWriteFailed_stillRefreshes() async throws {
        let auth = AuthManager.shared
        let keychain = OwnershipKeychainStore()
        auth.keychain = keychain
        try auth.applySession(token: Self.tokenA1, sessionToken: "sess-a", user: makeUser("user-a"))
        keychain.failingKey = auth.tokenKey(for: "user-a")
        authService.served = [Self.tokenA1: (Self.tokenA2, makeUser("user-a")),
                              Self.tokenA2: (Self.jwt("user-a", "a3"), makeUser("user-a"))]
        _ = try await auth.refreshSession(force: true)
        XCTAssertEqual(APIClient.shared.authToken, Self.tokenA2)
        XCTAssertEqual(keychain.load(forKey: auth.tokenKey(for: "user-a"), account: nil), Self.tokenA1,
                       "prémisse : le trousseau a gardé l'ancien jeton")

        let token = try await auth.refreshSession(presentedToken: Self.tokenA2, stillInstalled: true, force: true)

        XCTAssertEqual(token, Self.jwt("user-a", "a3"))
        XCTAssertEqual(authService.presentedTokens, [Self.tokenA1, Self.tokenA2],
                       "le rafraîchissement présente le jeton installé, pas celui du trousseau")
    }

    // MARK: - handleUnauthorized au nom d'un jeton

    func test_handleUnauthorized_forATokenThatIsNoLongerTheActiveOne_refreshesNothing() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.tokenB1, sessionToken: "sess-b", user: makeUser("user-b"))
        authService.served = [Self.tokenB1: (Self.tokenB2, makeUser("user-b"))]

        auth.handleUnauthorized(presentedToken: Self.tokenA1)
        auth.handleUnauthorized(presentedToken: nil)
        await auth.cancelPendingTokenRefreshForTesting()
        XCTAssertEqual(authService.presentedTokens, [], "le 401 d'un autre jeton ne rafraîchit pas B")

        auth.handleUnauthorized(presentedToken: Self.tokenB1)
        await waitUntil { self.authService.presentedTokens.count == 1 }
        await auth.cancelPendingTokenRefreshForTesting()
        XCTAssertEqual(authService.presentedTokens, [Self.tokenB1], "le 401 du jeton actif rafraîchit, une fois")
    }

    // MARK: - La voie nominale reste intacte

    func test_401OfTheLiveToken_refreshesOnce_andReplaysUnderTheFreshToken() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.tokenA1, sessionToken: "sess-a", user: makeUser("user-a"))
        authService.served = [Self.tokenA1: (Self.tokenA2, makeUser("user-a"))]
        let client = makeStubbedClient(token: Self.tokenA1)
        OwnershipStubProtocol.script = [.immediate(401), .immediate(500)]

        _ = try? await AuthService(api: client, pinned: client).me()

        XCTAssertEqual(authService.presentedTokens, [Self.tokenA1])
        XCTAssertEqual(OwnershipStubProtocol.authorizations,
                       ["Bearer \(Self.tokenA1)", "Bearer \(Self.tokenA2)"])
    }
}

// MARK: - Doublures

/// Répond selon un script ; une réponse `held` attend `release()`.
private final class OwnershipStubProtocol: URLProtocol {
    enum Step { case held(Int), immediate(Int) }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var _authorizations: [String] = []
    nonisolated(unsafe) private static var _script: [Step] = []
    nonisolated(unsafe) private static var _released = false

    private static func locked<T>(_ body: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body()
    }

    static var authorizations: [String] { locked { _authorizations } }
    static var script: [Step] {
        get { locked { _script } }
        set { locked { _script = newValue } }
    }
    static func release() { locked { _released = true } }
    static func reset() { locked { _authorizations = []; _script = []; _released = false } }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        let step: Step = Self.locked {
            Self._authorizations.append(request.value(forHTTPHeaderField: "Authorization") ?? "")
            return Self._script.isEmpty ? .immediate(500) : Self._script.removeFirst()
        }
        let status: Int
        let waits: Bool
        switch step {
        case .held(let code): status = code; waits = true
        case .immediate(let code): status = code; waits = false
        }
        DispatchQueue.global().async { [self] in
            if waits {
                for _ in 0..<5_000 where !Self.locked({ Self._released }) { usleep(2_000) }
            }
            let response = HTTPURLResponse(
                url: request.url ?? URL(string: "https://stub.meeshy.test")!,
                statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(#"{"success":false,"error":"Unauthorized"}"#.utf8))
            client?.urlProtocolDidFinishLoading(self)
        }
    }

    override nonisolated func stopLoading() {}
}

/// La passerelle d'authentification : un rafraîchissement par jeton présenté,
/// qu'on peut RETENIR.
private final class OwnershipAuthService: AuthServiceProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var _presentedTokens: [String] = []
    private var _holds = false
    private var _served: [String: (String, MeeshyUser)] = [:]
    private var _holdsByToken: Set<String> = []

    private func locked<T>(_ body: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body()
    }

    var presentedTokens: [String] { locked { _presentedTokens } }
    var holds: Bool {
        get { locked { _holds } }
        set { locked { _holds = newValue } }
    }
    var served: [String: (String, MeeshyUser)] {
        get { locked { _served } }
        set { locked { _served = newValue } }
    }
    var holdsByToken: Set<String> {
        get { locked { _holdsByToken } }
        set { locked { _holdsByToken = newValue } }
    }
    func release() { holds = false; holdsByToken = [] }

    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        locked { _presentedTokens.append(currentToken) }
        while holds || holdsByToken.contains(currentToken) { try await Task.sleep(nanoseconds: 2_000_000) }
        guard let (token, user) = locked({ _served[currentToken] }) else {
            throw MeeshyError.network(.noConnection)
        }
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

private final class OwnershipKeychainStore: KeychainStoring, @unchecked Sendable {
    struct WriteFailed: Error {}
    private var store: [String: String] = [:]
    /// Une clé dont l'écriture échoue (trousseau verrouillé avant le premier déverrouillage).
    var failingKey: String?
    func save(_ value: String, forKey key: String, account: String?) throws {
        if key == failingKey { throw WriteFailed() }
        store[key] = value
    }
    func load(forKey key: String, account: String?) -> String? { store[key] }
    func delete(forKey key: String, account: String?) { store.removeValue(forKey: key) }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws {
        try save(value, forKey: key, account: account)
    }
    func loadAsync(forKey key: String, account: String?) async -> String? {
        load(forKey: key, account: account)
    }
}
