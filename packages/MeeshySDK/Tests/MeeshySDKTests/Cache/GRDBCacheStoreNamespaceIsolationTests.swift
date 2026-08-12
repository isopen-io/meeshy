import XCTest
import GRDB
@testable import MeeshySDK

private struct NamespacedTestItem: CacheIdentifiable, Codable, Equatable {
    var id: String
    var name: String
}

/// Isolation de namespace à la purge.
///
/// Tous les `GRDBCacheStore` partagent DEUX tables (`cache_entries` et
/// `cache_metadata`) et ne se distinguent que par le PRÉFIXE de la clé
/// (`"namespace:key"`). `invalidateAll()` déléguait à un `deleteAllL2()` qui
/// faisait `CacheEntry.deleteAll(db)` SANS filtre : vider le cache d'un seul
/// domaine emportait tous les autres (messages, feed, stories, préférences…).
///
/// C'est la condition PRÉALABLE à toute purge sélective : sans cette isolation,
/// « vider les données des stories » vide aussi les conversations, et l'UI
/// mentirait à l'utilisateur sur ce qu'elle détruit.
final class GRDBCacheStoreNamespaceIsolationTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeStore(
        namespace: String,
        db: DatabaseQueue
    ) -> GRDBCacheStore<String, NamespacedTestItem> {
        let policy = CachePolicy(ttl: .hours(1), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
        return GRDBCacheStore(policy: policy, db: db, namespace: namespace)
    }

    /// Le cœur du contrat : purger un domaine laisse les autres INTACTS.
    func test_invalidateAll_doesNotWipeOtherNamespaces() async throws {
        let db = try makeDB()
        let stories = makeStore(namespace: "stories", db: db)
        let messages = makeStore(namespace: "msg", db: db)

        try await stories.save([NamespacedTestItem(id: "s1", name: "story")], for: "list")
        try await messages.save([NamespacedTestItem(id: "m1", name: "message")], for: "conv-1")

        await stories.invalidateAll()

        // Le store purgé est vide…
        let storiesResult = await stories.load(for: "list")
        XCTAssertNil(storiesResult.snapshot(), "Le store purgé doit être vide")

        // …et l'autre domaine a SURVÉCU.
        //
        // `evictL1()` est INDISPENSABLE ici : sans lui, le survivant répond
        // depuis son cache mémoire et l'assertion passe même quand la ligne L2
        // a été détruite. C'est exactement ce qui a masqué le bug en
        // production — la perte ne devient visible qu'au démarrage à froid
        // suivant (ou après une alerte mémoire).
        await messages.evictL1()

        let messagesResult = await messages.load(for: "conv-1")
        XCTAssertEqual(
            messagesResult.snapshot(),
            [NamespacedTestItem(id: "m1", name: "message")],
            "Purger `stories` ne doit pas détruire le namespace `msg`"
        )
    }

    /// La purge doit aussi être isolée en L2 (après éviction de la L1), sinon
    /// le premier démarrage à froid suivant révélerait la perte.
    func test_invalidateAll_leavesOtherNamespaceReadableFromL2() async throws {
        let db = try makeDB()
        let feed = makeStore(namespace: "feed", db: db)
        let prefs = makeStore(namespace: "prefs-user", db: db)

        try await feed.save([NamespacedTestItem(id: "p1", name: "post")], for: "main-feed")
        try await prefs.save([NamespacedTestItem(id: "u1", name: "pref")], for: "all")

        await feed.invalidateAll()

        // Vide la L1 du store survivant : la lecture suivante DOIT venir de L2.
        await prefs.evictL1()

        let result = await prefs.load(for: "all")
        XCTAssertEqual(
            result.snapshot(),
            [NamespacedTestItem(id: "u1", name: "pref")],
            "Le namespace `prefs-user` doit rester lisible depuis L2 après purge de `feed`"
        )
    }

    /// Deux clés du MÊME namespace partent bien ensemble — l'isolation ne doit
    /// pas dégénérer en « ne supprime plus rien ».
    func test_invalidateAll_stillClearsEveryKeyOfItsOwnNamespace() async throws {
        let db = try makeDB()
        let feed = makeStore(namespace: "feed", db: db)

        try await feed.save([NamespacedTestItem(id: "p1", name: "a")], for: "main-feed")
        try await feed.save([NamespacedTestItem(id: "p2", name: "b")], for: "bookmarks")

        await feed.invalidateAll()

        let mainFeed = await feed.load(for: "main-feed")
        let bookmarks = await feed.load(for: "bookmarks")
        XCTAssertNil(mainFeed.snapshot(), "`main-feed` doit être purgée")
        XCTAssertNil(bookmarks.snapshot(), "`bookmarks` doit être purgée")
    }

    /// Un namespace ne doit pas emporter celui dont il est le PRÉFIXE.
    /// `prefs` et `prefs-user` cohabitent dans le coordinator (`prefs-cat`,
    /// `prefs-tags`, `prefs-user`, `prefs-conv`) : un `LIKE 'prefs%'` naïf
    /// détruirait les quatre. Le séparateur `:` doit faire partie du motif.
    func test_invalidateAll_doesNotWipeNamespaceSharingAPrefix() async throws {
        let db = try makeDB()
        let prefs = makeStore(namespace: "prefs", db: db)
        let prefsUser = makeStore(namespace: "prefs-user", db: db)

        try await prefs.save([NamespacedTestItem(id: "a", name: "generic")], for: "all")
        try await prefsUser.save([NamespacedTestItem(id: "b", name: "user")], for: "all")

        await prefs.invalidateAll()

        // Idem : on force la lecture L2, sinon la L1 masque la destruction.
        await prefsUser.evictL1()

        let survivor = await prefsUser.load(for: "all")
        XCTAssertEqual(
            survivor.snapshot(),
            [NamespacedTestItem(id: "b", name: "user")],
            "`prefs-user` ne doit pas tomber avec `prefs` (préfixe commun)"
        )
    }
}
