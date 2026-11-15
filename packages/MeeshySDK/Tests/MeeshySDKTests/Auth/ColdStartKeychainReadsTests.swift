import XCTest
@testable import MeeshySDK

/// #11558 — chaque lecture du trousseau est un aller-retour XPC SYNCHRONE
/// vers `securityd`, et le démarrage à froid les faisait sur le fil principal
/// avant le premier rendu de la liste : `activeUserId` relisait le trousseau à
/// chaque accès (cinq fois rien que pour reprendre la session), le setter
/// réécrivait la même valeur, et la liste des comptes était réécrite à chaque
/// lancement pour rafraîchir un horodatage qui ne change pas l'ordre.
final class PersistedActiveUserTests: XCTestCase {

    func test_read_twice_loadsTheKeychainOnce() {
        let keychain = CountingKeychainStore(["meeshy_active_user_id": "u1"])
        var slot = PersistedActiveUser()

        XCTAssertEqual(slot.read(from: keychain), "u1")
        XCTAssertEqual(slot.read(from: keychain), "u1")

        XCTAssertEqual(keychain.loads(of: PersistedActiveUser.key), 1)
    }

    func test_read_absentValue_isAlsoRemembered() {
        let keychain = CountingKeychainStore([:])
        var slot = PersistedActiveUser()

        XCTAssertNil(slot.read(from: keychain))
        XCTAssertNil(slot.read(from: keychain))

        XCTAssertEqual(keychain.loads(of: PersistedActiveUser.key), 1)
    }

    func test_write_theValueTheKeychainAlreadyHolds_doesNotRewriteIt() {
        let keychain = CountingKeychainStore(["meeshy_active_user_id": "u1"])
        var slot = PersistedActiveUser()
        _ = slot.read(from: keychain)

        slot.write("u1", to: keychain, groupSuite: nil)

        XCTAssertEqual(keychain.saves(of: PersistedActiveUser.key), 0)
    }

    func test_write_aNewValue_isPersistedOnce_andReadBackWithoutTheKeychain() {
        let keychain = CountingKeychainStore([:])
        var slot = PersistedActiveUser()

        slot.write("u2", to: keychain, groupSuite: nil)

        XCTAssertEqual(keychain.saves(of: PersistedActiveUser.key), 1)
        XCTAssertEqual(keychain.value(of: PersistedActiveUser.key), "u2")
        XCTAssertEqual(slot.read(from: keychain), "u2")
        XCTAssertEqual(keychain.loads(of: PersistedActiveUser.key), 0)
    }

    func test_write_beforeAnyRead_alwaysPersists() {
        let keychain = CountingKeychainStore(["meeshy_active_user_id": "u1"])
        var slot = PersistedActiveUser()

        slot.write("u1", to: keychain, groupSuite: nil)

        XCTAssertEqual(keychain.saves(of: PersistedActiveUser.key), 1, "rien n'a été lu : rien ne prouve que le trousseau la porte")
    }

    func test_write_nil_deletesTheEntry() {
        let keychain = CountingKeychainStore(["meeshy_active_user_id": "u1"])
        var slot = PersistedActiveUser()

        slot.write(nil, to: keychain, groupSuite: nil)

        XCTAssertNil(keychain.value(of: PersistedActiveUser.key))
        XCTAssertNil(slot.read(from: keychain))
        XCTAssertEqual(keychain.loads(of: PersistedActiveUser.key), 0)
    }

    func test_write_alwaysMirrorsTheValueToTheAppGroup() throws {
        let suite = "PersistedActiveUserTests.\(UUID().uuidString)"
        let group = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { group.removePersistentDomain(forName: suite) }
        let keychain = CountingKeychainStore(["meeshy_active_user_id": "u1"])
        var slot = PersistedActiveUser()
        _ = slot.read(from: keychain)

        let io = AppGroupIO(label: "PersistedActiveUserTests")

        slot.write("u1", to: keychain, groupSuite: suite, io: io)
        io.drain()

        XCTAssertEqual(group.string(forKey: PersistedActiveUser.key), "u1", "les extensions lisent le compte actif dans le groupe")
    }

