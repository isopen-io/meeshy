import XCTest
@testable import MeeshySDK

final class SocialSocketEventTests: XCTestCase {

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

    private func minimalAPIPostJSON(
        id: String = "post1",
        type: String = "POST",
        content: String = "Hello world"
    ) -> String {
        """
        {
            "id": "\(id)",
            "type": "\(type)",
            "content": "\(content)",
            "createdAt": "2026-03-06T10:00:00.000Z",
            "author": {
                "id": "author1",
                "username": "alice",
                "displayName": "Alice Dupont",
                "avatar": "https://cdn.meeshy.me/avatars/alice.jpg"
            },
            "likeCount": 5,
            "commentCount": 2
        }
        """
    }

    private func minimalAPIPostCommentJSON(
        id: String = "comment1",
        content: String = "Great post!"
    ) -> String {
        """
        {
            "id": "\(id)",
            "content": "\(content)",
            "createdAt": "2026-03-06T11:00:00.000Z",
            "author": {
                "id": "author2",
                "username": "bob",
                "displayName": "Bob Martin"
            }
        }
        """
    }

    // MARK: - SocketPostCreatedData

    func testSocketPostCreatedDataDecoding() throws {
        let json = """
        {
            "post": \(minimalAPIPostJSON())
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketPostCreatedData.self, from: json)
        XCTAssertEqual(data.post.id, "post1")
        XCTAssertEqual(data.post.type, "POST")
        XCTAssertEqual(data.post.content, "Hello world")
        XCTAssertEqual(data.post.author.id, "author1")
        XCTAssertEqual(data.post.author.username, "alice")
        XCTAssertEqual(data.post.author.displayName, "Alice Dupont")
        XCTAssertEqual(data.post.likeCount, 5)
        XCTAssertEqual(data.post.commentCount, 2)
        XCTAssertNotNil(data.post.createdAt)
    }

    // MARK: - SocketPostUpdatedData

    func testSocketPostUpdatedDataDecoding() throws {
        let json = """
        {
            "post": \(minimalAPIPostJSON(id: "post2", content: "Updated content"))
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketPostUpdatedData.self, from: json)
        XCTAssertEqual(data.post.id, "post2")
        XCTAssertEqual(data.post.content, "Updated content")
    }

    // MARK: - SocketPostDeletedData

    func testSocketPostDeletedDataDecoding() throws {
        let json = """
        {"postId": "p1", "authorId": "a1"}
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketPostDeletedData.self, from: json)
        XCTAssertEqual(data.postId, "p1")
        XCTAssertEqual(data.authorId, "a1")
    }

    // MARK: - SocketPostLikedData

    func testSocketPostLikedDataDecoding() throws {
        let json = """
        {
            "postId": "p1",
            "userId": "u1",
            "emoji": "\u{2764}\u{FE0F}",
            "likeCount": 10,
            "reactionSummary": {"\u{2764}\u{FE0F}": 8, "\u{1F44D}": 2}
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketPostLikedData.self, from: json)
        XCTAssertEqual(data.postId, "p1")
        XCTAssertEqual(data.userId, "u1")
        XCTAssertEqual(data.emoji, "\u{2764}\u{FE0F}")
        XCTAssertEqual(data.likeCount, 10)
        XCTAssertEqual(data.reactionSummary["\u{2764}\u{FE0F}"], 8)
        XCTAssertEqual(data.reactionSummary["\u{1F44D}"], 2)
    }

    // MARK: - SocketPostUnlikedData

    func testSocketPostUnlikedDataDecoding() throws {
        let json = """
        {
            "postId": "p1",
            "userId": "u1",
            "likeCount": 9,
            "reactionSummary": {"\u{2764}\u{FE0F}": 7, "\u{1F44D}": 2}
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketPostUnlikedData.self, from: json)
        XCTAssertEqual(data.postId, "p1")
        XCTAssertEqual(data.userId, "u1")
        XCTAssertEqual(data.likeCount, 9)
        XCTAssertEqual(data.reactionSummary["\u{2764}\u{FE0F}"], 7)
        XCTAssertEqual(data.reactionSummary["\u{1F44D}"], 2)
    }

    // MARK: - SocketPostRepostedData

    func testSocketPostRepostedDataDecoding() throws {
        let json = """
        {
            "originalPostId": "orig1",
            "repost": \(minimalAPIPostJSON(id: "repost1", content: "Reposted!"))
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketPostRepostedData.self, from: json)
        XCTAssertEqual(data.originalPostId, "orig1")
        XCTAssertEqual(data.repost.id, "repost1")
        XCTAssertEqual(data.repost.content, "Reposted!")
        XCTAssertEqual(data.repost.author.username, "alice")
    }

