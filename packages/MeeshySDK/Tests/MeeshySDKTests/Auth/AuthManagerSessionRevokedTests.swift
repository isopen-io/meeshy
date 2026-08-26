import XCTest
import Combine
@testable import MeeshySDK

/// `auth:session-revoked` — le serveur a INVALIDÉ la session (mot de passe
/// changé, révocation de tous les appareils, action admin) puis a coupé la
/// socket. Le chemin iOS doit aller droit à la ré-authentification.
///
/// Ce qui se joue ici n'est pas « quelque chose se passe » mais « quelle porte
/// est empruntée » : la voisine immédiate (`auth:token-expired` →
/// `handleUnauthorized()`) lance `refreshSession(force: true)`, et
/// `/auth/refresh` rend un JWT neuf SANS vérifier que la session existe encore.
/// Emprunter cette porte-là RÉARMERAIT pour 24 h la session qu'on vient de
/// révoquer — un correctif pire que le défaut.
@MainActor
final class AuthManagerSessionRevokedTests: XCTestCase {

    private var originalAuthService: AuthServiceProviding!
    private var mockAuthService: RefreshCountingAuthService!
    private var originalKeychain: (any KeychainStoring)!
    private var mockKeychain: RevocationKeychainStore!
    /// État de session du singleton AVANT la suite. Le chemin testé remet
    /// `isAuthenticated` à false — mais une assertion qui casse avant la
    /// révocation, ou un test qui ne fait que se connecter, laisserait le
    /// singleton AUTHENTIFIÉ pour tout le processus, et la garde
    /// `isUserAuthenticated` de `UserPreferencesManager` s'ouvrirait pour les
    /// suites suivantes (voir `AuthManagerVoicePublicRevalidationTests`).
    private var originalUser: MeeshyUser?
    private var originalIsAuthenticated = false
    private var originalAuthToken: String?

    override func setUp() async throws {
        try await super.setUp()

        originalUser = AuthManager.shared.currentUser
        originalIsAuthenticated = AuthManager.shared.isAuthenticated
        originalAuthToken = APIClient.shared.authToken
        originalAuthService = AuthManager.shared.authService
        mockAuthService = RefreshCountingAuthService()
        AuthManager.shared.authService = mockAuthService

        // `KeychainManager` n'est pas habilité dans l'hôte de test SPM : chaque
        // save/load y est un no-op silencieux, donc `applySession` ne
        // persisterait rien et `activeUserId` serait toujours nil — le guard de
        // `handleSessionRevoked()` sortirait avant d'avoir rien prouvé.
        originalKeychain = AuthManager.shared.keychain
        mockKeychain = RevocationKeychainStore()
        AuthManager.shared.keychain = mockKeychain
    }

    override func tearDown() async throws {
        // Pas de `logout()` ici : le chemin testé EST la remise à zéro de la
        // session (il vide le trousseau et repasse `isAuthenticated` à false),
        // et la cascade de `logout()` atteint `UNUserNotificationCenter`,
        // indisponible dans un binaire de test SPM sans app hôte.
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        AuthManager.shared.currentUser = originalUser
        AuthManager.shared.isAuthenticated = originalIsAuthenticated
        APIClient.shared.authToken = originalAuthToken
        try await super.tearDown()
    }

