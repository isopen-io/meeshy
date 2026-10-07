import XCTest
import MeeshyUI
@testable import Meeshy

/// **Le toucher qui RAMÈNE le bouton pause ne fait rien d'autre** (#9577,
/// directive porteur 2026-10-07 : « un toucher le ramène, un second met en
/// pause »).
///
/// Dans la galerie, un toucher sur le média bascule le plein cadre (#6142). Les
/// deux gestes se disputaient donc le même doigt : sans arbitrage, ramener le
/// bouton faisait AUSSI disparaître tout le chrome — bouton compris. La règle
/// tranche : tant que le bouton est effacé sur une piste qui joue, le toucher le
/// ramène et s'arrête là.
@MainActor
final class MediaGalleryPlayPauseFadeTests: XCTestCase {

    private var faded: FullscreenPlayPauseFade {
        FullscreenPlayPauseFade().playback(isPlaying: true).fading()
    }

    func test_aTap_onlyRevealsTheButton_whenItHasFadedOverAPlayingTrack() {
        XCTAssertTrue(MediaStagePlayPause.tapRevealsOnly(fade: faded,
                                                         holdsTrack: true,
                                                         chromeVisible: true))
    }

    func test_aTap_keepsItsStageDoor_whileTheButtonShows() {
        let shown = FullscreenPlayPauseFade().playback(isPlaying: true)
        XCTAssertFalse(MediaStagePlayPause.tapRevealsOnly(fade: shown,
                                                          holdsTrack: true,
                                                          chromeVisible: true),
                       "bouton visible : le toucher sur le média garde sa porte du plein cadre")
        XCTAssertFalse(MediaStagePlayPause.tapRevealsOnly(fade: FullscreenPlayPauseFade(),
                                                          holdsTrack: true,
                                                          chromeVisible: true),
                       "en pause, le bouton est là : rien à ramener")
    }

    func test_aTap_keepsItsStageDoor_onAPageThatHoldsNoTrack() {
        XCTAssertFalse(MediaStagePlayPause.tapRevealsOnly(fade: faded,
                                                          holdsTrack: false,
                                                          chromeVisible: true),
                       "une image, une vidéo non chargée : aucun bouton à ramener, la porte reste")
    }

    func test_aTap_inFullFrame_stillBringsTheChromeBack() {
        XCTAssertFalse(MediaStagePlayPause.tapRevealsOnly(fade: faded,
                                                          holdsTrack: true,
                                                          chromeVisible: false),
                       "en plein cadre le bouton n'est pas à l'écran : le toucher doit rendre le plateau")
    }

    // MARK: - Câblage

    func test_theStageDoor_asksTheRule_beforeTogglingTheFrame() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"))
        guard let debut = code.range(of: "func onEnterStage(_ door: StageEntry) {"),
              let regle = code.range(of: "MediaStagePlayPause.tapRevealsOnly(", range: debut.upperBound..<code.endIndex),
              let transport = code.range(of: "applyTransport(StagePresentation.transportIntent(", range: debut.upperBound..<code.endIndex)
        else {
            return XCTFail("`onEnterStage` ne consulte pas la règle du bouton central")
        }
        XCTAssertLessThan(regle.lowerBound, transport.lowerBound,
                          "la règle se lit AVANT le transport et le cadrage : sinon le toucher fait les deux")
    }

    func test_theFade_respectsReduceMotion() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"))
        XCTAssertTrue(code.contains("accessibilityReduceMotion"),
                      "l'effacement du bouton ne s'anime pas quand « Réduire les animations » est actif")
        XCTAssertTrue(code.contains("playPauseFade.fadeDelay"),
                      "le délai vient de la règle du SDK, jamais d'un nombre recopié")
    }
}
