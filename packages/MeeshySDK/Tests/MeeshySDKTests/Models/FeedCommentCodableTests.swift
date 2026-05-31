import XCTest
@testable import MeeshySDK

final class FeedCommentCodableTests: XCTestCase {

    func test_currentUserReactions_roundtripsWhenSet() throws {
        let original = FeedComment(
            id: "c1",
            author: "Alice",
            authorId: "u1",
            content: "Hello",
            currentUserReactions: ["❤️", "🔥"]
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let data = try encoder.encode(original)
        let decoded = try JSONDecoder().decode(FeedComment.self, from: data)
        XCTAssertEqual(decoded.currentUserReactions, ["❤️", "🔥"])
    }

    func test_currentUserReactions_roundtripsAsNilWhenAbsent() throws {
        let original = FeedComment(
            id: "c2",
            author: "Bob",
            authorId: "u2",
            content: "World"
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(FeedComment.self, from: data)
        XCTAssertNil(decoded.currentUserReactions)
    }

    func test_decodesLegacyPayloadWithoutTheField() throws {
        let json = """
        {
          "id": "c3", "author": "Carol", "authorId": "u3",
          "content": "Old", "timestamp": 0, "likes": 0, "replies": 0,
          "effectFlags": 0
        }
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(FeedComment.self, from: json)
        XCTAssertNil(decoded.currentUserReactions)
        XCTAssertEqual(decoded.id, "c3")
    }

    func test_preservesEmptyArrayDistinctFromNil() throws {
        let original = FeedComment(
            id: "c4",
            author: "Dan",
            authorId: "u4",
            content: "Empty",
            currentUserReactions: []
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(FeedComment.self, from: data)
        XCTAssertEqual(decoded.currentUserReactions, [])
        XCTAssertNotNil(decoded.currentUserReactions)
    }
}
