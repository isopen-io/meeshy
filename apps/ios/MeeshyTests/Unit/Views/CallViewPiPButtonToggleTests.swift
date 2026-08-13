import XCTest
@testable import Meeshy

/// Audit fix (2026-08-13): the in-app "enter PiP" control (`pip.enter`) stayed
/// visible after PiP started (`canActivateSystemPiP` doesn't exclude the
/// already-active case) but its action always called `startSystemPiP()` —
/// unconditionally a no-op once PiP is active (`PiPCallController.start()`'s
/// own guard). Net effect: after the first tap the button silently did
/// nothing on every subsequent tap, with no haptic, no error, no VoiceOver
/// feedback, until the user dismissed PiP via the system's own chrome.
@MainActor
final class CallViewPiPButtonToggleTests: XCTestCase {

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func pipButtonBlock(in source: String) -> String {
        guard let range = source.range(of: "if callManager.canActivateSystemPiP {") else {
            XCTFail("CallView must gate the PiP button on canActivateSystemPiP")
            return ""
        }
        let end = source.index(range.lowerBound, offsetBy: 1000, limitedBy: source.endIndex) ?? source.endIndex
        return String(source[range.lowerBound..<end])
    }

    func test_pipButton_branchesOnActiveState_insteadOfAlwaysStarting() throws {
        let block = pipButtonBlock(in: try callViewSource())
        XCTAssertTrue(
            block.contains("callManager.isSystemPiPActive"),
            "The PiP button action must branch on callManager.isSystemPiPActive so it " +
            "can call stop while active instead of always calling start."
        )
        XCTAssertTrue(
            block.contains("callManager.stopSystemPiP()"),
            "The PiP button action must call callManager.stopSystemPiP() when PiP is " +
            "already active — otherwise tapping it a second time is a silent no-op."
        )
    }

    func test_pipButton_labelReflectsExitStateWhenActive() throws {
        let block = pipButtonBlock(in: try callViewSource())
        XCTAssertTrue(
            block.contains("call.control.pip.exit"),
            "The PiP button must expose a distinct label/localization key for the " +
            "exit-PiP state so VoiceOver and sighted users alike know the second tap " +
            "closes PiP rather than repeating a no-op 'reduce to PiP' action."
        )
    }
}
