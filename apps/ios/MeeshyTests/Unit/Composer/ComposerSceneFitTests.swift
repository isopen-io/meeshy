import XCTest
@testable import Meeshy

/// **La scène est le plus grand 9:16 de la zone sûre** (#13839) — le témoin
/// INVERSE de `ComposerRailMountGeometryTests`, qui réservait les couloirs du
/// plateau autour d'une carte. Plus de carte ni de couloir : la scène occupe
/// tout ce que la zone sûre permet, et se réduit en UNE transaction
/// (échelle + décalage) quand le clavier ou un panneau monte.
final class ComposerSceneFitTests: XCTestCase {

    private let ratio: CGFloat = 9.0 / 16.0

    func test_frame_iPhonePortrait_laLargeurEntiere() {
        let zone = CGRect(x: 0, y: 59, width: 393, height: 759)
        let scene = ComposerSceneFit.frame(in: zone, aspectRatio: ratio)

        XCTAssertEqual(scene.width, 393, accuracy: 0.5, "aucun couloir latéral")
        XCTAssertEqual(scene.height, 393 / ratio, accuracy: 0.5)
        XCTAssertEqual(scene.midY, zone.midY, accuracy: 0.5)
    }

    func test_frame_zoneTropLarge_laHauteurEntiere_centreeHorizontalement() {
        let zone = CGRect(x: 0, y: 24, width: 1024, height: 700)
        let scene = ComposerSceneFit.frame(in: zone, aspectRatio: ratio)

        XCTAssertEqual(scene.height, 700, accuracy: 0.5)
        XCTAssertEqual(scene.width, 700 * ratio, accuracy: 0.5)
        XCTAssertEqual(scene.midX, zone.midX, accuracy: 0.5)
    }

    func test_frame_zoneDegeneree_neRendJamaisNaN() {
        for zone in [CGRect.zero, CGRect(x: 0, y: 0, width: -10, height: 100),
                     CGRect(x: 0, y: 0, width: CGFloat.nan, height: 100)] {
            let scene = ComposerSceneFit.frame(in: zone, aspectRatio: ratio)
            XCTAssertFalse(scene.width.isNaN || scene.height.isNaN || scene.minX.isNaN || scene.minY.isNaN,
                           "un NaN dans un cadre fige le moteur d'accessibilité")
            XCTAssertGreaterThanOrEqual(scene.width, 0)
        }
    }

    // MARK: - La réduction

    func test_lift_sansObstacle_echelleUneSansDecalage() {
        let scene = CGRect(x: 0, y: 80, width: 393, height: 698)
        let lift = ComposerSceneFit.lift(scene: scene, visibleBottom: 852)

        XCTAssertEqual(lift.scale, 1)
        XCTAssertEqual(lift.offsetY, 0)
    }

    func test_lift_leClavierMonte_laSceneTientAuDessus_sansChangerDeLargeurDeMiseEnPage() {
        let scene = CGRect(x: 0, y: 80, width: 393, height: 698)
        let lift = ComposerSceneFit.lift(scene: scene, visibleBottom: 500)

        XCTAssertLessThan(lift.scale, 1)
        let basReduit = scene.minY + lift.offsetY + scene.height * lift.scale
        XCTAssertLessThanOrEqual(basReduit, 500 + 0.5, "le bas de la scène reste au-dessus du clavier")
        XCTAssertGreaterThanOrEqual(scene.minY + lift.offsetY, 0, "le haut ne quitte pas l'écran")
    }

    func test_lift_unObstacleImmense_echelleBorneeJamaisNulle() {
        let scene = CGRect(x: 0, y: 80, width: 393, height: 698)
        let lift = ComposerSceneFit.lift(scene: scene, visibleBottom: 60)

        XCTAssertGreaterThanOrEqual(lift.scale, ComposerSceneFit.minimumScale)
        XCTAssertFalse(lift.scale.isNaN || lift.offsetY.isNaN)
    }

    func test_lift_sceneDegeneree_neRendJamaisNaN() {
        let lift = ComposerSceneFit.lift(scene: .zero, visibleBottom: 300)
        XCTAssertEqual(lift.scale, 1)
        XCTAssertEqual(lift.offsetY, 0)
    }
}