    private func makeUser() -> MeeshyUser {
        MeeshyUser(
            id: "user-revoked", username: "revoked", email: "revoked@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
    }

    // MARK: - Session active

    func test_handleSessionRevoked_withActiveSession_clearsTheSession() {
        AuthManager.shared.applySession(token: "tok-live", sessionToken: "sess-live", user: makeUser())
        XCTAssertTrue(AuthManager.shared.isAuthenticated)

        AuthManager.shared.handleSessionRevoked()

        XCTAssertFalse(
            AuthManager.shared.isAuthenticated,
            "La bascule doit être IMMÉDIATE : `handleUnauthorized()` laisserait `isAuthenticated` à true " +
            "le temps d'un rafraîchissement de fond — c'est précisément la différence entre les deux chemins"
        )
        XCTAssertNil(AuthManager.shared.authToken, "le jeton mort ne doit plus être présenté par l'APIClient")
        XCTAssertNil(AuthManager.shared.currentUser)
    }

    func test_handleSessionRevoked_withActiveSession_emitsSessionInvalidatedBeforeAuthFlip() {
        AuthManager.shared.applySession(token: "tok-live", sessionToken: "sess-live", user: makeUser())

        var emitCount = 0
        var wasStillAuthenticatedAtEmit: Bool?
        let cancellable = AuthManager.shared.sessionInvalidated.sink { _ in
            emitCount += 1
            wasStillAuthenticatedAtEmit = AuthManager.shared.isAuthenticated
        }

        AuthManager.shared.handleSessionRevoked()

        XCTAssertEqual(emitCount, 1, "l'écran de ré-auth existe déjà et s'arme sur ce signal — aucune UI neuve n'est requise")
        XCTAssertEqual(
            wasStillAuthenticatedAtEmit, true,
            "le signal part AVANT le flip, pour que le hook outbox distingue une invalidation serveur d'un logout volontaire"
        )
        cancellable.cancel()
    }

    func test_handleSessionRevoked_neverRefreshesTheToken() async throws {
        AuthManager.shared.applySession(token: "tok-live", sessionToken: "sess-live", user: makeUser())

        AuthManager.shared.handleSessionRevoked()

        // `handleUnauthorized()` rafraîchit dans une Task de fond : on laisse
        // volontairement passer plusieurs tours de boucle avant de mesurer,
        // pour qu'un tel appel ait tout le temps d'atteindre le stub.
        try await Task.sleep(for: .milliseconds(200))

        XCTAssertEqual(
            mockAuthService.refreshCount(forToken: "tok-live"), 0,
            "`/auth/refresh` rend un JWT neuf sans vérifier la session : le rafraîchir ici prolongerait de 24 h " +
            "la session que le serveur vient de révoquer"
        )
    }

    // MARK: - Aucune session

    func test_handleSessionRevoked_withoutActiveSession_isANoOp() {
        var emitCount = 0
        let cancellable = AuthManager.shared.sessionInvalidated.sink { _ in emitCount += 1 }

        AuthManager.shared.handleSessionRevoked()

        XCTAssertEqual(
            emitCount, 0,
            "Sans utilisateur actif il n'y a rien à révoquer : émettre le signal ferait apparaître un écran " +
            "de ré-authentification à quelqu'un qui n'était pas connecté"
        )
        cancellable.cancel()
    }
}

// MARK: - Stubs

/// Ne compte que `refreshToken` : c'est le seul appel qui distingue le chemin
/// révocation du chemin 401. Le reste échoue bruyamment.
private final class RefreshCountingAuthService: AuthServiceProviding, @unchecked Sendable {
    private let queue = DispatchQueue(label: "RefreshCountingAuthService.lock")
    private var _presentedTokens: [String] = []

    /// La mesure porte sur le TOKEN présenté, jamais sur un compteur global :
    /// une tâche de fond armée par une suite précédente atterrit sur ce même
    /// stub et fausserait un compteur nu — elle présente, elle, un autre jeton.
    func refreshCount(forToken token: String) -> Int {
        queue.sync { _presentedTokens.filter { $0 == token }.count }
    }

    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        queue.sync { _presentedTokens.append(currentToken) }
        throw MeeshyError.network(.noConnection)
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

/// Trousseau en mémoire — même seam que `AuthManagerRefreshTests`. Tous les
/// accès passent par le MainActor (`AuthManager` est `@MainActor`), donc aucun
/// verrou n'est nécessaire.
private final class RevocationKeychainStore: KeychainStoring, @unchecked Sendable {
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
