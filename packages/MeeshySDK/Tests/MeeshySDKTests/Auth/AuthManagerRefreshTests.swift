import XCTest
import Combine
@testable import MeeshySDK

@MainActor
final class AuthManagerRefreshTests: XCTestCase {
    private var originalAuthService: AuthServiceProviding!
    private var mockAuthService: MockAuthServiceForManager!
    private var originalKeychain: (any KeychainStoring)!
    private var mockKeychain: InMemoryKeychainStore!

    override func setUp() async throws {
        try await super.setUp()

        // Purge toute tâche de refresh laissée en vol par une activité de fond :
        // `handleUnauthorized()` poste un `Task` fire-and-forget à chaque 401, et
        // celui-ci appelle le service stubbé — donc incrémente `refreshTokenCallCount`
        // sans rapport avec ce test, et occupe `tokenRefreshTask` que la garde de
        // sérialisation de `refreshSession` respecte. C'est ce qui faisait compter
        // 2 ou 3 appels là où le test n'en émet qu'un. Le seam existe pour ça et
        // `MeeshyTests/AuthServiceTests` l'utilise déjà ; cette suite l'ignorait.
        AuthManager.shared.cancelPendingTokenRefreshForTesting()

        originalAuthService = AuthManager.shared.authService
        mockAuthService = MockAuthServiceForManager()
        AuthManager.shared.authService = mockAuthService

        // `KeychainManager` (the production default) is not entitled inside
        // the SPM xctest host: every save/load silently no-ops, so
        // `applySession` can never persist a token and `refreshSession`
        // short-circuits with `sessionExpired` before it ever reaches the
        // mock auth service. Swapping in an in-memory store makes the real
        // `AuthManager.shared` round trip through `applySession` →
        // `refreshSession` actually exercisable.
        originalKeychain = AuthManager.shared.keychain
        mockKeychain = InMemoryKeychainStore()
        AuthManager.shared.keychain = mockKeychain
    }

    override func tearDown() async throws {
        await AuthManager.shared.logout()
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        try await super.tearDown()
    }

    func testConcurrentRefreshSerializesCalls() async throws {
        // 1. Setup a valid session first
        let user = MeeshyUser(
            id: "user-123", username: "testuser", email: "test@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
        AuthManager.shared.applySession(token: "expired-token", sessionToken: "session-abc", user: user)

        // 2. Perform 5 concurrent refreshes.
        //
        // Deux corrections indépendantes, toutes deux nécessaires :
        //
        // (a) La porte retient le premier appel réseau EN VOL. Tant qu'elle est
        //     fermée, `tokenRefreshTask` reste non-nil, donc les appelants qui
        //     entrent ensuite coalescent réellement au lieu de dépendre de
        //     l'ordonnancement du groupe.
        // (b) L'assertion porte sur le TOKEN présenté, pas sur le compteur
        //     global. C'est ce dernier qui faisait échouer le test en CI
        //     (« (2) is not equal to (1) ») : il additionne les appels de ce
        //     test et ceux qu'une activité de fond déclenche sur le même
        //     singleton — un 401 ailleurs poste un refresh fire-and-forget qui
        //     frappe ce stub. Le nombre variait donc avec la charge (2 en CI,
        //     jusqu'à 4 en local) sans qu'aucun défaut produit soit en cause.
        mockAuthService.stubbedToken = "refreshed-jwt-success"
        mockAuthService.holdsUntilReleased = true
        // `applySession` ci-dessus peut avoir réveillé un refresh de fond ;
        // on ne mesure que les appels émis par ce test.
        AuthManager.shared.cancelPendingTokenRefreshForTesting()
        mockAuthService.refreshTokenCallCount = 0

        let mock = mockAuthService!
        let result = try await withThrowingTaskGroup(of: String?.self) { group -> [String] in
            for _ in 0..<5 {
                group.addTask {
                    try await AuthManager.shared.refreshSession(force: true)
                }
            }
            // Tâche de contrôle : ouvre la porte une fois le premier refresh
            // en vol et les autres appelants entrés. Reste DANS le groupe pour
            // que rien ne survive au test (une `Task` détachée finissant après
            // le teardown fait remonter des exceptions sans rapport).
            group.addTask {
                var waited = 0
                while mock.refreshCallCount(forToken: "expired-token") == 0 && waited < 2_000 {
                    try await Task.sleep(nanoseconds: 1_000_000)
                    waited += 1
                }
                // Fenêtre COURTE : chaque milliseconde passée porte ouverte est
                // une milliseconde pendant laquelle un refresh de fond (401 →
                // `handleUnauthorized`) peut frapper le service stubbé et gonfler
                // le compteur. 20 ms suffisent aux quatre autres appelants pour
                // sauter sur le MainActor et trouver la tâche partagée.
                try await Task.sleep(nanoseconds: 20_000_000)
                await mock.gate.open()
                return nil
            }

            var tokens: [String] = []
            for try await token in group {
                if let token { tokens.append(token) }
            }
            return tokens
        }

        // 3. Verify they all got the same refreshed token
        XCTAssertEqual(result.count, 5)
        for token in result {
            XCTAssertEqual(token, "refreshed-jwt-success")
        }

        // 4. Verify only exactly 1 refresh call was made to the authService
        // Un seul appel réseau pour rafraîchir CE token, quels que soient les
        // refresh de fond concomitants (ils présentent un autre token).
        XCTAssertEqual(mockAuthService.refreshCallCount(forToken: "expired-token"), 1)
    }

    func testConcurrentRefreshPropagatesErrors() async throws {
        // 1. Setup a valid session first
        let user = MeeshyUser(
            id: "user-123", username: "testuser", email: "test@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
        AuthManager.shared.applySession(token: "expired-token", sessionToken: "session-abc", user: user)

        // 2. Mock service to fail
        mockAuthService.errorToThrow = MeeshyError.auth(.sessionExpired)

        // 3. Perform concurrent refreshes and verify they all fail
        do {
            try await withThrowingTaskGroup(of: String.self) { group in
                for _ in 0..<5 {
                    group.addTask {
                        return try await AuthManager.shared.refreshSession(force: true)
                    }
                }
                for try await _ in group {}
            }
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.sessionExpired) = error {
                // expected
            } else {
                XCTFail("Expected sessionExpired, got \(error)")
            }
        }

        // 4. Verify only exactly 1 refresh call was made to the authService
        XCTAssertEqual(mockAuthService.refreshTokenCallCount, 1)
    }
}

// MARK: - Stub conforming to AuthServiceProviding
//
// The production `AuthService` is `final`, so we conform to the protocol
// directly instead of subclassing. Only the methods this suite exercises
// (`refreshToken`) record state; the rest throw to flag accidental use.

/// Porte asynchrone : maintient le premier `refreshToken` EN VOL jusqu'à ce que
/// le test l'ouvre. Sans elle, le coalescing n'est pas réellement exercé — il
/// suffit que le premier refresh se termine avant que la tâche suivante ne soit
/// ordonnancée (CI chargée) pour qu'un second appel réseau parte légitimement.
private actor ReleaseGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        isOpen = true
        let pending = waiters
        waiters = []
        for waiter in pending { waiter.resume() }
    }
}

