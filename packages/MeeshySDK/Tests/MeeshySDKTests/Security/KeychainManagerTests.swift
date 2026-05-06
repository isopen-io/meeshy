import XCTest
@testable import MeeshySDK

final class KeychainManagerTests: XCTestCase {

    private let sut = KeychainManager.shared
    private var testKeyPrefix: String!

    /// Pure-SPM test bundles run without a Team identifier / app entitlements,
    /// so the iOS Simulator Keychain returns errSecMissingEntitlement (-34018)
    /// for SecItemAdd/SecItemUpdate. Skip the round-trip tests in that
    /// environment — these are exercised via the host app's UI tests instead.
    private func skipIfKeychainUnavailable() throws {
        let probeKey = "keychain_probe_\(UUID().uuidString)"
        do {
            try sut.save("probe", forKey: probeKey)
            sut.delete(forKey: probeKey)
        } catch KeychainError.saveFailed(let status) where status == -34018 {
            throw XCTSkip("Keychain unavailable in pure-SPM xctest environment (errSecMissingEntitlement). Validated via app-hosted UI tests.")
        }
    }

    override func setUp() {
        super.setUp()
        testKeyPrefix = "test_keychain_\(UUID().uuidString)"
    }

    override func tearDown() {
        sut.delete(forKey: testKey("value"))
        sut.delete(forKey: testKey("migrate"))
        sut.delete(forKey: testKey("delete"))
        sut.delete(forKey: testKey("overwrite"))
        sut.delete(forKey: testKey("all1"))
        sut.delete(forKey: testKey("all2"))
        UserDefaults.standard.removeObject(forKey: testKey("migrate"))
        super.tearDown()
    }

    private func testKey(_ suffix: String) -> String {
        "\(testKeyPrefix!)_\(suffix)"
    }

    // MARK: - Save + Load

    func test_save_load_roundTrip_returnsOriginalValue() throws {
        try skipIfKeychainUnavailable()
        let key = testKey("value")
        try sut.save("hello_world", forKey: key)

        let loaded = sut.load(forKey: key)
        XCTAssertEqual(loaded, "hello_world")
    }

    func test_save_overwrite_returnsUpdatedValue() throws {
        try skipIfKeychainUnavailable()
        let key = testKey("overwrite")
        try sut.save("first", forKey: key)
        try sut.save("second", forKey: key)

        let loaded = sut.load(forKey: key)
        XCTAssertEqual(loaded, "second")
    }

    func test_save_emptyString_roundTrips() throws {
        try skipIfKeychainUnavailable()
        let key = testKey("value")
        try sut.save("", forKey: key)

        let loaded = sut.load(forKey: key)
        XCTAssertEqual(loaded, "")
    }

    // MARK: - Load

    func test_load_nonexistentKey_returnsNil() {
        let loaded = sut.load(forKey: testKey("nonexistent_\(UUID().uuidString)"))
        XCTAssertNil(loaded)
    }

    // MARK: - Delete

    func test_delete_existingKey_removesValue() throws {
        try skipIfKeychainUnavailable()
        let key = testKey("delete")
        try sut.save("to_delete", forKey: key)
        XCTAssertNotNil(sut.load(forKey: key))

        sut.delete(forKey: key)
        XCTAssertNil(sut.load(forKey: key))
    }

    func test_delete_nonexistentKey_doesNotCrash() {
        sut.delete(forKey: testKey("nonexistent_\(UUID().uuidString)"))
    }

    // MARK: - Delete All

    func test_deleteAll_removesAllKeysForService() throws {
        try skipIfKeychainUnavailable()
        let key1 = testKey("all1")
        let key2 = testKey("all2")
        try sut.save("v1", forKey: key1)
        try sut.save("v2", forKey: key2)

        sut.deleteAll()

        XCTAssertNil(sut.load(forKey: key1))
        XCTAssertNil(sut.load(forKey: key2))
    }

    // MARK: - Migration

    func test_migrateFromUserDefaults_movesStringValue() throws {
        try skipIfKeychainUnavailable()
        let key = testKey("migrate")
        UserDefaults.standard.set("migrated_value", forKey: key)

        sut.migrateFromUserDefaults(keys: [key])

        XCTAssertEqual(sut.load(forKey: key), "migrated_value")
        XCTAssertNil(UserDefaults.standard.string(forKey: key))
    }

    func test_migrateFromUserDefaults_skipsIfKeychainAlreadyHasValue() throws {
        try skipIfKeychainUnavailable()
        let key = testKey("migrate")
        try sut.save("existing", forKey: key)
        UserDefaults.standard.set("should_not_overwrite", forKey: key)

        sut.migrateFromUserDefaults(keys: [key])

        XCTAssertEqual(sut.load(forKey: key), "existing")
    }

    func test_migrateFromUserDefaults_noopForMissingDefaults() {
        let key = testKey("migrate")
        sut.migrateFromUserDefaults(keys: [key])
        XCTAssertNil(sut.load(forKey: key))
    }

    // MARK: - Singleton

    func test_shared_returnsSameInstance() {
        let a = KeychainManager.shared
        let b = KeychainManager.shared
        XCTAssertTrue(a === b)
    }
}
