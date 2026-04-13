import XCTest
@testable import Meeshy

final class WidgetDataManagerTests: XCTestCase {

    // MARK: - WidgetConversation Data Model

    func test_widgetConversation_encodesAndDecodes() throws {
        let conversation = WidgetConversation(
            id: "conv123",
            contactName: "Alice",
            contactAvatar: "person.circle.fill",
            lastMessage: "Hey there!",
            timestamp: Date(timeIntervalSince1970: 1700000000),
            isUnread: true,
            isPinned: false,
            accentColor: "6366F1"
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(conversation)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(WidgetConversation.self, from: data)

        XCTAssertEqual(decoded.id, "conv123")
        XCTAssertEqual(decoded.contactName, "Alice")
        XCTAssertEqual(decoded.contactAvatar, "person.circle.fill")
        XCTAssertEqual(decoded.lastMessage, "Hey there!")
        XCTAssertTrue(decoded.isUnread)
        XCTAssertFalse(decoded.isPinned)
        XCTAssertEqual(decoded.accentColor, "6366F1")
    }

    func test_widgetConversation_identifiableById() {
        let conversation = WidgetConversation(
            id: "unique-id",
            contactName: "Bob",
            contactAvatar: "person.fill",
            lastMessage: "",
            timestamp: Date(),
            isUnread: false,
            isPinned: true,
            accentColor: "4ECDC4"
        )

        XCTAssertEqual(conversation.id, "unique-id")
    }

    // MARK: - WidgetFavoriteContact Data Model

    func test_widgetFavoriteContact_encodesAndDecodes() throws {
        let contact = WidgetFavoriteContact(
            id: "fav1",
            name: "Charlie",
            avatar: "person.crop.circle.fill",
            status: "Online",
            accentColor: "34D399"
        )

        let data = try JSONEncoder().encode(contact)
        let decoded = try JSONDecoder().decode(WidgetFavoriteContact.self, from: data)

        XCTAssertEqual(decoded.id, "fav1")
        XCTAssertEqual(decoded.name, "Charlie")
        XCTAssertEqual(decoded.avatar, "person.crop.circle.fill")
        XCTAssertEqual(decoded.status, "Online")
        XCTAssertEqual(decoded.accentColor, "34D399")
    }

    func test_widgetFavoriteContact_identifiableById() {
        let contact = WidgetFavoriteContact(
            id: "contact-id",
            name: "Dana",
            avatar: "person.fill",
            status: "Offline",
            accentColor: "6366F1"
        )

        XCTAssertEqual(contact.id, "contact-id")
    }

    // MARK: - Multiple Conversations Serialization

    func test_multipleWidgetConversations_encodeAsArray() throws {
        let conversations = [
            WidgetConversation(id: "1", contactName: "A", contactAvatar: "", lastMessage: "a", timestamp: Date(), isUnread: false, isPinned: false, accentColor: "6366F1"),
            WidgetConversation(id: "2", contactName: "B", contactAvatar: "", lastMessage: "b", timestamp: Date(), isUnread: true, isPinned: true, accentColor: "4ECDC4")
        ]

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(conversations)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode([WidgetConversation].self, from: data)

        XCTAssertEqual(decoded.count, 2)
        XCTAssertEqual(decoded[0].contactName, "A")
        XCTAssertEqual(decoded[1].contactName, "B")
        XCTAssertEqual(decoded[0].accentColor, "6366F1")
    }
}
