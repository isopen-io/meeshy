import XCTest
@testable import MeeshySDK

final class VoIPTokenStoreTests: XCTestCase {

    private let keychain = KeychainManager.shared
    private var storageKey: String!
    private var legacyTokenKey: String { KeychainVoIPTokenStore.legacyTokenKey }
    private var legacyDateKey: String { KeychainVoIPTokenStore.legacyDateKey }

    /// Pure-SPM test bundles run without a Team identifier / app entitlements,
    /// so the iOS Simulator Keychain returns errSecMissingEntitlement (-34018)
    /// for SecItemAdd. We honor the same skip-pattern as KeychainManagerTests
    /// so this suite stays green when run via `swift test` outside Xcode.
    private func skipIfKeychainUnavailable() throws {
        let probeKey = "voip_token_probe_\(UUID().uuidString)"
        do {
            try keychain.save("probe", forKey: probeKey)
            keychain.delete(forKey: probeKey)
        } catch KeychainError.saveFailed(let status) where status == -34018 {
            throw XCTSkip("Keychain unavailable in pure-SPM xctest environment")
        }
    }

    override func setUp() {
        super.setUp()
        storageKey = "voip_test_\(UUID().uuidString)"
    }

    override func tearDown() {
        keychain.delete(forKey: storageKey)
        UserDefaults.standard.removeObject(forKey: legacyTokenKey)
        UserDefaults.standard.removeObject(forKey: legacyDateKey)
        super.tearDown()
    }

    private func makeSUT(userDefaults: UserDefaults = .standard) -> KeychainVoIPTokenStore {
        KeychainVoIPTokenStore(
            keychain: keychain,
            storageKey: storageKey,
            userDefaults: userDefaults
        )
    }

    // MARK: - Round-trip

    func test_save_thenRead_returnsExactRecord() async throws {
        try skipIfKeychainUnavailable()
        let sut = makeSUT()
        let date = Date(timeIntervalSince1970: 1_700_000_000)

        try await sut.save(token: "abc123", at: date)
        let read = try XCTUnwrap(await sut.read())

        XCTAssertEqual(read.token, "abc123")
        XCTAssertEqual(read.at.timeIntervalSince1970, date.timeIntervalSince1970, accuracy: 0.001)
    }

    func test_read_whenNothingSaved_returnsNil() async {
        let sut = makeSUT()
        let read = await sut.read()
        XCTAssertNil(read)
    }

    func test_clear_afterSave_returnsNil() async throws {
        try skipIfKeychainUnavailable()
        let sut = makeSUT()
        try await sut.save(token: "abc123", at: Date())

        await sut.clear()

        let read = await sut.read()
        XCTAssertNil(read, "clear() must purge the stored record")
    }

    func test_save_overwritesPreviousRecord() async throws {
        try skipIfKeychainUnavailable()
        let sut = makeSUT()
        try await sut.save(token: "old", at: Date(timeIntervalSince1970: 0))
        try await sut.save(token: "new", at: Date(timeIntervalSince1970: 100))

        let read = try XCTUnwrap(await sut.read())
        XCTAssertEqual(read.token, "new")
        XCTAssertEqual(read.at.timeIntervalSince1970, 100, accuracy: 0.001)
    }

    // MARK: - Migration from UserDefaults

    func test_migrate_whenLegacyTokenPresent_movesItToKeychain() async throws {
        try skipIfKeychainUnavailable()
        let defaults = UserDefaults.standard
        let legacyDate = Date(timeIntervalSince1970: 1_650_000_000)
        defaults.set("legacy_token_value", forKey: legacyTokenKey)
        defaults.set(legacyDate, forKey: legacyDateKey)

        let sut = makeSUT()
        let migrated = try XCTUnwrap(await sut.migrateFromUserDefaultsIfNeeded())

        XCTAssertEqual(migrated.token, "legacy_token_value")
        XCTAssertEqual(migrated.at.timeIntervalSince1970, legacyDate.timeIntervalSince1970, accuracy: 0.001)

        // Now persisted in keychain
        let read = await sut.read()
        XCTAssertEqual(read?.token, "legacy_token_value")

        // Legacy UserDefaults purged
        XCTAssertNil(defaults.string(forKey: legacyTokenKey))
        XCTAssertNil(defaults.object(forKey: legacyDateKey))
    }

    func test_migrate_whenLegacyAbsent_returnsNil() async {
        let sut = makeSUT()
        let migrated = await sut.migrateFromUserDefaultsIfNeeded()
        XCTAssertNil(migrated)
    }

    func test_migrate_isIdempotent_doesNotClobberKeychainValue() async throws {
        try skipIfKeychainUnavailable()
        let defaults = UserDefaults.standard
        let sut = makeSUT()

        // First, save something fresh in the keychain
        let freshDate = Date(timeIntervalSince1970: 2_000_000_000)
        try await sut.save(token: "fresh", at: freshDate)

        // Then drop a (stale) legacy value in UserDefaults
        defaults.set("stale", forKey: legacyTokenKey)
        defaults.set(Date(timeIntervalSince1970: 0), forKey: legacyDateKey)

        let migrated = await sut.migrateFromUserDefaultsIfNeeded()

        // The keychain value wins; migration returns the existing record.
        XCTAssertEqual(migrated?.token, "fresh")
        let read = try XCTUnwrap(await sut.read())
        XCTAssertEqual(read.token, "fresh")
        XCTAssertEqual(read.at.timeIntervalSince1970, freshDate.timeIntervalSince1970, accuracy: 0.001)

        // And the legacy entries are still purged.
        XCTAssertNil(defaults.string(forKey: legacyTokenKey))
        XCTAssertNil(defaults.object(forKey: legacyDateKey))
    }

    func test_migrate_whenLegacyTokenEmpty_clearsAndReturnsNil() async {
        let defaults = UserDefaults.standard
        defaults.set("", forKey: legacyTokenKey)
        defaults.set(Date(), forKey: legacyDateKey)

        let sut = makeSUT()
        let migrated = await sut.migrateFromUserDefaultsIfNeeded()

        XCTAssertNil(migrated)
        XCTAssertNil(defaults.string(forKey: legacyTokenKey))
        XCTAssertNil(defaults.object(forKey: legacyDateKey))
    }
}
