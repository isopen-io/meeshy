import XCTest
@testable import MeeshySDK

/// Tests for the Local-First in-app toast subtitle resolution on
/// `NotificationToastManager`. A conversation toast must show the LOCAL
/// presentation (renamed name + favorite emoji, resolved via the
/// app-injected `conversationPresentationProvider`), and fall back to the
/// gateway-sent group title when no local snapshot exists. Direct messages
/// (which never had a subtitle) must stay subtitle-less even when a provider
/// is installed.
@MainActor
final class NotificationToastSubtitleResolutionTests: XCTestCase {

    private let decoder = JSONDecoder()

    private func makeEvent(_ json: String) throws -> SocketNotificationEvent {
        try decoder.decode(SocketNotificationEvent.self, from: Data(json.utf8))
    }

    private func groupEvent() throws -> SocketNotificationEvent {
        try makeEvent("""
        {
            "id": "n1", "userId": "u1", "type": "new_message",
            "content": "Salut",
            "actor": { "id": "a1", "displayName": "Alice" },
            "context": { "conversationId": "c1", "conversationTitle": "Équipe Tech", "conversationType": "group" }
        }
        """)
    }

    override func tearDown() async throws {
        // The manager is a shared singleton — clear the injected provider so a
        // following test never inherits this test's resolution closure.
        NotificationToastManager.shared.conversationPresentationProvider = nil
        try await super.tearDown()
    }

    // MARK: - ConversationPresentation.composedSubtitle (pure)

    func test_composedSubtitle_withFavorite_putsFavoriteFirst() {
        let presentation = NotificationToastManager.ConversationPresentation(
            name: "Maman", favoriteEmoji: "⭐️"
        )
        XCTAssertEqual(presentation.composedSubtitle, "⭐️ Maman")
    }

    func test_composedSubtitle_withoutFavorite_isNameOnly() {
        let presentation = NotificationToastManager.ConversationPresentation(
            name: "Maman", favoriteEmoji: nil
        )
        XCTAssertEqual(presentation.composedSubtitle, "Maman")
    }

    func test_composedSubtitle_blankFavorite_isNameOnly() {
        let presentation = NotificationToastManager.ConversationPresentation(
            name: "Maman", favoriteEmoji: "   "
        )
        XCTAssertEqual(presentation.composedSubtitle, "Maman")
    }

    // MARK: - resolvedToastSubtitle

    func test_resolvedSubtitle_noProvider_fallsBackToGatewayTitle() throws {
        let event = try groupEvent()
        NotificationToastManager.shared.conversationPresentationProvider = nil
        XCTAssertEqual(
            NotificationToastManager.shared.resolvedToastSubtitle(for: event),
            "Équipe Tech"
        )
    }

    func test_resolvedSubtitle_withLocalRename_prefersRenamedNameAndFavorite() throws {
        let event = try groupEvent()
        NotificationToastManager.shared.conversationPresentationProvider = { id in
            id == "c1" ? .init(name: "Mon équipe à moi", favoriteEmoji: "😴") : nil
        }
        XCTAssertEqual(
            NotificationToastManager.shared.resolvedToastSubtitle(for: event),
            "😴 Mon équipe à moi"
        )
    }

    func test_resolvedSubtitle_providerReturnsNil_fallsBackToGatewayTitle() throws {
        let event = try groupEvent()
        NotificationToastManager.shared.conversationPresentationProvider = { _ in nil }
        XCTAssertEqual(
            NotificationToastManager.shared.resolvedToastSubtitle(for: event),
            "Équipe Tech"
        )
    }

    func test_resolvedSubtitle_directMessage_staysSubtitleLess() throws {
        // No conversationTitle → toastSubtitle is nil; the provider must NOT
        // inject a subtitle that the direct-message toast never displayed.
        let event = try makeEvent("""
        {
            "id": "n2", "userId": "u1", "type": "new_message",
            "content": "Coucou",
            "actor": { "id": "a1", "displayName": "Bob" },
            "context": { "conversationId": "dm1", "conversationType": "direct" }
        }
        """)
        NotificationToastManager.shared.conversationPresentationProvider = { _ in
            .init(name: "Bob renommé", favoriteEmoji: "❤️")
        }
        XCTAssertNil(NotificationToastManager.shared.resolvedToastSubtitle(for: event))
    }
}
