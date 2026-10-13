import XCTest
@testable import MeeshySDK

/// #10446 — le SDK refuse d'installer la session d'un AUTRE utilisateur
/// par-dessus une session ouverte. La garde vivait dans l'application
/// (`SignInLinkOpener`) ; `applySession` posait la session sans démonter la
/// précédente — sockets, files, caches — et `confirmEmail`, `validateMagicLink`
/// et `openSession` restaient sans garde.
///
/// #10450 — la garde n'a plus de dérogation : un autre utilisateur ne se pose
/// que sur une session DÉMONTÉE. `switchToProvenAccount` suspend, vérifie que
/// la session est bien démontée, puis pose ; un rafraîchissement ne réinstalle
/// jamais le compte quitté ; une session prouvée qui ne se pose pas est
/// refermée côté passerelle, avec réessais.
@MainActor
final class AuthManagerSessionReplacementGuardTests: XCTestCase {

    private var originalKeychain: (any KeychainStoring)!
    private var originalUser: MeeshyUser?
    private var originalIsAuthenticated = false
    private var originalAuthToken: String?
    private var originalAuthService: AuthServiceProviding!
    private var authService: ReplacementGuardAuthService!

    override func setUp() async throws {
        try await super.setUp()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        originalAuthService = AuthManager.shared.authService
        authService = ReplacementGuardAuthService()
        AuthManager.shared.authService = authService
        originalUser = AuthManager.shared.currentUser
        originalIsAuthenticated = AuthManager.shared.isAuthenticated
        originalAuthToken = APIClient.shared.authToken
        // `KeychainManager` n'est pas habilité dans l'hôte de test SPM :
        // `activeUserId` y serait toujours nil, et la garde jugerait à vide.
        originalKeychain = AuthManager.shared.keychain
        AuthManager.shared.keychain = ReplacementGuardKeychainStore()
        AuthManager.shared.isAuthenticated = false
    }

