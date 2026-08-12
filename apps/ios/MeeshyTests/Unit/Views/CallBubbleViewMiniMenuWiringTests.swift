import XCTest
@testable import Meeshy

/// `CallBubbleView`'s mini-menu buttons only call existing, already-tested
/// `CallManager` methods (`toggleMute`/`toggleSpeaker`/`endCall` — see
/// `CallManagerTests.swift`) — there is no new behavior to exercise at
/// runtime, and this project does not write SwiftUI tap-simulation tests
/// (see `apps/ios/CLAUDE.md`). Source-guard confirms the wiring itself,
/// matching the existing convention in `CallManagerTests.swift`
/// (`AudioRouteChangeStateReconciliationTests`) — read the code, not comments.
@MainActor
final class CallBubbleViewMiniMenuWiringTests: XCTestCase {

    private func callBubbleViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/CallBubbleView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func body(of propertyDeclaration: String, upTo nextDeclaration: String, in source: String) throws -> String {
        guard let range = source.range(of: propertyDeclaration) else {
            XCTFail("\(propertyDeclaration) not found in CallBubbleView.swift")
            return ""
        }
        let end = source.range(of: nextDeclaration, range: range.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        return String(source[range.lowerBound..<end])
    }

    func test_muteButton_callsToggleMute() throws {
        let source = try callBubbleViewSource()
        let body = try body(of: "private var muteButton", upTo: "\n    private var speakerButton", in: source)
        XCTAssertTrue(body.contains("callManager.toggleMute()"))
    }

    func test_speakerButton_callsToggleSpeaker() throws {
        let source = try callBubbleViewSource()
        let body = try body(of: "private var speakerButton", upTo: "\n    private var hangupButton", in: source)
        XCTAssertTrue(body.contains("callManager.toggleSpeaker()"))
    }

    func test_hangupButton_callsEndCall() throws {
        let source = try callBubbleViewSource()
        let body = try body(of: "private var hangupButton", upTo: "\n    // MARK:", in: source)
        XCTAssertTrue(body.contains("callManager.endCall()"))
    }

    func test_hangupButton_hasAccessibilityHint() throws {
        let source = try callBubbleViewSource()
        let body = try body(of: "private var hangupButton", upTo: "\n    // MARK:", in: source)
        XCTAssertTrue(
            body.contains(".accessibilityHint("),
            "The mini-menu's hang-up button must carry an accessibility hint — " +
            "FloatingCallPillView's hangupButton already has one (call.end.hint); " +
            "this bubble variant must not regress behind it for VoiceOver users."
        )
    }

    func test_dismissLayer_isRemoved() throws {
        let source = try callBubbleViewSource()
        XCTAssertFalse(
            source.contains("dismissLayer"),
            "The full-screen dismissLayer must be gone — while it existed, ANY tap " +
            "anywhere on screen while the mini-menu was open was swallowed just to " +
            "close the menu, blocking interaction with the rest of the app."
        )
    }

    func test_tapOnBubble_whenMenuRevealed_closesMenuInstead() throws {
        let source = try callBubbleViewSource()
        guard let range = source.range(of: ".onTapGesture {") else {
            XCTFail(".onTapGesture not found in CallBubbleView.swift"); return
        }
        let end = source.range(of: ".accessibilityElement(children: .contain)", range: range.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("closeMenu()"),
            "Tapping the bubble while the mini-menu is open must close it (retap-to-dismiss) " +
            "now that the full-screen dismissLayer is gone — otherwise there is no way to " +
            "close the menu short of waiting 3s or hitting a button."
        )
        XCTAssertFalse(
            body.contains("guard !isMenuRevealed else { return }"),
            "The old no-op guard must be replaced — a tap while the menu is open must " +
            "actively close it, not do nothing."
        )
    }
}
