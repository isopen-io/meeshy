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
        XCTAssertEqual(CallModeGestureRule.clock(0), "0:00")
        XCTAssertEqual(CallModeGestureRule.clock(9.7), "0:09")
        XCTAssertEqual(CallModeGestureRule.clock(75), "1:15")
        XCTAssertEqual(CallModeGestureRule.clock(-3), "0:00")
    }
}