    /// #11558 — le groupe d'app s'écrit sur la file `AppGroupIO`, jamais sur le
    /// fil qui pose le compte actif (le principal, au démarrage à froid).
    func test_write_mirrorsToTheAppGroup_onItsQueue_notOnTheCallingThread() throws {
        let suite = "PersistedActiveUserTests.\(UUID().uuidString)"
        let group = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { group.removePersistentDomain(forName: suite) }
        let io = AppGroupIO(label: "PersistedActiveUserTests.gated")
        let gate = DispatchSemaphore(value: 0)
        io.enqueue { gate.wait() }
        var slot = PersistedActiveUser()

        slot.write("u1", to: CountingKeychainStore([:]), groupSuite: suite, io: io)

        XCTAssertNil(group.string(forKey: PersistedActiveUser.key), "rien ne s'écrit avant le tour de la file")
        gate.signal()
        io.drain()
        XCTAssertEqual(group.string(forKey: PersistedActiveUser.key), "u1")
    }

    func test_successiveWrites_reachTheAppGroupInOrder() throws {
        let suite = "PersistedActiveUserTests.\(UUID().uuidString)"
        let group = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { group.removePersistentDomain(forName: suite) }
        let io = AppGroupIO(label: "PersistedActiveUserTests.order")
        let keychain = CountingKeychainStore([:])
        var slot = PersistedActiveUser()

        slot.write("u1", to: keychain, groupSuite: suite, io: io)
        slot.write(nil, to: keychain, groupSuite: suite, io: io)
        slot.write("u2", to: keychain, groupSuite: suite, io: io)
        io.drain()

        XCTAssertEqual(group.string(forKey: PersistedActiveUser.key), "u2")
    }

    func test_write_failedSave_letsTheNextReadAskTheKeychain() {
        let keychain = CountingKeychainStore(["meeshy_active_user_id": "u1"])
        keychain.failsSaves = true
        var slot = PersistedActiveUser()

        slot.write("u2", to: keychain, groupSuite: nil)

        XCTAssertEqual(slot.read(from: keychain), "u1")
    }

    func test_forget_rereadsTheKeychain() {
        let keychain = CountingKeychainStore(["meeshy_active_user_id": "u1"])
        var slot = PersistedActiveUser()
        _ = slot.read(from: keychain)
        keychain.seed(PersistedActiveUser.key, "u3")

        slot.forget()

        XCTAssertEqual(slot.read(from: keychain), "u3")
        XCTAssertEqual(keychain.loads(of: PersistedActiveUser.key), 2)
    }
}

/// La reprise de session du démarrage à froid, mesurée en lectures et
/// écritures de trousseau sur le vrai `AuthManager.shared`.
@MainActor
final class ColdStartSessionRestoreKeychainTests: XCTestCase {

    private var originalKeychain: (any KeychainStoring)!
    private var originalAuthService: AuthServiceProviding!
    private var originalUser: MeeshyUser?
    private var originalIsAuthenticated = false
    private var originalAuthToken: String?
    private var originalSessionToken: String?
    private var originalSavedAccounts: [SavedAccount] = []

    override func setUp() async throws {
        try await super.setUp()
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        originalKeychain = AuthManager.shared.keychain
        originalAuthService = AuthManager.shared.authService
        originalUser = AuthManager.shared.currentUser
        originalIsAuthenticated = AuthManager.shared.isAuthenticated
        originalAuthToken = APIClient.shared.authToken
        originalSessionToken = APIClient.shared.registeredSessionToken
        originalSavedAccounts = AuthManager.shared.savedAccounts
        AuthManager.shared.authService = OfflineRestoreAuthService()
        AuthManager.shared.isAuthenticated = false
        AuthManager.shared.currentUser = nil
    }

    override func tearDown() async throws {
        await AuthManager.shared.cancelPendingTokenRefreshForTesting()
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        AuthManager.shared.currentUser = originalUser
        AuthManager.shared.isAuthenticated = originalIsAuthenticated
        AuthManager.shared.savedAccounts = originalSavedAccounts
        APIClient.shared.authToken = originalAuthToken
        APIClient.shared.registeredSessionToken = originalSessionToken
        try await super.tearDown()
    }

