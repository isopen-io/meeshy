import XCTest
@testable import MeeshySDK

final class APIMessageToMessageTests: XCTestCase {

    // MARK: - Factory

    private func makeAPIMessage(
        id: String = "msg-test",
        conversationId: String = "conv-1",
        senderId: String = "sender-1",
        content: String = "Hello",
        createdAt: Date = Date(),
        extraFields: [String: Any] = [:]
    ) -> APIMessage {
        var json: [String: Any] = [
            "id": id,
            "conversationId": conversationId,
            "senderId": senderId,
            "content": content,
            "createdAt": ISO8601DateFormatter().string(from: createdAt),
            "updatedAt": ISO8601DateFormatter().string(from: createdAt),
        ]
        for (key, value) in extraFields {
            json[key] = value
        }
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(APIMessage.self, from: data)
    }

    private func makeSenderJSON(
        id: String = "participant-1",
        displayName: String = "John",
        avatar: String? = nil,
        type: String = "user",
        userId: String? = "user-1",
        username: String? = "john",
        userBlock: [String: Any]? = nil
    ) -> [String: Any] {
        var dict: [String: Any] = [
            "id": id,
            "displayName": displayName,
            "type": type,
        ]
        if let avatar { dict["avatar"] = avatar }
        if let userId { dict["userId"] = userId }
        if let username { dict["username"] = username }
        if let userBlock {
            dict["user"] = userBlock
        }
        return dict
    }

    // MARK: - isMe by userId

    func test_toMessage_isMe_matchesByUserId() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(userId: "user-42", username: "john"),
        ])

        let msg = api.toMessage(currentUserId: "user-42")

        XCTAssertTrue(msg.isMe)
    }

    // MARK: - isMe by username fallback

    func test_toMessage_isMe_matchesByUsername_whenUserIdDiffers() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(userId: "user-99", username: "john"),
        ])

        let msg = api.toMessage(currentUserId: "user-42", currentUsername: "john")

        XCTAssertTrue(msg.isMe)
    }

    // MARK: - isMe case-insensitive username

    func test_toMessage_isMe_caseInsensitiveUsername() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(userId: "user-99", username: "John"),
        ])

        let msg = api.toMessage(currentUserId: "user-42", currentUsername: "john")

        XCTAssertTrue(msg.isMe)
    }

    // MARK: - isMe false when neither matches

    func test_toMessage_isMe_falseWhenNeitherMatches() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(userId: "user-99", username: "alice"),
        ])

        let msg = api.toMessage(currentUserId: "user-42", currentUsername: "bob")

        XCTAssertFalse(msg.isMe)
    }

    // MARK: - isMe without currentUsername

    func test_toMessage_isMe_noCurrentUsername_fallsBackToUserId() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(userId: "user-99", username: "john"),
        ])

        let msg = api.toMessage(currentUserId: "user-99")

        XCTAssertTrue(msg.isMe)

        let msg2 = api.toMessage(currentUserId: "user-42")

        XCTAssertFalse(msg2.isMe)
    }

    // MARK: - senderUserId preserved

    func test_toMessage_preservesSenderUserId() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(userId: "user-77"),
        ])

        let msg = api.toMessage(currentUserId: "someone-else")

        XCTAssertEqual(msg.senderUserId, "user-77")
    }

    // MARK: - editedAt decoded (server's clock, used to order `message:edited` events)

    func test_decode_preservesEditedAt() {
        let editedAt = Date(timeIntervalSince1970: 1_700_000_000)
        let api = makeAPIMessage(extraFields: [
            "isEdited": true,
            "editedAt": ISO8601DateFormatter().string(from: editedAt),
        ])

        XCTAssertEqual(api.editedAt, editedAt)
    }

    func test_decode_editedAtNilWhenAbsent() {
        let api = makeAPIMessage()

        XCTAssertNil(api.editedAt)
    }

    // MARK: - senderUsername preserved

    func test_toMessage_preservesSenderUsername() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(username: "charlie"),
        ])

        let msg = api.toMessage(currentUserId: "someone-else")

        XCTAssertEqual(msg.senderUsername, "charlie")
    }

    // MARK: - senderUsername from nested user block

    func test_toMessage_preservesSenderUsername_fromUserBlock() {
        let api = makeAPIMessage(extraFields: [
            "sender": makeSenderJSON(
                username: nil,
                userBlock: ["id": "user-1", "username": "nested_user", "displayName": "Nested"]
            ),
        ])

        let msg = api.toMessage(currentUserId: "someone-else")

        XCTAssertEqual(msg.senderUsername, "nested_user")
    }

    // MARK: - storyReplyToId preserved

    func test_toMessage_preservesStoryReplyToId() {
        let storyId = "story-abc-123"
        let api = makeAPIMessage(extraFields: [
            "storyReplyToId": storyId,
        ])

        let msg = api.toMessage(currentUserId: "user-1")

        XCTAssertEqual(msg.storyReplyToId, storyId)
        XCTAssertNotNil(msg.replyTo)
        XCTAssertTrue(msg.replyTo?.isStoryReply ?? false)
    }

    // MARK: - mood reply enrichment (storyReplyTo.moodEmoji)

    func test_toMessage_storyReplyTo_withMoodEmoji_buildsMoodReply() {
        let api = makeAPIMessage(extraFields: [
            "storyReplyToId": "status-1",
            "storyReplyTo": [
                "id": "status-1",
                "reactionCount": 0,
                "commentCount": 0,
                "createdAt": ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: 1_700_000_000)),
                "previewText": "en forme",
                "moodEmoji": "🔥"
            ]
        ])

        let reply = api.toMessage(currentUserId: "user-1").replyTo

        XCTAssertEqual(reply?.moodEmoji, "🔥")
        XCTAssertEqual(reply?.previewText, "en forme")
        XCTAssertTrue(reply?.isStoryReply ?? false)
        XCTAssertNotNil(reply?.storyPublishedAt)
    }

    func test_toMessage_storyReplyTo_withoutMoodEmoji_staysStory() {
        let api = makeAPIMessage(extraFields: [
            "storyReplyToId": "story-1",
            "storyReplyTo": [
                "id": "story-1",
                "reactionCount": 2,
                "commentCount": 1,
                "createdAt": ISO8601DateFormatter().string(from: Date()),
                "previewText": "ma story"
            ]
        ])

        let reply = api.toMessage(currentUserId: "user-1").replyTo

        XCTAssertNil(reply?.moodEmoji)
        XCTAssertTrue(reply?.isStoryReply ?? false)
        XCTAssertEqual(reply?.previewText, "ma story")
    }

    // MARK: - attachment thumbHash preserved

    func test_toMessage_preservesThumbHash() {
        let thumbHashValue = "1QcSHQRnh493V4dIh4eXh1h4kJUI"
        let api = makeAPIMessage(extraFields: [
            "attachments": [
                [
                    "id": "att-1",
                    "fileName": "photo.jpg",
                    "mimeType": "image/jpeg",
                    "fileUrl": "https://example.com/photo.jpg",
                    "thumbHash": thumbHashValue,
                ] as [String: Any],
            ],
        ])

        let msg = api.toMessage(currentUserId: "user-1")

        XCTAssertEqual(msg.attachments.count, 1)
        XCTAssertEqual(msg.attachments.first?.thumbHash, thumbHashValue)
    }
}
