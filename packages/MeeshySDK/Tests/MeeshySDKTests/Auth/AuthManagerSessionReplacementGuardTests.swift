import XCTest
@testable import MeeshySDK

/// #10446 — le SDK refuse d'installer la session d'un AUTRE utilisateur
/// par-dessus une session ouverte. La garde vivait dans l'application
/// (`SignInLinkOpener`) ; `applySession` posait la session sans démonter la
/// précédente — sockets, files, caches — et `confirmEmail`, `validateMagicLink`
/// et `openSession` restaient sans garde. Seul le changement de compte
/// explicite passe (`switchingAccount`, emprunté par `switchToProvenAccount`).
@MainActor
final class AuthManagerSessionReplacementGuardTests: XCTestCase {

    private var originalKeychain: (any KeychainStoring)!
    private var originalUser: MeeshyUser?
    private var originalIsAuthenticated = false
    private var originalAuthToken: String?

    override func setUp() async throws {
        try await super.setUp()
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
            currentlyAuthenticated: true, currentActiveUserId: "a", newUserId: "a", switchingAccount: false))
    }

    func test_law_anotherUser_overAnOpenSession_isRefused() {
        XCTAssertTrue(AuthManager.refusesSessionReplacement(
            currentlyAuthenticated: true, currentActiveUserId: "a", newUserId: "b", switchingAccount: false))
    }

    func test_law_unknownActiveUser_underAnOpenSession_isRefused() {
        XCTAssertTrue(AuthManager.refusesSessionReplacement(
            currentlyAuthenticated: true, currentActiveUserId: nil, newUserId: "b", switchingAccount: false))
    }

    func test_law_noOpenSession_acceptsAnyone() {
        XCTAssertFalse(AuthManager.refusesSessionReplacement(
            currentlyAuthenticated: false, currentActiveUserId: "a", newUserId: "b", switchingAccount: false))
    }

    func test_law_explicitAccountSwitch_isAccepted() {
        XCTAssertFalse(AuthManager.refusesSessionReplacement(
            currentlyAuthenticated: true, currentActiveUserId: "a", newUserId: "b", switchingAccount: true))
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

    /// La porte publique non levante refuse aussi, et le dit.
    func test_openSession_anotherUser_isRefused_andSaysSo() throws {
        let auth = AuthManager.shared
        try auth.applySession(token: "tok-a", sessionToken: "sess-a", user: makeUser("user-a"))
        auth.errorMessage = nil

        auth.openSession(EmailProvenSession(token: "tok-b", sessionToken: "sess-b", user: makeUser("user-b")))

        XCTAssertEqual(auth.activeAccountId, "user-a")
        XCTAssertEqual(APIClient.shared.authToken, "tok-a")
        XCTAssertNotNil(auth.errorMessage)
    }

    func test_applySession_explicitAccountSwitch_installsTheOtherUser() throws {
        let auth = AuthManager.shared
        try auth.applySession(token: "tok-a", sessionToken: "sess-a", user: makeUser("user-a"))

        try auth.applySession(token: "tok-b", sessionToken: "sess-b", user: makeUser("user-b"), origin: .login, switchingAccount: true)

        XCTAssertEqual(auth.activeAccountId, "user-b")
        XCTAssertEqual(auth.currentUser?.id, "user-b")
        XCTAssertEqual(APIClient.shared.authToken, "tok-b")
    }

    /// Le chemin explicite est bien celui que l'ouverture d'un lien emprunte.
    func test_switchToProvenAccount_isTheExplicitPath() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Auth/AuthManager+EmailAccess.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(source.contains("try installSession(proven, switchingAccount: true)"))
        XCTAssertEqual(source.components(separatedBy: "switchingAccount: true").count - 1, 1,
                       "un seul site franchit la garde")
    }
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
