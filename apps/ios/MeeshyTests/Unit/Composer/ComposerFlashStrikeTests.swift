import XCTest
import AVFoundation
@testable import Meeshy

/// **L'éclair qui dit qu'on vient d'allumer le flash** (#17463) : il frappe à
/// l'activation seulement, jamais sous Reduce Motion, jamais en filmant, et son
/// horloge est une fonction pure du temps écoulé.
final class ComposerFlashStrikeTests: XCTestCase {

    // MARK: - Quand l'éclair se joue

    func test_plays_offToOn_strikes() {
        XCTAssertTrue(ComposerFlashStrike.plays(from: .off, to: .on, reduceMotion: false, recording: false))
    }

    func test_plays_onToAuto_strikes() {
        XCTAssertTrue(ComposerFlashStrike.plays(from: .on, to: .auto, reduceMotion: false, recording: false))
    }

    func test_plays_offToAuto_strikes() {
        XCTAssertTrue(ComposerFlashStrike.plays(from: .off, to: .auto, reduceMotion: false, recording: false))
    }

    func test_plays_turningOff_neverStrikes() {
        XCTAssertFalse(ComposerFlashStrike.plays(from: .auto, to: .off, reduceMotion: false, recording: false))
        XCTAssertFalse(ComposerFlashStrike.plays(from: .on, to: .off, reduceMotion: false, recording: false))
    }

    func test_plays_sameMode_neverStrikes() {
        XCTAssertFalse(ComposerFlashStrike.plays(from: .on, to: .on, reduceMotion: false, recording: false))
    }

    func test_plays_reduceMotion_neverStrikes() {
        XCTAssertFalse(ComposerFlashStrike.plays(from: .off, to: .on, reduceMotion: true, recording: false))
    }

    func test_plays_whileRecording_neverStrikes() {
        XCTAssertFalse(ComposerFlashStrike.plays(from: .off, to: .on, reduceMotion: false, recording: true))
    }

    // MARK: - Ce que l'activation produit

    func test_outcome_activation_strikesWithHapticAndAnnouncement() {
        let issue = ComposerFlashStrike.outcome(from: .off, to: .on, reduceMotion: false, recording: false)
        XCTAssertEqual(issue, ComposerFlashStrike.Outcome(strikes: true, haptic: true, announces: true))
    }

    func test_outcome_reduceMotion_onlyAnnounces() {
        let issue = ComposerFlashStrike.outcome(from: .off, to: .auto, reduceMotion: true, recording: false)
        XCTAssertEqual(issue, ComposerFlashStrike.Outcome(strikes: false, haptic: false, announces: true))
    }

    func test_outcome_turningOff_isSilent() {
        let issue = ComposerFlashStrike.outcome(from: .on, to: .off, reduceMotion: false, recording: false)
        XCTAssertEqual(issue, .silent)
    }

    func test_outcome_whileRecording_isSilent() {
        let issue = ComposerFlashStrike.outcome(from: .off, to: .on, reduceMotion: true, recording: true)
        XCTAssertEqual(issue, .silent)
    }

    // MARK: - L'horloge de l'éclair

    func test_frame_atStart_drawsNothing() {
        let image = ComposerFlashStrike.frame(at: 0)
        XCTAssertEqual(image.drawn, 0, accuracy: 0.001)
        XCTAssertEqual(image.whitening, 0, accuracy: 0.001)
    }

    func test_frame_afterDrawDuration_boltIsFullyDrawn() {
        let image = ComposerFlashStrike.frame(at: ComposerFlashStrike.drawDuration)
        XCTAssertEqual(image.drawn, 1, accuracy: 0.001)
        XCTAssertEqual(image.boltOpacity, 1, accuracy: 0.001)
    }

    func test_frame_drawIsMonotonic() {
        let pas = stride(from: 0.0, through: ComposerFlashStrike.drawDuration, by: 0.01)
        let traces = pas.map { ComposerFlashStrike.frame(at: $0).drawn }
        XCTAssertEqual(traces, traces.sorted(), "le tracé ne recule jamais")
    }

    func test_frame_whitening_isBriefAndModerate() {
        let pas = stride(from: 0.0, through: ComposerFlashStrike.lifetime, by: 0.005)
        let blancs = pas.map { ($0, ComposerFlashStrike.frame(at: $0).whitening) }
        let allumes = blancs.filter { $0.1 > 0.001 }
        let duree = (allumes.last?.0 ?? 0) - (allumes.first?.0 ?? 0)
        XCTAssertLessThanOrEqual(duree, 0.13, "le blanchiment dure environ 120 ms")
        XCTAssertGreaterThan(duree, 0.08)
        let pic = blancs.map(\.1).max() ?? 0
        XCTAssertLessThanOrEqual(pic, ComposerFlashStrike.whiteningPeak)
        XCTAssertLessThan(ComposerFlashStrike.whiteningPeak, 0.5, "l'image reste lisible sous le blanc")
    }

    func test_frame_atLifetime_leavesNothingOnScreen() {
        let image = ComposerFlashStrike.frame(at: ComposerFlashStrike.lifetime)
        XCTAssertEqual(image.boltOpacity, 0, accuracy: 0.001)
        XCTAssertEqual(image.glow, 0, accuracy: 0.001)
        XCTAssertEqual(image.whitening, 0, accuracy: 0.001)
    }

    func test_frame_negativeOrNonFiniteTime_isTheFirstImage() {
        XCTAssertEqual(ComposerFlashStrike.frame(at: -1), ComposerFlashStrike.frame(at: 0))
        XCTAssertEqual(ComposerFlashStrike.frame(at: .nan), ComposerFlashStrike.frame(at: 0))
    }

    // MARK: - Le tracé

    func test_boltPath_staysInsideTheViewfinder() {
        let toile = CGRect(x: 0, y: 0, width: 390, height: 693)
        let cadre = ComposerFlashStrike.boltPath(in: toile.size).boundingRect
        XCTAssertTrue(toile.contains(cadre))
        XCTAssertGreaterThan(cadre.height, toile.height * 0.3, "un éclair qui se voit")
    }

    func test_boltPath_emptyCanvas_isEmpty() {
        XCTAssertTrue(ComposerFlashStrike.boltPath(in: .zero).isEmpty)
    }
}
