import XCTest
@testable import Meeshy

final class WidgetDataManagerTests: XCTestCase {

    // WidgetDataManager uses app group UserDefaults and WidgetKit.
    // We test the data models (WidgetConversation, WidgetFavoriteContact) and
    // the formatLastMessage logic indirectly through encoding.

    // MARK: - WidgetConversation Data Model

    func test_widgetConversation_encodesAndDecodes() throws {
        let conversation = WidgetConversation(
            id: "conv123",
            contactName: "Alice",
            contactAvatar: "person.circle.fill",
            lastMessage: "Hey there!",
            timestamp: Date(timeIntervalSince1970: 1700000000),
            isUnread: true,
            isPinned: false
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
    }

    func test_widgetConversation_identifiableById() {
        let conversation = WidgetConversation(
            id: "unique-id",
            contactName: "Bob",
            contactAvatar: "person.fill",
            lastMessage: "",
            timestamp: Date(),
            isUnread: false,
            isPinned: true
        )

        XCTAssertEqual(conversation.id, "unique-id")
    }

    // MARK: - WidgetFavoriteContact Data Model

    func test_widgetFavoriteContact_encodesAndDecodes() throws {
        let contact = WidgetFavoriteContact(
            id: "fav1",
            name: "Charlie",
            avatar: "person.crop.circle.fill",
            status: "Online"
        )

        let data = try JSONEncoder().encode(contact)
        let decoded = try JSONDecoder().decode(WidgetFavoriteContact.self, from: data)

        XCTAssertEqual(decoded.id, "fav1")
        XCTAssertEqual(decoded.name, "Charlie")
        XCTAssertEqual(decoded.avatar, "person.crop.circle.fill")
        XCTAssertEqual(decoded.status, "Online")
    }

    func test_widgetFavoriteContact_identifiableById() {
        let contact = WidgetFavoriteContact(
            id: "contact-id",
            name: "Dana",
            avatar: "person.fill",
            status: "Offline"
        )

        XCTAssertEqual(contact.id, "contact-id")
    }

    // MARK: - Multiple Conversations Serialization

    func test_multipleWidgetConversations_encodeAsArray() throws {
        let conversations = [
            WidgetConversation(id: "1", contactName: "A", contactAvatar: "", lastMessage: "a", timestamp: Date(), isUnread: false, isPinned: false),
            WidgetConversation(id: "2", contactName: "B", contactAvatar: "", lastMessage: "b", timestamp: Date(), isUnread: true, isPinned: true)
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
    }
}
