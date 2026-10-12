import XCTest
@testable import MeeshyUI

/// **Le geste ne fait que `play()` (#10354).**
///
/// Pendant le défilement, le seul travail permis est la pause du sortant et le
/// `play()` d'un lecteur vidéo déjà attaché à la surface entrante — quel que
/// soit le type du réel entrant. Tout le reste attend que le défilement se pose.
final class ReelSwitchWorkTests: XCTestCase {

    private let heavyWork: ReelSwitchWork = [
        .loadEngine, .configureSession, .coordinatePlayback, .reportWatch,
        .configurePip, .refreshPool, .startScene, .startAudio, .mountActiveChrome,
    ]

    // MARK: - Pendant le geste

    func test_gesture_videoWithAttachedPlayer_onlyPausesAndPlays() {
        XCTAssertEqual(ReelSwitchWork.permitted(in: .gesture, for: .video(attachedPlayer: true)),
                       [.pauseOutgoing, .playAttachedPlayer])
    }

    func test_gesture_videoWithoutAttachedPlayer_createsNoPlayer() {
        let work = ReelSwitchWork.permitted(in: .gesture, for: .video(attachedPlayer: false))
        XCTAssertEqual(work, [.pauseOutgoing],
                       "sans lecteur dans le pool, le poster reste : aucun AVPlayer ni AVPlayerItem à mi-course")
        XCTAssertFalse(work.contains(.loadEngine))
    }

    func test_gesture_scene_mountsNothingAndStartsNothing() {
        let work = ReelSwitchWork.permitted(in: .gesture, for: .scene)
        XCTAssertEqual(work, [.pauseOutgoing])
        XCTAssertFalse(work.contains(.startScene), "la scène (canvas, calques, mixer) démarre une fois posée")
        XCTAssertFalse(work.contains(.configureSession))
    }

    func test_gesture_audio_startsNoEngine() {
        let work = ReelSwitchWork.permitted(in: .gesture, for: .audio)
        XCTAssertEqual(work, [.pauseOutgoing])
        XCTAssertFalse(work.contains(.startAudio), "le moteur audio démarre une fois posé")
        XCTAssertFalse(work.contains(.coordinatePlayback))
    }

    func test_gesture_image_onlyPauses() {
        XCTAssertEqual(ReelSwitchWork.permitted(in: .gesture, for: .image), [.pauseOutgoing])
    }

    func test_gesture_neverPermitsHeavyWork_forAnyKind() {
        let kinds: [ReelSwitchWork.Kind] = [.video(attachedPlayer: true), .video(attachedPlayer: false),
                                            .scene, .audio, .image]
        for kind in kinds {
            XCTAssertTrue(ReelSwitchWork.permitted(in: .gesture, for: kind).isDisjoint(with: heavyWork),
                          "travail lourd permis pendant le geste pour \(kind)")
        }
    }

    // MARK: - Une fois posé

    func test_settled_video_runsTheFullEngine() {
        let work = ReelSwitchWork.permitted(in: .settled, for: .video(attachedPlayer: true))
        XCTAssertTrue(work.isSuperset(of: [.loadEngine, .configureSession, .coordinatePlayback,
                                           .reportWatch, .configurePip, .refreshPool, .mountActiveChrome]))
        XCTAssertFalse(work.contains(.playAttachedPlayer), "posé, c'est le moteur complet qui joue")
    }

    func test_settled_videoWithoutAttachedPlayer_createsItsPlayer() {
        XCTAssertTrue(ReelSwitchWork.permitted(in: .settled, for: .video(attachedPlayer: false)).contains(.loadEngine))
    }

    func test_settled_scene_startsTheScene() {
        let work = ReelSwitchWork.permitted(in: .settled, for: .scene)
        XCTAssertTrue(work.contains(.startScene))
        XCTAssertFalse(work.contains(.loadEngine))
    }

    func test_settled_audio_startsTheAudioEngine() {
        let work = ReelSwitchWork.permitted(in: .settled, for: .audio)
        XCTAssertTrue(work.isSuperset(of: [.startAudio, .coordinatePlayback]))
        XCTAssertFalse(work.contains(.configurePip))
    }

    // MARK: - La phase d'une page

    func test_phase_notElected_isNil() {
        XCTAssertNil(ReelSwitchWork.phase(isElected: false, isSettled: true))
        XCTAssertNil(ReelSwitchWork.phase(isElected: false, isSettled: false))
    }

    func test_phase_electedMidScroll_isGesture() {
        XCTAssertEqual(ReelSwitchWork.phase(isElected: true, isSettled: false), .gesture)
    }

    func test_phase_electedAndSettled_isSettled() {
        XCTAssertEqual(ReelSwitchWork.phase(isElected: true, isSettled: true), .settled)
    }

    func test_engages_onlyOnceSettled() {
        XCTAssertFalse(ReelSwitchWork.engages(isElected: true, isSettled: false))
        XCTAssertTrue(ReelSwitchWork.engages(isElected: true, isSettled: true))
        XCTAssertFalse(ReelSwitchWork.engages(isElected: false, isSettled: true),
                       "perdre l'élection désengage tout de suite, même sur la page encore posée")
    }
}
