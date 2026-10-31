import XCTest
@testable import Meeshy

/// **Une feuille qui monte RÉDUIT la scène au-dessus d'elle** (#13839, L3).
///
/// Le témoin inverse de l'ancienne loi « une feuille système couvre la
/// scène » : le bas visible de la scène est le plus haut des obstacles du bas
/// (étages du panneau ou feuille ancrée), et la scène, entière et en 9:16, tient
/// au-dessus.
final class ComposerSceneFramingTests: XCTestCase {

    private let ratio: CGFloat = 9.0 / 16.0

    func test_visibleBottom_withoutObstruction_isTheWholeZone() {
        XCTAssertEqual(ComposerSceneFraming.visibleBottom(zoneHeight: 800, zoneMinY: 0, obstructionTops: [nil, nil]), 800)
    }

    func test_visibleBottom_withAnAnchoredSheet_stopsAtTheSheetTop() {
        XCTAssertEqual(ComposerSceneFraming.visibleBottom(zoneHeight: 800, zoneMinY: 40, obstructionTops: [nil, 540]), 500)
    }

    func test_visibleBottom_withSheetAndPanel_keepsTheHigherOne() {
        XCTAssertEqual(ComposerSceneFraming.visibleBottom(zoneHeight: 800, zoneMinY: 0, obstructionTops: [600, 450]), 450)
    }

    func test_visibleBottom_obstructionBelowTheZone_changesNothing() {
        XCTAssertEqual(ComposerSceneFraming.visibleBottom(zoneHeight: 800, zoneMinY: 0, obstructionTops: [900]), 800)
    }

    func test_visibleBottom_nonFiniteObstruction_isIgnored() {
        XCTAssertEqual(ComposerSceneFraming.visibleBottom(zoneHeight: 800, zoneMinY: 0, obstructionTops: [CGFloat.nan, CGFloat.infinity]), 800)
    }

    func test_visibleBottom_sheetAboveTheZone_neverGoesNegative() {
        XCTAssertEqual(ComposerSceneFraming.visibleBottom(zoneHeight: 800, zoneMinY: 100, obstructionTops: [50]), 0)
    }

    func test_anOpenSheet_keepsTheSceneWholeAndNineBySixteenAboveIt() {
        let zone = CGRect(x: 0, y: 0, width: 393, height: 852)
        let scene = ComposerSceneFit.frame(in: zone, aspectRatio: ratio)
        let bas = ComposerSceneFraming.visibleBottom(zoneHeight: zone.height, zoneMinY: 0, obstructionTops: [nil, 420])
        let lift = ComposerSceneFit.lift(scene: scene, visibleBottom: bas)
        XCTAssertLessThan(lift.scale, 1, "la scène se réduit")
        XCTAssertLessThanOrEqual(scene.minY + lift.offsetY + scene.height * lift.scale, 420.5,
                                 "et tient entière au-dessus de la feuille")
    }

    func test_restChrome_withASheetOpen_steps_aside() {
        XCTAssertFalse(ComposerSceneFraming.restChromeIsShown(sheetIsOpen: true))
        XCTAssertTrue(ComposerSceneFraming.restChromeIsShown(sheetIsOpen: false))
    }
}
