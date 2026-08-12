import XCTest
@testable import MeeshyUI

/// Prédicats du garde background : `isAnyAudioPlaying` doit exclure le lecteur
/// vidéo partagé (une vidéo hors PiP ne survit jamais à l'arrière-plan), tandis
/// que `isAnyPlaying` reste le prédicat global (vidéo comprise) consommé par la
/// reprise post-appel du coordinator audio.
@MainActor
final class PlaybackCoordinatorPredicateTests: XCTestCase {

    override func tearDown() {
        SharedAVPlayerManager.shared.isPlaying = false
        super.tearDown()
    }

    func test_isAnyAudioPlaying_excludesSharedVideoManager() {
        SharedAVPlayerManager.shared.isPlaying = true

        XCTAssertTrue(PlaybackCoordinator.shared.isAnyPlaying,
                      "Le prédicat global doit voir la vidéo")
        XCTAssertFalse(PlaybackCoordinator.shared.isAnyAudioPlaying,
                       "Le prédicat audio ne doit PAS voir la vidéo")
    }

    func test_isAnyAudioPlaying_falseWhenNothingPlays() {
        SharedAVPlayerManager.shared.isPlaying = false
        XCTAssertFalse(PlaybackCoordinator.shared.isAnyAudioPlaying)
    }

    func test_shouldHaltPlaybackOnPipStop_userCloseHalts_internalTeardownDoesNot() {
        XCTAssertTrue(SharedAVPlayerManager.shouldHaltPlaybackOnPipStop(teardownWasInternal: false),
                      "La fermeture de la fenêtre PiP par l'utilisateur (X) arrête la lecture")
        XCTAssertFalse(SharedAVPlayerManager.shouldHaltPlaybackOnPipStop(teardownWasInternal: true),
                       "Restauration in-app ou stop programmatique : la lecture continue")
    }
}
