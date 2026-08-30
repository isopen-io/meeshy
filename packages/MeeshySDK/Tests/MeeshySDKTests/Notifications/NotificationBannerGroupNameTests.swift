import XCTest
@testable import MeeshySDK

/// Résolution Local-First du nom de groupe d'une bannière in-app.
///
/// Le cadrage « X dans <groupe> » doit nommer le groupe tel que L'APPAREIL le
/// connaît (renommé + emoji favori, via `conversationPresentationProvider`
/// injecté par l'app), et retomber sur le titre canonique du serveur à défaut
/// d'instantané local. Un message direct n'a pas de groupe, et un fournisseur
/// installé ne doit pas lui en inventer un.
@MainActor
final class NotificationBannerGroupNameTests: XCTestCase {

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

    // MARK: - resolvedConversationGroupName

    func test_resolvedGroupName_noProvider_fallsBackToGatewayTitle() throws {
        let event = try groupEvent()
        NotificationToastManager.shared.conversationPresentationProvider = nil
        XCTAssertEqual(
            NotificationToastManager.shared.resolvedConversationGroupName(for: event),
            "Équipe Tech"
        )
    }

    func test_resolvedGroupName_withLocalRename_prefersRenamedNameAndFavorite() throws {
        let event = try groupEvent()
        NotificationToastManager.shared.conversationPresentationProvider = { id in
            id == "c1" ? .init(name: "Mon équipe à moi", favoriteEmoji: "😴") : nil
        }
        XCTAssertEqual(
            NotificationToastManager.shared.resolvedConversationGroupName(for: event),
            "😴 Mon équipe à moi"
        )
    }

    func test_resolvedGroupName_providerReturnsNil_fallsBackToGatewayTitle() throws {
        let event = try groupEvent()
        NotificationToastManager.shared.conversationPresentationProvider = { _ in nil }
        XCTAssertEqual(
            NotificationToastManager.shared.resolvedConversationGroupName(for: event),
            "Équipe Tech"
        )
    }

    func test_resolvedGroupName_directMessage_staysGroupLess() throws {
        // Pas de conversationTitle → `conversationGroupName` est nil ; le
        // fournisseur ne doit PAS injecter un groupe là où il n'y en a pas :
        // la bannière d'un message direct dit « Bob », jamais « Bob dans Bob ».
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
        XCTAssertNil(NotificationToastManager.shared.resolvedConversationGroupName(for: event))
    }
}
