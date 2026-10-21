import XCTest
@testable import MeeshyUI

/// § B.2 puis #11041 (décision porteur e, 2026-10-20) — la top bar inline
/// n'affiche JAMAIS de bouton PiP : une vidéo inline ne configure aucune
/// fenêtre (`PipPresentationLaw`), le bouton n'aurait aucun effet (loi 4).
/// Le PiP vit au plein écran (`VideoTransportControls`).
final class MeeshyVideoPlayerInlinePipButtonTests: XCTestCase {

    func test_hidesPipButton_evenWhenControlPresentAndSupported() {
        XCTAssertFalse(_InlineOverlayControls.showsPipButton(
            controls: [.playPause, .pip], isPipSupported: true))
    }

    func test_hidesPipButton_whenSupportedButControlAbsent() {
        XCTAssertFalse(_InlineOverlayControls.showsPipButton(
            controls: [.playPause], isPipSupported: true))
    }

    func test_hidesPipButton_whenControlPresentButUnsupported() {
        XCTAssertFalse(_InlineOverlayControls.showsPipButton(
            controls: [.playPause, .pip], isPipSupported: false))
    }
}
