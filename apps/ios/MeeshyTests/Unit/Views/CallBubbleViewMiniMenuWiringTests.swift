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
}
