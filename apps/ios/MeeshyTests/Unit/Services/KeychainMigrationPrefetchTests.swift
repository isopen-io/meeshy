import XCTest
import Security
@testable import MeeshySDK

/// #11587 — la migration d'accessibilité réécrit un élément (suppression puis
/// ajout). Une lecture d'avance tombée entre les deux a lu « absent » : la
/// réécriture doit retirer cette réponse, comme `save` et `delete` le font,
/// sinon le jeton ou la clé de base qui existe est servi comme absent.
final class KeychainMigrationPrefetchTests: XCTestCase {

    private let service = "me.meeshy.app"

    func test_migrateToAfterFirstUnlock_rewritesAPrefetchedKey_loadServesTheStoredValue() throws {
        let key = "meeshy_test_prefetch_migration_\(UUID().uuidString)"
        try addWhenUnlockedItem(key, value: "stored")
        defer { KeychainManager.shared.delete(forKey: key) }

        let readDuringRewrite: @Sendable (String) -> KeychainRead = { _ in .absent }
        KeychainManager.shared.prefetch.start(
            KeychainPrefetchPlan(keys: [key], followUp: { _ in [] }),
            on: DispatchQueue(label: "test.keychain.prefetch.migration"),
            lifetime: .seconds(30),
            read: readDuringRewrite
        )

        KeychainManager.shared.migrateToAfterFirstUnlock()

        XCTAssertEqual(KeychainManager.shared.load(forKey: key), "stored",
                       "la réponse lue pendant la réécriture ne doit pas survivre à la migration")
    }

    private func addWhenUnlockedItem(_ key: String, value: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlocked,
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw XCTSkip("trousseau indisponible (\(status))") }
    }
}
