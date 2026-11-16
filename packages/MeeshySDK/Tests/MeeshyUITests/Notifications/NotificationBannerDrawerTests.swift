import XCTest
@testable import MeeshyUI

/// #18721 (retour porteur du 2026-11-16) — la bannière se tire comme un
/// TIROIR : son haut reste accroché, son bord bas suit le doigt avec une
/// résistance franche, et, relâchée au-delà du seuil, elle se transforme
/// continûment en la feuille de la conversation.
final class NotificationBannerDrawerTests: XCTestCase {

    // MARK: - L'ouverture du tiroir

    func test_opening_atRestOrPushedUp_isZero() {
        XCTAssertEqual(NotificationBannerDrawer.opening(translation: 0), 0)
        XCTAssertEqual(NotificationBannerDrawer.opening(translation: -40), 0)
    }

    func test_opening_resistsFromTheFirstPoint() {
        for translation in [CGFloat(10), 40, 96, 200] {
            XCTAssertLessThan(NotificationBannerDrawer.opening(translation: translation), translation,
                              "le tiroir résiste dès le premier point : il ne suit jamais un pour un")
        }
    }

    func test_opening_atTheThreshold_isFrank() {
        let atThreshold = NotificationBannerDrawer.opening(translation: NotificationBannerPull.commitDistance)
        XCTAssertGreaterThan(atThreshold, 60, "au seuil, le tiroir s'est franchement ouvert")
    }

    func test_opening_isMonotonic() {
        let samples = stride(from: CGFloat(0), through: 3_000, by: 9).map { NotificationBannerDrawer.opening(translation: $0) }
        XCTAssertEqual(samples, samples.sorted(), "le tiroir ne se referme jamais quand le doigt descend")
    }

    func test_opening_isBoundedByItsReach() {
        XCTAssertLessThan(NotificationBannerDrawer.opening(translation: 100_000), NotificationBannerDrawer.reach)
    }

    func test_resistance_grows_theFurtherItIsPulled() {
        let early = NotificationBannerDrawer.opening(translation: 50) / 50
        let late = NotificationBannerDrawer.opening(translation: 400) / 400
        XCTAssertLessThan(late, early, "plus on tire, plus il résiste")
    }

    // MARK: - Le haut reste accroché

    func test_lift_downward_keepsTheTopAnchored() {
        XCTAssertEqual(NotificationBannerDrawer.lift(translation: 150), 0)
    }

    func test_lift_upward_followsTheDismissSwipe() {
        XCTAssertEqual(NotificationBannerDrawer.lift(translation: -25), -25)
    }

    // MARK: - Il s'élargit vers la feuille

    func test_sideInset_closesAsTheDrawerOpens() {
        XCTAssertEqual(NotificationBannerDrawer.sideInset(progress: 0, rest: 8), 8)
        XCTAssertEqual(NotificationBannerDrawer.sideInset(progress: 1, rest: 8), 0)
        XCTAssertEqual(NotificationBannerDrawer.sideInset(progress: 3, rest: 8), 0)
    }

    // MARK: - L'armement

    func test_isArmed_onlyFromTheThreshold() {
        XCTAssertFalse(NotificationBannerDrawer.isArmed(translation: NotificationBannerPull.commitDistance - 1))
        XCTAssertTrue(NotificationBannerDrawer.isArmed(translation: NotificationBannerPull.commitDistance))
    }

    // MARK: - La carte sous le doigt

    func test_toastDrawer_atRest_isClosed() {
        XCTAssertEqual(NotificationToastDrawer.pulled(translation: 0, restInset: 8, reduceMotion: false), .closed)
        XCTAssertEqual(NotificationToastDrawer.pulled(translation: -30, restInset: 8, reduceMotion: false), .closed)
    }

    func test_toastDrawer_pulled_opensWidensAndArms() {
        let drawer = NotificationToastDrawer.pulled(translation: 120, restInset: 8, reduceMotion: false)
        XCTAssertEqual(drawer.opening, NotificationBannerDrawer.opening(translation: 120))
        XCTAssertEqual(drawer.sideInset, 0)
        XCTAssertTrue(drawer.isArmed)
    }

    func test_toastDrawer_underReduceMotion_neverStretches_butStillArms() {
        let drawer = NotificationToastDrawer.pulled(translation: 120, restInset: 8, reduceMotion: true)
        XCTAssertEqual(drawer.opening, 0)
        XCTAssertNil(drawer.sideInset)
        XCTAssertTrue(drawer.isArmed)
    }

    // MARK: - La feuille d'arrivée