    private static let userId = "64f000000000000000000a11"

    private func storedSession(headAccount: SavedAccount) throws -> CountingKeychainStore {
        let user = MeeshyUser(
            id: Self.userId, username: "lea", email: "lea@test.com",
            displayName: "Léa", role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z"
        )
        let accounts = String(decoding: try JSONEncoder().encode([headAccount]), as: UTF8.self)
        return CountingKeychainStore([
            PersistedActiveUser.key: Self.userId,
            AuthStorageKeys.token(for: Self.userId): "tok-lea",
            AuthStorageKeys.sessionToken(for: Self.userId): "sess-lea",
            AuthStorageKeys.user(for: Self.userId): String(decoding: try JSONEncoder().encode(user), as: UTF8.self),
            "meeshy_saved_accounts": accounts,
        ])
    }

    private func head(username: String = "lea", displayName: String? = "Léa") -> SavedAccount {
        SavedAccount(id: Self.userId, username: username, displayName: displayName,
                     avatarURL: nil, lastActiveAt: Date(timeIntervalSince1970: 1_000))
    }

    func test_checkExistingSession_readsTheActiveUserOnce_andRewritesNothing() async throws {
        let keychain = try storedSession(headAccount: head())
        AuthManager.shared.keychain = keychain

        await AuthManager.shared.checkExistingSession()

        XCTAssertTrue(AuthManager.shared.isAuthenticated)
        XCTAssertEqual(APIClient.shared.authToken, "tok-lea")
        XCTAssertEqual(APIClient.shared.registeredSessionToken, "sess-lea")
        XCTAssertEqual(keychain.loads(of: PersistedActiveUser.key), 1)
        XCTAssertEqual(keychain.loads(of: AuthStorageKeys.token(for: Self.userId)), 1)
        XCTAssertEqual(keychain.loads(of: AuthStorageKeys.sessionToken(for: Self.userId)), 1)
        XCTAssertEqual(keychain.saves(of: PersistedActiveUser.key), 0)
        XCTAssertEqual(keychain.saves(of: "meeshy_saved_accounts"), 0, "le compte est déjà en tête, sous le même nom")
    }

    func test_checkExistingSession_renamedAccount_stillRefreshesTheSelector() async throws {
        let keychain = try storedSession(headAccount: head(displayName: "Ancien nom"))
        AuthManager.shared.keychain = keychain

        await AuthManager.shared.checkExistingSession()

        XCTAssertEqual(keychain.saves(of: "meeshy_saved_accounts"), 1)
        XCTAssertEqual(AuthManager.shared.savedAccounts.first?.displayName, "Léa")
    }

    /// La migration des clés historiques pose le compte actif au trousseau
    /// SANS passer par `AuthManager` : celui-ci, qui l'avait lu absent,
    /// doit le relire, sinon la session de l'ancienne version ne reprend pas.
    func test_checkExistingSession_legacyActiveUser_isRestoredDespiteAnEarlierRead() async throws {
        let keychain = try storedSession(headAccount: head())
        keychain.delete(forKey: PersistedActiveUser.key, account: nil)
        AuthManager.shared.keychain = keychain
        XCTAssertNil(AuthManager.shared.persistedActiveUserId)
        UserDefaults.standard.set(Self.userId, forKey: PersistedActiveUser.key)
        defer { UserDefaults.standard.removeObject(forKey: PersistedActiveUser.key) }

        await AuthManager.shared.checkExistingSession()

        XCTAssertEqual(AuthManager.shared.persistedActiveUserId, Self.userId)
        XCTAssertTrue(AuthManager.shared.isAuthenticated)
    }