    // MARK: - SocketStoryCreatedData

    func testSocketStoryCreatedDataDecoding() throws {
        let json = """
        {
            "story": \(minimalAPIPostJSON(id: "story1", type: "STORY", content: "My story"))
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStoryCreatedData.self, from: json)
        XCTAssertEqual(data.story.id, "story1")
        XCTAssertEqual(data.story.type, "STORY")
        XCTAssertEqual(data.story.content, "My story")
    }

    // MARK: - SocketStoryViewedData

    func testSocketStoryViewedDataDecoding() throws {
        let json = """
        {
            "storyId": "s1",
            "viewerId": "v1",
            "viewerUsername": "bob",
            "viewCount": 42
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStoryViewedData.self, from: json)
        XCTAssertEqual(data.storyId, "s1")
        XCTAssertEqual(data.viewerId, "v1")
        XCTAssertEqual(data.viewerUsername, "bob")
        XCTAssertEqual(data.viewCount, 42)
    }

    // MARK: - SocketStoryReactedData

    func testSocketStoryReactedDataDecoding() throws {
        let json = """
        {"storyId": "s1", "userId": "u1", "emoji": "\u{1F525}"}
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStoryReactedData.self, from: json)
        XCTAssertEqual(data.storyId, "s1")
        XCTAssertEqual(data.userId, "u1")
        XCTAssertEqual(data.emoji, "\u{1F525}")
    }

    // MARK: - SocketStatusCreatedData

    func testSocketStatusCreatedDataDecoding() throws {
        let json = """
        {
            "status": \(minimalAPIPostJSON(id: "status1", type: "STATUS", content: "Feeling good"))
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStatusCreatedData.self, from: json)
        XCTAssertEqual(data.status.id, "status1")
        XCTAssertEqual(data.status.type, "STATUS")
        XCTAssertEqual(data.status.content, "Feeling good")
    }

    // MARK: - SocketStatusDeletedData

