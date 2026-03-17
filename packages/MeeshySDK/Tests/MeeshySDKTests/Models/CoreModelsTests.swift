import XCTest
@testable import MeeshySDK

final class CoreModelsTests: XCTestCase {

    // MARK: - MeeshyConversationFilter

    func testConversationFilterAllCases() {
        XCTAssertEqual(MeeshyConversationFilter.allCases.count, 9)
    }

    func testConversationFilterRawValues() {
        XCTAssertEqual(MeeshyConversationFilter.all.rawValue, "Tous")
        XCTAssertEqual(MeeshyConversationFilter.unread.rawValue, "Non lus")
        XCTAssertEqual(MeeshyConversationFilter.personnel.rawValue, "Personnel")
        XCTAssertEqual(MeeshyConversationFilter.privee.rawValue, "Privee")
        XCTAssertEqual(MeeshyConversationFilter.ouvertes.rawValue, "Ouvertes")
        XCTAssertEqual(MeeshyConversationFilter.globales.rawValue, "Globales")
        XCTAssertEqual(MeeshyConversationFilter.channels.rawValue, "Channels")
        XCTAssertEqual(MeeshyConversationFilter.favoris.rawValue, "Favoris")
        XCTAssertEqual(MeeshyConversationFilter.archived.rawValue, "Archives")
    }

    func testConversationFilterColors() {
        XCTAssertEqual(MeeshyConversationFilter.all.color, "4ECDC4")
        XCTAssertEqual(MeeshyConversationFilter.unread.color, "FF6B6B")
        XCTAssertEqual(MeeshyConversationFilter.personnel.color, "3498DB")
        XCTAssertEqual(MeeshyConversationFilter.privee.color, "F8B500")
        XCTAssertEqual(MeeshyConversationFilter.ouvertes.color, "2ECC71")
        XCTAssertEqual(MeeshyConversationFilter.globales.color, "E74C3C")
        XCTAssertEqual(MeeshyConversationFilter.channels.color, "1ABC9C")
        XCTAssertEqual(MeeshyConversationFilter.favoris.color, "F59E0B")
        XCTAssertEqual(MeeshyConversationFilter.archived.color, "9B59B6")
    }

    func testConversationFilterIdMatchesRawValue() {
        for filter in MeeshyConversationFilter.allCases {
            XCTAssertEqual(filter.id, filter.rawValue)
        }
    }

    // MARK: - MeeshyFeedItem

    func testFeedItemInit() {
        let item = MeeshyFeedItem(author: "Alice", content: "Hello world", likes: 10)
        XCTAssertEqual(item.author, "Alice")
        XCTAssertEqual(item.content, "Hello world")
        XCTAssertEqual(item.likes, 10)
        XCTAssertFalse(item.color.isEmpty)
    }

    func testFeedItemColorAutoGeneration() {
        let item1 = MeeshyFeedItem(author: "Alice", content: "A")
        let item2 = MeeshyFeedItem(author: "Alice", content: "B")
        XCTAssertEqual(item1.color, item2.color)
    }

    func testFeedItemExplicitColor() {
        let item = MeeshyFeedItem(author: "Bob", content: "C", color: "CUSTOM1")
        XCTAssertEqual(item.color, "CUSTOM1")
    }

    func testFeedItemDefaultLikes() {
        let item = MeeshyFeedItem(author: "Charlie", content: "D")
        XCTAssertEqual(item.likes, 0)
    }

    // MARK: - ConversationType Enum

    func testConversationTypeAllCasesRawValues() {
        let allCases = MeeshyConversation.ConversationType.allCases
        let expected: [String] = ["direct", "group", "public", "global", "community", "channel", "bot", "broadcast"]
        let actual = allCases.map { $0.rawValue }
        XCTAssertEqual(actual, expected)
    }

    func testConversationTypeInitFromRawValue() {
        XCTAssertEqual(MeeshyConversation.ConversationType(rawValue: "direct"), .direct)
        XCTAssertEqual(MeeshyConversation.ConversationType(rawValue: "group"), .group)
        XCTAssertEqual(MeeshyConversation.ConversationType(rawValue: "public"), .public)
        XCTAssertEqual(MeeshyConversation.ConversationType(rawValue: "global"), .global)
        XCTAssertEqual(MeeshyConversation.ConversationType(rawValue: "community"), .community)
        XCTAssertEqual(MeeshyConversation.ConversationType(rawValue: "channel"), .channel)
        XCTAssertEqual(MeeshyConversation.ConversationType(rawValue: "bot"), .bot)
        XCTAssertEqual(MeeshyConversation.ConversationType(rawValue: "broadcast"), .broadcast)
        XCTAssertNil(MeeshyConversation.ConversationType(rawValue: "unknown"))
    }

    func testConversationTypeCodable() throws {
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        for type in MeeshyConversation.ConversationType.allCases {
            let data = try encoder.encode(type)
            let decoded = try decoder.decode(MeeshyConversation.ConversationType.self, from: data)
            XCTAssertEqual(decoded, type)
        }
    }

    // MARK: - Attachment AttachmentType

    func testAttachmentTypeRawValues() {
        XCTAssertEqual(MeeshyMessageAttachment.AttachmentType.image.rawValue, "image")
        XCTAssertEqual(MeeshyMessageAttachment.AttachmentType.video.rawValue, "video")
        XCTAssertEqual(MeeshyMessageAttachment.AttachmentType.audio.rawValue, "audio")
        XCTAssertEqual(MeeshyMessageAttachment.AttachmentType.file.rawValue, "file")
        XCTAssertEqual(MeeshyMessageAttachment.AttachmentType.location.rawValue, "location")
    }

    // MARK: - FeedMediaType

    func testFeedMediaTypeRawValues() {
        XCTAssertEqual(FeedMediaType.image.rawValue, "image")
        XCTAssertEqual(FeedMediaType.video.rawValue, "video")
        XCTAssertEqual(FeedMediaType.audio.rawValue, "audio")
        XCTAssertEqual(FeedMediaType.document.rawValue, "document")
        XCTAssertEqual(FeedMediaType.location.rawValue, "location")
    }
}
