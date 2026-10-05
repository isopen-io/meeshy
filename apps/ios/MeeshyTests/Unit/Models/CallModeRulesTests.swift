import XCTest
@testable import Meeshy

/// #8578 — le carrousel unique d'un mode : l'élément choisi au centre, agrandi,
/// ses voisins plus petits et atténués ; et le mode Effets, qui n'active qu'un
/// réglage à la fois.
@MainActor
final class CallModeRulesTests: XCTestCase {

    // MARK: - Le carrousel

    func test_scale_selectedIsFullSize_neighboursAreSmaller() {
        XCTAssertEqual(CallModeCarouselRule.scale(isSelected: true), 1)
        XCTAssertLessThan(CallModeCarouselRule.scale(isSelected: false), 1)
    }

    func test_opacity_neighboursAreDimmed() {
        XCTAssertEqual(CallModeCarouselRule.opacity(isSelected: true), 1)
        XCTAssertLessThan(CallModeCarouselRule.opacity(isSelected: false), 1)
    }

    func test_sideInset_centresTheFirstAndLastItems() {
        XCTAssertEqual(CallModeCarouselRule.sideInset(containerWidth: 390, itemWidth: 70), 160)
    }

    func test_sideInset_narrowerThanAnItem_isZero() {
        XCTAssertEqual(CallModeCarouselRule.sideInset(containerWidth: 40, itemWidth: 70), 0)
    }

    func test_stepping_forward_selectsTheNextItem() {
        XCTAssertEqual(CallModeCarouselRule.stepping("b", in: ["a", "b", "c"], by: 1), "c")
    }

    func test_stepping_pastTheEnds_staysOnTheLastOrFirst() {
        XCTAssertEqual(CallModeCarouselRule.stepping("c", in: ["a", "b", "c"], by: 1), "c")
        XCTAssertEqual(CallModeCarouselRule.stepping("a", in: ["a", "b", "c"], by: -1), "a")
    }

    func test_stepping_unknownSelection_fallsBackToTheFirst() {
        XCTAssertEqual(CallModeCarouselRule.stepping("z", in: ["a", "b"], by: 1), "a")
    }

    // MARK: - Suivre le doigt (#8736)

    func test_commits_whileInteracting_isFalse() {
        XCTAssertFalse(CallModeCarouselRule.commits(isInteracting: true))
    }

    func test_commits_whenIdle_isTrue() {
        XCTAssertTrue(CallModeCarouselRule.commits(isInteracting: false))
    }

    func test_mayFollowSelection_neverUnderTheFinger() {
        XCTAssertFalse(CallModeCarouselRule.mayFollowSelection(isInteracting: true))
        XCTAssertTrue(CallModeCarouselRule.mayFollowSelection(isInteracting: false))
    }

    func test_settled_withoutATarget_isSettled() {
        XCTAssertTrue(CallModeCarouselRule.settled(nearest: "b", target: nil as String?))
        XCTAssertTrue(CallModeCarouselRule.settled(nearest: nil as String?, target: nil))
    }

    func test_settled_onlyWhenTheTargetReachesTheCentre() {
        XCTAssertFalse(CallModeCarouselRule.settled(nearest: "c", target: "e"))
        XCTAssertFalse(CallModeCarouselRule.settled(nearest: nil, target: "e"))
        XCTAssertTrue(CallModeCarouselRule.settled(nearest: "e", target: "e"))
    }

    func test_trackHeight_neverBelowAThumbsReach() {
        XCTAssertEqual(CallModeCarouselRule.trackHeight(itemHeight: 60), 88)
        XCTAssertEqual(CallModeCarouselRule.trackHeight(itemHeight: 85), 88)
        XCTAssertEqual(CallModeCarouselRule.trackHeight(itemHeight: 120), 120)
        XCTAssertGreaterThanOrEqual(CallModeCarouselRule.trackHeight(itemHeight: 0), 88)
    }

    func test_verticalMargin_centresTheItemsInTheBand() {
        XCTAssertEqual(CallModeCarouselRule.verticalMargin(itemHeight: 60), 14)
        XCTAssertEqual(CallModeCarouselRule.verticalMargin(itemHeight: 120), 0)
    }

    func test_nearestIndex_roundsToTheClosestItem() {
        XCTAssertEqual(CallModeCarouselRule.nearestIndex(offset: 0, itemWidth: 60, spacing: 14, count: 6), 0)
        XCTAssertEqual(CallModeCarouselRule.nearestIndex(offset: 36, itemWidth: 60, spacing: 14, count: 6), 0)
        XCTAssertEqual(CallModeCarouselRule.nearestIndex(offset: 38, itemWidth: 60, spacing: 14, count: 6), 1)
        XCTAssertEqual(CallModeCarouselRule.nearestIndex(offset: 148, itemWidth: 60, spacing: 14, count: 6), 2)
    }