private final class MockAuthServiceForManager: AuthServiceProviding, @unchecked Sendable {
    private let queue = DispatchQueue(label: "MockAuthServiceForManager.lock")
    private var _refreshTokenCallCount = 0
    var refreshTokenCallCount: Int {
        get { queue.sync { _refreshTokenCallCount } }
        set { queue.sync { _refreshTokenCallCount = newValue } }
    }
    var refreshTokenDelayMs: UInt64 = 100
    var stubbedToken = "refreshed-jwt"
    var errorToThrow: Error?

    /// Quand `true`, `refreshToken` attend `gate.open()` au lieu de dormir.
    let gate = ReleaseGate()
    private var _holdsUntilReleased = false
    var holdsUntilReleased: Bool {
        get { queue.sync { _holdsUntilReleased } }
        set { queue.sync { _holdsUntilReleased = newValue } }
    }

    /// Tokens présentés à chaque appel. Le compteur global ne distingue pas les
    /// appels émis par le test de ceux qu'une activité de fond déclenche (401 →
    /// `handleUnauthorized` → refresh fire-and-forget sur ce même stub, cf.
    /// `AuthManager.cancelPendingTokenRefreshForTesting`) ; le token présenté,
    /// lui, les sépare : le test part d'un token connu, les refresh ultérieurs
    /// portent celui déjà rafraîchi.
    private var _presentedTokens: [String] = []
    func refreshCallCount(forToken token: String) -> Int {
        queue.sync { _presentedTokens.filter { $0 == token }.count }
    }

    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        queue.sync {
            _refreshTokenCallCount += 1
            _presentedTokens.append(currentToken)
        }
        if holdsUntilReleased {
            await gate.wait()
        } else {
            try await Task.sleep(nanoseconds: refreshTokenDelayMs * 1_000_000)
        }
        if let error = errorToThrow {
            throw error
        }

        let user = MeeshyUser(
            id: "user-123", username: "testuser", email: "test@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
        return LoginResponseData(
            user: user,
            token: stubbedToken,
            sessionToken: "new-session",
            expiresIn: 3600,
            requires2FA: nil,
            twoFactorToken: nil
        )
    }

    // MARK: Unused conformances — fail loudly if accidentally hit.

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

// MARK: - In-memory KeychainStoring for AuthManager isolation
//
// The real `KeychainManager` requires a keychain-access entitlement the SPM
// xctest host doesn't have, so every save/load silently no-ops there.
// Swapping this in on `AuthManager.shared.keychain` (an injectable `var` —
// mirrors the `authService` seam above) lets `applySession` / `refreshSession`
// actually persist state for the duration of this suite. All access happens
// on the MainActor (the whole `AuthManager` type is `@MainActor`-isolated,
// so even the 5 concurrent `Task`s in the tests below serialize through this
// store one at a time) — no extra locking needed, matching the existing
// `MockKeychainStore` pattern in `PushNotificationManagerTests`.
private final class InMemoryKeychainStore: KeychainStoring, @unchecked Sendable {
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
