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

    // MARK: - isCompactShape (circle at rest, capsule for rich content)

    func test_isCompactShape_restState_isFalse() {
        XCTAssertFalse(
            ConversationScrollControlsView.isCompactShape(hasUnreadContent: false, isOffline: false, isSearchingQuotedMessage: false))
    }

    func test_isCompactShape_hasUnreadContent_isTrue() {
        XCTAssertTrue(
            ConversationScrollControlsView.isCompactShape(hasUnreadContent: true, isOffline: false, isSearchingQuotedMessage: false))
    }

    func test_isCompactShape_offline_isTrue() {
        XCTAssertTrue(
            ConversationScrollControlsView.isCompactShape(hasUnreadContent: false, isOffline: true, isSearchingQuotedMessage: false))
    }

    func test_isCompactShape_searchingQuotedMessage_isTrue() {
        XCTAssertTrue(
            ConversationScrollControlsView.isCompactShape(hasUnreadContent: false, isOffline: false, isSearchingQuotedMessage: true))
    }

    // MARK: - hasAttachmentPreview (call notice branch)

    func test_hasAttachmentPreview_unreadCallSymbolPresent_isTrue() {
        XCTAssertTrue(
            ConversationScrollControlsView.hasAttachmentPreview(
                unreadAttachmentIsAudio: false,
                unreadAttachmentThumbHash: nil,
                unreadAttachmentThumbnailUrl: nil,
                unreadAttachmentFullUrl: nil,
                unreadAttachmentSymbol: nil,
                unreadCallSymbol: "phone.fill"
            ))
    }

    func test_hasAttachmentPreview_allNil_isFalse() {
        XCTAssertFalse(
            ConversationScrollControlsView.hasAttachmentPreview(
                unreadAttachmentIsAudio: false,
                unreadAttachmentThumbHash: nil,
                unreadAttachmentThumbnailUrl: nil,
                unreadAttachmentFullUrl: nil,
                unreadAttachmentSymbol: nil,
                unreadCallSymbol: nil
            ))
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

    // MARK: - #3921 : nom de l'expéditeur devant l'aperçu, seuil de 5 avant
    // le format condensé « N nouveaux messages »

    func test_lastMessageLineText_withSenderName_prefixesDisplayName() {
        XCTAssertEqual(
            ConversationScrollControlsView.lastMessageLineText(senderName: "Maiza Biyoko", content: "Bonjour à tous"),
            "Maiza Biyoko : Bonjour à tous"
        )
    }

    func test_lastMessageLineText_noSenderName_returnsContentAlone() {
        XCTAssertEqual(
            ConversationScrollControlsView.lastMessageLineText(senderName: nil, content: "Bonjour à tous"),
            "Bonjour à tous"
        )
    }

    func test_lastMessageLineText_emptySenderName_returnsContentAlone() {
        XCTAssertEqual(
            ConversationScrollControlsView.lastMessageLineText(senderName: "", content: "Bonjour à tous"),
            "Bonjour à tous"
        )
    }

    func test_lastMessageLineText_noContent_returnsNil() {
        XCTAssertNil(ConversationScrollControlsView.lastMessageLineText(senderName: "Maiza", content: nil))
        XCTAssertNil(ConversationScrollControlsView.lastMessageLineText(senderName: "Maiza", content: ""))
    }

    /// Jusqu'à 5 messages accumulés : pas de ligne de décompte, juste
    /// l'aperçu (nom + dernier message) — le format condensé « N nouveaux
    /// messages » n'apparaît qu'au-delà.
    func test_shouldShowCountHeadline_upToFive_isFalse() {
        for count in [0, 1, 2, 5] {
            XCTAssertFalse(
                ConversationScrollControlsView.shouldShowCountHeadline(unreadCount: count),
                "count=\(count) ne doit pas afficher la ligne de décompte"
            )
        }
    }

    func test_shouldShowCountHeadline_beyondFive_isTrue() {
        for count in [6, 7, 200] {
            XCTAssertTrue(
                ConversationScrollControlsView.shouldShowCountHeadline(unreadCount: count),
                "count=\(count) doit afficher « N nouveaux messages »"
            )
        }
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