    func test_nearestIndex_bouncePastTheEnds_staysOnTheFirstOrLast() {
        XCTAssertEqual(CallModeCarouselRule.nearestIndex(offset: -80, itemWidth: 60, spacing: 14, count: 6), 0)
        XCTAssertEqual(CallModeCarouselRule.nearestIndex(offset: 10_000, itemWidth: 60, spacing: 14, count: 6), 5)
    }

    func test_nearestIndex_emptyTrack_isNil() {
        XCTAssertNil(CallModeCarouselRule.nearestIndex(offset: 0, itemWidth: 60, spacing: 14, count: 0))
        XCTAssertNil(CallModeCarouselRule.nearestIndex(offset: 0, itemWidth: 0, spacing: 0, count: 3))
    }

    func test_motion_swipe_choosesOnlyWhereItRests() {
        var motion = CallModeCarouselMotion<String>()
        motion.moved(to: "b", infersInteraction: true)
        motion.moved(to: "c", infersInteraction: true)
        XCTAssertTrue(motion.isInteracting, "Sans phase lisible, un centre qui bouge sans cible, c'est le doigt")
        motion.userScrolling(false)
        XCTAssertEqual(motion.rests(on: "c", selection: "a"), "c")
    }

    func test_motion_underTheFinger_selectionIsNotFollowed() {
        var motion = CallModeCarouselMotion<String>()
        motion.userScrolling(true)
        XCTAssertFalse(motion.follows("e", from: "b"), "Un défilement programmé ne se bat jamais contre le doigt")
        XCTAssertNil(motion.settling)
    }

    func test_motion_restWhileInteracting_commitsNothing() {
        var motion = CallModeCarouselMotion<String>()
        motion.userScrolling(true)
        XCTAssertNil(motion.rests(on: "c", selection: "a"))
    }

    func test_motion_tapOnAFarItem_itemsCrossedInTransitAreNeverChosen() {
        var motion = CallModeCarouselMotion<String>()
        motion.tapped()
        XCTAssertTrue(motion.follows("e", from: "a"))
        motion.moved(to: "b", infersInteraction: true)
        motion.moved(to: "c", infersInteraction: true)
        XCTAssertFalse(motion.isInteracting, "Le trajet programmé n'est pas un doigt")
        XCTAssertEqual(motion.settling, "e")
        motion.moved(to: "e", infersInteraction: true)
        XCTAssertNil(motion.settling)
        XCTAssertNil(motion.rests(on: "e", selection: "e"))
    }

    func test_motion_restMidTransit_choosesNobody_andTheTargetIsFollowedAgain() {
        var motion = CallModeCarouselMotion<String>()
        XCTAssertTrue(motion.follows("e", from: "a"))
        motion.moved(to: "c", infersInteraction: true)
        XCTAssertNil(motion.rests(on: "c", selection: "e"))
        XCTAssertTrue(motion.follows("e", from: "c"))
    }

    func test_motion_fingerTakesOverATransit_choosesWhereItRests() {
        var motion = CallModeCarouselMotion<String>()
        XCTAssertTrue(motion.follows("e", from: "a"))
        motion.userScrolling(true)
        XCTAssertNil(motion.settling)
        motion.userScrolling(false)
        XCTAssertEqual(motion.rests(on: "c", selection: "e"), "c")
    }

    func test_motion_tap_endsTheInferredInteraction_soTheTappedItemIsCentred() {
        var motion = CallModeCarouselMotion<String>()
        motion.moved(to: "b", infersInteraction: true)
        motion.tapped()
        XCTAssertTrue(motion.follows("d", from: "b"))
    }

    func test_motion_alreadyCentred_followsNothing() {
        var motion = CallModeCarouselMotion<String>()
        XCTAssertFalse(motion.follows("b", from: "b"))
        XCTAssertNil(motion.rests(on: "b", selection: "b"))
    }

    // MARK: - Le mode Effets

    func test_categories_faceThenColor() {
        XCTAssertEqual(CallEffectsCategory.allCases, [.face, .color])
    }

    func test_faces_followTheSharedDesignOrder() {
        XCTAssertEqual(CallEffectsModeRule.faces, [.none, .smoothing, .toad, .angel, .demon, .volcano])
    }

    func test_colors_naturalFirst() {
        XCTAssertEqual(CallEffectsModeRule.colors, [.natural, .warm, .cool, .vivid, .muted])
    }