    /// L'ancienne version gardait le compte actif dans les préférences ET, plus tôt encore,
    /// un jeton GLOBAL. La migration pose le compte actif au trousseau (étape 1) : la
    /// reprise du jeton global (étape 4) ne vaut alors plus, sinon un jeton plus ancien
    /// remplace celui du compte et la session finit en reconnexion forcée.
    func test_checkExistingSession_legacyActiveUser_keepsTheAccountTokenOverTheGlobalOne() async throws {
        let keychain = try storedSession(headAccount: head())
        keychain.delete(forKey: PersistedActiveUser.key, account: nil)
        keychain.seed("meeshy_auth_token", "tok-global-ancien")
        keychain.seed("meeshy_current_user", try XCTUnwrap(keychain.value(of: AuthStorageKeys.user(for: Self.userId))))
        AuthManager.shared.keychain = keychain
        XCTAssertNil(AuthManager.shared.persistedActiveUserId)
        UserDefaults.standard.set(Self.userId, forKey: PersistedActiveUser.key)
        defer { UserDefaults.standard.removeObject(forKey: PersistedActiveUser.key) }

        await AuthManager.shared.checkExistingSession()

        XCTAssertEqual(keychain.value(of: AuthStorageKeys.token(for: Self.userId)), "tok-lea")
        XCTAssertEqual(APIClient.shared.authToken, "tok-lea")
    }

    /// Revenir au compte qui était en tête au lancement (A → B → A) doit le refaire
    /// passer devant : la liste en mémoire n'est pas retriée par une mise à jour, donc
    /// « en tête » n'y veut pas dire « le plus récent ».
    func test_returningToTheHeadAccount_makesItTheMostRecentAgain() async throws {
        let other = "64f000000000000000000b22"
        let keychain = try storedSession(headAccount: head())
        let otherUser = MeeshyUser(
            id: other, username: "noe", email: "noe@test.com", displayName: "Noé", role: "USER",
            systemLanguage: "fr", createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z"
        )
        let accounts = [head(), SavedAccount(id: other, username: "noe", displayName: "Noé", avatarURL: nil,
                                             lastActiveAt: Date(timeIntervalSince1970: 500))]
        keychain.seed("meeshy_saved_accounts", String(decoding: try JSONEncoder().encode(accounts), as: UTF8.self))
        keychain.seed(AuthStorageKeys.token(for: other), "tok-noe")
        keychain.seed(AuthStorageKeys.user(for: other), String(decoding: try JSONEncoder().encode(otherUser), as: UTF8.self))
        AuthManager.shared.keychain = keychain
        await AuthManager.shared.checkExistingSession()

        AuthManager.shared.isAuthenticated = false
        XCTAssertTrue(AuthManager.shared.installStoredSession(for: other))
        AuthManager.shared.isAuthenticated = false
        XCTAssertTrue(AuthManager.shared.installStoredSession(for: Self.userId))

        let persisted = try JSONDecoder().decode(
            [SavedAccount].self, from: Data(try XCTUnwrap(keychain.value(of: "meeshy_saved_accounts")).utf8)
        )
        let returned = try XCTUnwrap(persisted.first { $0.id == Self.userId })
        let left = try XCTUnwrap(persisted.first { $0.id == other })
        XCTAssertGreaterThanOrEqual(returned.lastActiveAt, left.lastActiveAt, "le compte rouvert en dernier passe devant")
    }

    func test_swappingTheKeychain_forgetsTheRememberedActiveUser() throws {
        AuthManager.shared.keychain = CountingKeychainStore([PersistedActiveUser.key: "first"])
        XCTAssertEqual(AuthManager.shared.persistedActiveUserId, "first")

        AuthManager.shared.keychain = CountingKeychainStore([PersistedActiveUser.key: "second"])

        XCTAssertEqual(AuthManager.shared.persistedActiveUserId, "second")
    }

    func test_rereadPersistedActiveUser_seesAWriteMadeBehindAuthManager() throws {
        let keychain = CountingKeychainStore([PersistedActiveUser.key: "first"])
        AuthManager.shared.keychain = keychain
        XCTAssertEqual(AuthManager.shared.persistedActiveUserId, "first")
        keychain.seed(PersistedActiveUser.key, "vitrine")

        AuthManager.shared.rereadPersistedActiveUser()

        XCTAssertEqual(AuthManager.shared.persistedActiveUserId, "vitrine")
    }
}

