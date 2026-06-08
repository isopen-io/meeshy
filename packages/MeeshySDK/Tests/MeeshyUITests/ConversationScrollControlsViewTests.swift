import XCTest
@testable import MeeshyUI

/// Le bouton de retour au bas affiche les auteurs en cours de frappe SANS
/// suffixe « écrit » (l'animation de points suffit) et ne doit jamais
/// afficher deux fois le même auteur.
final class ConversationScrollControlsViewTests: XCTestCase {

    func test_typingLabel_empty_returnsEmptyString() {
        XCTAssertEqual(ConversationScrollControlsView.typingLabel(for: []), "")
    }

    func test_typingLabel_singleAuthor_hasNoEcritSuffix() {
        XCTAssertEqual(ConversationScrollControlsView.typingLabel(for: ["André"]), "André")
    }

    func test_typingLabel_twoAuthors_joinedWithComma_noVerb() {
        XCTAssertEqual(
            ConversationScrollControlsView.typingLabel(for: ["André", "Bob"]),
            "André, Bob"
        )
    }

    func test_typingLabel_threeOrMoreAuthors_compactsToFitWidth() {
        XCTAssertEqual(
            ConversationScrollControlsView.typingLabel(for: ["André", "Bob", "Cléo"]),
            "André +2"
        )
    }

    func test_typingLabel_duplicateAuthor_appearsOnlyOnce() {
        XCTAssertEqual(
            ConversationScrollControlsView.typingLabel(for: ["André", "André"]),
            "André"
        )
    }

    func test_typingLabel_duplicateAmongMany_dedupedPreservingOrder() {
        XCTAssertEqual(
            ConversationScrollControlsView.typingLabel(for: ["André", "Bob", "André"]),
            "André, Bob"
        )
    }

    // MARK: - shouldShowAttachmentPreview (no stale preview once read)

    func test_shouldShowAttachmentPreview_withUnreadAndAttachment_isTrue() {
        XCTAssertTrue(
            ConversationScrollControlsView.shouldShowAttachmentPreview(unreadCount: 2, hasAttachmentPreview: true))
    }

    /// Conversation is READ (count 0) but the last unread message's attachment
    /// inputs linger (only cleared on tap). A mere typing indicator must NOT
    /// resurface the now-read message's attachment preview.
    func test_shouldShowAttachmentPreview_noUnread_isFalse_evenWithAttachment() {
        XCTAssertFalse(
            ConversationScrollControlsView.shouldShowAttachmentPreview(unreadCount: 0, hasAttachmentPreview: true))
    }

    func test_shouldShowAttachmentPreview_noAttachment_isFalse() {
        XCTAssertFalse(
            ConversationScrollControlsView.shouldShowAttachmentPreview(unreadCount: 3, hasAttachmentPreview: false))
    }
}
