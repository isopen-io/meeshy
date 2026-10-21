import XCTest
@testable import MeeshyUI

/// § B.2 puis #11041 (décision porteur e, 2026-10-20) — `configurePip` arme
/// `canStartPictureInPictureAutomaticallyFromInline` : seule une surface
/// PLEIN ÉCRAN qui demande `.pip` le configure. Bulle (`.inlineMinimal`),
/// post du fil, page de post, profil visité et commentaire (`.inlineDefault`)
/// ne partent jamais en PiP ; le plein écran d'un message, d'un post ou d'un
/// commentaire (`.fullscreenDefault`) y part.
final class MeeshyVideoPlayerSurfaceEnablesPipTests: XCTestCase {

    func test_fullscreenSurface_enablesPip_whenControlsIncludePip() {
        XCTAssertTrue(MeeshyVideoPlayer.surfaceEnablesPip(style: .fullscreen, controls: .fullscreenDefault))
    }

    func test_fullscreenSurface_doesNotEnablePip_whenControlsExcludePip() {
        XCTAssertFalse(MeeshyVideoPlayer.surfaceEnablesPip(style: .fullscreen, controls: .miniDefault))
    }

    func test_bubbleInlineMinimal_neverArmsAutomaticPip() {
        XCTAssertFalse(MeeshyVideoPlayer.surfaceEnablesPip(style: .inline, controls: .inlineMinimal))
    }

    func test_inlineCommentAndPostControls_neverArmAutomaticPip() {
        XCTAssertFalse(MeeshyVideoPlayer.surfaceEnablesPip(style: .inline, controls: .inlineDefault))
        XCTAssertFalse(MeeshyVideoPlayer.surfaceEnablesPip(style: .inline, controls: .inlineDefault.union(.pip)))
    }
}
