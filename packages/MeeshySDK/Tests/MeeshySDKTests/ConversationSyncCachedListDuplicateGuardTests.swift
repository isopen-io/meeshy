import XCTest

/// La liste de conversations en cache (`"list"`) peut porter un doublon : la
/// première page est enregistrée telle que reçue. L'indexer par
/// `Dictionary(uniqueKeysWithValues:)` faisait planter chaque synchronisation —
/// et la synchronisation repart au lancement suivant, donc en boucle.
final class ConversationSyncCachedListDuplicateGuardTests: XCTestCase {

    func test_cachedListIndexes_tolerateADuplicateConversation() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Sync/ConversationSyncEngine+Chargement.swift")
        let rules = url.deletingLastPathComponent().appendingPathComponent("ConversationDeltaRules.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
            + (try String(contentsOf: rules, encoding: .utf8))
        XCTAssertFalse(code.contains("uniqueKeysWithValues"))
        XCTAssertGreaterThanOrEqual(code.components(separatedBy: "uniquingKeysWith").count - 1, 2)
    }
}
