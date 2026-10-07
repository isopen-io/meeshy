import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le toucher qui RAMÈNE le bouton pause bascule AUSSI le plein cadre**
/// (#9577, décision porteur 2026-10-08, alignée sur le web).
///
/// La directive du 2026-10-07 disait « un toucher le ramène, un second met en
/// pause » ; la galerie en avait tiré un arbitrage — bouton effacé ⇒ le toucher
/// ne faisait QUE ramener le bouton, et il en fallait deux pour entrer en plein
/// cadre. Le porteur a tranché l'inverse : un toucher sur le média ramène le
/// bouton (et réarme sa seconde) ET garde sa porte, comme sur le web. Le reste
/// de la règle tient : effacement à 1 s, pause affichée en permanence en pause,
/// relais VoiceOver.
@MainActor
final class MediaGalleryPlayPauseFadeTests: XCTestCase {

    private var faded: FullscreenPlayPauseFade {
        FullscreenPlayPauseFade().playback(isPlaying: true).fading()
    }

    // MARK: - Ce que produit un toucher, bouton effacé, sur une piste qui joue

    func test_aTap_onAFadedButton_revealsIt_andRearmsTheSecond() {
        let revealed = faded.tappingMedia()
        XCTAssertTrue(revealed.isVisible, "le toucher ramène le bouton central")
        XCTAssertEqual(revealed.fadeDelay, FullscreenChromeMetrics.playPauseFadeDelay,
                       "et la seconde repart")
    }

    func test_aTap_fromTheCardedStage_entersFullFrame_inOneGesture() {
        XCTAssertTrue(StagePresentation.carded.after(.tap).isFull,
                      "le même toucher bascule le plein cadre : un geste, pas deux")
        XCTAssertFalse(StagePresentation.full(pausedOnEntry: false).after(.tap).isFull,
                       "et en plein cadre, il rend le plateau")
    }

    // MARK: - Câblage

    func test_theStageDoor_neverStopsAtTheButton() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"))
        guard let debut = code.range(of: "func onEnterStage(_ door: StageEntry) {"),
              let porte = code.range(of: "stagePresentation.after(door)", range: debut.upperBound..<code.endIndex)
        else {
            return XCTFail("`onEnterStage` ne lit plus la porte du plein cadre")
        }
        let avantLaPorte = String(code[debut.upperBound..<porte.lowerBound])
        XCTAssertTrue(avantLaPorte.contains("playPauseFade.tappingMedia()"),
                      "le toucher ramène le bouton central avant de passer la porte")
        XCTAssertFalse(avantLaPorte.contains("return"),
                       "aucun retour anticipé : le toucher qui ramène le bouton bascule aussi le plein cadre")
        XCTAssertFalse(code.contains("tapRevealsOnly"),
                       "l'arbitrage « le toucher ne fait que ramener le bouton » est retiré (décision 2026-10-08)")
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
