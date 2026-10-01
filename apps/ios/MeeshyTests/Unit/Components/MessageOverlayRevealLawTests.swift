import XCTest
@testable import Meeshy

/// #9043 — le menu d'appui long d'un message : la BANDE d'emojis s'allonge de
/// ×1,4 (les emojis et les lignes du menu gardent leur taille), et un
/// glissement vers le haut réduit l'aperçu pour dégager le menu coupé.
@MainActor
final class MessageOverlayRevealLawTests: XCTestCase {

    // MARK: - La bande d'emojis (×1,4), le menu préservé

    func test_emojiBandLengthFactor_porteurDirective_isOnePointFour() {
        XCTAssertEqual(MessageOverlayMenu.emojiBandLengthFactor, 1.4)
    }

    func test_emojiBandWidth_roomAvailable_isReferenceTimesOnePointFour() {
        XCTAssertEqual(MessageOverlayMenu.emojiBandWidth(available: 1000), 280 * 1.4, accuracy: 0.0001)
    }

    func test_emojiBandWidth_narrowScreen_isBoundedByAvailableWidth() {
        XCTAssertEqual(MessageOverlayMenu.emojiBandWidth(available: 361), 361)
    }

    func test_rowHeight_porteurDirective_isPreservedAtFortyFour() {
        XCTAssertEqual(MessageActionsMenu.rowHeight, 44)
    }

    func test_estimatedSize_fiveActions_keepsTheSystemMenuHeight() {
        let size = MessageActionsMenu.estimatedSize(actionCount: 5)
        XCTAssertEqual(size.height, 5 * 44 + 20, accuracy: 0.0001)
        XCTAssertEqual(size.width, MessageActionsMenu.menuWidth)
    }

    // MARK: - floor — jusqu'où l'aperçu se réduit

    func test_floor_menuFullyVisible_isOne() {
        XCTAssertEqual(MessageOverlayRevealLaw.floor(hiddenHeight: 0, shrinkableHeight: 500), 1)
        XCTAssertEqual(MessageOverlayRevealLaw.floor(hiddenHeight: -30, shrinkableHeight: 500), 1)
    }

    func test_floor_menuCut_revealsExactlyTheHiddenHeight() {
        XCTAssertEqual(MessageOverlayRevealLaw.floor(hiddenHeight: 100, shrinkableHeight: 500), 0.8, accuracy: 0.0001)
    }

    func test_floor_menuCutBeyondTheBound_stopsAtMinimumFactor() {
        XCTAssertEqual(MessageOverlayRevealLaw.floor(hiddenHeight: 900, shrinkableHeight: 500),
                       MessageOverlayRevealLaw.minimumFactor)
        XCTAssertEqual(MessageOverlayRevealLaw.minimumFactor, 0.4)
    }

    func test_floor_noShrinkablePreview_isOne() {
        XCTAssertEqual(MessageOverlayRevealLaw.floor(hiddenHeight: 100, shrinkableHeight: 0), 1)
    }

    // MARK: - split — le doigt réduit d'abord l'aperçu, le reste va au geste existant

    func test_split_upwardDrag_menuFollowsTheFingerOneToOne() {
        let split = MessageOverlayRevealLaw.split(translation: -50, committed: 1, floor: 0.8, shrinkableHeight: 500)
        XCTAssertEqual(split.factor, 0.9, accuracy: 0.0001)
        XCTAssertEqual(split.residual, 0, accuracy: 0.0001)
        XCTAssertEqual(MessageOverlayRevealLaw.rise(factor: split.factor, shrinkableHeight: 500), 50, accuracy: 0.0001)
    }

    func test_split_upwardDragBeyondTheFloor_residualFeedsTheMoreGesture() {
        let split = MessageOverlayRevealLaw.split(translation: -180, committed: 1, floor: 0.8, shrinkableHeight: 500)
        XCTAssertEqual(split.factor, 0.8, accuracy: 0.0001)
        XCTAssertEqual(split.residual, -80, accuracy: 0.0001)
    }

    func test_split_menuNotCut_wholeDragFeedsTheExistingGesture() {
        let split = MessageOverlayRevealLaw.split(translation: -90, committed: 1, floor: 1, shrinkableHeight: 500)
        XCTAssertEqual(split.factor, 1)
        XCTAssertEqual(split.residual, -90, accuracy: 0.0001)
    }

    func test_split_downwardDragFromReducedState_restoresTheSizeFirst() {
        let split = MessageOverlayRevealLaw.split(translation: 30, committed: 0.8, floor: 0.8, shrinkableHeight: 500)
        XCTAssertEqual(split.factor, 0.86, accuracy: 0.0001)
        XCTAssertEqual(split.residual, 0, accuracy: 0.0001)
    }

    func test_split_downwardDragBeyondFullSize_residualFeedsTheDismissGesture() {
        let split = MessageOverlayRevealLaw.split(translation: 200, committed: 0.8, floor: 0.8, shrinkableHeight: 500)
        XCTAssertEqual(split.factor, 1, accuracy: 0.0001)
        XCTAssertEqual(split.residual, 100, accuracy: 0.0001)
    }

    func test_split_releaseKeepsTheReachedState_nextDragStartsFromIt() {
        let first = MessageOverlayRevealLaw.split(translation: -40, committed: 1, floor: 0.6, shrinkableHeight: 400)
        let second = MessageOverlayRevealLaw.split(translation: 0, committed: first.factor, floor: 0.6, shrinkableHeight: 400)
        XCTAssertEqual(second.factor, first.factor, accuracy: 0.0001)
        XCTAssertEqual(second.factor, 0.9, accuracy: 0.0001)
    }

    func test_split_noShrinkablePreview_neverDividesByZero() {
        let split = MessageOverlayRevealLaw.split(translation: -60, committed: 1, floor: 1, shrinkableHeight: 0)
        XCTAssertEqual(split.factor, 1)
        XCTAssertEqual(split.residual, -60, accuracy: 0.0001)
    }

    // MARK: - restingFactor — atteindre le menu sans le geste

    func test_restingFactor_withoutAssistiveTechnology_isFullSize() {
        XCTAssertEqual(MessageOverlayRevealLaw.restingFactor(floor: 0.7, assistiveReveal: false), 1)
    }

    func test_restingFactor_voiceOverRunning_opensAlreadyRevealed() {
        XCTAssertEqual(MessageOverlayRevealLaw.restingFactor(floor: 0.7, assistiveReveal: true), 0.7)
    }
}
