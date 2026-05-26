import XCTest
@testable import MeeshySDK

/// Couvre le contrat `wipe()` du `SessionSnapshotStore` V1.
///
/// Note : en environnement de test SDK pur, l'entitlement App Group n'est
/// pas garanti — `UserDefaults(suiteName:)` peut retourner nil. Le test
/// vérifie alors uniquement que `wipe()` ne crash pas (early-return safe).
/// Quand l'entitlement est dispo (environnement app), le test exerce
/// effectivement le path de suppression.
final class SessionSnapshotStoreTests: XCTestCase {

    func test_wipe_doesNotCrashEvenWithoutAppGroupAccess() {
        // Smoke test — pin le contrat de base : wipe() peut être appelée
        // sans crash même si l'App Group n'est pas accessible côté test.
        // C'est important car `AuthManager.logout()` câble wipe() en
        // première opération ; si wipe() throw / crash, le logout casse.
        SessionSnapshotStore.wipe()
    }

    func test_wipe_removesOnlyMeeshySessionKeys_whenAppGroupAvailable() throws {
        guard let defaults = UserDefaults(suiteName: SessionSnapshotStore.appGroupSuite) else {
            throw XCTSkip("App Group not accessible in this test environment — skipping functional path")
        }

        let unrelatedKey = "test_unrelated_\(UUID().uuidString)"
        let snapshotKeyA = SessionSnapshotStore.keyPrefix
        let snapshotKeyB = SessionSnapshotStore.keyPrefix + "_userA"

        defaults.set("snapshot-blob-A", forKey: snapshotKeyA)
        defaults.set("snapshot-blob-B", forKey: snapshotKeyB)
        defaults.set("unrelated-value", forKey: unrelatedKey)

        SessionSnapshotStore.wipe()

        XCTAssertNil(defaults.object(forKey: snapshotKeyA), "v1 snapshot key must be wiped")
        XCTAssertNil(defaults.object(forKey: snapshotKeyB), "versioned-suffixed snapshot key must be wiped")
        XCTAssertEqual(
            defaults.string(forKey: unrelatedKey),
            "unrelated-value",
            "wipe must NOT touch non-snapshot keys"
        )

        // Cleanup
        defaults.removeObject(forKey: unrelatedKey)
    }
}
