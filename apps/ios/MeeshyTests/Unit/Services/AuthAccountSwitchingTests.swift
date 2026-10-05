import XCTest
@testable import MeeshySDK

/// **Plusieurs comptes sur l'appareil (#8286).**
///
/// Le vrai `AuthManager.shared`, ses deux coutures (`authService`, `keychain`)
/// bouchonnées, la cascade complète de sortie de session comprise — c'est ce
/// que l'hôte applicatif permet et que l'hôte SPM ne permet pas (la cascade y
/// atteint `UNUserNotificationCenter`).
///
/// Ce qui est prouvé : le premier compte est gardé sans question ; la case
/// « Rester connecté » n'est proposée qu'au compte supplémentaire ; on passe
/// d'un compte gardé à l'autre et retour SANS mot de passe ; un compte non
/// gardé est fermé quand on le quitte ; « Déconnexion » garde le compte listé
/// mais exige de nouveau le mot de passe.
@MainActor
final class AuthAccountSwitchingTests: XCTestCase {

    private var originalAuthService: AuthServiceProviding!
    private var stub: AccountSwitchStubAuthService!
    private var originalKeychain: (any KeychainStoring)!

    override func setUp() async throws {
        try await super.setUp()
        originalAuthService = AuthManager.shared.authService
        stub = AccountSwitchStubAuthService()
        AuthManager.shared.authService = stub
        originalKeychain = AuthManager.shared.keychain
        AuthManager.shared.keychain = AccountSwitchKeychain()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        await AuthManager.shared.logout()
        AuthManager.shared.savedAccounts.forEach { AuthManager.shared.removeSavedAccount(userId: $0.id) }
    }

    override func tearDown() async throws {
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        await AuthManager.shared.logout()
        AuthManager.shared.savedAccounts.forEach { AuthManager.shared.removeSavedAccount(userId: $0.id) }
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        try await super.tearDown()
    }

    // MARK: - Fixtures

    private static let alice = MeeshyUser(id: "acct-alice", username: "alice", email: "alice@test.io", displayName: "Alice")
    private static let bob = MeeshyUser(id: "acct-bob", username: "bob", email: "bob@test.io", displayName: "Bob")

    private func signIn(_ user: MeeshyUser, token: String, keepSignedIn: Bool = true) async {
        stub.loginResult = .success(LoginResponseData(
            user: user, token: token, sessionToken: "s-\(token)", expiresIn: 3600, requires2FA: nil, twoFactorToken: nil
        ))
        await AuthManager.shared.login(username: user.username, password: "secret", keepSignedIn: keepSignedIn)
    }

    private var auth: AuthManager { AuthManager.shared }

    // MARK: - Le premier compte

    func test_login_firstAccount_keepsItsSessionWithoutAsking() async {
        XCTAssertFalse(auth.offersKeepSignedIn, "rien à proposer au premier compte")

        await signIn(Self.alice, token: "tA")

        XCTAssertEqual(auth.savedAccounts.first?.keepsSession, true)
        XCTAssertTrue(auth.hasPreservedSession(for: Self.alice.id))
    }

    // MARK: - La case « Rester connecté »

    func test_suspendActiveSession_keepsTheAccountAndOffersTheCheckbox() async {
        await signIn(Self.alice, token: "tA")

        await auth.suspendActiveSession()

        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertTrue(auth.hasPreservedSession(for: Self.alice.id))
        XCTAssertTrue(auth.offersKeepSignedIn)
    }

    func test_login_keepSignedInOff_sendsRememberDeviceFalse() async {
        await signIn(Self.alice, token: "tA")
        await auth.suspendActiveSession()

        await signIn(Self.bob, token: "tB", keepSignedIn: false)

        XCTAssertEqual(stub.rememberDeviceValues.last, false)
        XCTAssertEqual(auth.savedAccounts.first { $0.id == Self.bob.id }?.keepsSession, false)
    }

    // MARK: - Changer de compte

