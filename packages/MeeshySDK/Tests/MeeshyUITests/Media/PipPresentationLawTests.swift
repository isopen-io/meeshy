import XCTest
@testable import MeeshyUI

/// #11041, décision porteur e (2026-10-20) — seul le PLEIN ÉCRAN ouvre un PiP
/// en sortie d'app, quelle que soit l'origine de la vidéo. Une vidéo inline
/// (bulle, post du fil, page de post, profil visité, commentaire) ne configure
/// jamais de fenêtre, même si son jeu de contrôles demande `.pip`.
final class PipPresentationLawTests: XCTestCase {

    func test_inlineVideo_neverConfiguresPip_evenWhenItAsksForIt() {
        XCTAssertFalse(PipPresentationLaw.mayConfigurePip(presentation: .inline, requestsPip: true))
        XCTAssertFalse(PipPresentationLaw.mayConfigurePip(presentation: .inline, requestsPip: false))
    }

    func test_fullscreenVideo_configuresPip_whenItAsksForIt() {
        XCTAssertTrue(PipPresentationLaw.mayConfigurePip(presentation: .fullscreen, requestsPip: true))
        XCTAssertFalse(PipPresentationLaw.mayConfigurePip(presentation: .fullscreen, requestsPip: false))
    }

    func test_onlyTheFullscreenStyle_isAFullscreenPresentation() {
        XCTAssertEqual(VideoPresentation.of(.fullscreen), .fullscreen)
        XCTAssertEqual(VideoPresentation.of(.inline), .inline)
    }

    /// Post du fil (`.inlineDefault ∪ .mute`), page de post, profil visité et
    /// commentaire (`.inlineDefault`), bulle (`.inlineMinimal`) : aucun n'arme
    /// le PiP automatique.
    func test_everyInlineSurface_neverArmsPip() {
        let inlineSets: [MeeshyVideoPlayer.ControlSet] = [
            .inlineDefault, .inlineDefault.union(.mute), .inlineMinimal,
            .inlineDefault.union(.pip), .fullscreenDefault,
        ]
        for controls in inlineSets {
            for style: MeeshyVideoPlayer.Style in [.inline] {
                XCTAssertFalse(MeeshyVideoPlayer.surfaceEnablesPip(style: style, controls: controls),
                               "\(style) \(controls.rawValue)")
            }
        }
    }

    /// Le plein écran d'un message, d'un post ou d'un commentaire
    /// (`.fullscreenDefault`) garde le PiP en sortie d'app.
    func test_fullscreenPlayer_armsPip_withItsDefaultControls() {
        XCTAssertTrue(MeeshyVideoPlayer.surfaceEnablesPip(style: .fullscreen, controls: .fullscreenDefault))
        XCTAssertFalse(MeeshyVideoPlayer.surfaceEnablesPip(style: .fullscreen, controls: [.playPause, .close]))
    }

    /// Le bouton PiP n'existe que là où la fenêtre peut s'ouvrir : jamais
    /// dans l'overlay inline, même si on le demande.
    func test_inlineOverlay_neverShowsAPipButton() {
        XCTAssertFalse(_InlineOverlayControls.showsPipButton(
            controls: .inlineDefault.union(.pip), isPipSupported: true))
    }

    func test_inlineDefault_noLongerOffersPip() {
        XCTAssertFalse(MeeshyVideoPlayer.ControlSet.inlineDefault.contains(.pip))
    }
}