    func testSocketStatusDeletedDataDecoding() throws {
        let json = """
        {"statusId": "st1", "authorId": "a1"}
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStatusDeletedData.self, from: json)
        XCTAssertEqual(data.statusId, "st1")
        XCTAssertEqual(data.authorId, "a1")
    }

    // MARK: - SocketStatusReactedData

    func testSocketStatusReactedDataDecoding() throws {
        let json = """
        {"statusId": "st1", "userId": "u1", "emoji": "\u{1F602}"}
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStatusReactedData.self, from: json)
        XCTAssertEqual(data.statusId, "st1")
        XCTAssertEqual(data.userId, "u1")
        XCTAssertEqual(data.emoji, "\u{1F602}")
    }

    // MARK: - SocketCommentAddedData

    func testSocketCommentAddedDataDecoding() throws {
        let json = """
        {
            "postId": "p1",
            "comment": \(minimalAPIPostCommentJSON()),
            "commentCount": 3
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketCommentAddedData.self, from: json)
        XCTAssertEqual(data.postId, "p1")
        XCTAssertEqual(data.commentCount, 3)
        XCTAssertEqual(data.comment.id, "comment1")
        XCTAssertEqual(data.comment.content, "Great post!")
        XCTAssertEqual(data.comment.author.id, "author2")
        XCTAssertEqual(data.comment.author.username, "bob")
        XCTAssertNotNil(data.comment.createdAt)
    }

    // MARK: - SocketCommentDeletedData

    func testSocketCommentDeletedDataDecoding() throws {
        let json = """
        {"postId": "p1", "commentId": "c1", "commentCount": 4}
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketCommentDeletedData.self, from: json)
        XCTAssertEqual(data.postId, "p1")
        XCTAssertEqual(data.commentId, "c1")
        XCTAssertEqual(data.commentCount, 4)
    }

    // MARK: - SocketCommentLikedData

    func testSocketCommentLikedDataDecoding() throws {
        let json = """
        {"postId": "p1", "commentId": "c1", "userId": "u1", "likeCount": 7}
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketCommentLikedData.self, from: json)
        XCTAssertEqual(data.postId, "p1")
        XCTAssertEqual(data.commentId, "c1")
        XCTAssertEqual(data.userId, "u1")
        XCTAssertEqual(data.likeCount, 7)
    }

    // MARK: - SocketStoryTranslationUpdatedData

    func testSocketStoryTranslationUpdatedDataDecoding() throws {
        let json = """
        {
            "postId": "p1",
            "textObjectIndex": 0,
            "translations": {"fr": "Bonjour", "es": "Hola"}
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(SocketStoryTranslationUpdatedData.self, from: json)
        XCTAssertEqual(data.postId, "p1")
        XCTAssertEqual(data.textObjectIndex, 0)
        XCTAssertEqual(data.translations["fr"], "Bonjour")
        XCTAssertEqual(data.translations["es"], "Hola")
        XCTAssertEqual(data.translations.count, 2)
    }

    // MARK: - APIPost with optional fields

    func testAPIPostDecodingWithAllOptionals() throws {
        let json = """
        {
            "id": "full1",
            "type": "POST",
            "visibility": "PUBLIC",
            "content": "Full post",
            "originalLanguage": "en",
            "createdAt": "2026-03-06T10:00:00.000Z",
            "updatedAt": "2026-03-06T11:00:00.000Z",
            "expiresAt": "2026-03-07T10:00:00.000Z",
            "author": {
                "id": "a1",
                "username": "alice",
                "displayName": "Alice",
                "avatar": "https://cdn.meeshy.me/a.jpg"
            },
            "likeCount": 10,
            "commentCount": 5,
            "repostCount": 2,
            "viewCount": 100,
            "bookmarkCount": 3,
            "shareCount": 1,
            "reactionSummary": {"\u{2764}\u{FE0F}": 8, "\u{1F44D}": 2},
            "isPinned": true,
            "isEdited": false,
            "isQuote": false,
            "moodEmoji": "\u{1F60A}",
            "audioUrl": "https://cdn.meeshy.me/audio.mp3",
            "audioDuration": 5000
        }
        """.data(using: .utf8)!

        let post = try decoder.decode(APIPost.self, from: json)
        XCTAssertEqual(post.id, "full1")
        XCTAssertEqual(post.type, "POST")
        XCTAssertEqual(post.visibility, "PUBLIC")
        XCTAssertEqual(post.content, "Full post")
        XCTAssertEqual(post.originalLanguage, "en")
        XCTAssertNotNil(post.updatedAt)
        XCTAssertNotNil(post.expiresAt)
        XCTAssertEqual(post.author.id, "a1")
        XCTAssertEqual(post.likeCount, 10)
        XCTAssertEqual(post.commentCount, 5)
        XCTAssertEqual(post.repostCount, 2)
        XCTAssertEqual(post.viewCount, 100)
        XCTAssertEqual(post.bookmarkCount, 3)
        XCTAssertEqual(post.shareCount, 1)
        XCTAssertEqual(post.reactionSummary?["\u{2764}\u{FE0F}"], 8)
        XCTAssertEqual(post.isPinned, true)
        XCTAssertEqual(post.isEdited, false)
        XCTAssertEqual(post.isQuote, false)
        XCTAssertEqual(post.moodEmoji, "\u{1F60A}")
        XCTAssertEqual(post.audioUrl, "https://cdn.meeshy.me/audio.mp3")
        XCTAssertEqual(post.audioDuration, 5000)
    }

    // MARK: - APIPostComment optional fields

    func testAPIPostCommentDecodingWithOptionals() throws {
        let json = """
        {
            "id": "c1",
            "content": "Nice!",
            "originalLanguage": "en",
            "likeCount": 3,
            "replyCount": 1,
            "createdAt": "2026-03-06T12:00:00.000Z",
            "author": {
                "id": "a1",
                "username": "charlie"
            }
        }
        """.data(using: .utf8)!

        let comment = try decoder.decode(APIPostComment.self, from: json)
        XCTAssertEqual(comment.id, "c1")
        XCTAssertEqual(comment.content, "Nice!")
        XCTAssertEqual(comment.originalLanguage, "en")
        XCTAssertEqual(comment.likeCount, 3)
        XCTAssertEqual(comment.replyCount, 1)
        XCTAssertNotNil(comment.createdAt)
        XCTAssertEqual(comment.author.id, "a1")
        XCTAssertEqual(comment.author.username, "charlie")
        XCTAssertNil(comment.author.displayName)
        XCTAssertNil(comment.author.avatar)
    }
}
