import XCTest
@testable import Meeshy

/// L'air sous la barre de composition, clavier fermé (#11565).
///
/// L'espace visible sous la barre = l'air laissé par l'hôte + le relèvement.
/// Il doit valoir au moins `max(encart bas, diamètre d'une porte)`, sans jamais
/// empiler l'encart et le diamètre.
final class ComposerBottomClearanceTests: XCTestCase {

    private let door = ComposerBottomClearance.doorDiameter

    private func visibleSpace(hostSpace: CGFloat, inset: CGFloat, inputSurfaceShown: Bool = false) -> CGFloat {
        hostSpace + ComposerBottomClearance.lift(spaceBelow: hostSpace, safeAreaBottom: inset,
                                                 inputSurfaceShown: inputSurfaceShown)
    }

    func test_doorDiameter_isTheStickerDoorHitTarget() {
        XCTAssertEqual(door, 44)
    }

    func test_lift_proMaxDockAtScreenEdge_leavesOneDoorBelowTheBar() {
        XCTAssertEqual(visibleSpace(hostSpace: 4, inset: 34), 44)
    }

    func test_lift_proMaxSheetAboveSafeArea_neverStacksInsetAndDoor() {
        XCTAssertEqual(visibleSpace(hostSpace: 38, inset: 34), 44)
    }

    func test_lift_iPhoneSEWithoutInset_leavesOneDoorBelowTheBar() {
        XCTAssertEqual(visibleSpace(hostSpace: 4, inset: 0), 44)
    }

    func test_lift_keyboardOrPanelShown_keepsTodaySpacing() {
        XCTAssertEqual(ComposerBottomClearance.lift(spaceBelow: 4, safeAreaBottom: 34, inputSurfaceShown: true), 0)
    }

    func test_lift_insetLargerThanDoor_keepsTheInset() {
        XCTAssertEqual(visibleSpace(hostSpace: 4, inset: 60), 60)
    }

    func test_lift_hostAlreadyLiftsHigherThanRequired_addsNothing() {
        XCTAssertEqual(ComposerBottomClearance.lift(spaceBelow: 58, safeAreaBottom: 34, inputSurfaceShown: false), 0)
    }

    func test_lift_beforeAnyMeasurement_movesNothing() {
        XCTAssertEqual(ComposerBottomClearance.lift(spaceBelow: nil, safeAreaBottom: 34, inputSurfaceShown: false), 0)
    }

    func test_lift_negativeMeasurement_isBoundedByTheRequiredSpace() {
        XCTAssertEqual(ComposerBottomClearance.lift(spaceBelow: -200, safeAreaBottom: 34, inputSurfaceShown: false), 44)
    }

    func test_lift_iPadInset_keepsOneDoorBelowTheBar() {
        XCTAssertEqual(visibleSpace(hostSpace: 4, inset: 20), 44)
    }
}
