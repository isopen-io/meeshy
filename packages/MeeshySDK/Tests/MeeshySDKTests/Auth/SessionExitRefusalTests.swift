import Combine
import XCTest
@testable import MeeshySDK

/// #10463 — l'audit adversarial de cb51e822da.
///
/// B2 : un rafraîchissement ABANDONNÉ (sortie de session en cours, session
/// remplacée) lève `CancellationError`, que `APIClient` traduisait en
/// `.auth(.sessionExpired)`. Le compte qu'on quittait passait alors par
/// `requireReauthentication`, et un compte GARDÉ au sélecteur perdait ses
/// jetons. `APIClient` relance désormais l'abandon tel quel, et un refus ne
/// démonte que le compte actif, sous la génération qui l'a demandé, hors sortie.
///
/// R4 : la déconnexion attend la fin d'un changement de compte.
///
/// R2 : connexion, second facteur et inscription refusent pendant un
/// changement de compte, et referment côté passerelle la session refusée ;
/// la bascule distingue un trousseau vidé d'une session posée entre-temps.
@MainActor
final class SessionExitRefusalTests: XCTestCase {

    private static let expiredJWT = "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.sig"
    private static let liveJWT = "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjQxMDI0NDQ4MDB9.sig"

    private var originalKeychain: (any KeychainStoring)!
    private var originalUser: MeeshyUser?
    private var originalIsAuthenticated = false
    private var originalAuthToken: String?
    private var originalAuthService: AuthServiceProviding!
    private var authService: SessionExitAuthService!

    override func setUp() async throws {
        try await super.setUp()
        SessionExitStubProtocol.reset()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        originalAuthService = AuthManager.shared.authService
        authService = SessionExitAuthService()
        AuthManager.shared.authService = authService
        originalUser = AuthManager.shared.currentUser
        originalIsAuthenticated = AuthManager.shared.isAuthenticated
        originalAuthToken = APIClient.shared.authToken
        originalKeychain = AuthManager.shared.keychain
        AuthManager.shared.keychain = SessionExitKeychainStore()
        AuthManager.shared.isAuthenticated = false
        AuthManager.shared.resetProfileRefreshThrottleForTesting()
    }

