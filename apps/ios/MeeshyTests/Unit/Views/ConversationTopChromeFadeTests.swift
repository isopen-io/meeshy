import XCTest
@testable import Meeshy

// MARK: - Conversation Top Chrome — pas de scrim status bar + pill sticky de jour

// 2026-08-12 — retours user successifs (captures à l'appui) :
// 1. Les tuiles de jour transparaissaient dans la zone status bar / Dynamic
//    Island → un scrim noir plein y a d'abord été posé… puis RETIRÉ le jour
//    même (« il faut juste enlever la barre noire de la status bar ») : la
//    conversation reste immersive, AUCUN scrim au-dessus de la liste.
// 2. La pill sticky de jour vivait à safeArea+4, sous l'îlot et la rangée du
//    header flottant — elle démarre désormais SOUS le header
//    (MessageDayStickyPlacement.topOffset).
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

    // MARK: - Pas de scrim status bar

    func test_statusBarScrim_staysRemoved() throws {
        let source = try conversationViewSource()
        XCTAssertFalse(
            source.contains("TopBarBottomFade"),
            "ConversationView must NOT mount a status-bar scrim — the solid " +
            "black band was explicitly removed (user feedback 2026-08-12: " +
            "« il faut juste enlever la barre noire de la status bar »). " +
            "TopBarBottomFade belongs to the call banner only."
        )
        XCTAssertFalse(
            source.contains("Color.black.opacity(0.75), location: 0"),
            "The old ad-hoc translucent scrim stops (0.75 → 0.4 → clear) must " +
            "not come back either — no dark band over the status-bar strip."
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
