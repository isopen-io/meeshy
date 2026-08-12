import XCTest
@testable import Meeshy

/// Garde de source — WCAG 2.2.2 exige un mécanisme de pause ACTIONNABLE,
/// indépendant du réglage système Reduce Motion (technique C39, suffisante
/// pour la SC 2.3.3, PAS pour la 2.2.2 — question formellement ouverte au
/// W3C, issues #3766/#4319). Ce test verrouille la présence du câblage,
/// pas son comportement runtime (déjà couvert par SyncPillRotatorTests sur
/// la primitive sous-jacente).
final class SyncPillPauseGestureTests: XCTestCase {
    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Components/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Components/SyncPill.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Comments are stripped before matching — Zone A's doc comment on
    /// `isPausedByUser` literally quotes `rotator.setAutoRotation(false)`,
    /// which would otherwise satisfy the second assertion below on its own.
    private func code() throws -> String {
        AppSourceGuard.stripComments(try source())
    }

    func test_syncPill_hasLongPressGestureWiredToPauseToggle() throws {
        let code = try code()
        XCTAssertTrue(code.contains("onLongPressGesture"), "L'appui long doit rester câblé — c'est le mécanisme de pause WCAG 2.2.2")
        XCTAssertTrue(code.contains("rotator.setAutoRotation"), "Le toggle doit geler la rotation via la primitive existante")
    }

    func test_syncPill_hasAccessibilityPauseAction() throws {
        let code = try code()
        XCTAssertTrue(code.contains("accessibilityAction(named:"), "VoiceOver doit pouvoir déclencher la pause sans le geste tactile")
    }
}