    func test_switchAccount_betweenPreservedAccounts_needsNoPassword_andComesBack() async {
        await signIn(Self.alice, token: "tA")
        await auth.suspendActiveSession()
        await signIn(Self.bob, token: "tB")
        let loginsBefore = stub.loginCallCount

        let toAlice = await auth.switchAccount(to: Self.alice.id)

        XCTAssertTrue(toAlice)
        XCTAssertEqual(auth.currentUser?.id, Self.alice.id)
        XCTAssertEqual(auth.authToken, "tA")
        XCTAssertTrue(auth.isAuthenticated)

        let toBob = await auth.switchAccount(to: Self.bob.id)

        XCTAssertTrue(toBob)
        XCTAssertEqual(auth.currentUser?.id, Self.bob.id)
        XCTAssertEqual(auth.authToken, "tB")
        XCTAssertEqual(stub.loginCallCount, loginsBefore, "aucune bascule ne repasse par le mot de passe")
        XCTAssertFalse(auth.isSwitchingAccount)
    }

    func test_switchAccount_leavingAnAccountNotKept_endsItsSession() async {
        await signIn(Self.alice, token: "tA")
        await auth.suspendActiveSession()
        await signIn(Self.bob, token: "tB", keepSignedIn: false)

        _ = await auth.switchAccount(to: Self.alice.id)

        XCTAssertFalse(auth.hasPreservedSession(for: Self.bob.id))
        let bobAgain = await auth.switchAccount(to: Self.bob.id)
        XCTAssertFalse(bobAgain, "revenir à un compte non gardé exige le mot de passe")
        XCTAssertEqual(auth.currentUser?.id, Self.alice.id, "un refus laisse le compte actuel en place")
    }

    // MARK: - Déconnexion

    func test_logoutKeepingAccount_listsItButRequiresThePasswordAgain() async {
        await signIn(Self.alice, token: "tA")

        await auth.logout(forgettingAccount: false)

        XCTAssertEqual(auth.savedAccounts.map(\.id), [Self.alice.id])
        XCTAssertFalse(auth.hasPreservedSession(for: Self.alice.id))
        let back = await auth.switchAccount(to: Self.alice.id)
        XCTAssertFalse(back)
    }
}

// MARK: - Doubles

private final class AccountSwitchStubAuthService: AuthServiceProviding, @unchecked Sendable {
    private let lock = NSLock()
    var loginResult: Result<LoginResponseData, Error> = .failure(MeeshyError.network(.noConnection))
    private var _rememberDeviceValues: [Bool] = []
    var rememberDeviceValues: [Bool] { lock.withLock { _rememberDeviceValues } }
    var loginCallCount: Int { lock.withLock { _rememberDeviceValues.count } }

    func login(username: String, password: String, rememberDevice: Bool) async throws -> LoginResponseData {
        lock.withLock { _rememberDeviceValues.append(rememberDevice) }
        return try loginResult.get()
    }
    func completeLoginWith2FA(twoFactorToken: String, code: String) async throws -> LoginResponseData { throw MeeshyError.network(.noConnection) }
    func register(request: RegisterRequest) async throws -> LoginResponseData { throw MeeshyError.network(.noConnection) }
    func requestMagicLink(email: String, deviceFingerprint: String?) async throws -> Int { 0 }
    func validateMagicLink(token: String) async throws -> LoginResponseData { throw MeeshyError.network(.noConnection) }
    func requestPasswordReset(email: String) async throws {}
    func resetPassword(token: String, newPassword: String) async throws {}
    func sendPhoneCode(phoneNumber: String) async throws {}
    func verifyPhone(phoneNumber: String, code: String) async throws -> VerifyPhoneResponse { throw MeeshyError.network(.noConnection) }
    func verifyEmail(code: String) async throws {}
    func verifyEmailWithCode(code: String, email: String) async throws {}
    func resendVerificationEmail(email: String) async throws {}
    func confirmEmail(_ request: EmailVerificationRequest) async throws -> LoginResponseData { throw MeeshyError.network(.noConnection) }
    func checkAvailability(username: String?, email: String?, phone: String?) async throws -> AvailabilityResponse { throw MeeshyError.network(.noConnection) }
    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData { throw MeeshyError.network(.noConnection) }
    func me() async throws -> MeeshyUser { throw MeeshyError.network(.noConnection) }
    func logout() async {}
}

private final class AccountSwitchKeychain: KeychainStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws { lock.withLock { store[key] = value } }
    func load(forKey key: String, account: String?) -> String? { lock.withLock { store[key] } }
    func delete(forKey key: String, account: String?) { lock.withLock { _ = store.removeValue(forKey: key) } }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws { try save(value, forKey: key, account: account) }
    func loadAsync(forKey key: String, account: String?) async -> String? { load(forKey: key, account: account) }
}
