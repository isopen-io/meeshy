import XCTest
@testable import MeeshySDK

final class PostModelsTests: XCTestCase {

    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: str) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(str)")
        }
        return decoder
    }

    // MARK: - APIAuthor

    func testAPIAuthorDecodableAllFields() throws {
        let json = """
        {
            "id": "author1",
            "username": "alice",
            "displayName": "Alice Wonderland",
            "avatar": "https://example.com/alice.jpg"
        }
        """.data(using: .utf8)!
        let author = try JSONDecoder().decode(APIAuthor.self, from: json)
        XCTAssertEqual(author.id, "author1")
        XCTAssertEqual(author.username, "alice")
        XCTAssertEqual(author.displayName, "Alice Wonderland")
        XCTAssertEqual(author.avatar, "https://example.com/alice.jpg")
    }

    func testAPIAuthorNameComputedProperty() throws {
        let withDisplay = """
        {"id": "a1", "username": "bob", "displayName": "Bobby"}
        """.data(using: .utf8)!
        let author1 = try JSONDecoder().decode(APIAuthor.self, from: withDisplay)
        XCTAssertEqual(author1.name, "Bobby")

        let withoutDisplay = """
        {"id": "a2", "username": "charlie"}
        """.data(using: .utf8)!
        let author2 = try JSONDecoder().decode(APIAuthor.self, from: withoutDisplay)
        XCTAssertEqual(author2.name, "charlie")

        let withoutBoth = """
        {"id": "a3"}
        """.data(using: .utf8)!
        let author3 = try JSONDecoder().decode(APIAuthor.self, from: withoutBoth)
        XCTAssertEqual(author3.name, "Anonymous")
    }

    // MARK: - APIPostMedia

    func testAPIPostMediaDecodable() throws {
        let json = """
        {
            "id": "media1",
            "fileName": "photo.jpg",
            "originalName": "vacation.jpg",
            "mimeType": "image/jpeg",
            "fileSize": 1024000,
            "fileUrl": "https://cdn.example.com/photo.jpg",
            "width": 1920,
            "height": 1080,
            "thumbnailUrl": "https://cdn.example.com/photo_thumb.jpg",
            "duration": 0,
            "order": 1,
            "caption": "Beautiful sunset"
        }
        """.data(using: .utf8)!
        let media = try JSONDecoder().decode(APIPostMedia.self, from: json)
        XCTAssertEqual(media.id, "media1")
        XCTAssertEqual(media.mimeType, "image/jpeg")
        XCTAssertEqual(media.mediaType, .image)
        XCTAssertEqual(media.width, 1920)
        XCTAssertEqual(media.height, 1080)
        XCTAssertEqual(media.caption, "Beautiful sunset")
    }

    func testAPIPostMediaTypeComputed() throws {
        let imageJson = """
        {"id": "m1", "mimeType": "image/png"}
        """.data(using: .utf8)!
        let image = try JSONDecoder().decode(APIPostMedia.self, from: imageJson)
        XCTAssertEqual(image.mediaType, .image)

        let videoJson = """
        {"id": "m2", "mimeType": "video/mp4"}
        """.data(using: .utf8)!
        let video = try JSONDecoder().decode(APIPostMedia.self, from: videoJson)
        XCTAssertEqual(video.mediaType, .video)

        let audioJson = """
        {"id": "m3", "mimeType": "audio/mpeg"}
        """.data(using: .utf8)!
        let audio = try JSONDecoder().decode(APIPostMedia.self, from: audioJson)
        XCTAssertEqual(audio.mediaType, .audio)

        let docJson = """
        {"id": "m4", "mimeType": "application/pdf"}
        """.data(using: .utf8)!
        let doc = try JSONDecoder().decode(APIPostMedia.self, from: docJson)
        XCTAssertEqual(doc.mediaType, .document)

        let nilJson = """
        {"id": "m5"}
        """.data(using: .utf8)!
        let nilMedia = try JSONDecoder().decode(APIPostMedia.self, from: nilJson)
        XCTAssertEqual(nilMedia.mediaType, .image)
    }

    // MARK: - APIPost

    func testAPIPostDecodable() throws {
        let json = """
        {
            "id": "post1",
            "type": "POST",
            "visibility": "PUBLIC",
            "content": "Hello world!",
            "originalLanguage": "en",
            "createdAt": "2026-01-15T10:30:00.000Z",
            "author": {"id": "a1", "username": "alice", "displayName": "Alice"},
            "likeCount": 42,
            "commentCount": 5,
            "repostCount": 2,
            "viewCount": 100,
            "isPinned": false,
            "isEdited": false
        }
        """.data(using: .utf8)!
        let post = try makeDecoder().decode(APIPost.self, from: json)
        XCTAssertEqual(post.id, "post1")
        XCTAssertEqual(post.type, "POST")
        XCTAssertEqual(post.visibility, "PUBLIC")
        XCTAssertEqual(post.content, "Hello world!")
        XCTAssertEqual(post.originalLanguage, "en")
        XCTAssertEqual(post.author.name, "Alice")
        XCTAssertEqual(post.likeCount, 42)
        XCTAssertEqual(post.commentCount, 5)
        XCTAssertEqual(post.repostCount, 2)
        XCTAssertEqual(post.isPinned, false)
    }

    func testAPIPostToFeedPost() throws {
        let json = """
        {
            "id": "post2",
            "type": "POST",
            "content": "Testing conversion",
            "createdAt": "2026-01-15T10:30:00.000Z",
            "author": {"id": "a2", "username": "bob"},
            "likeCount": 10,
            "commentCount": 3,
            "media": [
                {"id": "med1", "mimeType": "image/jpeg", "fileUrl": "https://example.com/img.jpg"}
            ]
        }
        """.data(using: .utf8)!
        let apiPost = try makeDecoder().decode(APIPost.self, from: json)
        let feedPost = apiPost.toFeedPost()
        XCTAssertEqual(feedPost.id, "post2")
        XCTAssertEqual(feedPost.author, "bob")
        XCTAssertEqual(feedPost.authorId, "a2")
        XCTAssertEqual(feedPost.content, "Testing conversion")
        XCTAssertEqual(feedPost.likes, 10)
        XCTAssertEqual(feedPost.commentCount, 3)
        XCTAssertTrue(feedPost.hasMedia)
        XCTAssertEqual(feedPost.media.count, 1)
    }

    // MARK: - APIPostComment

    func testAPIPostCommentDecodable() throws {
        let json = """
        {
            "id": "comment1",
            "content": "Great post!",
            "originalLanguage": "en",
            "likeCount": 3,
            "replyCount": 1,
            "createdAt": "2026-01-15T10:30:00.000Z",
            "author": {"id": "a3", "username": "charlie"}
        }
        """.data(using: .utf8)!
        let comment = try makeDecoder().decode(APIPostComment.self, from: json)
        XCTAssertEqual(comment.id, "comment1")
        XCTAssertEqual(comment.content, "Great post!")
        XCTAssertEqual(comment.originalLanguage, "en")
        XCTAssertEqual(comment.likeCount, 3)
        XCTAssertEqual(comment.replyCount, 1)
        XCTAssertEqual(comment.author.name, "charlie")
        XCTAssertNotNil(comment.createdAt)
    }

    // MARK: - FeedPost

    func testFeedPostInitDefaults() {
        let post = FeedPost(author: "TestUser", content: "Hello")
        XCTAssertEqual(post.author, "TestUser")
        XCTAssertEqual(post.content, "Hello")
        XCTAssertEqual(post.likes, 0)
        XCTAssertFalse(post.isLiked)
        XCTAssertTrue(post.comments.isEmpty)
        XCTAssertEqual(post.commentCount, 0)
        XCTAssertNil(post.repost)
        XCTAssertNil(post.repostAuthor)
        XCTAssertFalse(post.hasMedia)
    }

    func testFeedPostHasMediaComputed() {
        let withMedia = FeedPost(author: "A", content: "B", media: [.image()])
        XCTAssertTrue(withMedia.hasMedia)

        let withoutMedia = FeedPost(author: "C", content: "D")
        XCTAssertFalse(withoutMedia.hasMedia)
    }

    func testFeedPostMediaUrl() {
        let post = FeedPost(author: "A", content: "B", media: [.image(url: "https://example.com/img.jpg")])
        XCTAssertEqual(post.mediaUrl, "https://example.com/img.jpg")
    }
}
