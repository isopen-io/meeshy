import XCTest
@testable import MeeshyUI

/// **Revenir sur un réel le reprend à l'instant (#10354).**
///
/// La reprise mettait plusieurs secondes : le lecteur rendu au pool revenait à
/// zéro, jouait depuis le début pendant le geste, puis un `seek` PRÉCIS le
/// replaçait une fois la page posée.
final class PlaybackResumeLawTests: XCTestCase {

    private let resumable: (TimeInterval, TimeInterval) -> Bool = SharedAVPlayerManager.isResumable

    // MARK: - La tête d'un lecteur retrouvé

    func test_action_headAlreadyOnTheResume_onlyPlays() {
        XCTAssertEqual(PlaybackResumeLaw.action(saved: 12, current: 12), .none,
                       "le lecteur du pool n'a pas quitté sa position : seulement play()")
    }

    func test_action_headWithinTolerance_doesNotSeek() {
        XCTAssertEqual(PlaybackResumeLaw.action(saved: 12, current: 11.6), .none)
    }

    func test_action_headPlayedPastTheResumeDuringTheGesture_neverJumpsBack() {
        XCTAssertEqual(PlaybackResumeLaw.action(saved: 12, current: 12.4), .none)
        XCTAssertEqual(PlaybackResumeLaw.action(saved: 12, current: 13.1), .none,
                       "ramener la tête en arrière rejouerait ce que l'utilisateur vient de voir")
    }

    func test_action_freshPlayerAtZero_seeksToTheResume() {
        XCTAssertEqual(PlaybackResumeLaw.action(saved: 12, current: 0), .seek(to: 12))
    }

    func test_action_nothingToResume_doesNotMove() {
        XCTAssertEqual(PlaybackResumeLaw.action(saved: nil, current: 7), .none)
        XCTAssertEqual(PlaybackResumeLaw.action(saved: nil, current: 0), .none)
    }

    func test_action_invalidHead_isTreatedAsTheStart() {
        XCTAssertEqual(PlaybackResumeLaw.action(saved: 12, current: .nan), .seek(to: 12))
    }

    func test_tolerance_isAtMostHalfASecond() {
        XCTAssertLessThanOrEqual(PlaybackResumeLaw.tolerance, 0.5)
        XCTAssertGreaterThan(PlaybackResumeLaw.tolerance, 0)
    }

    // MARK: - La tête d'un lecteur rendu au pool

    func test_recycledHead_resumablePosition_isKept() {
        XCTAssertNil(PlaybackResumeLaw.recycledHead(position: 12, duration: 30, isResumable: resumable),
                     "le lecteur rendu au pool garde sa position : le retour reprend là")
    }

    func test_recycledHead_nearTheEnd_rewinds() {
        XCTAssertEqual(PlaybackResumeLaw.recycledHead(position: 29.5, duration: 30, isResumable: resumable), 0)
    }

    func test_recycledHead_nearTheStart_rewinds() {
        XCTAssertEqual(PlaybackResumeLaw.recycledHead(position: 0.4, duration: 30, isResumable: resumable), 0)
    }

    func test_recycledHead_shortClip_rewinds() {
        XCTAssertEqual(PlaybackResumeLaw.recycledHead(position: 1, duration: 1.5, isResumable: resumable), 0)
    }

    func test_recycledHead_unknownDuration_rewinds() {
        XCTAssertEqual(PlaybackResumeLaw.recycledHead(position: 5, duration: .nan, isResumable: resumable), 0)
    }

    /// La tête gardée par le pool et la position mémorisée disent la même
    /// chose : un lecteur gardé à sa place n'a jamais à être déplacé au retour.
    func test_recycledHeadAndResumeAction_agree() {
        let position: TimeInterval = 12
        XCTAssertNil(PlaybackResumeLaw.recycledHead(position: position, duration: 30, isResumable: resumable))
        XCTAssertEqual(PlaybackResumeLaw.action(saved: position, current: position), .none)
    }

    // MARK: - L'éviction du pool

    func test_victim_withoutDistances_isTheOldest() {
        XCTAssertEqual(PlayerPoolEviction.victim(order: ["a", "b", "c", "d"], distances: [:]), "a")
    }

    func test_victim_keepsTheReelJustLeft_overALaterFarPreroll() {
        let victim = PlayerPoolEviction.victim(
            order: ["previous", "next", "far", "nextNext"],
            distances: ["previous": -1, "next": 1, "far": 4, "nextNext": 2])
        XCTAssertEqual(victim, "far")
    }

    func test_victim_keepsNeighboursOneThenTwo() {
        let victim = PlayerPoolEviction.victim(
            order: ["minusOne", "minusTwo", "plusOne", "plusTwo"],
            distances: ["minusOne": -1, "minusTwo": -2, "plusOne": 1, "plusTwo": 2])
        XCTAssertEqual(victim, "minusTwo", "à distance égale (N−2, N+2), le plus ancien part")
    }

    func test_victim_unknownDistance_leavesBeforeAnyDeclaredNeighbour() {
        let victim = PlayerPoolEviction.victim(
            order: ["minusOne", "plusOne", "story", "plusTwo"],
            distances: ["minusOne": -1, "plusOne": 1, "plusTwo": 2])
        XCTAssertEqual(victim, "story")
    }

    func test_victim_emptyPool_isNil() {
        XCTAssertNil(PlayerPoolEviction.victim(order: [], distances: ["a": 1]))
    }
}
