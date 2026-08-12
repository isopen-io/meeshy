import XCTest
@testable import Meeshy

// MARK: - Conversation Top Chrome — scrim status bar + pill sticky de jour

// 2026-08-12 — retour user (capture à l'appui) : les tuiles de jour
// transparaissaient dans la zone status bar / Dynamic Island (une Live
// Activity y déploie un bandeau noir), et la pill sticky de jour vivait à
// safeArea+4, en plein dessous. Deux correctifs gardés ici :
// 1. Le scrim status bar de ConversationView est NOIR PLEIN en haut puis
//    suit les bandes de sortie partagées TopBarBottomFade (~24 % de dégradé,
//    6 % transparent en bas) — plus de stops translucides ad hoc.
// 2. La pill sticky démarre SOUS la rangée du header flottant
//    (MessageDayStickyPlacement.topOffset), hors de la barre noire.
@MainActor
final class ConversationTopChromeFadeTests: XCTestCase {

    private func viewsDirectory() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func conversationViewSource() throws -> String {
        try String(
            contentsOf: viewsDirectory().appendingPathComponent("ConversationView.swift"),
            encoding: .utf8
        )
    }

    private func messageListControllerSource() throws -> String {
        try String(
            contentsOf: viewsDirectory().appendingPathComponent("MessageListViewController.swift"),
            encoding: .utf8
        )
    }

    // MARK: - Scrim status bar

    func test_statusBarScrim_usesSharedTopBarBottomFadeGradient() throws {
        let source = try conversationViewSource()
        XCTAssertTrue(
            source.contains("TopBarBottomFade.gradient"),
            "ConversationView's status-bar scrim must render the shared " +
            "TopBarBottomFade.gradient (solid black through the status bar / " +
            "Dynamic Island strip, then the shared exit bands) — scrolled day " +
            "tiles must no longer show through that zone."
        )
        XCTAssertFalse(
            source.contains("Color.black.opacity(0.75), location: 0"),
            "The old ad-hoc translucent scrim stops (0.75 → 0.4 → clear) must " +
            "stay removed — they let scrolled content bleed through the " +
            "status-bar strip (user feedback 2026-08-12)."
        )
    }

    func test_statusBarScrim_staysAboveListButBelowFloatingHeader() throws {
        let source = try conversationViewSource()
        guard let gradientRange = source.range(of: "TopBarBottomFade.gradient") else {
            XCTFail("expected the shared scrim gradient in ConversationView")
            return
        }
        let end = source.index(gradientRange.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[gradientRange.lowerBound..<end])
        XCTAssertTrue(
            vicinity.contains(".zIndex(99)"),
            "The scrim must keep zIndex 99 — above the message list, below the " +
            "floating header (zIndex 100) so the back pill / call / search " +
            "controls stay crisp over the solid black band."
        )
        XCTAssertTrue(
            vicinity.contains(".allowsHitTesting(false)"),
            "The scrim is decorative — it must never intercept touches."
        )
    }

    // MARK: - Pill sticky de jour

    func test_stickyDayPill_isAnchoredBelowFloatingHeader() throws {
        let source = try messageListControllerSource()
        XCTAssertTrue(
            source.contains("constant: MessageDayStickyPlacement.topOffset"),
            "The sticky day pill must be anchored with the named " +
            "MessageDayStickyPlacement.topOffset — the bare `constant: 4` put " +
            "it under the Dynamic Island / Live Activity band and over the " +
            "floating header row (user feedback 2026-08-12)."
        )
    }

    func test_stickyDayPillOffset_clearsFloatingHeaderRow() {
        // Header flottant : padding haut 8 (MeeshySpacing.sm) + rangée de
        // contrôles ~44pt → la pill doit démarrer à 52pt de safe area au
        // minimum pour passer dessous.
        XCTAssertGreaterThanOrEqual(MessageDayStickyPlacement.topOffset, 52,
                                    "la pill sticky doit démarrer sous la rangée du header flottant")
        XCTAssertLessThanOrEqual(MessageDayStickyPlacement.topOffset, 96,
                                 "la pill sticky doit rester dans le premier tiers du viewport pour rester utile")
    }
}
