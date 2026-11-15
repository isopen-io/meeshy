import XCTest
import GRDB
@testable import MeeshySDK

/// #6893 — les entrées de cache écrites AVANT le correctif portent des
/// documents v3 réencodés par le runtime v1 : leur première scène a perdu ce
/// que v1 ne modélise pas. Le correctif n'empêche que les écritures NEUVES
/// de mutiler ; une ligne déjà mutilée resterait servie à froid jusqu'au
/// prochain rafraîchissement. La migration v10 purge une fois les deux
/// stores qui portent un canvas (`feed`, `stories`), et eux seuls.
final class AppDatabaseCanvasCachePurgeMigrationTests: XCTestCase {

    private func databaseBeforePurge() throws -> DatabaseQueue {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db, upTo: "v9_cache_entries_position")
        try db.write { db in
            for (key, item) in [("feed:home", "p1"), ("feed:p2", "p2"), ("stories:tray", "s1"), ("msg:c1", "m1"), ("conv:list", "c1")] {
                try db.execute(
                    sql: "INSERT INTO cache_entries (key, itemId, encodedData, updatedAt) VALUES (?, ?, ?, ?)",
                    arguments: [key, item, Data([0x7b]), Date()]
                )
            }
            for key in ["feed:home", "stories:tray", "msg:c1"] {
                try db.execute(
                    sql: "INSERT INTO cache_metadata (key, hasMore, lastFetchedAt) VALUES (?, ?, ?)",
                    arguments: [key, false, Date()]
                )
            }
        }
        return db
    }

    private func keys(in db: DatabaseQueue, table: String) throws -> [String] {
        try db.read { db in try String.fetchAll(db, sql: "SELECT key FROM \(table) ORDER BY key") }
    }

    func test_v10_purgeLesEntreesFeedEtStories_etLaisseLesAutresStores() throws {
        let db = try databaseBeforePurge()

        try AppDatabase.runMigrations(on: db)

        XCTAssertEqual(try keys(in: db, table: "cache_entries"), ["conv:list", "msg:c1"])
        XCTAssertEqual(try keys(in: db, table: "cache_metadata"), ["msg:c1"])
    }

    func test_v10_neRejoueJamaisLaPurge_surUneBaseDejaMigree() throws {
        let db = try databaseBeforePurge()
        try AppDatabase.runMigrations(on: db)
        try db.write { db in
            try db.execute(
                sql: "INSERT INTO cache_entries (key, itemId, encodedData, updatedAt) VALUES (?, ?, ?, ?)",
                arguments: ["feed:home", "p9", Data([0x7b]), Date()]
            )
        }

        try AppDatabase.runMigrations(on: db)

        XCTAssertEqual(try keys(in: db, table: "cache_entries"), ["conv:list", "feed:home", "msg:c1"])
    }
}
