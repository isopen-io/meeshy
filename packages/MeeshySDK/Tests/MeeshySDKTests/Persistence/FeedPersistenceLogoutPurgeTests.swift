import XCTest
import GRDB
@testable import MeeshySDK

/// P0 (revue local-first 2026-08-01, fiche grdb-01) — miroir feed du contrat
/// Q3 : aucune table de `meeshy_messages.sqlite` n'est namespacée par userId
/// et le fichier App Group est partagé entre comptes. `feed_posts` porte le
/// flag PERSONNEL `isLikedByMe` et la lecture (`FeedStore.loadInitial`) prend
/// le top-N par `createdAt` sans scoping : sans purge au logout, les lignes du
/// compte A se mélangent à celles du compte B — même classe de défaut que le
/// hotfix Q3 messages, fermée ici « safe-by-construction » sans attendre
/// qu'un lecteur (`useUIKitList`) s'active.
final class FeedPersistenceLogoutPurgeTests: XCTestCase {

    private var actor: FeedPersistenceActor!
    private var dbQueue: DatabaseQueue!

    private let tables = ["feed_posts", "feed_comments", "feed_translations"]

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: dbQueue)
        actor = FeedPersistenceActor(dbWriter: dbQueue)
    }

    private func seedOneRowPerTable() async throws {
        try await dbQueue.write { db in
            let now = Date()
            try db.execute(
                sql: "INSERT INTO feed_posts (id, authorId, isLikedByMe, createdAt) VALUES ('p1','uA', 1, ?)",
                arguments: [now]
            )
            try db.execute(
                sql: "INSERT INTO feed_comments (id, postId, authorId, content, createdAt) VALUES ('c1','p1','uA','hello', ?)",
                arguments: [now]
            )
            try db.execute(
                sql: "INSERT INTO feed_translations (id, postId, targetLanguage, translatedContent, receivedAt) VALUES ('tr1','p1','en','hi', ?)",
                arguments: [now]
            )
        }
    }

    private func counts() async throws -> [String: Int] {
        try await dbQueue.read { [tables] db in
            var result: [String: Int] = [:]
            for table in tables {
                result[table] = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM \(table)") ?? -1
            }
            return result
        }
    }

    func test_clearAllForLogout_purgesFeedPostsCommentsAndTranslations() async throws {
        try await seedOneRowPerTable()

        let before = try await counts()
        for table in tables {
            XCTAssertEqual(before[table], 1, "precondition: \(table) seeded with one row")
        }

        try await actor.clearAllForLogout()

        let after = try await counts()
        for table in tables {
            XCTAssertEqual(after[table], 0, "\(table) must be empty after logout purge")
        }
    }
}