    func test_colorSelection_noPreset_readsAsNatural() {
        XCTAssertEqual(CallEffectsModeRule.colorSelection(of: VideoFilterConfig()), .natural)
    }

    func test_applyingNatural_removesTheColorimetry() {
        let warm = VideoFilterConfig().applyingPreset(.warm)
        let natural = CallEffectsModeRule.applying(color: .natural, to: warm)
        XCTAssertNil(natural.activePreset)
        XCTAssertEqual(CallEffectsModeRule.colorSelection(of: natural), .natural)
    }

    func test_applyingAColor_keepsTheFaceEffect() {
        let toad = VideoFilterConfig().selectingFaceEffect(.toad)
        let cool = CallEffectsModeRule.applying(color: .cool, to: toad)
        XCTAssertEqual(cool.activePreset, .cool)
        XCTAssertEqual(cool.activeFaceEffect, .toad)
    }

    func test_exiting_validated_keepsWhatWasChosen() {
        let original = VideoFilterConfig()
        let chosen = original.selectingFaceEffect(.angel)
        XCTAssertEqual(CallEffectsModeRule.exiting(validated: true, current: chosen, original: original), chosen)
    }

    func test_exiting_quit_restoresTheImageAsItWas() {
        let original = VideoFilterConfig().applyingPreset(.vivid)
        let tried = original.selectingFaceEffect(.demon)
        XCTAssertEqual(CallEffectsModeRule.exiting(validated: false, current: tried, original: original), original)
    }

    // MARK: - Les gestes sur le style choisi (#8625)

    func test_outcome_doubleTapOnTheSelectedStyle_capturesAPhoto() {
        XCTAssertEqual(CallModeGestureRule.outcome(of: .doubleTap, isSelected: true, isRecording: false), .capturePhoto)
    }

    func test_outcome_longPressOnTheSelectedStyle_startsRecording() {
        XCTAssertEqual(CallModeGestureRule.outcome(of: .longPress, isSelected: true, isRecording: false), .startRecording)
    }

    func test_outcome_singleTapOnTheSelectedStyle_doesNothing() {
        XCTAssertEqual(CallModeGestureRule.outcome(of: .tap, isSelected: true, isRecording: false), .none)
    }

    func test_outcome_anyGestureOnAnotherStyle_selectsIt() {
        for gesture in CallModeGesture.allCases {
            XCTAssertEqual(CallModeGestureRule.outcome(of: gesture, isSelected: false, isRecording: false), .select, "\(gesture)")
        }
    }

    func test_outcome_whileRecording_theSelectedStyleNeitherShootsNorRestarts() {
        for gesture in CallModeGesture.allCases {
            XCTAssertEqual(CallModeGestureRule.outcome(of: gesture, isSelected: true, isRecording: true), .none, "\(gesture)")
        }
    }

    func test_outcome_whileRecording_anotherStyleIsStillSelectable() {
        XCTAssertEqual(CallModeGestureRule.outcome(of: .tap, isSelected: false, isRecording: true), .select)
    }

    func test_listensForShots_onlyTheSelectedStyleWhenIdle_listens() {
        XCTAssertTrue(CallModeGestureRule.listensForShots(isSelected: true, isRecording: false))
        XCTAssertFalse(CallModeGestureRule.listensForShots(isSelected: false, isRecording: false))
        XCTAssertFalse(CallModeGestureRule.listensForShots(isSelected: true, isRecording: true))
    }

    func test_showsHint_onlyUntilItHasBeenSeen() {
        XCTAssertTrue(CallModeGestureRule.showsHint(hasSeenHint: false, isRecording: false))
        XCTAssertFalse(CallModeGestureRule.showsHint(hasSeenHint: true, isRecording: false))
        XCTAssertFalse(CallModeGestureRule.showsHint(hasSeenHint: false, isRecording: true))
    }

    func test_clock_readsMinutesAndSeconds() {
        let latin = Locale(identifier: "en_US_POSIX")
        XCTAssertEqual(CallModeGestureRule.clock(0, locale: latin), "0:00")
        XCTAssertEqual(CallModeGestureRule.clock(9.7, locale: latin), "0:09")
        XCTAssertEqual(CallModeGestureRule.clock(75, locale: latin), "1:15")
        XCTAssertEqual(CallModeGestureRule.clock(-3, locale: latin), "0:00")
    }

    func test_clock_readsTheDigitsOfTheReadersLocale() {
        let arabic = CallModeGestureRule.clock(75, locale: Locale(identifier: "ar-EG"))
        XCTAssertNotEqual(arabic, "1:15")
        XCTAssertTrue(arabic.contains("١"), arabic)
    }
}
