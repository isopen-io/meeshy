import XCTest
@testable import Meeshy

/// Source-code inspection tests for `CallEffectsOverlay`.
///
/// The view is a SwiftUI struct (not directly instantiable without a hosting
/// controller), so these tests read the source file and pin invariants that
/// a code-review or refactor could silently break. Companion to
/// `CallViewAccessibilityTests.test_callEffectsOverlay_receivesCallManagerFromParent`,
/// which asserts the CallView side of the same contract.
@MainActor
final class CallEffectsOverlayTests: XCTestCase {

    private func overlaySource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/CallEffectsOverlay.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - CallManager ownership

    func test_callManager_isReceivedNotInstantiated() throws {
        // `@ObservedObject private var callManager = CallManager.shared` would
        // re-create the subscription on every parent (CallView) body
        // re-evaluation — CallView re-evaluates often (pulse animation,
        // showEffectsToolbar toggle, control-bar auto-hide). CallView and
        // IncomingCallView were already fixed for this exact hazard
        // (Audit P1-16); the overlay must follow the same pattern.
        let source = try overlaySource()
        XCTAssertFalse(
            source.contains("= CallManager.shared"),
            "CallEffectsOverlay must not instantiate CallManager.shared locally — it must " +
            "receive the manager from its parent as a plain @ObservedObject property."
        )
        XCTAssertTrue(
            source.contains("@ObservedObject var callManager: CallManager"),
            "CallEffectsOverlay must declare callManager as a received (non-private, no " +
            "default value) @ObservedObject so CallView can inject its own instance."
        )
    }

    // MARK: - Backdrop dismiss accessibility

    func test_backdrop_isAccessibleButton() throws {
        let source = try overlaySource()
        XCTAssertTrue(
            source.contains("call.effects.backdrop.label"),
            "The dismiss backdrop must carry an accessibility label so VoiceOver users can " +
            "identify and activate the dismiss action, not just sighted tap-outside users."
        )
        XCTAssertTrue(
            source.contains(".accessibilityAddTraits(.isButton)"),
            "The dismiss backdrop must expose the .isButton trait since it is an " +
            "onTapGesture, not a native Button, and VoiceOver would not otherwise treat " +
            "it as activatable."
        )
    }

    // MARK: - Toolbar button toggle state

    func test_toolbarButton_exposesActiveStateAsAccessibilityValue() throws {
        let source = try overlaySource()
        XCTAssertTrue(
            source.contains(".accessibilityValue(isActive"),
            "The effects toolbar button must expose its active/inactive state via " +
            ".accessibilityValue so VoiceOver announces on/off, not just the static label."
        )
    }
}
