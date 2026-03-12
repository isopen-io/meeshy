import XCTest
@testable import MeeshySDK

final class UserModelsTests: XCTestCase {

    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            if let date = formatter.date(from: dateString) { return date }
            let fallback = ISO8601DateFormatter()
            fallback.formatOptions = [.withInternetDateTime]
            if let date = fallback.date(from: dateString) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateString)")
        }
        return decoder
    }

    // MARK: - APIConversationUser

    func testAPIConversationUserDecoding() throws {
        let json = """
        {
            "id": "user1",
            "username": "alice",
            "displayName": "Alice W",
            "firstName": "Alice",
            "lastName": "Wonderland",
            "avatar": "https://img.test/alice.png",
            "avatarUrl": "https://cdn.test/alice.png",
            "isOnline": true,
            "lastActiveAt": "2026-01-15T10:30:00.000Z"
        }
        """.data(using: .utf8)!

        let user = try makeDecoder().decode(APIConversationUser.self, from: json)
        XCTAssertEqual(user.id, "user1")
        XCTAssertEqual(user.username, "alice")
        XCTAssertEqual(user.displayName, "Alice W")
        XCTAssertEqual(user.firstName, "Alice")
        XCTAssertEqual(user.lastName, "Wonderland")
        XCTAssertEqual(user.avatar, "https://img.test/alice.png")
        XCTAssertEqual(user.avatarUrl, "https://cdn.test/alice.png")
        XCTAssertEqual(user.isOnline, true)
        XCTAssertNotNil(user.lastActiveAt)
    }

    func testAPIConversationUserNameComputed() throws {
        let withDisplayName = """
        {"id":"u1","username":"alice","displayName":"Alice W"}
        """.data(using: .utf8)!

        let user1 = try makeDecoder().decode(APIConversationUser.self, from: withDisplayName)
        XCTAssertEqual(user1.name, "Alice W")

        let withoutDisplayName = """
        {"id":"u2","username":"bob","displayName":null}
        """.data(using: .utf8)!

        let user2 = try makeDecoder().decode(APIConversationUser.self, from: withoutDisplayName)
        XCTAssertEqual(user2.name, "bob")
    }

    func testAPIConversationUserResolvedAvatar() throws {
        let bothAvatars = """
        {"id":"u1","username":"a","avatar":"primary.png","avatarUrl":"fallback.png"}
        """.data(using: .utf8)!

        let user1 = try makeDecoder().decode(APIConversationUser.self, from: bothAvatars)
        XCTAssertEqual(user1.resolvedAvatar, "primary.png")

        let onlyUrl = """
        {"id":"u2","username":"b","avatar":null,"avatarUrl":"fallback.png"}
        """.data(using: .utf8)!

        let user2 = try makeDecoder().decode(APIConversationUser.self, from: onlyUrl)
        XCTAssertEqual(user2.resolvedAvatar, "fallback.png")

        let neither = """
        {"id":"u3","username":"c","avatar":null,"avatarUrl":null}
        """.data(using: .utf8)!

        let user3 = try makeDecoder().decode(APIConversationUser.self, from: neither)
        XCTAssertNil(user3.resolvedAvatar)
    }

    // MARK: - APIConversationMember

    func testAPIConversationMemberDecoding() throws {
        let json = """
        {
            "id": "part1",
            "conversationId": "conv1",
            "type": "user",
            "userId": "user1",
            "displayName": "Alice",
            "avatar": null,
            "role": "admin",
            "language": "en",
            "permissions": {
                "canSendMessages": true,
                "canSendFiles": true,
                "canSendImages": true,
                "canSendVideos": true,
                "canSendAudios": true,
                "canSendLocations": true,
                "canSendLinks": true
            },
            "isActive": true,
            "isOnline": true,
            "joinedAt": "2026-01-15T10:30:00.000Z",
            "leftAt": null,
            "bannedAt": null,
            "nickname": null,
            "lastActiveAt": null,
            "user": {"id":"user1","username":"alice","displayName":"Alice"}
        }
        """.data(using: .utf8)!

        let member = try makeDecoder().decode(APIParticipant.self, from: json)
        XCTAssertEqual(member.userId, "user1")
        XCTAssertEqual(member.role, "admin")
        XCTAssertEqual(member.user?.username, "alice")
        XCTAssertEqual(member.displayName, "Alice")
        XCTAssertEqual(member.type, .user)
        XCTAssertTrue(member.isActive)
    }

    // MARK: - APIConversationLastMessage

    func testAPIConversationLastMessageDecoding() throws {
        let json = """
        {
            "id": "msg1",
            "content": "Hello there!",
            "senderId": "user1",
            "createdAt": "2026-01-15T10:30:00.000Z",
            "messageType": "text",
            "sender": {"id":"user1","username":"alice","displayName":"Alice"},
            "attachments": [],
            "_count": {"attachments": 0},
            "isBlurred": false,
            "isViewOnce": false,
            "expiresAt": null
        }
        """.data(using: .utf8)!

        let message = try makeDecoder().decode(APIConversationLastMessage.self, from: json)
        XCTAssertEqual(message.id, "msg1")
        XCTAssertEqual(message.content, "Hello there!")
        XCTAssertEqual(message.senderId, "user1")
        XCTAssertEqual(message.messageType, "text")
        XCTAssertEqual(message.sender?.username, "alice")
        XCTAssertEqual(message.attachments?.count, 0)
        XCTAssertEqual(message._count?.attachments, 0)
        XCTAssertEqual(message.isBlurred, false)
        XCTAssertEqual(message.isViewOnce, false)
        XCTAssertNil(message.expiresAt)
    }

    // MARK: - APIConversation (full)

    func testAPIConversationDecoding() throws {
        let json = makeFullConversationJSON()
        let conversation = try makeDecoder().decode(APIConversation.self, from: json)

        XCTAssertEqual(conversation.id, "conv1")
        XCTAssertEqual(conversation.type, "direct")
        XCTAssertEqual(conversation.identifier, "conv-abc")
        XCTAssertNil(conversation.title)
        XCTAssertEqual(conversation.memberCount, 2)
        XCTAssertEqual(conversation.participants?.count, 2)
        XCTAssertEqual(conversation.unreadCount, 3)
        XCTAssertNotNil(conversation.lastMessage)
        XCTAssertEqual(conversation.lastMessage?.content, "Hey!")
    }

    // MARK: - toConversation

    func testToConversationSetsBasicFields() throws {
        let json = makeFullConversationJSON()
        let apiConv = try makeDecoder().decode(APIConversation.self, from: json)
        let conv = apiConv.toConversation(currentUserId: "me")

        XCTAssertEqual(conv.id, "conv1")
        XCTAssertEqual(conv.type, .direct)
        XCTAssertEqual(conv.identifier, "conv-abc")
        XCTAssertEqual(conv.memberCount, 2)
        XCTAssertEqual(conv.unreadCount, 3)
    }

    func testToConversationSetsPinnedAndMutedFromUserPreferences() throws {
        let json = makeFullConversationJSON(isPinned: true, isMuted: true)
        let apiConv = try makeDecoder().decode(APIConversation.self, from: json)
        let conv = apiConv.toConversation(currentUserId: "me")

        XCTAssertTrue(conv.isPinned)
        XCTAssertTrue(conv.isMuted)
    }

    func testToConversationSetsParticipantUserIdForDirectConversation() throws {
        let json = makeFullConversationJSON()
        let apiConv = try makeDecoder().decode(APIConversation.self, from: json)
        let conv = apiConv.toConversation(currentUserId: "me")

        XCTAssertEqual(conv.participantUserId, "other")
    }

    func testToConversationUsesOtherUserNameForDirectTitle() throws {
        let json = makeFullConversationJSON()
        let apiConv = try makeDecoder().decode(APIConversation.self, from: json)
        let conv = apiConv.toConversation(currentUserId: "me")

        XCTAssertEqual(conv.title, "Bob")
    }

    func testToConversationGroupUsesTitle() throws {
        let json = """
        {
            "id": "conv2",
            "type": "group",
            "identifier": "grp-xyz",
            "title": "Team Chat",
            "memberCount": 5,
            "unreadCount": 0,
            "participants": [],
            "createdAt": "2026-01-15T10:30:00.000Z"
        }
        """.data(using: .utf8)!

        let apiConv = try makeDecoder().decode(APIConversation.self, from: json)
        let conv = apiConv.toConversation(currentUserId: "me")

        XCTAssertEqual(conv.type, .group)
        XCTAssertEqual(conv.title, "Team Chat")
    }

    // MARK: - Helpers

    private func makeFullConversationJSON(isPinned: Bool = false, isMuted: Bool = false) -> Data {
        """
        {
            "id": "conv1",
            "type": "direct",
            "identifier": "conv-abc",
            "title": null,
            "description": null,
            "avatar": null,
            "banner": null,
            "communityId": null,
            "isActive": true,
            "memberCount": 2,
            "lastMessageAt": "2026-01-15T10:30:00.000Z",
            "participants": [
                {
                    "id": "p1", "conversationId": "conv1", "type": "user",
                    "userId": "me", "displayName": "Me", "role": "member",
                    "language": "en", "isActive": true,
                    "permissions": {"canSendMessages":true,"canSendFiles":true,"canSendImages":true,"canSendVideos":true,"canSendAudios":true,"canSendLocations":true,"canSendLinks":true},
                    "joinedAt": "2026-01-15T10:30:00.000Z",
                    "user": {"id":"me","username":"myuser","displayName":"Me"}
                },
                {
                    "id": "p2", "conversationId": "conv1", "type": "user",
                    "userId": "other", "displayName": "Bob", "role": "member",
                    "language": "en", "isActive": true,
                    "permissions": {"canSendMessages":true,"canSendFiles":true,"canSendImages":true,"canSendVideos":true,"canSendAudios":true,"canSendLocations":true,"canSendLinks":true},
                    "joinedAt": "2026-01-15T10:30:00.000Z",
                    "user": {"id":"other","username":"bob","displayName":"Bob"}
                }
            ],
            "lastMessage": {
                "id": "msg1",
                "content": "Hey!",
                "senderId": "other",
                "createdAt": "2026-01-15T10:30:00.000Z",
                "messageType": "text",
                "sender": {"id":"other","username":"bob","displayName":"Bob"}
            },
            "userPreferences": [
                {
                    "isPinned": \(isPinned),
                    "isMuted": \(isMuted),
                    "isArchived": false,
                    "tags": []
                }
            ],
            "unreadCount": 3,
            "updatedAt": "2026-01-15T10:30:00.000Z",
            "createdAt": "2026-01-15T10:30:00.000Z"
        }
        """.data(using: .utf8)!
    }
}