    func test_sheetFrame_spansTheWidth_fromTheSheetTop_toTheBottom() {
        let frame = NotificationBannerMorph.sheetFrame(container: CGSize(width: 402, height: 874), top: 70)
        XCTAssertEqual(frame, CGRect(x: 0, y: 70, width: 402, height: 804))
    }

    func test_cornerRadius_opensFromTheCard_toTheSheet() {
        XCTAssertEqual(NotificationBannerMorph.cornerRadius(progress: 0, from: 22, to: 38), 22)
        XCTAssertEqual(NotificationBannerMorph.cornerRadius(progress: 1, from: 22, to: 38), 38)
        XCTAssertEqual(NotificationBannerMorph.cornerRadius(progress: 0.5, from: 22, to: 38), 30, accuracy: 0.0001)
    }

    func test_conversationFace_appearsInTheSecondHalf() {
        XCTAssertEqual(NotificationBannerMorph.conversationOpacity(progress: 0), 0)
        XCTAssertEqual(NotificationBannerMorph.conversationOpacity(progress: 0.5), 0)
        XCTAssertEqual(NotificationBannerMorph.conversationOpacity(progress: 0.75), 0.5, accuracy: 0.0001)
        XCTAssertEqual(NotificationBannerMorph.conversationOpacity(progress: 1), 1)
    }

    /// La carte n'est jamais vide : le message s'efface pendant que la feuille
    /// se compose, et leurs opacités se complètent au milieu.
    func test_faces_neverLeaveTheCardEmpty() {
        for progress in stride(from: CGFloat(0), through: 1, by: 0.05) {
            let total = NotificationBannerMorph.bodyOpacity(progress: progress) + NotificationBannerMorph.conversationOpacity(progress: progress)
            XCTAssertLessThanOrEqual(total, 1.0001)
        }
        XCTAssertEqual(NotificationBannerMorph.bodyOpacity(progress: 0.5), 0)
    }

    func test_scrim_darkensWithTheMorph_upToTheSheetDim() {
        XCTAssertEqual(NotificationBannerMorph.scrimOpacity(progress: 0), 0)
        XCTAssertEqual(NotificationBannerMorph.scrimOpacity(progress: 1), NotificationBannerMorph.sheetDim, accuracy: 0.0001)
        XCTAssertEqual(NotificationBannerMorph.scrimOpacity(progress: 2), NotificationBannerMorph.sheetDim, accuracy: 0.0001)
    }
    // MARK: - Le relais de l'enveloppe à la feuille

    /// Mesuré au simulateur : l'enveloppe s'effaçait 120 ms après la demande
    /// de feuille, laquelle paraissait 0,4 s plus tard puis montrait son
    /// squelette 0,5 s — un écran vide d'une seconde. L'enveloppe ne part
    /// plus qu'une fois la feuille PEINTE.
    func test_handoff_waitsForTheSheetToPaintItsMessages() {
        XCTAssertFalse(NotificationBannerHandoff.releasesEnvelope(morphSettled: true, sheetPainted: false, waited: 0.5))
        XCTAssertTrue(NotificationBannerHandoff.releasesEnvelope(morphSettled: true, sheetPainted: true, waited: 0.5))
    }

    func test_handoff_neverBeforeTheMorphHasSettled() {
        XCTAssertFalse(NotificationBannerHandoff.releasesEnvelope(morphSettled: false, sheetPainted: true, waited: 0))
    }

    /// Une feuille qui ne peint jamais (réseau froid, verrou) ne retient pas
    /// l'enveloppe indéfiniment : elle part au plafond.
    func test_handoff_neverWaitsBeyondTheCeiling() {
        XCTAssertFalse(NotificationBannerHandoff.releasesEnvelope(
            morphSettled: true, sheetPainted: false, waited: NotificationBannerHandoff.ceiling - 0.01))
        XCTAssertTrue(NotificationBannerHandoff.releasesEnvelope(
            morphSettled: true, sheetPainted: false, waited: NotificationBannerHandoff.ceiling))
    }

    /// La feuille réelle pose son propre voile : celui de l'enveloppe s'efface
    /// à cet instant, sinon l'écran s'assombrit deux fois.
    func test_envelopeScrim_yieldsToTheSheetsOwnDim() {
        XCTAssertEqual(NotificationBannerMorph.scrimOpacity(progress: 1, sheetShown: false), NotificationBannerMorph.sheetDim, accuracy: 0.0001)
        XCTAssertEqual(NotificationBannerMorph.scrimOpacity(progress: 1, sheetShown: true), 0)
    }
}