    override func tearDown() async throws {
        authService.releaseSessions()
        AuthManager.shared.isSwitchingAccount = false
        await AuthManager.shared.awaitRefusedSessionClosuresForTesting()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        AuthManager.shared.activeSessionExits = 0
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        AuthManager.shared.currentUser = originalUser
        AuthManager.shared.isAuthenticated = originalIsAuthenticated
        AuthManager.shared.requires2FA = false
        AuthManager.shared.twoFactorToken = nil
        AuthManager.shared.errorMessage = nil
        AuthManager.shared.resetProfileRefreshThrottleForTesting()
        APIClient.shared.authToken = originalAuthToken
        SessionExitStubProtocol.reset()
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

    private func makeStubbedClient(token: String) -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SessionExitStubProtocol.self]
        let client = APIClient(urlSession: URLSession(configuration: config))
        client.authToken = token
        return client
    }

    private func beginSessionExit(_ auth: AuthManager) {
        auth.sessionGeneration &+= 1
        auth.activeSessionExits += 1
    }

    // MARK: - B2 — APIClient relance l'abandon tel quel

    /// Rafraîchissement PRÉVENTIF (JWT expiré) pendant une sortie : l'ancien
    /// chemin rendait `.auth(.sessionExpired)`.
    func test_request_withAnExpiredJWT_duringASessionExit_throwsTheCancellation_notSessionExpired() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.expiredJWT, sessionToken: "sess-b", user: makeUser("user-b"))
        let client = makeStubbedClient(token: Self.expiredJWT)
        beginSessionExit(auth)

        do {
            _ = try await AuthService(api: client, pinned: client).me()
            XCTFail("un rafraîchissement abandonné ne rend pas de profil")
        } catch {
            XCTAssertTrue(error is CancellationError, "attendu : l'abandon tel quel, reçu \(error)")
        }

        XCTAssertEqual(SessionExitStubProtocol.authorizations, [], "rien ne part sous un jeton expiré")
        XCTAssertEqual(authService.refreshCallCount, 0)
    }

    /// Rafraîchissement RÉACTIF (401) pendant une sortie : l'ancien chemin
    /// relançait `handleUnauthorized` et rendait `.auth(.sessionExpired)`.
    func test_request_answered401_duringASessionExit_throwsTheCancellation_notSessionExpired() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.liveJWT, sessionToken: "sess-b", user: makeUser("user-b"))
        let client = makeStubbedClient(token: Self.liveJWT)
        beginSessionExit(auth)

        do {
            _ = try await AuthService(api: client, pinned: client).me()
            XCTFail("un 401 suivi d'un rafraîchissement abandonné ne rend pas de profil")
        } catch {
            XCTAssertTrue(error is CancellationError, "attendu : l'abandon tel quel, reçu \(error)")
        }

        XCTAssertEqual(SessionExitStubProtocol.authorizations, ["Bearer \(Self.liveJWT)"], "aucun rejeu")
        XCTAssertEqual(authService.refreshCallCount, 0)
    }

    // MARK: - B2 — le compte qu'on quitte garde ses jetons

    /// Le témoin de l'audit : sortie commencée, `me()` part sous un JWT expiré.
    /// L'ancien chemin effaçait les jetons du compte gardé.
    func test_profileRevalidation_duringASessionExit_keepsTheLeftAccountsTokens() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: Self.expiredJWT, sessionToken: "sess-b", user: makeUser("user-b"))
        let client = makeStubbedClient(token: Self.expiredJWT)
        authService.meForwarder = AuthService(api: client, pinned: client)
        var invalidations = 0
        let watch = auth.sessionInvalidated.sink { _ in invalidations += 1 }
        defer { watch.cancel() }
        beginSessionExit(auth)

        await auth.refreshCurrentUserProfile()

        XCTAssertEqual(authService.meCallCount, 1, "la revalidation est bien partie")
        XCTAssertEqual(auth.keychain.load(forKey: auth.tokenKey(for: "user-b"), account: nil), Self.expiredJWT,
                       "le compte gardé au sélecteur garde son jeton")
        XCTAssertEqual(auth.keychain.load(forKey: auth.sessionTokenKey(for: "user-b"), account: nil), "sess-b")
        XCTAssertEqual(invalidations, 0, "aucune session n'a été invalidée par le serveur")
    }

    // MARK: - B2 — la loi de requireReauthentication

    func test_law_reauthentication_appliesOnlyToTheActiveAccount_underItsGeneration_outsideAnExit() {
        XCTAssertTrue(AuthManager.reauthenticationApplies(
            refusedUserId: "a", refusedGeneration: 3, activeUserId: "a", currentGeneration: 3, isLeavingActiveSession: false))
        XCTAssertFalse(AuthManager.reauthenticationApplies(
            refusedUserId: "a", refusedGeneration: 3, activeUserId: "a", currentGeneration: 3, isLeavingActiveSession: true))
        XCTAssertFalse(AuthManager.reauthenticationApplies(
            refusedUserId: "a", refusedGeneration: 2, activeUserId: "a", currentGeneration: 3, isLeavingActiveSession: false))
        XCTAssertFalse(AuthManager.reauthenticationApplies(
            refusedUserId: "a", refusedGeneration: 3, activeUserId: "b", currentGeneration: 3, isLeavingActiveSession: false))
        XCTAssertFalse(AuthManager.reauthenticationApplies(
            refusedUserId: "a", refusedGeneration: 3, activeUserId: nil, currentGeneration: 3, isLeavingActiveSession: false))
    }

    func test_requireReauthentication_duringASessionExit_keepsEverything() throws {
        let auth = AuthManager.shared
        try auth.applySession(token: "tok-a", sessionToken: "sess-a", user: makeUser("user-a"))
        let generation = auth.sessionGeneration
        auth.activeSessionExits += 1

        auth.requireReauthentication(userId: "user-a", generation: generation)

        XCTAssertEqual(auth.keychain.load(forKey: auth.tokenKey(for: "user-a"), account: nil), "tok-a")
        XCTAssertEqual(auth.activeAccountId, "user-a")
        XCTAssertTrue(auth.isAuthenticated)
    }

    func test_requireReauthentication_ofAReplacedSession_doesNotCloseTheOpenOne() throws {
        let auth = AuthManager.shared
        try auth.applySession(token: "tok-a", sessionToken: "sess-a", user: makeUser("user-a"))
        let staleGeneration = auth.sessionGeneration
        auth.sessionGeneration &+= 1
        auth.activeUserId = nil
        auth.isAuthenticated = false
        try auth.applySession(token: "tok-b", sessionToken: "sess-b", user: makeUser("user-b"), origin: .login)

        auth.requireReauthentication(userId: "user-a", generation: staleGeneration)
        auth.requireReauthentication(userId: "user-a", generation: auth.sessionGeneration)

        XCTAssertEqual(auth.activeAccountId, "user-b", "seul le compte qui a reçu le refus est démonté")
        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(auth.keychain.load(forKey: auth.tokenKey(for: "user-b"), account: nil), "tok-b")
        XCTAssertEqual(auth.keychain.load(forKey: auth.tokenKey(for: "user-a"), account: nil), "tok-a",
                       "le compte gardé au sélecteur garde son jeton")
    }

    func test_requireReauthentication_ofTheActiveSession_closesIt() throws {
        let auth = AuthManager.shared
        try auth.applySession(token: "tok-a", sessionToken: "sess-a", user: makeUser("user-a"))

        auth.requireReauthentication(userId: "user-a", generation: auth.sessionGeneration)

        XCTAssertNil(auth.keychain.load(forKey: auth.tokenKey(for: "user-a"), account: nil))
        XCTAssertNil(auth.activeAccountId)
        XCTAssertFalse(auth.isAuthenticated)
    }

    // MARK: - R4 — la déconnexion attend la fin d'une bascule

    func test_logout_duringAnAccountSwitch_waitsForItToEnd() async throws {
        let auth = AuthManager.shared
        auth.isAuthenticated = true
        auth.isSwitchingAccount = true

        let logout = Task { await auth.logout() }
        try await Task.sleep(for: .milliseconds(120))

        XCTAssertTrue(auth.isAuthenticated, "rien n'est fermé tant que la bascule tient la session")
        auth.isSwitchingAccount = false
        await logout.value
        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertFalse(auth.isLeavingActiveSession, "la sortie terminée ne laisse aucune sortie en cours")
    }

    // MARK: - R2 — connexion, second facteur, inscription pendant une bascule

    func test_login_duringAnAccountSwitch_isRefused_beforeAnyRequest() async {
        let auth = AuthManager.shared
        auth.isSwitchingAccount = true

        let outcome = await auth.login(username: "user-c", password: "pw")

        XCTAssertEqual(outcome, .failed)
        XCTAssertEqual(authService.sessionCallCount, 0, "rien n'est demandé au serveur")
        XCTAssertEqual(auth.errorMessage, AccountSwitchUnderway().errorDescription)
        XCTAssertNil(auth.activeAccountId)
    }

    func test_login_whoseSessionArrivesDuringAnAccountSwitch_isRefused_andClosed() async {
        let auth = AuthManager.shared
        authService.servedUser = makeUser("user-c")
        authService.holdsSessions = true

        let login = Task { await auth.login(username: "user-c", password: "pw") }
        while authService.sessionCallCount == 0 { await Task.yield() }
        auth.isSwitchingAccount = true
        authService.releaseSessions()
        let outcome = await login.value
        await auth.awaitRefusedSessionClosuresForTesting()

        XCTAssertEqual(outcome, .failed)
        XCTAssertNil(auth.activeAccountId)
        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertFalse(auth.hasPreservedSession(for: "user-c"))
        XCTAssertEqual(authService.loggedOutTokens, ["tok-served"], "la session refusée est refermée côté passerelle")
    }

    func test_secondFactor_whoseSessionArrivesDuringAnAccountSwitch_isRefused_andClosed() async {
        let auth = AuthManager.shared
        auth.twoFactorToken = "2fa"
        authService.servedUser = makeUser("user-c")
        authService.holdsSessions = true

        let completion = Task { await auth.completeLoginWith2FA(code: "123456") }
        while authService.sessionCallCount == 0 { await Task.yield() }
        auth.isSwitchingAccount = true
        authService.releaseSessions()
        await completion.value
        await auth.awaitRefusedSessionClosuresForTesting()

        XCTAssertNil(auth.activeAccountId)
        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertNotNil(auth.errorMessage)
        XCTAssertEqual(authService.loggedOutTokens, ["tok-served"])
    }

    func test_secondFactor_duringAnAccountSwitch_isRefused_beforeAnyRequest() async {
        let auth = AuthManager.shared
        auth.twoFactorToken = "2fa"
        auth.isSwitchingAccount = true

        await auth.completeLoginWith2FA(code: "123456")

        XCTAssertEqual(authService.sessionCallCount, 0)
        XCTAssertEqual(auth.errorMessage, AccountSwitchUnderway().errorDescription)
    }

    func test_register_whoseSessionArrivesDuringAnAccountSwitch_isRefused_andClosed() async {
        let auth = AuthManager.shared
        authService.servedUser = makeUser("user-c")
        authService.holdsSessions = true

        let registration = Task {
            await auth.register(request: RegisterRequest(displayName: "C", email: "c@test.com", password: "Xk9$mQ2vLp8#nR4wZ"))
        }
        while authService.sessionCallCount == 0 { await Task.yield() }
        auth.isSwitchingAccount = true
        authService.releaseSessions()
        await registration.value
        await auth.awaitRefusedSessionClosuresForTesting()

        XCTAssertNil(auth.activeAccountId)
        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertEqual(authService.loggedOutTokens, ["tok-served"])
    }

    func test_registerThrowing_overAnotherOpenSession_isRefused_andClosed() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: "tok-a", sessionToken: "sess-a", user: makeUser("user-a"))
        authService.servedUser = makeUser("user-c")

        do {
            try await auth.registerThrowing(
                request: RegisterRequest(displayName: "C", email: "c@test.com", password: "Xk9$mQ2vLp8#nR4wZ"))
            XCTFail("la session d'un autre compte ne se pose pas par-dessus la session ouverte")
        } catch {
            XCTAssertTrue(error is SessionReplacementRefused)
        }
        await auth.awaitRefusedSessionClosuresForTesting()

        XCTAssertEqual(auth.activeAccountId, "user-a")
        XCTAssertEqual(authService.loggedOutTokens, ["tok-served"])
    }

    // MARK: - R2 — la bascule distingue un trousseau vidé d'un refus

    func test_switchAccount_whoseKeychainEmptiesDuringTheSwitch_endsSignedOut() async throws {
        let auth = AuthManager.shared
        try auth.keychain.save("tok-b", forKey: auth.tokenKey(for: "user-b"), account: nil)

        let switching = Task { await auth.switchAccount(to: "user-b") }
        while !auth.isSwitchingAccount { await Task.yield() }
        auth.keychain.delete(forKey: auth.tokenKey(for: "user-b"), account: nil)
        let switched = await switching.value

        XCTAssertFalse(switched)
        XCTAssertNil(auth.activeAccountId)
        XCTAssertFalse(auth.isAuthenticated)
    }

    func test_switchAccount_whileAnotherSessionOpensDuringTheSwitch_leavesItOpen() async throws {
        let auth = AuthManager.shared
        try auth.keychain.save("tok-b", forKey: auth.tokenKey(for: "user-b"), account: nil)

        let switching = Task { await auth.switchAccount(to: "user-b") }
        while !auth.isSwitchingAccount { await Task.yield() }
        try auth.applySession(token: "tok-c", sessionToken: "sess-c", user: makeUser("user-c"), origin: .login)
        let switched = await switching.value

        XCTAssertFalse(switched)
        XCTAssertEqual(auth.activeAccountId, "user-c", "la session ouverte n'est pas démontée par un refus")
        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(APIClient.shared.authToken, "tok-c")
        XCTAssertEqual(auth.keychain.load(forKey: auth.tokenKey(for: "user-b"), account: nil), "tok-b")
    }
}

