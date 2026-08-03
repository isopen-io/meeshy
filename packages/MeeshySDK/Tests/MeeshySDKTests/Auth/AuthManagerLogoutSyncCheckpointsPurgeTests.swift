import XCTest
@testable import MeeshySDK

/// P1 (revue local-first 2026-08-01, fiche sync-04) — les watermarks de
/// delta-sync (`me.meeshy.lastSyncTimestamp` / `lastCleanupDate` /
/// `lastFullReconcileAt`) vivent en UserDefaults globaux, per-user de fait.
/// Sans reset au logout ET à `requireReauthentication` (chemin qui ne passe
/// PAS par `logout()` mais purge quand même les caches via le flip
/// `isAuthenticated`), la session suivante hérite du checkpoint sortant : un
/// delta déclenché avant le premier fullSync réussi (foreground resume,
/// BGTask) persiste une liste de conversations PARTIELLE comme fraîche.
@MainActor
final class AuthManagerLogoutSyncCheckpointsPurgeTests: XCTestCase {

    private static let checkpointKeys = [
        "me.meeshy.lastSyncTimestamp",
        "me.meeshy.lastCleanupDate",
        "me.meeshy.lastFullReconcileAt",
    ]

    private var originalAuthService: AuthServiceProviding!
    private var originalKeychain: (any KeychainStoring)!

    override func setUp() async throws {
        try await super.setUp()
        originalAuthService = AuthManager.shared.authService
        originalKeychain = AuthManager.shared.keychain
        // KeychainManager no-op dans l'hôte xctest SPM : applySession ne peut
        // rien persister sans un store mémoire (même seam que
        // AuthManagerRefreshTests).
        AuthManager.shared.keychain = InMemoryKeychainStoreForCheckpoints()
    }

    override func tearDown() async throws {
        await AuthManager.shared.logout()
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        for key in Self.checkpointKeys {
            UserDefaults.standard.removeObject(forKey: key)
        }
        try await super.tearDown()
    }

    private func seedCheckpoints() {
        for key in Self.checkpointKeys {
            UserDefaults.standard.set(Date(), forKey: key)
        }
    }

    private func assertCheckpointsCleared(_ context: String) {
        for key in Self.checkpointKeys {
            XCTAssertNil(
                UserDefaults.standard.object(forKey: key),
                "\(key) doit être effacé \(context) — la session suivante hériterait du watermark sortant"
            )
        }
    }

    private func makeUser() -> MeeshyUser {
        MeeshyUser(
            id: "user-sync04", username: "sync04", email: "sync04@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
    }

    func test_logout_clearsSyncCheckpoints() async {
        // Pas d'applySession : la cascade complète de logout() atteint
        // UNUserNotificationCenter, indisponible dans l'hôte SPM
        // (bundleProxyForCurrentProcess nil — piège documenté dans
        // AuthManagerRefreshTests). Le reset est posé AVANT le guard
        // activeUserId, donc le chemin early-return le prouve pour TOUS les
        // chemins de logout.
        seedCheckpoints()

        await AuthManager.shared.logout()

        assertCheckpointsCleared("au logout")
    }

    func test_requireReauthentication_clearsSyncCheckpoints() async {
        // `requireReauthentication` est private (scope fichier) — déclenchement
        // indirect par le seul chemin public qui l'invoque : refreshSession
        // avec un service qui répond `.auth(.sessionExpired)` (précédent :
        // AuthManagerRefreshTests.testConcurrentRefreshPropagatesErrors).
        AuthManager.shared.applySession(token: "tok-sync04b", sessionToken: "sess", user: makeUser())
        AuthManager.shared.authService = SessionExpiredAuthServiceStub()
        seedCheckpoints()

        _ = try? await AuthManager.shared.refreshSession(force: true)

        assertCheckpointsCleared("à requireReauthentication")
    }
}

// MARK: - Doublons privés (les types homonymes d'AuthManagerRefreshTests sont
// `private` = scope fichier ; duplication tolérée par la convention du repo)

private final class InMemoryKeychainStoreForCheckpoints: KeychainStoring, @unchecked Sendable {
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

private final class SessionExpiredAuthServiceStub: AuthServiceProviding, @unchecked Sendable {
    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        throw MeeshyError.auth(.sessionExpired)
    }

    // Conformances inutilisées — échouent bruyamment si atteintes.
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
    func me() async throws -> MeeshyUser { throw MeeshyError.network(.noConnection) }
    func logout() async {}
}