/// #11558 — le jeton APNs persisté était relu au trousseau dans l'init du
/// gestionnaire, construit par `MeeshyApp` avant le premier écran.
@MainActor
final class PushTokenColdStartTests: XCTestCase {

    private func makeSUT(_ keychain: CountingKeychainStore) throws -> (PushNotificationManager, UserDefaults, String) {
        let suite = "PushTokenColdStartTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        return (PushNotificationManager(userDefaults: defaults, keychainStore: keychain), defaults, suite)
    }

    func test_init_doesNotReadTheKeychain() throws {
        let keychain = CountingKeychainStore([PushNotificationManager.persistedTokenKey: "cafe"])

        let (_, defaults, suite) = try makeSUT(keychain)
        defer { defaults.removePersistentDomain(forName: suite) }

        XCTAssertEqual(keychain.loads(of: PushNotificationManager.persistedTokenKey), 0)
    }

    func test_deviceToken_isReadOnce_atFirstAccess() throws {
        let keychain = CountingKeychainStore([PushNotificationManager.persistedTokenKey: "cafe"])
        let (sut, defaults, suite) = try makeSUT(keychain)
        defer { defaults.removePersistentDomain(forName: suite) }

        XCTAssertEqual(sut.deviceToken, "cafe")
        XCTAssertEqual(sut.deviceToken, "cafe")

        XCTAssertEqual(keychain.loads(of: PushNotificationManager.persistedTokenKey), 1)
    }

    func test_deviceToken_setBeforeAnyRead_winsOverThePersistedOne() throws {
        let keychain = CountingKeychainStore([PushNotificationManager.persistedTokenKey: "cafe"])
        let (sut, defaults, suite) = try makeSUT(keychain)
        defer { defaults.removePersistentDomain(forName: suite) }

        sut.registerDeviceToken(Data([0xBE, 0xEF]))

        XCTAssertEqual(sut.deviceToken, "beef")
        XCTAssertEqual(keychain.loads(of: PushNotificationManager.persistedTokenKey), 0)
    }

    /// Le réenregistrement part de `performOpeningStep`, sur le fil principal,
    /// avant le premier rendu de la liste : sa lecture du trousseau n'y a pas sa place.
    func test_reRegisterTokenIfNeeded_readsThePersistedTokenOffTheMainThread() async throws {
        let key = PushNotificationManager.persistedTokenKey
        let keychain = CountingKeychainStore([key: "cafe"])
        let (sut, defaults, suite) = try makeSUT(keychain)
        defer { defaults.removePersistentDomain(forName: suite) }

        sut.reRegisterTokenIfNeeded()
        try await waitUntil { keychain.loads(of: key) == 1 }

        XCTAssertEqual(keychain.mainThreadLoads(of: key), 0)
        try await waitUntil { sut.deviceToken == "cafe" }
        XCTAssertEqual(keychain.loads(of: key), 1, "la valeur lue hors du fil principal est retenue")
    }

    func test_reRegisterTokenIfNeeded_tokenSetMeanwhile_keepsTheNewerToken() async throws {
        let key = PushNotificationManager.persistedTokenKey
        let keychain = CountingKeychainStore([key: "cafe"])
        let (sut, defaults, suite) = try makeSUT(keychain)
        defer { defaults.removePersistentDomain(forName: suite) }

        sut.reRegisterTokenIfNeeded()
        sut.registerDeviceToken(Data([0xBE, 0xEF]))
        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.deviceToken, "beef")
    }

    private func waitUntil(_ condition: @MainActor () -> Bool) async throws {
        for _ in 0..<200 where !condition() {
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTAssertTrue(condition())
    }
}

@MainActor
final class LegacyAuthKeyMigrationActiveUserTests: XCTestCase {

