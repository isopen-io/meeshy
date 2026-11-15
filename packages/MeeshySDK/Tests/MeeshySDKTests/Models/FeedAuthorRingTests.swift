import XCTest
import GRDB
@testable import MeeshySDK

/// #10946 — le contour servi avec l'auteur (`author.profileDecor.avatarRing`, #10945) survit au
/// passage domaine du fil : post, commentaire mis en avant, original republié, groupe de stories.
/// Il traverse aussi les deux caches (Codable de `CacheCoordinator`, ligne GRDB `feed_posts`) :
/// cache-first, un contour ne disparaît pas au démarrage à froid.
final class FeedAuthorRingTests: XCTestCase {

    private let ring = ServedProfileDecorItem(pack: "contours-essentiels", item: "filet", origin: .builtin)
    private let decor = #""profileDecor":{"avatarRing":{"pack":"contours-essentiels","item":"filet","origin":"builtin","contract":null}}"#

    private func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let string = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return formatter.date(from: string) ?? Date(timeIntervalSince1970: 0)
        }
        return decoder
    }

    private func apiPost(type: String = "POST") throws -> APIPost {
        let json = """
        {
          "id": "p1", "content": "salut", "type": "\(type)", "createdAt": "2026-10-19T10:00:00.000Z",
          "expiresAt": "2099-10-19T10:00:00.000Z",
          "author": { "id": "u1", "username": "ana", \(decor) },
          "comments": [
            { "id": "c1", "content": "oui", "createdAt": "2026-10-19T11:00:00.000Z",
              "author": { "id": "u2", "username": "paul", \(decor) } }
          ],
          "repostOf": {
            "id": "orig", "content": "à l'origine", "createdAt": "2026-10-18T10:00:00.000Z",
            "author": { "id": "u3", "username": "lea", \(decor) }
          }
        }
        """
        return try decoder().decode(APIPost.self, from: Data(json.utf8))
    }

    func test_toFeedPost_carriesTheRingOfTheAuthorTheCommentersAndTheRepostedAuthor() throws {
        let post = try apiPost().toFeedPost()
        XCTAssertEqual(post.authorRing, ring)
        XCTAssertEqual(post.comments.first?.authorRing, ring)
        XCTAssertEqual(post.repost?.authorRing, ring)
    }

    func test_anAuthorWithoutRing_hasNone() throws {
        let json = #"{"id":"p2","content":"x","createdAt":"2026-10-19T10:00:00.000Z","author":{"id":"u1","username":"ana"}}"#
        XCTAssertNil(try decoder().decode(APIPost.self, from: Data(json.utf8)).toFeedPost().authorRing)
    }

    func test_theCodableCache_roundTripsEveryRing_andAnOlderBlobReadsWithout() throws {
        let post = try apiPost().toFeedPost()
        let decoded = try JSONDecoder().decode(FeedPost.self, from: JSONEncoder().encode(post))
        XCTAssertEqual(decoded.authorRing, ring)
        XCTAssertEqual(decoded.comments.first?.authorRing, ring)
        XCTAssertEqual(decoded.repost?.authorRing, ring)

        let older = FeedComment(author: "Paul", content: "avant")
        XCTAssertNil(try JSONDecoder().decode(FeedComment.self, from: JSONEncoder().encode(older)).authorRing)
    }

    func test_editingACommentKeepsItsAuthorRing() throws {
        let comment = try XCTUnwrap(try apiPost().toFeedPost().comments.first)
        XCTAssertEqual(comment.withEditedContent("modifié", effectFlags: 0).authorRing, ring)
    }

    func test_theStoryGroup_carriesItsAuthorRing_throughTheCache() throws {
        let group = try XCTUnwrap([try apiPost(type: "STORY")].toStoryGroups().first)
        XCTAssertEqual(group.authorRing, ring)
        XCTAssertEqual(group.with(stories: group.stories).authorRing, ring)
        XCTAssertEqual(try JSONDecoder().decode(StoryGroup.self, from: JSONEncoder().encode(group)).authorRing, ring)
    }

    func test_theGRDBFeedRow_keepsTheAuthorRing_forTheOfflineFallback() async throws {
        let dbQueue = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: dbQueue)
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        let persistence = FeedPersistenceActor(dbWriter: dbQueue)
        let record = PostRecord(
            id: "p1", authorId: "u1", authorUsername: "ana", authorDisplayName: nil, authorAvatarURL: nil,
            type: "POST", content: "salut", originalLanguage: "fr", visibility: "PUBLIC",
            likeCount: 0, commentCount: 0, repostCount: 0, viewCount: 0, bookmarkCount: 0, shareCount: 0,
            isLikedByMe: false, isPinned: false, isEdited: false, isQuote: false,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil,
            mediaJson: nil, reactionSummaryJson: nil, repostOfJson: nil, mentionedUsersJson: nil, translationsJson: nil,
            createdAt: Date(), updatedAt: nil, changeVersion: 0,
            authorRing: ring
        )
        try await persistence.insertPost(record)
        let posts = try await persistence.posts(limit: 10)
        let cached = try XCTUnwrap(posts.first)
        XCTAssertEqual(cached.toFeedPost().authorRing, ring)
    }
}
