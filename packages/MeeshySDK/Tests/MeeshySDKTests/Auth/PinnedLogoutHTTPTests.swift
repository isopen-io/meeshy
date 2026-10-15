import XCTest
@testable import MeeshySDK

/// #10463 F1 — une déconnexion PAR JETON ne parle qu'au nom de ce jeton.
///
/// `logoutThrowing(token:)` passait par `requestWithHeaders` : sur un 401, le
/// client rafraîchissait le compte ACTIF puis REJOUAIT la requête en remplaçant
/// `Authorization` par le jeton rafraîchi. Fermer une session prouvée refusée
/// (« Annuler » devant l'alerte) ou le compte qu'on quittait, et recevoir un
/// 401 — tentative précédente aboutie mais réponse perdue — fermait donc côté
/// serveur la session du compte qui restait ouvert.
///
/// Ces témoins observent le FIL, par un `URLProtocol` posé sous un vrai
/// `APIClient` : un 401 sur la déconnexion de B ne fait partir AUCUNE requête
/// sous un autre `Authorization`, ne rafraîchit rien, et ne touche pas A.
/// Sur l'ancien chemin, le premier témoin voyait partir une seconde requête
/// `Bearer tok-refreshed` et un rafraîchissement ; le second voyait la session
/// de A effacée (le rafraîchissement, refusé lui aussi, la déclarait morte) et
/// trois tentatives.
@MainActor
final class PinnedLogoutHTTPTests: XCTestCase {

    private var originalKeychain: (any KeychainStoring)!
    private var originalUser: MeeshyUser?
    private var originalIsAuthenticated = false
    private var originalAuthToken: String?
    private var originalAuthService: AuthServiceProviding!
    private var refreshDouble: PinnedLogoutRefreshDouble!

    override func setUp() async throws {
        try await super.setUp()
        PinnedLogoutStubProtocol.reset()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        originalAuthService = AuthManager.shared.authService
        refreshDouble = PinnedLogoutRefreshDouble()
        AuthManager.shared.authService = refreshDouble
        originalUser = AuthManager.shared.currentUser
        originalIsAuthenticated = AuthManager.shared.isAuthenticated
        originalAuthToken = APIClient.shared.authToken
        originalKeychain = AuthManager.shared.keychain
        AuthManager.shared.keychain = PinnedLogoutKeychainStore()
        AuthManager.shared.isAuthenticated = false
    }

    override func tearDown() async throws {
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        AuthManager.shared.currentUser = originalUser
        AuthManager.shared.isAuthenticated = originalIsAuthenticated
        APIClient.shared.authToken = originalAuthToken
        AuthManager.shared.errorMessage = nil
        PinnedLogoutStubProtocol.reset()
        try await super.tearDown()
    }