    private func migration(_ keychain: CountingKeychainStore, _ defaults: UserDefaults) -> LegacyAuthKeyMigration {
        LegacyAuthKeyMigration(
            keychain: keychain, userDefaults: defaults,
            activeUserIdKey: PersistedActiveUser.key, savedAccountsKey: "meeshy_saved_accounts",
            legacyTokenKey: "meeshy_auth_token", legacyUserKey: "meeshy_current_user",
            currentActiveUserId: { keychain.load(forKey: PersistedActiveUser.key, account: nil) },
            adopt: { _ in }
        )
    }

    func test_run_legacyActiveUserInDefaults_saysItWroteTheKeychain() throws {
        let suite = "LegacyAuthKeyMigrationActiveUserTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("u-legacy", forKey: PersistedActiveUser.key)
        let keychain = CountingKeychainStore([:])

        XCTAssertTrue(migration(keychain, defaults).run())
        XCTAssertEqual(keychain.value(of: PersistedActiveUser.key), "u-legacy")
    }

    func test_run_nothingLegacy_saysNothingWasWritten() throws {
        let suite = "LegacyAuthKeyMigrationActiveUserTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let keychain = CountingKeychainStore([PersistedActiveUser.key: "u1"])

        XCTAssertFalse(migration(keychain, defaults).run())
    }
}

/// #11558 — la file des accès au groupe d'app.
final class AppGroupIOTests: XCTestCase {

    func test_enqueuedWork_runsOffTheCallingMainThread_inOrder() {
        XCTAssertTrue(Thread.isMainThread)
        let io = AppGroupIO(label: "AppGroupIOTests")
        let trace = WorkTrace()

        for index in 0..<20 { io.enqueue { trace.record(index) } }
        io.drain()

        XCTAssertEqual(trace.indexes, Array(0..<20))
        XCTAssertEqual(trace.mainThreadRuns, 0)
    }
}

private final class WorkTrace: @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [Int] = []
    private var onMain = 0

    var indexes: [Int] { lock.withLock { recorded } }
    var mainThreadRuns: Int { lock.withLock { onMain } }

    func record(_ index: Int) {
        let isMain = Thread.isMainThread
        lock.withLock {
            recorded.append(index)
            if isMain { onMain += 1 }
        }
    }
}

// MARK: - Doubles

final class CountingKeychainStore: KeychainStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [String: String]
    private var loadCounts: [String: Int] = [:]
    private var saveCounts: [String: Int] = [:]
    private var mainThreadLoadCounts: [String: Int] = [:]
    var failsSaves = false

    init(_ seed: [String: String]) { store = seed }

    func seed(_ key: String, _ value: String) { lock.withLock { store[key] = value } }
    func value(of key: String) -> String? { lock.withLock { store[key] } }
    func loads(of key: String) -> Int { lock.withLock { loadCounts[key, default: 0] } }
    func saves(of key: String) -> Int { lock.withLock { saveCounts[key, default: 0] } }
    func mainThreadLoads(of key: String) -> Int { lock.withLock { mainThreadLoadCounts[key, default: 0] } }

    func save(_ value: String, forKey key: String, account: String?) throws {
        try lock.withLock {
            saveCounts[key, default: 0] += 1
            if failsSaves { throw KeychainError.saveFailed(-1) }
            store[key] = value
        }
    }

    func load(forKey key: String, account: String?) -> String? {
        let onMainThread = Thread.isMainThread
        return lock.withLock {
            loadCounts[key, default: 0] += 1
            if onMainThread { mainThreadLoadCounts[key, default: 0] += 1 }
            return store[key]
        }
    }

    func delete(forKey key: String, account: String?) {
        lock.withLock { _ = store.removeValue(forKey: key) }
    }

    func saveAsync(_ value: String, forKey key: String, account: String?) async throws {
        try save(value, forKey: key, account: account)
    }

    func loadAsync(forKey key: String, account: String?) async -> String? {
        load(forKey: key, account: account)
    }
}

private final class OfflineRestoreAuthService: AuthServiceProviding, @unchecked Sendable {
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
    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func me() async throws -> MeeshyUser {
        throw MeeshyError.network(.noConnection)
    }
    func logout() async {}
}
