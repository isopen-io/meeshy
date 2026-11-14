import XCTest
@testable import Meeshy

/// Spec §6.2 / backlog B.4 — the "sending" clock must stay hidden for the
/// first 200ms of a send (debounce) so a fast round-trip never flashes an
/// icon the user has no time to perceive, and must reveal itself once a
/// send genuinely lingers past that threshold.
@MainActor
final class BubbleDeliveryCheckSendingRevealTests: XCTestCase {

    func test_shouldRevealImmediately_noStartDate_returnsTrue() {
        XCTAssertTrue(BubbleDeliveryCheck.SendingClockGlyph.shouldRevealImmediately(sendStartedAt: nil, now: Date()))
    }

    func test_shouldRevealImmediately_justStarted_returnsFalse() {
        let now = Date()
        XCTAssertFalse(BubbleDeliveryCheck.SendingClockGlyph.shouldRevealImmediately(sendStartedAt: now, now: now))
    }

    func test_shouldRevealImmediately_elapsed100ms_returnsFalse() {
        let start = Date()
        let now = start.addingTimeInterval(0.1)
        XCTAssertFalse(BubbleDeliveryCheck.SendingClockGlyph.shouldRevealImmediately(sendStartedAt: start, now: now))
    }

    func test_shouldRevealImmediately_elapsedExactly200ms_returnsTrue() {
        let start = Date()
        let now = start.addingTimeInterval(0.2)
        XCTAssertTrue(BubbleDeliveryCheck.SendingClockGlyph.shouldRevealImmediately(sendStartedAt: start, now: now))
    }

    func test_shouldRevealImmediately_elapsed5Seconds_returnsTrue() {
        let start = Date()
        let now = start.addingTimeInterval(5)
        XCTAssertTrue(BubbleDeliveryCheck.SendingClockGlyph.shouldRevealImmediately(sendStartedAt: start, now: now))
    }

    // MARK: - La révélation a une vue à qui parler (#18420)

    /// Un `.task` posé sur un `EmptyView` ne part jamais : l'horloge d'une
    /// bulle née moins de 200 ms avant son premier rendu restait voilée jusqu'à
    /// la recréation de la cellule — ce qu'un vocal, qui attend sa transcription
    /// puis son téléversement, laissait voir pendant plusieurs secondes.
    func test_theSendingClock_isAlwaysMounted_andOnlyVeiled() throws {
        let iosRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let raw = try String(
            contentsOf: iosRoot.appendingPathComponent("Meeshy/Features/Main/Views/Bubble/BubbleDeliveryCheck.swift"),
            encoding: .utf8
        )
        let code = AppSourceGuard.stripComments(raw)
        let glyph = try XCTUnwrap(code.components(separatedBy: "struct SendingClockGlyph").dropFirst().first)
            .components(separatedBy: "struct PendingUploadSendingGlyph").first ?? ""

        XCTAssertTrue(glyph.contains(".opacity(isRevealed ? 1 : 0)"), "l'horloge se voile, elle ne se démonte pas")
        XCTAssertFalse(glyph.contains("EmptyView()"), "une vue vide n'exécute aucun `.task`")
        XCTAssertTrue(glyph.contains(".accessibilityHidden(!isRevealed)"), "voilée, elle ne parle pas au lecteur d'écran")
    }
}
