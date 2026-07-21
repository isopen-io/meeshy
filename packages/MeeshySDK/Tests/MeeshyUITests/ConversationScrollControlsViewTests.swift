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

    // MARK: - typingDotTimer property wrapper (audit backlog 2026-07-20,
    // lane "Perf divers", P2)
    //
    // `ConversationScrollControlsView` is a computed leaf view rebuilt by
    // `ConversationView.scrollToBottomButton` on every unrelated body
    // re-evaluation. A plain stored `let private let typingDotTimer =
    // Timer.publish(...).autoconnect()` re-runs its initializer — a fresh,
    // not-yet-ticked publisher — on every one of those reconstructions. If
    // they arrive faster than the 0.5s interval, `.onReceive(typingDotTimer)`
    // never sees a tick and the typing-dot animation freezes. `@State`'s
    // initial-value expression runs once per view identity, preserving the
    // same connected publisher across re-renders — this is a source-guard
    // locking the property wrapper (no ViewInspector dependency in this repo,
    // cf. `AvatarBannerNoRetryWiringTests`).

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_typingDotTimer_isDeclaredAsState() throws {
        let source = try sdkSource("Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift")
        XCTAssertTrue(
            source.contains("@State private var typingDotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()"),
            "typingDotTimer must be @State — a plain `let` gets re-initialized " +
            "(a fresh, not-yet-ticked Timer publisher) every time ConversationView " +
            "reconstructs this leaf view, which can starve the 0.5s interval and " +
            "freeze the typing-dot animation."
        )
        XCTAssertFalse(
            source.contains("private let typingDotTimer = Timer.publish"),
            "typingDotTimer must not be a `let` — see @State requirement above."
        )
    }
}
