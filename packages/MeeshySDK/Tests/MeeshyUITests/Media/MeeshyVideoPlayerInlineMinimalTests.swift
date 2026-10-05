import XCTest
@testable import MeeshyUI

/// **La lecture dans le fil d'une conversation n'offre que trois contrôles**
/// (#8231, commentaire porteur 2026-09-27 : « Il faut permettre de jouer en
/// inline mais avec peu de contrôleurs : son, pause/play et plein écran ! »).
///
/// Et toucher la vidéo HORS de ces contrôles ouvre le plein écran — avant la
/// lecture (le poster) comme pendant. Les autres surfaces inline (feed,
/// commentaires, détail de post) gardent leur jeu complet : les règles sont
/// des paramètres opaques, l'app décide où elles s'appliquent.
@MainActor
final class MeeshyVideoPlayerInlineMinimalTests: XCTestCase {

    private typealias Controls = MeeshyVideoPlayer.ControlSet

    func test_inlineMinimal_isExactlySoundPlayPauseAndFullscreen() {
        XCTAssertEqual(Controls.inlineMinimal, [.mute, .playPause, .expand])
    }

    func test_inlineMinimal_offersNoSkipScrubberTimeSpeedPipOrAirplay() {
        for extra: Controls in [.skip, .scrubber, .duration, .speed, .pip, .airplay] {
            XCTAssertFalse(Controls.inlineMinimal.contains(extra), "rawValue \(extra.rawValue)")
        }
    }

    func test_inlineDefault_keepsItsSkipButtons() {
        XCTAssertTrue(Controls.inlineDefault.contains(.skip),
                      "les surfaces hors fil gardent ±10 s : le drapeau ne fait que rendre le saut RETIRABLE")
    }

    func test_skip_hasItsOwnBit() {
        let others: [Controls] = [.playPause, .scrubber, .duration, .expand, .download, .save, .share,
                                  .mute, .speed, .close, .author, .airplay, .pip, .loop]
        XCTAssertTrue(others.allSatisfy { $0.intersection(.skip).isEmpty })
    }

    func test_skipButtons_followTheControlSet() {
        XCTAssertTrue(_InlineOverlayControls.showsSkipButtons(controls: .inlineDefault))
        XCTAssertFalse(_InlineOverlayControls.showsSkipButtons(controls: .inlineMinimal))
    }

    func test_surfaceTap_expands_whenAskedAndAnExpandHandlerExists() {
        XCTAssertEqual(_InlineRenderer.surfaceTapAction(surfaceTapExpands: true, hasExpandHandler: true), .expand)
    }

    func test_surfaceTap_togglesControls_byDefault() {
        XCTAssertEqual(_InlineRenderer.surfaceTapAction(surfaceTapExpands: false, hasExpandHandler: true), .toggleControls)
    }

    func test_surfaceTap_neverExpandsIntoNothing() {
        XCTAssertEqual(_InlineRenderer.surfaceTapAction(surfaceTapExpands: true, hasExpandHandler: false), .toggleControls,
                       "sans hôte de plein écran, le toucher garde son effet historique plutôt que de ne rien faire")
    }

    func test_controls_stayVisible_whenTheSurfaceTapExpands() {
        XCTAssertFalse(_InlineRenderer.autoHidesControls(surfaceTapAction: .expand),
                       "le toucher ne peut plus les faire revenir : masqués, pause et son deviendraient inatteignables")
        XCTAssertTrue(_InlineRenderer.autoHidesControls(surfaceTapAction: .toggleControls))
    }
}
