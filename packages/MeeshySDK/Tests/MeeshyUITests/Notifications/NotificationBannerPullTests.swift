import XCTest
@testable import MeeshyUI

/// #18721 — tirer la bannière vers le bas la transforme en conversation : la
/// carte suit le doigt, résiste au-delà du seuil, s'étire, et la levée décide
/// d'ouvrir ou de revenir. Le balayage vers le HAUT ne change pas.
final class NotificationBannerPullTests: XCTestCase {

    // MARK: - Progression

    func test_progress_atRest_isZero() {
        XCTAssertEqual(NotificationBannerPull.progress(translation: 0), 0)
    }

    func test_progress_pulledUp_staysAtZero() {
        XCTAssertEqual(NotificationBannerPull.progress(translation: -40), 0)
    }

    func test_progress_atCommitDistance_isOne() {
        XCTAssertEqual(NotificationBannerPull.progress(translation: NotificationBannerPull.commitDistance), 1)
    }

    func test_progress_farBeyondTheThreshold_isBoundedByOne() {
        XCTAssertEqual(NotificationBannerPull.progress(translation: 900), 1)
    }

    func test_progress_halfway_isHalf() {
        XCTAssertEqual(NotificationBannerPull.progress(translation: NotificationBannerPull.commitDistance / 2), 0.5, accuracy: 0.0001)
    }

    // MARK: - Élasticité

    func test_elasticOffset_belowTheThreshold_followsTheFingerOneForOne() {
        XCTAssertEqual(NotificationBannerPull.elasticOffset(translation: 40), 40)
    }

    func test_elasticOffset_pulledUp_neverDescends() {
        XCTAssertEqual(NotificationBannerPull.elasticOffset(translation: -30), 0)
    }

    func test_elasticOffset_beyondTheThreshold_resists() {
        let beyond = NotificationBannerPull.commitDistance + 100
        XCTAssertLessThan(NotificationBannerPull.elasticOffset(translation: beyond), beyond)
        XCTAssertGreaterThan(NotificationBannerPull.elasticOffset(translation: beyond), NotificationBannerPull.commitDistance)
    }

    func test_elasticOffset_isMonotonic() {
        let samples = stride(from: CGFloat(0), through: 2_000, by: 7).map { NotificationBannerPull.elasticOffset(translation: $0) }
        XCTAssertEqual(samples, samples.sorted(), "la carte ne recule jamais quand le doigt avance")
    }

    func test_elasticOffset_isBounded() {
        let ceiling = NotificationBannerPull.commitDistance + NotificationBannerPull.elasticReach
        XCTAssertLessThan(NotificationBannerPull.elasticOffset(translation: 100_000), ceiling)
    }

    func test_cardOffset_pulledUp_followsTheFingerForTheDismissSwipe() {
        XCTAssertEqual(NotificationBannerPull.cardOffset(translation: -25), -25)
    }

    // MARK: - Étirement

    func test_stretch_atRest_isIdentity() {
        XCTAssertEqual(NotificationBannerPull.stretch(progress: 0), .rest)
    }

    func test_stretch_atFullPull_widensAndStretchesWithinTheirMaximum() {
        let full = NotificationBannerPull.stretch(progress: 1)
        XCTAssertEqual(full.width, 1 + NotificationBannerPull.maximumWiden, accuracy: 0.0001)
        XCTAssertEqual(full.height, 1 + NotificationBannerPull.maximumStretch, accuracy: 0.0001)
    }

    func test_stretch_beyondFull_isBounded() {
        XCTAssertEqual(NotificationBannerPull.stretch(progress: 4), NotificationBannerPull.stretch(progress: 1))
    }

    // MARK: - Décision à la levée

    func test_outcome_releasedBeforeTheThreshold_cancels() {
        XCTAssertEqual(NotificationBannerPull.outcome(translation: 60, predictedEnd: 70), .cancel)
    }

    func test_outcome_releasedPastTheThreshold_opens() {
        XCTAssertEqual(NotificationBannerPull.outcome(translation: 110, predictedEnd: 120), .open)
    }

    func test_outcome_flungDownFranklyBeforeTheThreshold_opens() {
        XCTAssertEqual(NotificationBannerPull.outcome(translation: 40, predictedEnd: 260), .open)
    }

    func test_outcome_pastTheThresholdButSentBackUp_cancels() {
        XCTAssertEqual(NotificationBannerPull.outcome(translation: 120, predictedEnd: 40), .cancel)
    }

