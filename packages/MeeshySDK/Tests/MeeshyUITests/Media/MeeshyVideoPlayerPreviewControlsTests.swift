import XCTest
@testable import MeeshyUI

/// #9890 — l'aperçu d'une citation du composeur passe par le plein écran du
/// lecteur commun, SANS les sorties que ce plein écran offre à un message :
/// l'ancien lecteur nu n'en offrait aucune, et le remplacer ne doit pas en
/// ouvrir (enregistrer et partager sortent le média de la conversation).
final class MeeshyVideoPlayerPreviewControlsTests: XCTestCase {

    func test_fullscreenPreview_offersNoExit() {
        let preview = MeeshyVideoPlayer.ControlSet.fullscreenPreview
        XCTAssertFalse(preview.contains(.save))
        XCTAssertFalse(preview.contains(.share))
    }

    func test_fullscreenPreview_dropsTheMessageChrome() {
        let preview = MeeshyVideoPlayer.ControlSet.fullscreenPreview
        XCTAssertFalse(preview.contains(.author), "la citation n'a pas d'auteur à nommer ici")
        XCTAssertFalse(preview.contains(.loop))
    }

    func test_fullscreenPreview_keepsWhatPlayingNeeds() {
        let preview = MeeshyVideoPlayer.ControlSet.fullscreenPreview
        for control: MeeshyVideoPlayer.ControlSet in [.playPause, .scrubber, .duration, .close, .mute, .speed] {
            XCTAssertTrue(preview.contains(control), "\(control.rawValue)")
        }
    }

    func test_fullscreenPreview_isStrictlyWithinTheFullscreenDefault() {
        XCTAssertTrue(MeeshyVideoPlayer.ControlSet.fullscreenDefault
            .isSuperset(of: .fullscreenPreview))
    }
}
