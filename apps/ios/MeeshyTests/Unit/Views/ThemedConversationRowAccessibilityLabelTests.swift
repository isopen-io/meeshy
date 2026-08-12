import XCTest
import MeeshySDK
@testable import Meeshy

/// `ThemedConversationRow.conversationAccessibilityLabel` used to read the
/// RAW `conversation.lastMessagePreview` — always the original-language
/// content — instead of `resolvedLastMessagePreview(preferredLanguages:)`,
/// the SAME resolver the VISIBLE preview (`standardMessageContent`) already
/// uses. A VoiceOver user heard the original text even when the row visibly
/// showed a translation (audit 2026-07-20, "aligner sur ce que l'écran
/// affiche"). `conversationAccessibilityLabel` is a pure computed property
/// (no `@State`, no SwiftUI hosting needed) — safe to read directly off a
/// value constructed in the test, per the project's cross-file access
/// convention (property loosened from `private` to `internal`).
@MainActor
final class ThemedConversationRowAccessibilityLabelTests: XCTestCase {

    func test_conversationAccessibilityLabel_standardMessage_usesResolvedTranslation_notRawPreview() {
        let conversation = makeConversation(
            lastMessagePreview: "Hello there",
            lastMessageOriginalLanguage: "en",
            lastMessageTranslations: ["fr": "Bonjour"]
        )
        let row = ThemedConversationRow(conversation: conversation, preferredContentLanguages: ["fr"])

        XCTAssertTrue(
            row.conversationAccessibilityLabel.contains("Bonjour"),
            "Label should contain the FR translation matching the viewer's preferred language: \(row.conversationAccessibilityLabel)"
        )
        XCTAssertFalse(
            row.conversationAccessibilityLabel.contains("Hello there"),
            "Label must not announce the original-language preview once a preferred-language translation exists: \(row.conversationAccessibilityLabel)"
        )
    }

    func test_conversationAccessibilityLabel_noMatchingTranslation_fallsBackToOriginalPreview_neverTranslationsFirst() {
        // Prisme rule #1 (CLAUDE.md): absence of a preferred-language match
        // must show the ORIGINAL content, never an unrelated translation
        // (`translations.first`). Only a "de" translation exists; viewer
        // prefers "fr" — original preview must win.
        let conversation = makeConversation(
            lastMessagePreview: "Hello there",
            lastMessageOriginalLanguage: "en",
            lastMessageTranslations: ["de": "Hallo"]
        )
        let row = ThemedConversationRow(conversation: conversation, preferredContentLanguages: ["fr"])

        XCTAssertTrue(row.conversationAccessibilityLabel.contains("Hello there"))
        XCTAssertFalse(row.conversationAccessibilityLabel.contains("Hallo"))
    }

    func test_conversationAccessibilityLabel_messageAlreadyInPreferredLanguage_usesOriginalPreview() {
        // Original IS the preferred language -> canonical raw preview, even
        // though a (irrelevant) translation exists for another language.
        let conversation = makeConversation(
            lastMessagePreview: "Bonjour",
            lastMessageOriginalLanguage: "fr",
            lastMessageTranslations: ["en": "Hello there"]
        )
        let row = ThemedConversationRow(conversation: conversation, preferredContentLanguages: ["fr"])

        XCTAssertTrue(row.conversationAccessibilityLabel.contains("Bonjour"))
        XCTAssertFalse(row.conversationAccessibilityLabel.contains("Hello there"))
    }

    // MARK: - Factory Helper

    private func makeConversation(
        lastMessagePreview: String?,
        lastMessageOriginalLanguage: String?,
        lastMessageTranslations: [String: String]?
    ) -> Conversation {
        var conversation = Conversation(
            identifier: "conv-1",
            title: "Test Conversation",
            lastMessagePreview: lastMessagePreview
        )
        conversation.lastMessageOriginalLanguage = lastMessageOriginalLanguage
        conversation.lastMessageTranslations = lastMessageTranslations
        return conversation
    }
}