    func test_outcome_aTremor_cancels() {
        XCTAssertEqual(NotificationBannerPull.outcome(translation: 6, predictedEnd: 400), .cancel)
    }

    /// Le haut reste le domaine du balayage qui ferme : la traction ne s'en mêle pas.
    func test_outcome_swipedUp_neverOpens_andTheSwipeStillDismisses() {
        XCTAssertEqual(NotificationBannerPull.outcome(translation: -60, predictedEnd: -200), .cancel)
        XCTAssertEqual(NotificationBannerSwipe.outcome(translation: -60, predictedEnd: -200), .dismiss)
    }

    // MARK: - Morphisme

    private let card = CGRect(x: 8, y: 80, width: 377, height: 84)
    private let screen = CGRect(x: 0, y: 0, width: 393, height: 852)

    func test_morphFrame_atZero_isTheCard() {
        XCTAssertEqual(NotificationBannerMorph.frame(progress: 0, from: card, to: screen), card)
    }

    func test_morphFrame_atOne_isTheScreen() {
        XCTAssertEqual(NotificationBannerMorph.frame(progress: 1, from: card, to: screen), screen)
    }

    func test_morphFrame_growsMonotonically() {
        let heights = stride(from: CGFloat(0), through: 1, by: 0.1).map { NotificationBannerMorph.frame(progress: $0, from: card, to: screen).height }
        XCTAssertEqual(heights, heights.sorted())
    }

    func test_morphFrame_outOfRange_isClamped() {
        XCTAssertEqual(NotificationBannerMorph.frame(progress: 3, from: card, to: screen), screen)
        XCTAssertEqual(NotificationBannerMorph.frame(progress: -1, from: card, to: screen), card)
    }

    func test_morphBodyOpacity_fadesInTheFirstHalf_andStaysGone() {
        XCTAssertEqual(NotificationBannerMorph.bodyOpacity(progress: 0), 1)
        XCTAssertEqual(NotificationBannerMorph.bodyOpacity(progress: 0.25), 0.5, accuracy: 0.0001)
        XCTAssertEqual(NotificationBannerMorph.bodyOpacity(progress: 0.5), 0)
        XCTAssertEqual(NotificationBannerMorph.bodyOpacity(progress: 1), 0)
    }

    func test_morphCornerRadius_opensFromTheCardToSquare() {
        XCTAssertEqual(NotificationBannerMorph.cornerRadius(progress: 0, from: 22), 22)
        XCTAssertEqual(NotificationBannerMorph.cornerRadius(progress: 1, from: 22), 0)
    }

    // MARK: - Une traction n'est jamais un toucher

    /// Le bouton de la bannière émet son toucher à la levée du doigt, même
    /// après une traction : sans ce verrou, une traction relâchée sous le seuil
    /// ouvrait la conversation par le chemin du toucher, donc LUE.
    func test_tapLatch_afterAPull_swallowsTheReleaseTap() {
        let start = Date(timeIntervalSinceReferenceDate: 1_000)
        let latch = NotificationBannerTapLatch().notingPull(translation: 53, at: start)

        XCTAssertFalse(latch.admitsTap(at: start.addingTimeInterval(0.05)))
    }

    func test_tapLatch_aTremorBelowTheMinimumPull_staysATap() {
        let start = Date(timeIntervalSinceReferenceDate: 1_000)
        let latch = NotificationBannerTapLatch().notingPull(translation: NotificationBannerPull.minimumPull - 1, at: start)

        XCTAssertTrue(latch.admitsTap(at: start.addingTimeInterval(0.05)))
    }

    func test_tapLatch_aPullUpward_alsoSwallowsTheReleaseTap() {
        let start = Date(timeIntervalSinceReferenceDate: 1_000)
        let latch = NotificationBannerTapLatch().notingPull(translation: -40, at: start)

        XCTAssertFalse(latch.admitsTap(at: start.addingTimeInterval(0.05)))
    }

    func test_tapLatch_aDeliberateTapLater_opensAgain() {
        let start = Date(timeIntervalSinceReferenceDate: 1_000)
        let latch = NotificationBannerTapLatch().notingPull(translation: 53, at: start)

        XCTAssertTrue(latch.admitsTap(at: start.addingTimeInterval(NotificationBannerTapLatch.window + 0.01)))
    }

    func test_tapLatch_untouched_admitsTheTap() {
        XCTAssertTrue(NotificationBannerTapLatch().admitsTap(at: Date()))
    }
}
