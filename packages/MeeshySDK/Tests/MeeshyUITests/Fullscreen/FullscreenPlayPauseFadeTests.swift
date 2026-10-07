import XCTest
@testable import MeeshyUI

/// **Le bouton pause s'efface une seconde après le début de la lecture**
/// (#9577, directive porteur 2026-10-07).
///
/// Un bouton posé au centre d'une vidéo cache ce qu'on regarde. Il part donc
/// vite — plus vite que le reste du chrome —, un toucher le ramène et réarme la
/// seconde, et un toucher sur le bouton VISIBLE met en pause. En pause, il
/// reste : c'est la seule façon de reprendre.
final class FullscreenPlayPauseFadeTests: XCTestCase {

    private func playing() -> FullscreenPlayPauseFade {
        FullscreenPlayPauseFade().playback(isPlaying: true)
    }

    // MARK: - Le délai

    func test_theFadeDelay_isOneSecond_andIsNotTheChromeDelay() {
        XCTAssertEqual(FullscreenChromeMetrics.playPauseFadeDelay, 1)
        XCTAssertNotEqual(FullscreenChromeMetrics.playPauseFadeDelay,
                          FullscreenChromeMetrics.autoHideDelay,
                          "deux constantes : le bouton central part avant le reste du chrome")
        XCTAssertEqual(playing().fadeDelay, FullscreenChromeMetrics.playPauseFadeDelay)
    }

    // MARK: - En pause

    func test_atRest_theButtonIsShown_andNothingIsArmed() {
        let rest = FullscreenPlayPauseFade()
        XCTAssertTrue(rest.isVisible)
        XCTAssertNil(rest.fadeDelay, "à l'arrêt, rien ne s'efface")
        XCTAssertEqual(rest.fading(), rest, "un délai échu en pause ne retire rien")
    }

    func test_pausing_bringsTheButtonBack_forGood() {
        let paused = playing().fading().playback(isPlaying: false)
        XCTAssertTrue(paused.isVisible)
        XCTAssertNil(paused.fadeDelay)
    }

    // MARK: - En lecture

    func test_startingPlayback_showsTheButton_thenFadesItAfterTheDelay() {
        let started = playing()
        XCTAssertTrue(started.isVisible, "au début de la lecture, le bouton est encore là")
        XCTAssertNotNil(started.fadeDelay)

        let faded = started.fading()
        XCTAssertFalse(faded.isVisible)
        XCTAssertNil(faded.fadeDelay, "effacé : plus rien à armer")
    }

    func test_aTouch_bringsTheButtonBack_andRearmsTheSecond() {
        let faded = playing().fading()
        XCTAssertEqual(faded.mediaTapEffect, .reveals,
                       "le toucher qui ramène le bouton ne fait rien d'autre")

        let revealed = faded.tappingMedia()
        XCTAssertTrue(revealed.isVisible)
        XCTAssertEqual(revealed.fadeDelay, FullscreenChromeMetrics.playPauseFadeDelay)
        XCTAssertNotEqual(revealed, playing(),
                          "un réarmement est un état NEUF : la tâche qui compte la seconde repart")
        XCTAssertFalse(revealed.fading().isVisible)
    }

    func test_aTouchOnTheMedia_whileTheButtonShows_passesThrough_andRearms() {
        let started = playing()
        XCTAssertEqual(started.mediaTapEffect, .passesThrough)
        XCTAssertNotEqual(started.tappingMedia(), started, "la seconde repart")
        XCTAssertTrue(started.tappingMedia().isVisible)
    }

    func test_aTouchAtRest_passesThrough_andChangesNothing() {
        let rest = FullscreenPlayPauseFade()
        XCTAssertEqual(rest.mediaTapEffect, .passesThrough)
        XCTAssertEqual(rest.tappingMedia(), rest)
    }

    func test_theSamePlaybackState_isNotAChange() {
        let faded = playing().fading()
        XCTAssertEqual(faded.playback(isPlaying: true), faded,
                       "le moteur republie `isPlaying` : une valeur identique ne ramène pas le bouton")
    }

    // MARK: - VoiceOver

    func test_theAccessibleButton_outlivesTheVisualOne() {
        XCTAssertTrue(TransportLayout.keepsAccessiblePlayPause(centerVisible: false,
                                                               controls: [.playPause]),
                      "effacé à l'œil, le bouton reste atteignable par VoiceOver")
        XCTAssertFalse(TransportLayout.keepsAccessiblePlayPause(centerVisible: true,
                                                                controls: [.playPause]),
                       "visible, le bouton EST son propre élément : pas de doublon")
        XCTAssertFalse(TransportLayout.keepsAccessiblePlayPause(centerVisible: false,
                                                                controls: [.scrubber]),
                       "sans play/pause demandé, rien à garder (loi 4)")
    }
}
