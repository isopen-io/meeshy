import XCTest
import GRDB
@testable import MeeshySDK

final class MessageRecordTests: XCTestCase {

    func test_equatable_sameIdDifferentVersion_areNotEqual() {
        let a = MessageRecordFactory.make(localId: "msg_1", changeVersion: 1)
        let b = MessageRecordFactory.make(localId: "msg_1", changeVersion: 2)
        XCTAssertNotEqual(a, b)
    }

    func test_equatable_sameIdSameVersion_areEqual() {
        let a = MessageRecordFactory.make(localId: "msg_1", changeVersion: 1)
        let b = MessageRecordFactory.make(localId: "msg_1", changeVersion: 1)
        XCTAssertEqual(a, b)
    }

    func test_equatable_differentIdSameVersion_areNotEqual() {
        let a = MessageRecordFactory.make(localId: "msg_1", changeVersion: 1)
        let b = MessageRecordFactory.make(localId: "msg_2", changeVersion: 1)
        XCTAssertNotEqual(a, b)
    }

    func test_grdb_insertAndFetch_roundtrip() throws {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)

        let record = MessageRecordFactory.make(localId: "test_rt", content: "Hello world")
        try dbQueue.write { db in try record.insert(db) }

        let fetched = try dbQueue.read { db in
            try MessageRecord.fetchOne(db, key: "test_rt")
        }

        XCTAssertNotNil(fetched)
        XCTAssertEqual(fetched?.localId, "test_rt")
        XCTAssertEqual(fetched?.content, "Hello world")
        XCTAssertEqual(fetched?.state, .sending)
    }

    func test_grdb_allFieldsPersist() throws {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)

        var record = MessageRecordFactory.make(localId: "full_test")
        record.replyToId = "reply_1"
        record.forwardedFromId = "fwd_1"
        record.isEncrypted = true
        record.encryptionMode = "E2EE"
        record.effectFlags = 3
        record.pinnedAt = Date()
        record.pinnedBy = "admin"
        record.isEdited = true
        record.senderName = "Alice"
        record.senderColor = "#FF0000"

        try dbQueue.write { db in try record.insert(db) }

        let fetched = try dbQueue.read { db in
            try MessageRecord.fetchOne(db, key: "full_test")
        }!

        XCTAssertEqual(fetched.replyToId, "reply_1")
        XCTAssertEqual(fetched.forwardedFromId, "fwd_1")
        XCTAssertTrue(fetched.isEncrypted)
        XCTAssertEqual(fetched.encryptionMode, "E2EE")
        XCTAssertEqual(fetched.effectFlags, 3)
        XCTAssertNotNil(fetched.pinnedAt)
        XCTAssertEqual(fetched.pinnedBy, "admin")
        XCTAssertTrue(fetched.isEdited)
        XCTAssertEqual(fetched.senderName, "Alice")
        XCTAssertEqual(fetched.senderColor, "#FF0000")
    }
}

// MARK: - Factory

enum MessageRecordFactory {
    static func make(
        localId: String = "temp_\(UUID().uuidString)",
        conversationId: String = "conv_default",
        senderId: String = "user_me",
        content: String? = "Test message",
        state: MessageState = .sending,
        createdAt: Date = Date(),
        changeVersion: Int64 = 0
    ) -> MessageRecord {
        MessageRecord(
            localId: localId,
            serverId: nil,
            conversationId: conversationId,
            senderId: senderId,
            content: content,
            originalLanguage: "fr",
            messageType: "text",
            messageSource: "user",
            contentType: "text",
            state: state,
            retryCount: 0,
            lastError: nil,
            isEncrypted: false,
            encryptionMode: nil,
            encryptedPayload: nil,
            replyToId: nil,
            storyReplyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            replyToJson: nil,
            forwardedFromJson: nil,
            expiresAt: nil,
            effectFlags: 0,
            maxViewOnceCount: nil,
            viewOnceCount: 0,
            isEdited: false,
            editedAt: nil,
            deletedAt: nil,
            pinnedAt: nil,
            pinnedBy: nil,
            senderName: nil,
            senderUsername: nil,
            senderColor: nil,
            senderAvatarURL: nil,
            deliveredCount: 0,
            readCount: 0,
            deliveredToAllAt: nil,
            readByAllAt: nil,
            createdAt: createdAt,
            sentAt: nil,
            deliveredAt: nil,
            readAt: nil,
            updatedAt: createdAt,
            attachmentsJson: nil,
            reactionsJson: nil,
            reactionCount: 0,
            currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil,
            cachedBubbleHeight: nil,
            cachedLastLineWidth: nil,
            cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0,
            layoutMaxWidth: nil,
            changeVersion: changeVersion
        )
    }
}