    override func tearDown() async throws {
        // Pas de `logout()` : sa cascade atteint `UNUserNotificationCenter`,
        // indisponible dans un binaire de test SPM sans app hôte.
        authService.releaseRefresh()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.isSwitchingAccount = false
        AuthManager.shared.keychain = originalKeychain
        AuthManager.shared.currentUser = originalUser
        AuthManager.shared.isAuthenticated = originalIsAuthenticated
        APIClient.shared.authToken = originalAuthToken
        AuthManager.shared.errorMessage = nil
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

    // MARK: - La loi

    func test_law_sameUser_isARotation() {
        XCTAssertFalse(AuthManager.refusesSessionReplacement(
            currentlyAuthenticated: true, currentActiveUserId: "a", newUserId: "a"))
    }

    func test_law_anotherUser_overAnOpenSession_isRefused() {
        XCTAssertTrue(AuthManager.refusesSessionReplacement(
            currentlyAuthenticated: true, currentActiveUserId: "a", newUserId: "b"))
    }

    func test_law_unknownActiveUser_underAnOpenSession_isRefused() {
        XCTAssertTrue(AuthManager.refusesSessionReplacement(
            currentlyAuthenticated: true, currentActiveUserId: nil, newUserId: "b"))
    }

    func test_law_noOpenSession_acceptsAnyone() {
        XCTAssertFalse(AuthManager.refusesSessionReplacement(
            currentlyAuthenticated: false, currentActiveUserId: "a", newUserId: "b"))
    }

    func test_law_refreshAppliesOnlyToTheStillActiveAccount() {
        XCTAssertTrue(AuthManager.appliesRefreshedSession(refreshedUserId: "a", currentActiveUserId: "a"))
        XCTAssertFalse(AuthManager.appliesRefreshedSession(refreshedUserId: "a", currentActiveUserId: nil))
        XCTAssertFalse(AuthManager.appliesRefreshedSession(refreshedUserId: "a", currentActiveUserId: "b"))
    }

    // MARK: - Le comportement

    func test_applySession_anotherUser_isRefused_beforeAnyWrite() throws {
        let auth = AuthManager.shared
        try auth.applySession(token: "tok-a", sessionToken: "sess-a", user: makeUser("user-a"))

        XCTAssertThrowsError(try auth.applySession(token: "tok-b", sessionToken: "sess-b", user: makeUser("user-b"))) { error in
            XCTAssertEqual(error as? SessionReplacementRefused,
                           SessionReplacementRefused(activeUserId: "user-a", incomingUserId: "user-b"))
        }

        XCTAssertEqual(auth.activeAccountId, "user-a")
        XCTAssertEqual(auth.currentUser?.id, "user-a")
        XCTAssertEqual(APIClient.shared.authToken, "tok-a")
        XCTAssertFalse(auth.hasPreservedSession(for: "user-b"), "rien du compte refusé n'est écrit au trousseau")
    }

    /// La porte publique non levante refuse aussi, le dit, et rend son verdict.
    func test_openSession_anotherUser_isRefused_andSaysSo() throws {
        let auth = AuthManager.shared
        try auth.applySession(token: "tok-a", sessionToken: "sess-a", user: makeUser("user-a"))
        auth.errorMessage = nil

        let opened = auth.openSession(EmailProvenSession(token: "tok-b", sessionToken: "sess-b", user: makeUser("user-b")))

        XCTAssertFalse(opened, "l'appelant n'annonce aucun succès")
        XCTAssertEqual(auth.activeAccountId, "user-a")
        XCTAssertEqual(APIClient.shared.authToken, "tok-a")
        XCTAssertNotNil(auth.errorMessage)
    }

    func test_openSession_withoutAnOpenSession_postsIt_andSaysSo() {
        let auth = AuthManager.shared

        let opened = auth.openSession(EmailProvenSession(token: "tok-b", sessionToken: "sess-b", user: makeUser("user-b")))

        XCTAssertTrue(opened)
        XCTAssertEqual(auth.activeAccountId, "user-b")
    }

    /// Plus de dérogation (#10450) : même pendant un changement de compte,
    /// la session ouverte refuse l'autre utilisateur tant qu'elle n'est pas
    /// démontée.
    func test_applySession_anotherUser_duringAnAccountSwitch_isStillRefused() throws {
        let auth = AuthManager.shared
        try auth.applySession(token: "tok-a", sessionToken: "sess-a", user: makeUser("user-a"))
        auth.isSwitchingAccount = true

        XCTAssertThrowsError(try auth.applySession(token: "tok-b", sessionToken: "sess-b", user: makeUser("user-b"), origin: .login))

        XCTAssertEqual(auth.activeAccountId, "user-a")
        XCTAssertEqual(APIClient.shared.authToken, "tok-a")
    }

    /// Une fois la session ouverte DÉMONTÉE (ce que fait `suspendActiveSession`),
    /// l'autre utilisateur se pose comme une première connexion.
    func test_applySession_afterTheOpenSessionIsLeft_installsTheOtherUser() throws {
        let auth = AuthManager.shared
        try auth.applySession(token: "tok-a", sessionToken: "sess-a", user: makeUser("user-a"))
        auth.activeUserId = nil
        auth.isAuthenticated = false

        try auth.applySession(token: "tok-b", sessionToken: "sess-b", user: makeUser("user-b"), origin: .login)

        XCTAssertEqual(auth.activeAccountId, "user-b")
        XCTAssertEqual(auth.currentUser?.id, "user-b")
        XCTAssertEqual(APIClient.shared.authToken, "tok-b")
        XCTAssertTrue(auth.isAuthenticated)
    }

    // MARK: - #10450 R1 — le lien n'installe que sur une session démontée

    /// Le témoin de l'audit : une session ouverte dont le compte actif est
    /// INCONNU. `suspendActiveSession` n'a rien à quitter, la session reste
    /// ouverte — l'ancien drapeau posait pourtant l'autre utilisateur par-dessus.
    func test_switchToProvenAccount_overAnOpenSessionWithUnknownActive_installsNothing() async {
        let auth = AuthManager.shared
        auth.isAuthenticated = true
        auth.currentUser = makeUser("ghost")
        APIClient.shared.authToken = "tok-ghost"
        let proven = EmailProvenSession(token: "tok-b", sessionToken: "sess-b", user: makeUser("user-b"))

        let switched = await auth.switchToProvenAccount(proven)

        XCTAssertFalse(switched)
        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertNil(auth.activeAccountId, "rien n'est devenu le compte actif")
        XCTAssertEqual(auth.currentUser?.id, "ghost")
        XCTAssertEqual(APIClient.shared.authToken, "tok-ghost")
        XCTAssertFalse(auth.hasPreservedSession(for: "user-b"), "rien du compte du lien n'est écrit au trousseau")
        XCTAssertEqual(authService.loggedOutTokens, ["tok-b"], "la session prouvée est refermée côté passerelle")
        XCTAssertFalse(auth.isSwitchingAccount)
    }

    /// Deux acceptations rapprochées : la seconde n'attend pas que la première
    /// ait posé sa session pour poser la sienne par-dessus — elle est refermée.
    func test_switchToProvenAccount_whileAnotherSwitchIsUnderway_installsNothing() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: "tok-a", sessionToken: "sess-a", user: makeUser("user-a"))
        auth.isSwitchingAccount = true
        let proven = EmailProvenSession(token: "tok-c", sessionToken: "sess-c", user: makeUser("user-c"))

