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

    func test_apiAuthor_decodeAllFields_populatesAllProperties() throws {
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

    func test_apiAuthor_name_prefersDisplayNameThenUsernameThenAnonymous() throws {
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

    func test_apiPostMedia_decode_populatesAllProperties() throws {
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

    func test_apiPostMedia_mediaType_derivesFromMimeType() throws {
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

    func test_apiPost_decode_populatesAllProperties() throws {
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

    func test_apiPost_toFeedPost_mapsFieldsAndMedia() throws {
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

    func test_APIPost_decodes_impressionCount_andMapsToFeedPost() throws {
        let json = """
        {
            "id": "post3",
            "type": "POST",
            "content": "Counters",
            "createdAt": "2026-01-15T10:30:00.000Z",
            "author": {"id": "a3", "username": "carol"},
            "viewCount": 4,
            "postOpenCount": 34,
            "impressionCount": 51
        }
        """.data(using: .utf8)!
        let apiPost = try makeDecoder().decode(APIPost.self, from: json)
        XCTAssertEqual(apiPost.impressionCount, 51)

        let feedPost = apiPost.toFeedPost()
        // Total (displayed) views and impressions are the raw, non-deduped
        // counters; unique views stay in viewCount (saved, not displayed).
        XCTAssertEqual(feedPost.impressionCount, 51)
        XCTAssertEqual(feedPost.postOpenCount, 34)
        XCTAssertEqual(feedPost.viewCount, 4)
    }

    func test_APIPost_missingImpressionCount_defaultsToZero() throws {
        let json = """
        {
            "id": "post4",
            "type": "POST",
            "content": "No counters",
            "createdAt": "2026-01-15T10:30:00.000Z",
            "author": {"id": "a4", "username": "dave"}
        }
        """.data(using: .utf8)!
        let apiPost = try makeDecoder().decode(APIPost.self, from: json)
        XCTAssertNil(apiPost.impressionCount)
        XCTAssertEqual(apiPost.toFeedPost().impressionCount, 0)
    }

    // MARK: - APIPostComment

    func test_apiPostComment_decode_populatesAllProperties() throws {
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

    func test_feedPost_initWithDefaults_setsExpectedDefaults() {
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

    func test_feedPost_hasMedia_reflectsMediaArray() {
        let withMedia = FeedPost(author: "A", content: "B", media: [.image()])
        XCTAssertTrue(withMedia.hasMedia)

        let withoutMedia = FeedPost(author: "C", content: "D")
        XCTAssertFalse(withoutMedia.hasMedia)
    }

    func test_feedPost_mediaUrl_returnsFirstMediaUrl() {
        let post = FeedPost(author: "A", content: "B", media: [.image(url: "https://example.com/img.jpg")])
        XCTAssertEqual(post.mediaUrl, "https://example.com/img.jpg")
    }

    // MARK: - APIRepostOf isQuote

    func test_APIRepostOf_decodesIsQuote() throws {
        let json = """
        {
            "id": "repost1",
            "content": "Original post content",
            "author": {"id": "a1", "username": "alice"},
            "createdAt": "2026-01-15T10:30:00.000Z",
            "isQuote": true
        }
        """.data(using: .utf8)!
        let result = try makeDecoder().decode(APIRepostOf.self, from: json)
        XCTAssertEqual(result.isQuote, true)
    }

    func test_APIRepostOf_decodesWithoutIsQuote() throws {
        let json = """
        {
            "id": "repost2",
            "content": "Original post content",
            "author": {"id": "a2", "username": "bob"},
            "createdAt": "2026-01-15T10:30:00.000Z"
        }
        """.data(using: .utf8)!
        let result = try makeDecoder().decode(APIRepostOf.self, from: json)
        XCTAssertNil(result.isQuote)
    }

    func test_toFeedPost_quotedRepost_setsIsQuote() throws {
        let json = """
        {
            "id": "post3",
            "type": "QUOTE",
            "content": "My commentary on this",
            "createdAt": "2026-01-15T10:30:00.000Z",
            "author": {"id": "a3", "username": "charlie"},
            "isQuote": true,
            "repostOf": {
                "id": "repost3",
                "content": "The quoted post",
                "author": {"id": "a1", "username": "alice"},
                "createdAt": "2026-01-14T10:30:00.000Z",
                "isQuote": true
            }
        }
        """.data(using: .utf8)!
        let apiPost = try makeDecoder().decode(APIPost.self, from: json)
        let feedPost = apiPost.toFeedPost()
        XCTAssertTrue(feedPost.isQuote)
    }

    // MARK: - RepostRequest encoding

    func test_RepostRequest_alwaysEncodesIsQuoteKey() throws {
        let request = RepostRequest()
        let data = try JSONEncoder().encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertNotNil(json["isQuote"], "isQuote key must always be present in encoded JSON")
        XCTAssertEqual(json["isQuote"] as? Bool, false)
    }

    func test_RepostRequest_encodesIsQuoteTrueWithContent() throws {
        let request = RepostRequest(content: "My quote", isQuote: true)
        let data = try JSONEncoder().encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertEqual(json["isQuote"] as? Bool, true)
        XCTAssertEqual(json["content"] as? String, "My quote")
    }

    func test_toFeedPost_simpleRepost_isQuoteFalse() throws {
        let json = """
        {
            "id": "post4",
            "type": "REPOST",
            "content": "",
            "createdAt": "2026-01-15T10:30:00.000Z",
            "author": {"id": "a4", "username": "dave"},
            "repostOf": {
                "id": "repost4",
                "content": "The reposted post",
                "author": {"id": "a1", "username": "alice"},
                "createdAt": "2026-01-14T10:30:00.000Z"
            }
        }
        """.data(using: .utf8)!
        let apiPost = try makeDecoder().decode(APIPost.self, from: json)
        let feedPost = apiPost.toFeedPost()
        XCTAssertFalse(feedPost.isQuote)
    }

    // MARK: - APIRepostOf new fields (Phase A backend exposure)

    func test_APIRepostOf_decodes_newFields() throws {
        let json = """
        {
          "id": "r1",
          "type": "STORY",
          "content": "hi",
          "originalLanguage": "fr",
          "translations": {"en": {"text": "hi en", "translationModel": "nllb-200"}},
          "storyEffects": {"background": "color:#FF00FF", "textColor": "#FFFFFF"},
          "audioUrl": "/api/v1/attachments/file/audio.mp3",
          "originalRepostOfId": "root-1",
          "author": {"id": "a", "username": "alice", "displayName": "Alice"},
          "media": [],
          "createdAt": "2026-05-05T10:00:00.000Z",
          "likeCount": 5,
          "commentCount": 2,
          "isQuote": false
        }
        """.data(using: .utf8)!
        let repostOf = try makeDecoder().decode(APIRepostOf.self, from: json)

        XCTAssertEqual(repostOf.type, "STORY")
        XCTAssertEqual(repostOf.originalLanguage, "fr")
        XCTAssertNotNil(repostOf.translations)
        XCTAssertEqual(repostOf.translations?["en"]?.text, "hi en")
        XCTAssertNotNil(repostOf.storyEffects)
        XCTAssertEqual(repostOf.storyEffects?.textColor, "#FFFFFF")
        XCTAssertEqual(repostOf.audioUrl, "/api/v1/attachments/file/audio.mp3")
        XCTAssertEqual(repostOf.originalRepostOfId, "root-1")
    }

    func test_APIRepostOf_decodes_legacyResponse_withoutNewFields() throws {
        // Older API responses don't have the new fields — must still decode cleanly
        let json = """
        {
          "id": "r1",
          "content": "hi",
          "author": {"id": "a", "username": "alice", "displayName": "Alice"},
          "media": [],
          "createdAt": "2026-05-05T10:00:00.000Z",
          "likeCount": 0,
          "commentCount": 0,
          "isQuote": false
        }
        """.data(using: .utf8)!
        let decoder = makeDecoder()
        XCTAssertNoThrow(try decoder.decode(APIRepostOf.self, from: json))
        let repostOf = try decoder.decode(APIRepostOf.self, from: json)
        XCTAssertNil(repostOf.type)
        XCTAssertNil(repostOf.originalLanguage)
        XCTAssertNil(repostOf.translations)
        XCTAssertNil(repostOf.storyEffects)
        XCTAssertNil(repostOf.audioUrl)
        XCTAssertNil(repostOf.originalRepostOfId)
    }

    func test_APIPost_decodes_originalRepostOfId() throws {
        let json = """
        {
          "id": "p1",
          "type": "POST",
          "originalRepostOfId": "root-1",
          "createdAt": "2026-05-05T10:00:00.000Z",
          "author": {"id": "a", "username": "alice", "displayName": "Alice"}
        }
        """.data(using: .utf8)!
        let post = try makeDecoder().decode(APIPost.self, from: json)
        XCTAssertEqual(post.originalRepostOfId, "root-1")
    }

    // MARK: - APIPostComment.currentUserReactions

    // MARK: - APIPost.currentUserReactions

    func test_apiPost_decode_currentUserReactionsAbsent_isNil() throws {
        let json = """
        {
            "id": "post20",
            "type": "POST",
            "content": "No reactions",
            "createdAt": "2026-05-15T10:00:00.000Z",
            "author": {"id": "a1", "username": "alice"}
        }
        """.data(using: .utf8)!
        let post = try makeDecoder().decode(APIPost.self, from: json)
        XCTAssertEqual(post.id, "post20")
        XCTAssertNil(post.currentUserReactions)
    }

    func test_apiPost_decode_currentUserReactionsPresent_populatesArray() throws {
        let json = """
        {
            "id": "post21",
            "type": "POST",
            "content": "With reactions",
            "createdAt": "2026-05-15T10:00:00.000Z",
            "author": {"id": "a2", "username": "bob"},
            "currentUserReactions": ["\u{2764}\u{FE0F}"]
        }
        """.data(using: .utf8)!
        let post = try makeDecoder().decode(APIPost.self, from: json)
        XCTAssertEqual(post.currentUserReactions, ["\u{2764}\u{FE0F}"])
        XCTAssertEqual(post.currentUserReactions?.count, 1)
    }

    // MARK: - APIPostComment.currentUserReactions

    func test_apiPostComment_decode_currentUserReactionsAbsent_isNil() throws {
        let json = """
        {
            "id": "comment10",
            "content": "No reactions here",
            "createdAt": "2026-05-14T10:00:00.000Z",
            "author": {"id": "a1", "username": "alice"}
        }
        """.data(using: .utf8)!
        let comment = try makeDecoder().decode(APIPostComment.self, from: json)
        XCTAssertEqual(comment.id, "comment10")
        XCTAssertNil(comment.currentUserReactions)
    }

    func test_apiPostComment_decode_currentUserReactionsPresent_populatesArray() throws {
        let json = """
        {
            "id": "comment11",
            "content": "Reactions present",
            "createdAt": "2026-05-14T10:00:00.000Z",
            "author": {"id": "a2", "username": "bob"},
            "currentUserReactions": ["\u{2764}\u{FE0F}", "\u{1F525}"]
        }
        """.data(using: .utf8)!
        let comment = try makeDecoder().decode(APIPostComment.self, from: json)
        XCTAssertEqual(comment.currentUserReactions, ["\u{2764}\u{FE0F}", "\u{1F525}"])
        XCTAssertEqual(comment.currentUserReactions?.count, 2)
    }
}
