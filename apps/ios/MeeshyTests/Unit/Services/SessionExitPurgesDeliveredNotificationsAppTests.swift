import XCTest
@testable import MeeshySDK

/// ios-systeme-2 (#18911) — le bout en bout : la sortie de session vide le
/// Centre de notifications quand elle termine la session ou retire le compte
/// actif, et jamais quand elle ne fait que changer de compte.
///
/// L'hôte applicatif seul permet la cascade complète de sortie de session ; la
/// loi et le coordinateur sont témoignés côté SDK (`SessionExitNotificationPurgeTests`).
@MainActor
final class SessionExitPurgesDeliveredNotificationsAppTests: XCTestCase {

    private var originalAuthService: AuthServiceProviding!
    private var originalKeychain: (any KeychainStoring)!
    private var originalPurger: (any DeliveredNotificationsPurging)!
    private var stub: PurgeStubAuthService!
    private var purger: PurgeCountingCenter!

    override func setUp() async throws {
        try await super.setUp()
        originalAuthService = AuthManager.shared.authService
        stub = PurgeStubAuthService()
        AuthManager.shared.authService = stub
        originalKeychain = AuthManager.shared.keychain
        AuthManager.shared.keychain = PurgeKeychain()
        originalPurger = NotificationCoordinator.shared.deliveredNotificationsPurger
        purger = PurgeCountingCenter()
        NotificationCoordinator.shared.deliveredNotificationsPurger = purger
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        await AuthManager.shared.logout()
        purger.reset()
    }

    override func tearDown() async throws {
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        await AuthManager.shared.logout()
        AuthManager.shared.savedAccounts.forEach { AuthManager.shared.removeSavedAccount(userId: $0.id) }
        NotificationCoordinator.shared.deliveredNotificationsPurger = originalPurger
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        try await super.tearDown()
    }

    private static let alice = MeeshyUser(id: "purge-alice", username: "alice", email: "alice@test.io", displayName: "Alice")
    private static let bob = MeeshyUser(id: "purge-bob", username: "bob", email: "bob@test.io", displayName: "Bob")

    private var auth: AuthManager { AuthManager.shared }

    private func signIn(_ user: MeeshyUser, token: String, keepSignedIn: Bool = true) async {
        stub.loginResult = .success(LoginResponseData(
            user: user, token: token, sessionToken: "s-\(token)", expiresIn: 3600, requires2FA: nil, twoFactorToken: nil
        ))
        await auth.login(username: user.username, password: "secret", keepSignedIn: keepSignedIn)
    }

    func test_logout_emptiesTheNotificationCenter() async {
        await signIn(Self.alice, token: "tA")

        await auth.logout()

        XCTAssertEqual(purger.deliveredRemovals, 1, "les aperçus de A ne restent ni à l'écran verrouillé ni au Centre")
        XCTAssertEqual(purger.pendingRemovals, 1)
    }

    func test_switchAccount_toAKeptSession_leavesTheNotificationCenterAlone() async {
        await signIn(Self.alice, token: "tA")
        await auth.suspendActiveSession()
        await signIn(Self.bob, token: "tB")
        purger.reset()

        let switched = await auth.switchAccount(to: Self.alice.id)

        XCTAssertTrue(switched)
        XCTAssertEqual(purger.deliveredRemovals, 0, "A garde sa session : ses bannières restent adressables")
        XCTAssertEqual(purger.pendingRemovals, 0)
    }

    /// Audit du lot : une session close par le SERVEUR (mot de passe changé,
    /// « déconnecter tous les appareils », action admin) ne passe pas par
    /// `leaveActiveSession` — ses aperçus restaient et passaient sous le compte suivant.
    func test_sessionRevokedByTheServer_emptiesTheNotificationCenter() async {
        await signIn(Self.alice, token: "tA")
        purger.reset()
        PushNotificationManager.shared.deviceToken = "apns-of-the-revoked-session"
        defer { auth.acknowledgeSessionRevocationNotice() }

        auth.handleSessionRevoked(reason: .unknown)

        XCTAssertEqual(purger.deliveredRemovals, 1, "les aperçus de A ne restent pas sous l'écran de reconnexion")
        XCTAssertEqual(purger.pendingRemovals, 1)
        XCTAssertNil(PushNotificationManager.shared.deviceToken,
                     "le jeton APNs de la session close est oublié : la reconnexion le réenregistre")
    }

    func test_retireDeletedAccount_ofTheActiveAccount_emptiesTheNotificationCenter() async {
        await signIn(Self.alice, token: "tA")
        purger.reset()

        let retired = await auth.retireDeletedAccount(userId: Self.alice.id)

        XCTAssertTrue(retired)
        XCTAssertEqual(purger.deliveredRemovals, 1)
        XCTAssertEqual(purger.pendingRemovals, 1)
    }
}

// MARK: - Doubles

private final class PurgeCountingCenter: DeliveredNotificationsPurging, @unchecked Sendable {
    private let lock = NSLock()
    private var _delivered = 0
    private var _pending = 0
    var deliveredRemovals: Int { lock.withLock { _delivered } }
    var pendingRemovals: Int { lock.withLock { _pending } }
    func reset() { lock.withLock { _delivered = 0; _pending = 0 } }
    func removeAllDeliveredNotifications() { lock.withLock { _delivered += 1 } }
    func removeAllPendingNotificationRequests() { lock.withLock { _pending += 1 } }
}

private final class PurgeStubAuthService: AuthServiceProviding, @unchecked Sendable {
    var loginResult: Result<LoginResponseData, Error> = .failure(MeeshyError.network(.noConnection))

    func login(username: String, password: String, rememberDevice: Bool) async throws -> LoginResponseData { try loginResult.get() }
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
    func checkAvailability(username: String?, email: String?, phone: String?) async throws -> AvailabilityResponse { throw MeeshyError.network(.noConnection) }
    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData { throw MeeshyError.network(.noConnection) }
    func me() async throws -> MeeshyUser { throw MeeshyError.network(.noConnection) }
    func logout() async {}
}

private final class PurgeKeychain: KeychainStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws { lock.withLock { store[key] = value } }
    func load(forKey key: String, account: String?) -> String? { lock.withLock { store[key] } }
    func delete(forKey key: String, account: String?) { lock.withLock { _ = store.removeValue(forKey: key) } }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws { try save(value, forKey: key, account: account) }
    func loadAsync(forKey key: String, account: String?) async -> String? { load(forKey: key, account: account) }
}