/// Répond 401 à TOUT, et note ce qui est parti.
private final class SessionExitStubProtocol: URLProtocol {
    nonisolated(unsafe) static var authorizations: [String] = []

    static func reset() {
        authorizations = []
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }

    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        Self.authorizations.append(request.value(forHTTPHeaderField: "Authorization") ?? "")
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.meeshy.test")!,
            statusCode: 401, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"success":false,"error":"Unauthorized"}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

/// La passerelle : des sessions qu'on peut RETENIR (connexion, second facteur,
/// inscription), une déconnexion qui note le jeton, et un `me()` qui passe par
/// un vrai `AuthService` quand le témoin en pose un.
private final class SessionExitAuthService: AuthServiceProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var _loggedOutTokens: [String] = []
    private var _sessionCallCount = 0
    private var _refreshCallCount = 0
    private var _meCallCount = 0
    private var _holdsSessions = false
    private var _servedUser: MeeshyUser?
    private var _meForwarder: AuthService?

    private func locked<T>(_ body: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body()
    }

    var loggedOutTokens: [String] { locked { _loggedOutTokens } }
    var sessionCallCount: Int { locked { _sessionCallCount } }
    var refreshCallCount: Int { locked { _refreshCallCount } }
    var meCallCount: Int { locked { _meCallCount } }
    var holdsSessions: Bool {
        get { locked { _holdsSessions } }
        set { locked { _holdsSessions = newValue } }
    }
    var servedUser: MeeshyUser? {
        get { locked { _servedUser } }
        set { locked { _servedUser = newValue } }
    }
    var meForwarder: AuthService? {
        get { locked { _meForwarder } }
        set { locked { _meForwarder = newValue } }
    }

    func releaseSessions() { holdsSessions = false }

    private func serveSession() async throws -> LoginResponseData {
        locked { _sessionCallCount += 1 }
        while holdsSessions { try await Task.sleep(nanoseconds: 5_000_000) }
        guard let user = servedUser else { throw MeeshyError.network(.noConnection) }
        return LoginResponseData(user: user, token: "tok-served", sessionToken: "sess-served",
                                 expiresIn: 3600, requires2FA: nil, twoFactorToken: nil)
    }

    func login(username: String, password: String, rememberDevice: Bool) async throws -> LoginResponseData {
        try await serveSession()
    }
    func completeLoginWith2FA(twoFactorToken: String, code: String) async throws -> LoginResponseData {
        try await serveSession()
    }
    func register(request: RegisterRequest) async throws -> LoginResponseData {
        try await serveSession()
    }

    func logoutThrowing(token: String) async throws {
        locked { _loggedOutTokens.append(token) }
    }

    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        locked { _refreshCallCount += 1 }
        throw MeeshyError.network(.noConnection)
    }

    func me() async throws -> MeeshyUser {
        let forwarder: AuthService? = locked {
            _meCallCount += 1
            return _meForwarder
        }
        guard let forwarder else { throw MeeshyError.network(.noConnection) }
        return try await forwarder.me()
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
    func logout() async {}
}

private final class SessionExitKeychainStore: KeychainStoring, @unchecked Sendable {
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
