import XCTest
import Combine
@testable import MeeshySDK

/// Point 53: SocialSocket post event edge cases and publisher tests
/// Point 54: Story event edge cases
/// Point 55: Friend-related event struct decoding (FriendRequest model + notification)
final class SocialSocketAdditionalTests: XCTestCase {

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso.date(from: dateStr) { return date }
            iso.formatOptions = [.withInternetDateTime]
            if let date = iso.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid date: \(dateStr)"
            )
        }
        return d
    }()

    // MARK: - Shared JSON Fixtures

    private func minimalAPIPostJSON(id: String = "post1", type: String = "POST", content: String = "Hello") -> String {
        """
        {
            "id": "\(id)",
            "type": "\(type)",
            "content": "\(content)",
            "createdAt": "2026-04-09T10:00:00.000Z",
            "author": {"id": "a1", "username": "alice"},
            "likeCount": 0,
            "commentCount": 0
        }
        """
    }

    // MARK: - Point 53: Post publishers on MockSocialSocket

    func test_mockSocialSocket_postCreatedPublisher() {
        let mock = MockSocialSocket()
        let expectation = expectation(description: "postCreated emits")
        var cancellables = Set<AnyCancellable>()
        var receivedId: String?

        mock.postCreated
            .sink { post in
                receivedId = post.id
                expectation.fulfill()
            }
            .store(in: &cancellables)

        let postJSON = minimalAPIPostJSON(id: "p1")
        let post = try! decoder.decode(APIPost.self, from: postJSON.data(using: .utf8)!)
        mock.postCreated.send(post)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertEqual(receivedId, "p1")
    }

    func test_mockSocialSocket_postDeletedPublisher() {
        let mock = MockSocialSocket()
        let expectation = expectation(description: "postDeleted emits")
        var cancellables = Set<AnyCancellable>()
        var receivedId: String?

        mock.postDeleted
            .sink { postId in
                receivedId = postId
                expectation.fulfill()
            }
            .store(in: &cancellables)

        mock.postDeleted.send("deleted-post-id")

        wait(for: [expectation], timeout: 1.0)
        XCTAssertEqual(receivedId, "deleted-post-id")
    }

    func test_mockSocialSocket_connectDisconnect() {
        let mock = MockSocialSocket()
        XCTAssertFalse(mock.isConnected)
        XCTAssertEqual(mock.connectionState, .disconnected)
        XCTAssertEqual(mock.connectCallCount, 0)

        mock.connect()
        XCTAssertEqual(mock.connectCallCount, 1)

        mock.disconnect()
        XCTAssertEqual(mock.disconnectCallCount, 1)
    }

    func test_mockSocialSocket_subscribeFeed() {
        let mock = MockSocialSocket()
        XCTAssertEqual(mock.subscribeFeedCallCount, 0)

        mock.subscribeFeed()
        XCTAssertEqual(mock.subscribeFeedCallCount, 1)
    }

    // MARK: - Point 53: SocketPostBookmarkedData

    func test_socketPostBookmarkedData_bookmarked() throws {
        let json = """
        {"postId": "p1", "bookmarked": true}
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketPostBookmarkedData.self, from: json)
        XCTAssertEqual(data.postId, "p1")
        XCTAssertTrue(data.bookmarked)
    }

    func test_socketPostBookmarkedData_unbookmarked() throws {
        let json = """
        {"postId": "p2", "bookmarked": false}
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketPostBookmarkedData.self, from: json)
        XCTAssertEqual(data.postId, "p2")
        XCTAssertFalse(data.bookmarked)
    }

    // MARK: - Point 53: SocketPostTranslationUpdatedData

    func test_socketPostTranslationUpdatedData_decoding() throws {
        let json = """
        {
            "postId": "post1",
            "language": "fr",
            "translation": {
                "text": "Bonjour le monde",
                "translationModel": "nllb-200",
                "confidenceScore": 0.95,
                "createdAt": "2026-04-09T10:00:00.000Z"
            }
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketPostTranslationUpdatedData.self, from: json)
        XCTAssertEqual(data.postId, "post1")
        XCTAssertEqual(data.language, "fr")
        XCTAssertEqual(data.translation.text, "Bonjour le monde")
        XCTAssertEqual(data.translation.translationModel, "nllb-200")
        XCTAssertEqual(data.translation.confidenceScore, 0.95)
        XCTAssertEqual(data.translation.createdAt, "2026-04-09T10:00:00.000Z")
    }

    func test_socketPostTranslationUpdatedData_minimalTranslation() throws {
        let json = """
        {
            "postId": "post2",
            "language": "es",
            "translation": {
                "text": "Hola mundo"
            }
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketPostTranslationUpdatedData.self, from: json)
        XCTAssertEqual(data.language, "es")
        XCTAssertEqual(data.translation.text, "Hola mundo")
        XCTAssertNil(data.translation.translationModel)
        XCTAssertNil(data.translation.confidenceScore)
        XCTAssertNil(data.translation.createdAt)
    }

    // MARK: - Point 53: SocketCommentTranslationUpdatedData

    func test_socketCommentTranslationUpdatedData_decoding() throws {
        let json = """
        {
            "commentId": "c1",
            "postId": "p1",
            "language": "de",
            "translation": {
                "text": "Toll!",
                "translationModel": "nllb-200",
                "confidenceScore": 0.88
            }
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketCommentTranslationUpdatedData.self, from: json)
        XCTAssertEqual(data.commentId, "c1")
        XCTAssertEqual(data.postId, "p1")
        XCTAssertEqual(data.language, "de")
        XCTAssertEqual(data.translation.text, "Toll!")
    }

    // MARK: - Point 53: SocketPostLikedData with empty reactionSummary

    func test_socketPostLikedData_emptyReactionSummary() throws {
        let json = """
        {
            "postId": "p1",
            "userId": "u1",
            "emoji": "\u{1F44D}",
            "likeCount": 1,
            "reactionSummary": {}
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketPostLikedData.self, from: json)
        XCTAssertEqual(data.likeCount, 1)
        XCTAssertTrue(data.reactionSummary.isEmpty)
    }

    // MARK: - Point 54: Story event edge cases

    func test_socketStoryViewedData_zeroViewCount() throws {
        let json = """
        {
            "storyId": "s1",
            "viewerId": "v1",
            "viewerUsername": "bob",
            "viewCount": 0
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStoryViewedData.self, from: json)
        XCTAssertEqual(data.viewCount, 0)
    }

    func test_socketStoryViewedData_largeViewCount() throws {
        let json = """
        {
            "storyId": "s2",
            "viewerId": "v2",
            "viewerUsername": "charlie",
            "viewCount": 1000000
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStoryViewedData.self, from: json)
        XCTAssertEqual(data.viewCount, 1000000)
    }

    func test_socketStoryReactedData_unicodeEmoji() throws {
        let json = """
        {"storyId": "s1", "userId": "u1", "emoji": "\u{1F1EB}\u{1F1F7}"}
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStoryReactedData.self, from: json)
        XCTAssertEqual(data.emoji, "\u{1F1EB}\u{1F1F7}")
    }

    func test_socketStoryCreatedData_storyType() throws {
        let json = """
        {
            "story": \(minimalAPIPostJSON(id: "story1", type: "STORY", content: "My story content"))
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStoryCreatedData.self, from: json)
        XCTAssertEqual(data.story.id, "story1")
        XCTAssertEqual(data.story.type, "STORY")
        XCTAssertEqual(data.story.content, "My story content")
    }

    func test_socketStoryTranslationUpdatedData_emptyTranslations() throws {
        let json = """
        {
            "postId": "s1",
            "textObjectIndex": 0,
            "translations": {}
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStoryTranslationUpdatedData.self, from: json)
        XCTAssertEqual(data.postId, "s1")
        XCTAssertEqual(data.textObjectIndex, 0)
        XCTAssertTrue(data.translations.isEmpty)
    }

    func test_socketStoryTranslationUpdatedData_multipleLanguages() throws {
        let json = """
        {
            "postId": "s2",
            "textObjectIndex": 1,
            "translations": {"fr": "Bonjour", "es": "Hola", "de": "Hallo", "ja": "hello in Japanese"}
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStoryTranslationUpdatedData.self, from: json)
        XCTAssertEqual(data.textObjectIndex, 1)
        XCTAssertEqual(data.translations.count, 4)
        XCTAssertEqual(data.translations["fr"], "Bonjour")
        XCTAssertEqual(data.translations["ja"], "hello in Japanese")
    }

    // MARK: - Point 55: FriendRequest model decoding

    func test_friendRequest_fullDecoding() throws {
        let json = """
        {
            "id": "fr1",
            "senderId": "u1",
            "receiverId": "u2",
            "message": "Hi! Let's connect",
            "status": "pending",
            "sender": {
                "id": "u1",
                "username": "alice",
                "firstName": "Alice",
                "lastName": "Dupont",
                "displayName": "Alice Dupont",
                "avatar": "https://cdn.meeshy.me/a.jpg",
                "isOnline": true,
                "lastActiveAt": "2026-04-09T10:00:00.000Z"
            },
            "receiver": {
                "id": "u2",
                "username": "bob",
                "firstName": "Bob",
                "lastName": "Martin",
                "displayName": "Bob Martin",
                "avatar": null,
                "isOnline": false
            },
            "createdAt": "2026-04-09T09:00:00.000Z",
            "updatedAt": "2026-04-09T09:30:00.000Z"
        }
        """.data(using: .utf8)!

        let request = try decoder.decode(FriendRequest.self, from: json)
        XCTAssertEqual(request.id, "fr1")
        XCTAssertEqual(request.senderId, "u1")
        XCTAssertEqual(request.receiverId, "u2")
        XCTAssertEqual(request.message, "Hi! Let's connect")
        XCTAssertEqual(request.status, "pending")
        XCTAssertEqual(request.sender?.username, "alice")
        XCTAssertEqual(request.sender?.displayName, "Alice Dupont")
        XCTAssertEqual(request.sender?.isOnline, true)
        XCTAssertNotNil(request.sender?.lastActiveAt)
        XCTAssertEqual(request.receiver?.username, "bob")
        XCTAssertNil(request.receiver?.avatar)
        XCTAssertEqual(request.receiver?.isOnline, false)
        XCTAssertNotNil(request.createdAt)
        XCTAssertNotNil(request.updatedAt)
    }

    func test_friendRequest_minimalDecoding() throws {
        let json = """
        {
            "id": "fr2",
            "senderId": "u3",
            "receiverId": "u4",
            "status": "accepted",
            "createdAt": "2026-04-09T08:00:00.000Z"
        }
        """.data(using: .utf8)!

        let request = try decoder.decode(FriendRequest.self, from: json)
        XCTAssertEqual(request.id, "fr2")
        XCTAssertEqual(request.status, "accepted")
        XCTAssertNil(request.message)
        XCTAssertNil(request.sender)
        XCTAssertNil(request.receiver)
        XCTAssertNil(request.respondedAt)
        XCTAssertNil(request.updatedAt)
    }

    func test_friendRequest_rejectedStatus() throws {
        let json = """
        {
            "id": "fr3",
            "senderId": "u5",
            "receiverId": "u6",
            "status": "rejected",
            "respondedAt": "2026-04-09T12:00:00.000Z",
            "createdAt": "2026-04-09T11:00:00.000Z"
        }
        """.data(using: .utf8)!

        let request = try decoder.decode(FriendRequest.self, from: json)
        XCTAssertEqual(request.status, "rejected")
        XCTAssertNotNil(request.respondedAt)
    }

    func test_friendRequestUser_nameResolution_displayName() throws {
        let json = """
        {
            "id": "u1",
            "username": "alice",
            "firstName": "Alice",
            "lastName": "Dupont",
            "displayName": "Custom Name"
        }
        """.data(using: .utf8)!

        let user = try decoder.decode(FriendRequestUser.self, from: json)
        XCTAssertEqual(user.name, "Custom Name")
    }

    func test_friendRequestUser_nameResolution_firstAndLastName() throws {
        let json = """
        {
            "id": "u2",
            "username": "bob",
            "firstName": "Bob",
            "lastName": "Martin"
        }
        """.data(using: .utf8)!

        let user = try decoder.decode(FriendRequestUser.self, from: json)
        XCTAssertEqual(user.name, "Bob Martin")
    }

    func test_friendRequestUser_nameResolution_fallbackToUsername() throws {
        let json = """
        {
            "id": "u3",
            "username": "charlie"
        }
        """.data(using: .utf8)!

        let user = try decoder.decode(FriendRequestUser.self, from: json)
        XCTAssertEqual(user.name, "charlie")
    }

    // MARK: - Point 55: Friend request via SocketNotificationEvent

    func test_socketNotification_friendRequest_type() throws {
        let json = """
        {
            "id": "n1",
            "userId": "u1",
            "type": "friend_request",
            "content": "New friend request",
            "actor": {
                "id": "u2",
                "username": "alice",
                "displayName": "Alice"
            },
            "context": {
                "friendRequestId": "fr42"
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(SocketNotificationEvent.self, from: json)
        XCTAssertEqual(event.notificationType, .friendRequest)
        XCTAssertEqual(event.senderUsername, "alice")
        XCTAssertNotNil(event.context?.friendRequestId)
        XCTAssertEqual(event.context?.friendRequestId, "fr42")
    }

    func test_socketNotification_friendAccepted_type() throws {
        let json = """
        {
            "id": "n2",
            "userId": "u1",
            "type": "friend_accepted",
            "content": "bob accepted your request",
            "actor": {
                "id": "u3",
                "username": "bob"
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(SocketNotificationEvent.self, from: json)
        XCTAssertEqual(event.notificationType, .friendAccepted)
        XCTAssertEqual(event.senderUsername, "bob")
    }
}
