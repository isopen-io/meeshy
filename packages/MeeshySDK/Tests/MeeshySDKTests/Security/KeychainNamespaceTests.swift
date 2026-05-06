import XCTest
@testable import MeeshySDK

final class KeychainNamespaceTests: XCTestCase {

    func test_namespacedKeys_areIsolatedPerUser() throws {
        let manager = KeychainManager.shared
        let key = "test.session.\(UUID().uuidString)"

        try manager.save("alpha", forKey: key, account: "user-A")
        try manager.save("beta", forKey: key, account: "user-B")

        defer {
            manager.delete(forKey: key, account: "user-A")
            manager.delete(forKey: key, account: "user-B")
        }

        let aValue = manager.load(forKey: key, account: "user-A")
        let bValue = manager.load(forKey: key, account: "user-B")

        XCTAssertEqual(aValue, "alpha")
        XCTAssertEqual(bValue, "beta")
    }

    func test_loadWithNilAccount_doesNotReturnNamespacedValue() throws {
        let manager = KeychainManager.shared
        let key = "test.namespaced.\(UUID().uuidString)"

        try manager.save("namespaced", forKey: key, account: "user-X")
        defer { manager.delete(forKey: key, account: "user-X") }

        let nakedValue = manager.load(forKey: key)  // no account
        XCTAssertNil(nakedValue,
            "A naked-key load must NOT see a namespaced value — namespaces isolate")
    }

    func test_deleteWithAccount_doesNotAffectOtherUsers() throws {
        let manager = KeychainManager.shared
        let key = "test.delete.\(UUID().uuidString)"

        try manager.save("alpha", forKey: key, account: "user-A")
        try manager.save("beta", forKey: key, account: "user-B")
        defer {
            manager.delete(forKey: key, account: "user-A")
            manager.delete(forKey: key, account: "user-B")
        }

        manager.delete(forKey: key, account: "user-A")

        XCTAssertNil(manager.load(forKey: key, account: "user-A"))
        XCTAssertEqual(manager.load(forKey: key, account: "user-B"), "beta",
            "Deleting one user's value must not affect another user's namespace")
    }

    func test_migrateToNamespaced_copiesLegacyValues() throws {
        let manager = KeychainManager.shared
        let key = "test.migrate.\(UUID().uuidString)"
        let userId = "user-migrate-\(UUID().uuidString)"
        let migrationFlagKey = "meeshy.keychain.namespaceMigration.\(userId)"

        try manager.save("legacy-value", forKey: key)
        defer {
            manager.delete(forKey: key)
            manager.delete(forKey: key, account: userId)
            UserDefaults.standard.removeObject(forKey: migrationFlagKey)
        }

        manager.migrateToNamespaced(userId: userId, keys: [key])

        XCTAssertEqual(manager.load(forKey: key, account: userId), "legacy-value",
            "migrateToNamespaced must copy legacy value into namespaced slot")
        XCTAssertNil(manager.load(forKey: key),
            "migrateToNamespaced must delete the un-namespaced original")
    }

    func test_migrateToNamespaced_isIdempotent() throws {
        let manager = KeychainManager.shared
        let key = "test.migrate.idempotent.\(UUID().uuidString)"
        let userId = "user-idempotent-\(UUID().uuidString)"

        try manager.save("namespaced-already", forKey: key, account: userId)
        defer { manager.delete(forKey: key, account: userId) }

        // No legacy value exists — calling migrate must not clobber the existing namespaced value
        manager.migrateToNamespaced(userId: userId, keys: [key])

        XCTAssertEqual(manager.load(forKey: key, account: userId), "namespaced-already",
            "migrateToNamespaced must not overwrite an existing namespaced value")
    }
}
