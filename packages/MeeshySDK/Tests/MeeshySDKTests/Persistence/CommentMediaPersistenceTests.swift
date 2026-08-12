import XCTest
import GRDB
@testable import MeeshySDK

/// W4 lot 4 — `feed_comments` n'avait aucune colonne média (contrairement à
/// `feed_posts.mediaJson`), donc `comment:media-updated` (transcription +
/// variantes TTS d'un audio de commentaire) n'avait nulle part où atterrir.
final class CommentMediaPersistenceTests: XCTestCase {

    private func makeActor() throws -> (actor: FeedPersistenceActor, db: DatabaseQueue) {
        let db = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: db)
        try MessageDatabaseMigrations.runAll(on: db)
        return (FeedPersistenceActor(dbWriter: db), db)
    }

    private func makeMediaJson(transcription: String) throws -> Data {
        try JSONSerialization.data(withJSONObject: [[
            "id": "media_1",
            "fileUrl": "https://cdn/audio.m4a",
            "mimeType": "audio/m4a",
            "transcription": ["text": transcription, "language": "fr"]
        ]])
    }

    // MARK: - Migration

    func test_migration_addsMediaJsonColumnToComments() throws {
        let db = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: db)

        let columns = try db.read { try $0.columns(in: "feed_comments").map(\.name) }
        XCTAssertTrue(columns.contains("mediaJson"))
    }

    /// La migration est enregistrée EN DERNIER : une base déjà migrée jusqu'à
    /// `feed_location` doit accepter la nouvelle sans rejouer les précédentes.
    func test_migration_isAdditiveOnAnAlreadyMigratedDatabase() throws {
        let db = try DatabaseQueue()
        var partial = DatabaseMigrator()
        FeedDatabaseMigrations.registerAll(in: &partial)
        try partial.migrate(db, upTo: "feed_location")

        XCTAssertNoThrow(try FeedDatabaseMigrations.runAll(on: db))
        let columns = try db.read { try $0.columns(in: "feed_comments").map(\.name) }
        XCTAssertTrue(columns.contains("mediaJson"))
        XCTAssertTrue(columns.contains("locationJson"))
    }

    // MARK: - Round-trip

    func test_mediaJson_roundTripsThroughTheRecord() throws {
        let db = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: db)
        let json = try makeMediaJson(transcription: "bonjour tout le monde")
        let comment = CommentRecordFactory.make(id: "c_media", postId: "p1", mediaJson: json)

        try db.write { try comment.insert($0) }

        let fetched = try db.read { try CommentRecord.filter(Column("id") == "c_media").fetchOne($0) }
        XCTAssertEqual(fetched?.media.count, 1)
        XCTAssertEqual(fetched?.media.first?.transcription?.resolvedText, "bonjour tout le monde")
    }

    func test_media_defaultsToEmpty() {
        XCTAssertTrue(CommentRecordFactory.make(id: "c_no_media").media.isEmpty)
    }

    // MARK: - Actor

    func test_updateCommentMedia_replacesTheBlobAndBumpsChangeVersion() async throws {
        let (actor, db) = try makeActor()
        try await actor.insertComment(
            CommentRecordFactory.make(id: "c_enrich", postId: "p1",
                                      mediaJson: try makeMediaJson(transcription: ""))
        )

        try await actor.updateCommentMedia(
            commentId: "c_enrich",
            mediaJson: try makeMediaJson(transcription: "transcription prête")
        )

        let fetched = try await db.read { try CommentRecord.filter(Column("id") == "c_enrich").fetchOne($0) }
        XCTAssertEqual(fetched?.media.first?.transcription?.resolvedText, "transcription prête")
        XCTAssertEqual(fetched?.changeVersion, 1)
    }

    func test_updateCommentMedia_unknownComment_isANoOp() async throws {
        let (actor, db) = try makeActor()

        try await actor.updateCommentMedia(
            commentId: "ghost", mediaJson: try makeMediaJson(transcription: "x")
        )

        let count = try await db.read { try CommentRecord.fetchCount($0) }
        XCTAssertEqual(count, 0)
    }
}
