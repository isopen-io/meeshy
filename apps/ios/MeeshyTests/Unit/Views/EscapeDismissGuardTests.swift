import XCTest
import SwiftUI
@testable import Meeshy

/// Une surimpression maison se referme à la touche Échap du clavier physique d'iPad (et Cmd+.), pas seulement au
/// geste de VoiceOver : tout `accessibilityAction(.escape)` passe par `dismissOnEscape`, qui porte les deux.
final class EscapeDismissGuardTests: XCTestCase {
    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
    }

    func test_theModifier_bindsTheKeyboardAndVoiceOver() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.text(at: appRoot.appendingPathComponent("Features/Main/Components/EscapeDismiss.swift")))
        XCTAssertTrue(code.contains(".keyboardShortcut(.cancelAction)"))
        XCTAssertTrue(code.contains(".accessibilityAction(.escape, action)"))
    }

    func test_noOverlay_answersOnlyVoiceOversEscape() throws {
        let walker = try XCTUnwrap(FileManager.default.enumerator(atPath: appRoot.path))
        var offenders: [String] = []
        for case let path as String in walker where path.hasSuffix(".swift") && !path.hasSuffix("EscapeDismiss.swift") {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.text(at: appRoot.appendingPathComponent(path)))
            if code.contains(".accessibilityAction(.escape)") { offenders.append(path) }
        }
        XCTAssertEqual(offenders, [], "passer par .dismissOnEscape { … } — Échap au clavier physique aussi")
    }

    func test_theFiveOverlays_closeOnEscape() throws {
        for path in ["Features/Main/Components/MessageOverlayMenu.swift", "Features/Main/Components/MessagePieceOverlay.swift",
                     "Features/Main/Components/StatusBubbleOverlay.swift", "Features/Main/Composer/ComposerSceneMenu.swift",
                     "Features/Main/Components/ContactCard/ContactCardDetailSheet.swift"] {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.text(at: appRoot.appendingPathComponent(path)))
            XCTAssertTrue(code.contains(".dismissOnEscape {"), path)
        }
    }
}