    private func makeUser(_ id: String) -> MeeshyUser {
        MeeshyUser(
            id: id, username: id, email: "\(id)@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
    }

    /// A ouvert, SANS `applySession` : celui-ci lance le préchauffage des caches
    /// de session (`warmSessionScopedCaches`, la liste de blocage), une requête
    /// d'arrière-plan AU NOM DE A qui, sous un jeton non JWT, rafraîchit A —
    /// légitimement, c'est sa propre requête. Ce rafraîchissement-là n'a rien à
    /// voir avec la déconnexion épinglée de B et faisait rougir ces témoins
    /// (CI #10463, run 38335841062). L'état posé est celui que lisent les
    /// assertions : compte actif, trousseau, jeton du transport.
    private func openAccount(token: String, sessionToken: String, user: MeeshyUser) throws {
        let auth = AuthManager.shared
        try auth.keychain.save(token, forKey: auth.tokenKey(for: user.id), account: nil)
        try auth.keychain.save(sessionToken, forKey: auth.sessionTokenKey(for: user.id), account: nil)
        auth.activeUserId = user.id
        APIClient.shared.authToken = token
        auth.currentUser = user
        auth.isAuthenticated = true
    }

    /// Le jeton de A est un JWT VIVANT (échéance en 2100) : un jeton non JWT
    /// est lu « expiré » (`AuthManager.isTokenExpired`), et toute requête
    /// d'arrière-plan au nom de A le rafraîchirait — un rafraîchissement
    /// légitime, étranger à la déconnexion épinglée de B, qui faisait rougir
    /// ces témoins selon l'ordre des suites (CI dev d55cfaaf3f, run 38368531512).
    static let liveTokenA: String = {
        func part(_ json: String) -> String {
            Data(json.utf8).base64EncodedString()
                .replacingOccurrences(of: "+", with: "-")
                .replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
        }
        return [part(#"{"alg":"HS256","typ":"JWT"}"#), part(#"{"userId":"user-a","exp":4102444800}"#), "signature"]
            .joined(separator: ".")
    }()

    private func makeStubbedClient() -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [PinnedLogoutStubProtocol.self]
        return APIClient(urlSession: URLSession(configuration: config))
    }

    /// Le témoin au niveau du client : B reçoit 401, rien ne part sous A.
    func test_logoutThrowingWithToken_on401_sendsNothingButThePinnedToken() async throws {
        let auth = AuthManager.shared
        try openAccount(token: Self.liveTokenA, sessionToken: "sess-a", user: makeUser("user-a"))
        refreshDouble.refreshedUser = makeUser("user-a")
        let client = makeStubbedClient()
        let service = AuthService(api: client, pinned: client)

        do {
            try await service.logoutThrowing(token: "tok-proven-b")
            XCTFail("un 401 est rendu tel quel")
        } catch let error as MeeshyError {
            guard case .auth = error else { return XCTFail("attendu : refus d'authentification, reçu \(error)") }
        }

        XCTAssertEqual(PinnedLogoutStubProtocol.authorizations, ["Bearer tok-proven-b"],
                       "aucune requête ne part sous un autre Authorization que le jeton épinglé")
        XCTAssertEqual(PinnedLogoutStubProtocol.paths, [AuthEndpoint.logout.path])
        XCTAssertEqual(refreshDouble.refreshCallCount, 0, "le compte actif n'est pas rafraîchi pour la requête d'un autre")
        XCTAssertEqual(auth.activeAccountId, "user-a")
        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(APIClient.shared.authToken, Self.liveTokenA)
    }

    /// Le chemin réel : « Annuler » devant l'alerte referme la session prouvée
    /// par `discardProvenSession`. Sur 401, une seule tentative, sous B, et A
    /// reste ouvert.
    func test_discardProvenSession_on401_neverSpeaksForTheActiveAccount() async throws {
        let auth = AuthManager.shared
        try openAccount(token: Self.liveTokenA, sessionToken: "sess-a", user: makeUser("user-a"))
        let client = makeStubbedClient()
        auth.authService = AuthService(api: client, pinned: client)

        await auth.discardProvenSession(
            EmailProvenSession(token: "tok-proven-b", sessionToken: "sess-b", user: makeUser("user-b")))

        XCTAssertEqual(PinnedLogoutStubProtocol.authorizations, ["Bearer tok-proven-b"],
                       "un jeton refusé ne se réessaie pas, et ne se remplace jamais")
        XCTAssertEqual(PinnedLogoutStubProtocol.paths, [AuthEndpoint.logout.path])
        XCTAssertEqual(auth.activeAccountId, "user-a", "la session du compte ouvert survit")
        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(APIClient.shared.authToken, Self.liveTokenA)
        XCTAssertEqual(auth.keychain.load(forKey: auth.tokenKey(for: "user-a"), account: nil), Self.liveTokenA)
    }
}

/// Répond 401 à TOUT, et note ce qui est parti.
private final class PinnedLogoutStubProtocol: URLProtocol {
    nonisolated(unsafe) static var authorizations: [String] = []
    nonisolated(unsafe) static var paths: [String] = []

    static func reset() {
        authorizations = []
        paths = []
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }

    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        Self.authorizations.append(request.value(forHTTPHeaderField: "Authorization") ?? "")
        Self.paths.append(request.url?.path ?? "")
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.meeshy.test")!,
            statusCode: 401, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"success":false,"error":"Unauthorized"}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

/// La passerelle du compte ACTIF : un rafraîchissement qui réussirait — ce que
/// l'ancien chemin aurait obtenu, puis rejoué sous son jeton.
private final class PinnedLogoutRefreshDouble: AuthServiceProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var _refreshCallCount = 0
    private var _refreshedUser: MeeshyUser?

    private func locked<T>(_ body: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body()
    }

    var refreshCallCount: Int { locked { _refreshCallCount } }
    var refreshedUser: MeeshyUser? {
        get { locked { _refreshedUser } }
        set { locked { _refreshedUser = newValue } }
    }

    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        let user: MeeshyUser? = locked {
            _refreshCallCount += 1
            return _refreshedUser
        }
        guard let user else { throw MeeshyError.network(.noConnection) }
        return LoginResponseData(user: user, token: "tok-refreshed", sessionToken: sessionToken,
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
    func me() async throws -> MeeshyUser {
        throw MeeshyError.network(.noConnection)
    }
    func logout() async {}
}

private final class PinnedLogoutKeychainStore: KeychainStoring, @unchecked Sendable {
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws {
        store[key] = value
    }

    func load(forKey key: String, account: String?) -> String? {
        store[key]
    }

    func delete(forKey key: String, account: String?) {
        store.removeValue(forKey: key)
    }

    func saveAsync(_ value: String, forKey key: String, account: String?) async throws {
        try save(value, forKey: key, account: account)
    }

    func loadAsync(forKey key: String, account: String?) async -> String? {
        load(forKey: key, account: account)
    }
}
