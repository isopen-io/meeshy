import XCTest
import GRDB
@testable import MeeshySDK

final class DatabaseMigrationTableTests: XCTestCase {

    static let appIdentifiers = [
        "v1_create_tables",
        "v2_participant_cache",
        "v3_unified_cache",
        "v4_drop_legacy_tables",
        "v5_translation_cache",
        "v6_tus_upload_checkpoint",
        "search_idx_v1_conversations_users_fts5",
        "v7_cache_entries_itemId_index",
        "v8_cache_entries_content_hash",
        "v9_cache_entries_position",
        "v10_purge_canvas_reencoded_by_v1",
    ]

    static let messageIdentifiers = [
        "msg_v1_messages",
        "msg_v1_pending_ids",
        "msg_v1_translations",
        "msg_v1_transcriptions",
        "msg_v1_audio_translations",
        "msg_v1_local_attachments",
        "outbox",
        "outbox_v2_client_message_id",
        "messages_cached_time_string",
        "msg_v1_messages_fts5",
        "messages_call_summary",
        "messages_recipient_count",
        "messages_location",
        "messages_send_attempts",
        "outbox_v3_waiting_for_fanout_origin_since",
        "messages_join_notice",
        "messages_sticker",
        "messages_ephemeral_duration",
        "messages_view_once_opened_at",
        "messages_tracked_links",
        "messages_sender_is_anonymous",
        "messages_sender_has_account",
        "outbox_v4_cancel_requested_at",
        "messages_sender_ring",
        "messages_edited_by_id",
        "messages_e2ee_plaintext_erasures_v2",
    ]

    static let feedIdentifiers = [
        "feed_v1_posts",
        "feed_v1_comments",
        "feed_v1_translations",
        "feed_v2_comment_reactions",
        "feed_location",
        "feed_v3_comment_media",
        "feed_v4_post_audience",
        "feed_v5_post_reach_counters",
        "feed_v6_post_author_ring",
    ]

    static let searchIdentifiers = [
        "search_idx_v1_conversations_users_fts5",
    ]

    private func appliedIdentifiers(_ queue: DatabaseQueue) throws -> [String] {
        try queue.read { db in
            try String.fetchAll(db, sql: "SELECT identifier FROM grdb_migrations ORDER BY rowid")
        }
    }

    private func schemaFingerprint(_ queue: DatabaseQueue) throws -> [String] {
        try queue.read { db in
            try String.fetchAll(db, sql: """
                SELECT type || '|' || name || '|' || tbl_name || '|' || COALESCE(sql, '')
                FROM sqlite_master
                WHERE name NOT LIKE 'sqlite_%' AND name != 'grdb_migrations'
                ORDER BY type, name, tbl_name
                """)
        }
    }

    func test_messageTable_identifiers_areExactlyTheHistoricalOrder() {
        XCTAssertEqual(MessageDatabaseMigrations.all.map(\.identifier), Self.messageIdentifiers)
    }

    func test_feedTable_identifiers_areExactlyTheHistoricalOrder() {
        XCTAssertEqual(FeedDatabaseMigrations.all.map(\.identifier), Self.feedIdentifiers)
    }

    func test_searchIndexTable_identifiers_areExactlyTheHistoricalOrder() {
        XCTAssertEqual(SearchIndexMigrations.all.map(\.identifier), Self.searchIdentifiers)
    }

    func test_appTable_identifiers_areExactlyTheHistoricalOrder() {
        XCTAssertEqual(AppDatabaseMigrations.all.map(\.identifier), Self.appIdentifiers)
    }

    func test_registerAll_registersExactlyTheTable() {
        var message = DatabaseMigrator()
        MessageDatabaseMigrations.registerAll(in: &message)
        var feed = DatabaseMigrator()
        FeedDatabaseMigrations.registerAll(in: &feed)
        var search = DatabaseMigrator()
        SearchIndexMigrations.registerAll(in: &search)

        XCTAssertEqual(message.migrations, MessageDatabaseMigrations.all.map(\.identifier))
        XCTAssertEqual(feed.migrations, FeedDatabaseMigrations.all.map(\.identifier))
        XCTAssertEqual(search.migrations, SearchIndexMigrations.all.map(\.identifier))
        XCTAssertEqual(AppDatabase.migrator().migrations, AppDatabaseMigrations.all.map(\.identifier))
    }

    func test_appDatabase_appliedIdentifiers_areExactlyTheHistoricalOrder() throws {
        let queue = try DatabaseQueue()
        try AppDatabase.runMigrations(on: queue)

        XCTAssertEqual(try appliedIdentifiers(queue), Self.appIdentifiers)
    }

    func test_everyTable_identifiersAreUnique() {
        for table in [Self.appIdentifiers, Self.messageIdentifiers, Self.feedIdentifiers, Self.searchIdentifiers] {
            XCTAssertEqual(Set(table).count, table.count)
        }
    }

    func test_messageAndFeedIdentifiers_shareNoName() {
        XCTAssertTrue(Set(Self.messageIdentifiers).isDisjoint(with: Self.feedIdentifiers))
    }

    func test_messageThenFeed_onTheSameQueue_appliesBothTablesInOrder() throws {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        try FeedDatabaseMigrations.runAll(on: queue)

        XCTAssertEqual(try appliedIdentifiers(queue), Self.messageIdentifiers + Self.feedIdentifiers)
    }

    func test_runTwice_isIdempotent_forEveryMigrator() throws {
        let runs: [(String, (DatabaseQueue) throws -> Void)] = [
            ("app", { try AppDatabase.runMigrations(on: $0) }),
            ("message+feed", {
                try MessageDatabaseMigrations.runAll(on: $0)
                try FeedDatabaseMigrations.runAll(on: $0)
            }),
            ("search", { try SearchIndexMigrations.runAll(on: $0) }),
        ]
        for (name, run) in runs {
            let queue = try DatabaseQueue()
            try run(queue)
            let schema = try schemaFingerprint(queue)
            let applied = try appliedIdentifiers(queue)

            try run(queue)

            XCTAssertEqual(try schemaFingerprint(queue), schema, name)
            XCTAssertEqual(try appliedIdentifiers(queue), applied, name)
        }
    }
}
