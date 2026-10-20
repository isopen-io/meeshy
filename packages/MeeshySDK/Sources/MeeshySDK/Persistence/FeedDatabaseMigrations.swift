import Foundation
import GRDB

public enum FeedDatabaseMigrations {

    /// Runs on the MAIN THREAD at cold start (`DependencyContainer.init`).
    /// `migrate` always takes the writer barrier — and waits out any write the
    /// notification extension holds on the shared App Group file (busy
    /// timeout: 5 s) — even when there is nothing to apply, which is every
    /// launch but the first after an update. A read (a WAL snapshot on a pool,
    /// never blocked by a writer) answers that case first.
    public static func runAll(on db: any DatabaseWriter) throws {
        var migrator = DatabaseMigrator()
        registerAll(in: &migrator)
        if try db.read({ try migrator.hasCompletedMigrations($0) }) { return }
        try migrator.migrate(db)
    }

    public static func registerAll(in migrator: inout DatabaseMigrator) {
        migrator.register(all)
    }

    static let all: [any DatabaseMigration] = [
        FeedV1PostsMigration(),
        FeedV1CommentsMigration(),
        FeedV1TranslationsMigration(),
        FeedV2CommentReactionsMigration(),
        FeedLocationMigration(),
        FeedV3CommentMediaMigration(),
        FeedV4PostAudienceMigration(),
        FeedV5PostReachCountersMigration(),
        FeedV6PostAuthorRingMigration(),
    ]
}
