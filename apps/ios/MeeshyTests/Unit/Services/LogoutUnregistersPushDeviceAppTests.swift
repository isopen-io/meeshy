import XCTest
@testable import MeeshySDK

/// ios-systeme-1 (#18911) — le bout en bout : « Déconnexion » retire les jetons
/// push de l'appareil côté passerelle, SOUS le jeton du compte qui part, AVANT
/// de fermer sa session.
///
/// L'hôte applicatif seul permet la cascade complète de sortie de session (elle
/// atteint `UNUserNotificationCenter`, absent de l'hôte SPM) ; l'ordre, les
/// reprises et le fil sont témoignés côté SDK (`LogoutUnregistersPushDeviceTests`).
@MainActor
final class LogoutUnregistersPushDeviceAppTests: XCTestCase {

    private var originalAuthService: AuthServiceProviding!
    private var originalKeychain: (any KeychainStoring)!
    private var service: PushUnregisterRecordingAuthService!

    override func setUp() async throws {
        try await super.setUp()
        originalAuthService = AuthManager.shared.authService
        service = PushUnregisterRecordingAuthService()
        AuthManager.shared.authService = service
        originalKeychain = AuthManager.shared.keychain
        AuthManager.shared.keychain = PushUnregisterKeychain()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        await AuthManager.shared.logout()
        service.reset()
    }

    override func tearDown() async throws {
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        await AuthManager.shared.logout()
        AuthManager.shared.savedAccounts.forEach { AuthManager.shared.removeSavedAccount(userId: $0.id) }
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        try await super.tearDown()
    }

    private static let alice = MeeshyUser(id: "push-alice", username: "alice", email: "alice@test.io", displayName: "Alice")
    private static let bob = MeeshyUser(id: "push-bob", username: "bob", email: "bob@test.io", displayName: "Bob")

    private var auth: AuthManager { AuthManager.shared }

    private func signIn(_ user: MeeshyUser, token: String, keepSignedIn: Bool = true) async {
        service.loginResult = .success(LoginResponseData(
            user: user, token: token, sessionToken: "s-\(token)", expiresIn: 3600, requires2FA: nil, twoFactorToken: nil
        ))
        await auth.login(username: user.username, password: "secret", keepSignedIn: keepSignedIn)
    }

    private func waitForEvents(_ count: Int) async {
        var turns = 0
        while service.events.count < count, turns < 400 {
            turns += 1
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    func test_logout_unregistersThePushDevice_beforeClosingTheSession() async {
        await signIn(Self.alice, token: "T-A")
        let installation = PushDeviceIdentity.current(keychain: auth.keychain).deviceId
        XCTAssertNotNil(installation)

        await auth.logout()
        await waitForEvents(2)

        XCTAssertEqual(service.events, ["unregister:\(installation ?? "?"):T-A", "logout:T-A"],
                       "les jetons APNs et VoIP de l'installation partent d'abord, sous le jeton de A")
    }

    /// Audit du lot : le retrait différé (reprises à +1 s et +5 s, chacune jusqu'à
    /// 60 s) partait encore sous T-A1 après que A s'était reconnecté, et effaçait
    /// les jetons que la nouvelle session venait d'enregistrer.
    func test_logout_thenReconnectingTheSameAccount_sendsNoLateUnregistrationUnderTheOldToken() async {
        service.unregisterFailures = [.network(.timeout)]
        await signIn(Self.alice, token: "T-A1")

        await auth.logout()
        await waitForEvents(1)
        await signIn(Self.alice, token: "T-A2")
        let afterReconnection = service.events.count
        try? await Task.sleep(for: .seconds(2))

        XCTAssertFalse(service.events.dropFirst(afterReconnection).contains { $0.hasPrefix("unregister:") },
                       "aucun retrait ne part sous T-A1 une fois A reconnecté. Événements : \(service.events)")
    }

    func test_switchAccount_toAKeptSession_leavesThePushTokensRegistered() async {
        await signIn(Self.alice, token: "T-A")
        await auth.suspendActiveSession()
        await signIn(Self.bob, token: "T-B")
        service.reset()

        let switched = await auth.switchAccount(to: Self.alice.id)
        try? await Task.sleep(for: .milliseconds(100))

        XCTAssertTrue(switched)
        XCTAssertEqual(service.events, [],
                       "A garde sa session : ses pushes restent prévus (leur adressage sous B relève de #8668)")
    }
}

// MARK: - Doubles

private final class PushUnregisterRecordingAuthService: AuthServiceProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var _events: [String] = []
    private var _unregisterFailures: [MeeshyError] = []
    var loginResult: Result<LoginResponseData, Error> = .failure(MeeshyError.network(.noConnection))

    var events: [String] { lock.withLock { _events } }
    var unregisterFailures: [MeeshyError] {
        get { lock.withLock { _unregisterFailures } }
        set { lock.withLock { _unregisterFailures = newValue } }
    }
    func reset() { lock.withLock { _events = [] } }

    func unregisterPushDevice(deviceId: String, token: String) async throws {
        let failure: MeeshyError? = lock.withLock {
            _events.append("unregister:\(deviceId):\(token)")
            return _unregisterFailures.isEmpty ? nil : _unregisterFailures.removeFirst()
        }
        if let failure { throw failure }
    }

    func logoutThrowing(token: String) async throws {
        lock.withLock { _events.append("logout:\(token)") }
    }

    func login(username: String, password: String, rememberDevice: Bool) async throws -> LoginResponseData {
        try loginResult.get()
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
    func checkAvailability(username: String?, email: String?, phone: String?) async throws -> AvailabilityResponse { throw MeeshyError.network(.noConnection) }
    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData { throw MeeshyError.network(.noConnection) }
    func me() async throws -> MeeshyUser { throw MeeshyError.network(.noConnection) }
    func logout() async {}
}

private final class PushUnregisterKeychain: KeychainStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws { lock.withLock { store[key] = value } }
    func load(forKey key: String, account: String?) -> String? { lock.withLock { store[key] } }
    func delete(forKey key: String, account: String?) { lock.withLock { _ = store.removeValue(forKey: key) } }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws { try save(value, forKey: key, account: account) }
    func loadAsync(forKey key: String, account: String?) async -> String? { load(forKey: key, account: account) }
}
