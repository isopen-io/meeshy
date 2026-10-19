import XCTest
@testable import MeeshyUI

/// § B.2 — une surface sans bouton PiP visible ne doit JAMAIS armer
/// `canStartPictureInPictureAutomaticallyFromInline` : `configurePip` pose
/// implicitement ce flag (`SharedAVPlayerManager.configurePip`), donc une
/// surface opt-in sans contrôle visible ouvrirait une fenêtre PiP système au
/// passage en arrière-plan sans que l'utilisateur l'ait demandé.
final class MeeshyVideoPlayerSurfaceEnablesPipTests: XCTestCase {

    func test_surfaceEnablesPip_whenControlsIncludePip() {
        XCTAssertTrue(_InlineRenderer.surfaceEnablesPip(controls: .inlineDefault))
    }

    func test_surfaceDoesNotEnablePip_whenControlsExcludePip() {
        XCTAssertFalse(_InlineRenderer.surfaceEnablesPip(controls: .miniDefault))
    }

    /// #11041 — la vidéo d'un message lue dans sa bulle (`.inlineMinimal`) ne
    /// part JAMAIS en PiP quand on quitte l'app ; celle d'un commentaire
    /// (`.inlineDefault`) et celle d'un message mis en plein écran
    /// (`.fullscreenDefault`) y partent.
    func test_bubbleInlineMinimal_neverArmsAutomaticPip() {
        XCTAssertFalse(_InlineRenderer.surfaceEnablesPip(controls: .inlineMinimal))
    }

    func test_commentAndFullscreenControls_armAutomaticPip() {
        XCTAssertTrue(_InlineRenderer.surfaceEnablesPip(controls: .inlineDefault))
        XCTAssertTrue(_InlineRenderer.surfaceEnablesPip(controls: .fullscreenDefault))
    }
}