        let switched = await auth.switchToProvenAccount(proven)

        XCTAssertFalse(switched)
        XCTAssertEqual(auth.activeAccountId, "user-a")
        XCTAssertEqual(APIClient.shared.authToken, "tok-a")
        XCTAssertFalse(auth.hasPreservedSession(for: "user-c"))
        XCTAssertEqual(authService.loggedOutTokens, ["tok-c"])
        XCTAssertTrue(auth.isSwitchingAccount, "le changement en cours garde la main")
    }

    // MARK: - #10450 R8 — la session prouvée refusée se referme, avec réessais

    func test_discardProvenSession_retriesUntilTheGatewayCloses() async {
        authService.logoutFailuresBeforeSuccess = 1
        let proven = EmailProvenSession(token: "tok-b", sessionToken: "sess-b", user: makeUser("user-b"))

        await AuthManager.shared.discardProvenSession(proven)

        XCTAssertEqual(authService.loggedOutTokens, ["tok-b", "tok-b"], "un échec passager ne laisse pas la session ouverte au serveur")
        XCTAssertNil(AuthManager.shared.activeAccountId, "refuser n'écrit rien sur l'appareil")
    }

    // MARK: - #10450 R2 — un rafraîchissement ne réinstalle pas le compte quitté

    func test_refreshSession_ofAnAccountLeftDuringTheCall_isAbandoned() async throws {
        let auth = AuthManager.shared
        try auth.applySession(token: "tok-a", sessionToken: "sess-a", user: makeUser("user-a"))
        authService.refreshedUser = makeUser("user-a")
        authService.holdsRefresh = true

        let refresh = Task { try await auth.refreshSession(force: true) }
        while authService.refreshCallCount == 0 { await Task.yield() }
        // Le compte A est quitté pendant l'appel (changement de compte gardé).
        auth.activeUserId = nil
        auth.isAuthenticated = false
        APIClient.shared.authToken = nil
        authService.releaseRefresh()

        do {
            _ = try await refresh.value
            XCTFail("la session rafraîchie d'un compte quitté n'est pas rendue")
        } catch {
            XCTAssertFalse(error is MeeshyError, "un abandon n'efface pas les jetons du compte gardé")
        }

        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertNil(auth.activeAccountId)
        XCTAssertNil(APIClient.shared.authToken)
        XCTAssertEqual(auth.keychain.load(forKey: auth.tokenKey(for: "user-a"), account: nil), "tok-a",
                       "le compte gardé au sélecteur garde sa session")
    }
}

/// Un double de la passerelle : un rafraîchissement qu'on peut RETENIR, et une
/// déconnexion qui échoue un nombre donné de fois.
private final class ReplacementGuardAuthService: AuthServiceProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var _loggedOutTokens: [String] = []
    private var _logoutFailuresBeforeSuccess = 0
    private var _refreshCallCount = 0
    private var _holdsRefresh = false
    private var _refreshedUser: MeeshyUser?

    private func locked<T>(_ body: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body()
    }

    var loggedOutTokens: [String] { locked { _loggedOutTokens } }
    var refreshCallCount: Int { locked { _refreshCallCount } }
    var logoutFailuresBeforeSuccess: Int {
        get { locked { _logoutFailuresBeforeSuccess } }
        set { locked { _logoutFailuresBeforeSuccess = newValue } }
    }
    var holdsRefresh: Bool {
        get { locked { _holdsRefresh } }
        set { locked { _holdsRefresh = newValue } }
    }
    var refreshedUser: MeeshyUser? {
        get { locked { _refreshedUser } }
        set { locked { _refreshedUser = newValue } }
    }

    func releaseRefresh() { holdsRefresh = false }

    func logoutThrowing(token: String) async throws {
        let fails: Bool = locked {
            _loggedOutTokens.append(token)
            guard _logoutFailuresBeforeSuccess > 0 else { return false }
            _logoutFailuresBeforeSuccess -= 1
            return true
        }
        if fails { throw MeeshyError.network(.noConnection) }
    }

    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        locked { _refreshCallCount += 1 }
        while holdsRefresh { try await Task.sleep(nanoseconds: 5_000_000) }
        guard let user = refreshedUser else { throw MeeshyError.network(.noConnection) }
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

private final class ReplacementGuardKeychainStore: KeychainStoring, @unchecked Sendable {
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
