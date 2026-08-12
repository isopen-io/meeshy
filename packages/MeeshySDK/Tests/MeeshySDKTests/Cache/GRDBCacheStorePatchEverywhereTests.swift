import XCTest
import GRDB
@testable import MeeshySDK

private struct PatchTestItem: CacheIdentifiable, Codable, Equatable {
    var id: String
    var likes: Int
}

/// Un même post vit sous PLUSIEURS clés du store `feed` : `main-feed`, `<postId>`
/// (détail), la clé du pager de réels, `bookmarks`. `upsertPatch` ne touche qu'une
/// clé — liker depuis le feed laissait donc le détail et les réels sur l'ancien
/// compteur, et rouvrir l'écran ressortait la valeur périmée. `patchEverywhere`
/// est le primitif manquant : il applique la mutation à TOUTES les clés qui
/// contiennent l'item, qu'elles soient chargées en mémoire ou seulement en base.
final class GRDBCacheStorePatchEverywhereTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeStore(db: DatabaseQueue? = nil) throws -> GRDBCacheStore<String, PatchTestItem> {
        let database = try db ?? makeDB()
        let policy = CachePolicy(ttl: .hours(1), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
        return GRDBCacheStore(policy: policy, db: database)
    }

    func test_patchEverywhere_updatesTheItemUnderEveryKeyThatHoldsIt() async throws {
        let store = try makeStore()
        try await store.save([PatchTestItem(id: "p1", likes: 1),
                              PatchTestItem(id: "p2", likes: 7)], for: "main-feed")
        try await store.save([PatchTestItem(id: "p1", likes: 1)], for: "p1")
        try await store.save([PatchTestItem(id: "p1", likes: 1)], for: "reels")

        await store.patchEverywhere(itemId: "p1") { $0.likes = 42 }

        for key in ["main-feed", "p1", "reels"] {
            let items = await store.load(for: key).snapshot()
            XCTAssertEqual(items?.first(where: { $0.id == "p1" })?.likes, 42,
                           "la clé \(key) doit porter la valeur patchée")
        }
    }

    func test_patchEverywhere_leavesOtherItemsUntouched() async throws {
        let store = try makeStore()
        try await store.save([PatchTestItem(id: "p1", likes: 1),
                              PatchTestItem(id: "p2", likes: 7)], for: "main-feed")

        await store.patchEverywhere(itemId: "p1") { $0.likes = 42 }

        let items = await store.load(for: "main-feed").snapshot()
        XCTAssertEqual(items?.first(where: { $0.id == "p2" })?.likes, 7)
    }

    /// Le cas qui distingue `patchEverywhere` d'une boucle sur `loadedKeys()` :
    /// une clé écrite puis évincée de la mémoire n'est plus dans `loadedKeys()`,
    /// mais elle sera relue depuis GRDB au prochain cold start. La laisser
    /// périmée reproduit exactement le bug d'origine.
    func test_patchEverywhere_reachesKeysThatAreNotLoadedInMemory() async throws {
        let db = try makeDB()
        let writer = try makeStore(db: db)
        try await writer.save([PatchTestItem(id: "p1", likes: 1)], for: "cold-key")
        await writer.flushDirtyKeys()

        // Store neuf sur la MÊME base : rien en L1, tout en L2.
        let store = try makeStore(db: db)
        let loadedBefore = await store.loadedKeys()
        XCTAssertTrue(loadedBefore.isEmpty, "la garde du test : rien ne doit être chargé en mémoire")

        await store.patchEverywhere(itemId: "p1") { $0.likes = 42 }

        let items = await store.load(for: "cold-key").snapshot()
        XCTAssertEqual(items?.first?.likes, 42)
    }

    func test_patchEverywhere_onAbsentItem_isNoOp() async throws {
        let store = try makeStore()
        try await store.save([PatchTestItem(id: "p1", likes: 1)], for: "main-feed")

        await store.patchEverywhere(itemId: "ghost") { $0.likes = 42 }

        let items = await store.load(for: "main-feed").snapshot()
        XCTAssertEqual(items?.first?.likes, 1)
    }

    /// Le pendant destructif de `patchEverywhere` : un `post:deleted` doit
    /// retirer l'item de la clé chargée en L1 ET de la clé évincée qui ne vit
    /// plus qu'en base — sans rajeunir la fraîcheur au passage.
    func test_removeEverywhere_itemUnderL1AndEvictedL2Key_removedFromBoth_preservesFreshness() async throws {
        let db = try makeDB()
        let writer = try makeStore(db: db)
        try await writer.save([PatchTestItem(id: "p1", likes: 1)], for: "cold-key")
        await writer.flushDirtyKeys()

        // Store neuf sur la MÊME base : "cold-key" n'existe qu'en L2.
        let store = try makeStore(db: db)
        try await store.save([PatchTestItem(id: "p1", likes: 1),
                              PatchTestItem(id: "p2", likes: 7)], for: "main-feed")
        await store.debugRewindFetchTimestamp(by: .minutes(30), for: "main-feed")

        await store.removeEverywhere(itemId: "p1")

        let mainItems = await store.load(for: "main-feed").snapshot()
        XCTAssertNil(mainItems?.first(where: { $0.id == "p1" }),
                     "p1 doit être retiré de la clé chargée en mémoire")
        XCTAssertEqual(mainItems?.first(where: { $0.id == "p2" })?.likes, 7,
                       "les autres items survivent")
        let coldItems = await store.load(for: "cold-key").snapshot()
        XCTAssertNil(coldItems?.first(where: { $0.id == "p1" }),
                     "p1 doit être retiré de la clé qui ne vit qu'en base")

        let result = await store.load(for: "main-feed")
        guard case .stale = result else {
            return XCTFail("l'entrée doit rester .stale après un removeEverywhere, got \(result)")
        }
    }

    /// La fraîcheur appartient à `save()` : un patch temps réel ne doit pas
    /// faire passer pour fraîche une entrée que le ViewModel devait rafraîchir.
    func test_patchEverywhere_preservesFreshnessTimestamp() async throws {
        let store = try makeStore()
        try await store.save([PatchTestItem(id: "p1", likes: 1)], for: "main-feed")
        await store.debugRewindFetchTimestamp(by: .minutes(30), for: "main-feed")

        await store.patchEverywhere(itemId: "p1") { $0.likes = 42 }

        let result = await store.load(for: "main-feed")
        guard case .stale = result else {
            return XCTFail("l'entrée doit rester .stale après un patch, got \(result)")
        }
    }
}
