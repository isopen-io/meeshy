import XCTest
@testable import MeeshyUI

/// **Le bouton pause s'efface une seconde après le début de la lecture**
/// (#9577, directive porteur 2026-10-07).
///
/// Un bouton posé au centre d'une vidéo cache ce qu'on regarde. Il part donc
/// vite — plus vite que le reste du chrome —, un toucher le ramène et réarme la
/// seconde, et un toucher sur le bouton VISIBLE met en pause. En pause, il
/// reste : c'est la seule façon de reprendre.
///
/// Décision porteur 2026-10-08 : le toucher qui ramène le bouton bascule AUSSI
/// le chrome (comme le web) — il ne s'arrête jamais au bouton.
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
        XCTAssertFalse(faded.isVisible)

        let revealed = faded.tappingMedia()
        XCTAssertTrue(revealed.isVisible)
        XCTAssertEqual(revealed.fadeDelay, FullscreenChromeMetrics.playPauseFadeDelay)
        XCTAssertNotEqual(revealed, playing(),
                          "un réarmement est un état NEUF : la tâche qui compte la seconde repart")
        XCTAssertFalse(revealed.fading().isVisible)
    }

    func test_aTouchOnTheMedia_whileTheButtonShows_rearmsTheSecond() {
        let started = playing()
        XCTAssertNotEqual(started.tappingMedia(), started, "la seconde repart")
        XCTAssertTrue(started.tappingMedia().isVisible)
    }

    func test_aTouchAtRest_changesNothing() {
        let rest = FullscreenPlayPauseFade()
        XCTAssertEqual(rest.tappingMedia(), rest)
    }

    // MARK: - Le toucher garde l'effet de l'hôte (décision porteur 2026-10-08)

    func test_theFullscreenPlayer_aTouchRevealsTheButton_andTogglesTheChrome_inOneGesture() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Fullscreen/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        guard let renderer = source.range(of: "internal struct _FullscreenRenderer"),
              let start = source.range(of: "private func handleSurfaceTap() {",
                                       range: renderer.upperBound..<source.endIndex),
              let end = source.range(of: "\n    }\n", range: start.upperBound..<source.endIndex)
        else {
            return XCTFail("`_FullscreenRenderer.handleSurfaceTap` introuvable")
        }
        let body = String(source[start.upperBound..<end.lowerBound])
        XCTAssertTrue(body.contains("playPauseFade.tappingMedia()"),
                      "le toucher ramène le bouton central et réarme sa seconde")
        XCTAssertTrue(body.contains("toggleControls()"),
                      "le même toucher bascule le chrome")
        XCTAssertFalse(body.contains("if ") || body.contains("guard ") || body.contains("return"),
                       "aucune condition : le toucher qui ramène le bouton ne s'arrête jamais au bouton")
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
