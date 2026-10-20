import Foundation
import GRDB

struct MessagesCachedTimeStringMigration: DatabaseMigration {
    let identifier = "messages_cached_time_string"

    func migrate(_ db: Database) throws {
        try db.alter(table: "messages") { t in
            t.add(column: "cachedTimeString", .text)
        }
        // Backfill existing rows — GRDB stores Date columns as UTC text
        // ("yyyy-MM-dd HH:mm:ss.SSS" with a space separator). The 'localtime'
        // modifier converts from UTC to the device's local timezone so the
        // cached string matches what TimeStringCache.shared.format() produces.
        try db.execute(sql: """
            UPDATE messages SET cachedTimeString =
                strftime('%H:%M', createdAt, 'localtime')
            WHERE cachedTimeString IS NULL
            """)
    }
}

struct MessagesCallSummaryMigration: DatabaseMigration {
    let identifier = "messages_call_summary"

    func migrate(_ db: Database) throws {
        try db.alter(table: "messages") { t in
            t.add(column: "callSummaryJson", .blob)
        }
    }
}

struct MessagesRecipientCountMigration: DatabaseMigration {
    let identifier = "messages_recipient_count"

    func migrate(_ db: Database) throws {
        try db.alter(table: "messages") { t in
            t.add(column: "recipientCount", .integer).notNull().defaults(to: 0)
        }
    }
}

struct MessagesLocationMigration: DatabaseMigration {
    let identifier = "messages_location"

    func migrate(_ db: Database) throws {
        try db.alter(table: "messages") { t in
            t.add(column: "locationJson", .text)
        }
    }
}

struct MessagesJoinNoticeMigration: DatabaseMigration {
    let identifier = "messages_join_notice"

    func migrate(_ db: Database) throws {
        try db.alter(table: "messages") { t in
            t.add(column: "joinNoticeJson", .blob)
        }
    }
}

struct MessagesStickerMigration: DatabaseMigration {
    let identifier = "messages_sticker"

    func migrate(_ db: Database) throws {
        try db.alter(table: "messages") { t in
            t.add(column: "stickerJson", .text)
        }
    }
}

struct MessagesEphemeralDurationMigration: DatabaseMigration {
    let identifier = "messages_ephemeral_duration"

    func migrate(_ db: Database) throws {
        try db.alter(table: "messages") { t in
            t.add(column: "ephemeralDuration", .integer)
        }
    }
}

struct MessagesViewOnceOpenedAtMigration: DatabaseMigration {
    let identifier = "messages_view_once_opened_at"

    func migrate(_ db: Database) throws {
        try db.alter(table: "messages") { t in
            t.add(column: "viewOnceOpenedAt", .datetime)
        }
    }
}

struct MessagesTrackedLinksMigration: DatabaseMigration {
    let identifier = "messages_tracked_links"

    func migrate(_ db: Database) throws {
        try db.alter(table: "messages") { t in
            t.add(column: "trackedLinksJson", .text)
        }
    }
}

struct MessagesSenderIsAnonymousMigration: DatabaseMigration {
    let identifier = "messages_sender_is_anonymous"

    func migrate(_ db: Database) throws {
        try db.alter(table: "messages") { t in
            t.add(column: "senderIsAnonymous", .boolean)
        }
    }
}

struct MessagesSenderHasAccountMigration: DatabaseMigration {
    let identifier = "messages_sender_has_account"

    func migrate(_ db: Database) throws {
        try db.alter(table: "messages") { t in
            t.add(column: "senderHasAccount", .boolean)
        }
    }
}

struct MessagesSenderRingMigration: DatabaseMigration {
    let identifier = "messages_sender_ring"

    func migrate(_ db: Database) throws {
        try db.alter(table: "messages") { t in
            t.add(column: "senderRingJson", .text)
        }
    }
}
