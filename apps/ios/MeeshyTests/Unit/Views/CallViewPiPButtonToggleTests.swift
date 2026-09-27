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
        try AppSourceGuard.callViewSource()
    }

    /// Le bouton vit dans les actions « l'appel » depuis #8394 ; il n'est
    /// offert que si l'appel est éligible OU déjà en PiP (`CallActionContext`).
    private func pipButtonBlock(in source: String) -> String {
        guard let range = source.range(of: "func pictureInPictureActionButton(") else {
            XCTFail("CallView must define pictureInPictureActionButton")
            return ""
        }
        let end = source.index(range.lowerBound, offsetBy: 1400, limitedBy: source.endIndex) ?? source.endIndex
        return String(source[range.lowerBound..<end])
    }

    func test_pipAction_isOfferedWhenEligibleOrAlreadyActive() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("canPictureInPicture: callManager.canActivateSystemPiP || callManager.isSystemPiPActive"),
            "Le bouton PiP doit rester offert tant que le PiP est actif, pour pouvoir en sortir."
        )
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
