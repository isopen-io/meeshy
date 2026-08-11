import XCTest
@testable import MeeshyUI

/// § B.2 — la top bar inline n'affiche le bouton PiP que si le contrôle est
/// demandé ET que l'appareil supporte réellement le PiP
/// (`AVPictureInPictureController.isPictureInPictureSupported()` vaut
/// toujours `false` sur Simulateur). MASQUÉ, pas désactivé : un bouton grisé
/// flottant sur une vidéo n'est pas explicable, contrairement à un item de
/// menu grisé (cf. `VideoTransportControls.moreMenu`, qui désactive son item
/// PiP au lieu de le masquer).
final class MeeshyVideoPlayerInlinePipButtonTests: XCTestCase {

    func test_showsPipButton_whenControlPresentAndSupported() {
        XCTAssertTrue(_InlineOverlayControls.showsPipButton(
            controls: .inlineDefault, isPipSupported: true))
    }

    func test_hidesPipButton_whenSupportedButControlAbsent() {
        XCTAssertFalse(_InlineOverlayControls.showsPipButton(
            controls: [.playPause], isPipSupported: true))
    }

    func test_hidesPipButton_whenControlPresentButUnsupported() {
        XCTAssertFalse(_InlineOverlayControls.showsPipButton(
            controls: .inlineDefault, isPipSupported: false))
    }
}
