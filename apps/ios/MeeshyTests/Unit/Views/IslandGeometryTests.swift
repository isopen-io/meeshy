import XCTest
import CoreGraphics
@testable import Meeshy

/// La zone exacte de la Dynamic Island est la donnée dont dépend TOUT le morph
/// d'émergence : une capsule censée naître dedans naît à côté dès que la
/// géométrie est approximative — c'est le défaut rapporté le 2026-08-13
/// (« ce n'est pas envoyé exactement dedans mais toujours à côté »).
@MainActor
final class IslandGeometryTests: XCTestCase {

    private let accuracy: CGFloat = 0.01

    // MARK: - Présence

    func test_isPresent_isTrue_fromTheIslandInsetFloor() {
        // iPhone 14 Pro → 16 Pro : 59–62 pt.
        XCTAssertTrue(IslandGeometry.isPresent(safeAreaTop: 59))
        XCTAssertTrue(IslandGeometry.isPresent(safeAreaTop: 62))
    }

    func test_isPresent_isFalse_forAClassicNotchOrNoNotch() {
        // Notch classique : 44–50 pt. SE / iPad : 20–24.
        XCTAssertFalse(IslandGeometry.isPresent(safeAreaTop: 50))
        XCTAssertFalse(IslandGeometry.isPresent(safeAreaTop: 47))
        XCTAssertFalse(IslandGeometry.isPresent(safeAreaTop: 20))
    }

    // MARK: - Position

    func test_centerY_isHalfTheSafeAreaInset_onEveryIslandDevice() {
        // L'îlot est centré verticalement dans l'inset : le système réserve la
        // même marge dessus et dessous. C'est ce qui rend la position exacte
        // sans table par modèle — et ce que l'ancienne constante `islandTop`
        // figée à 11 pt ne pouvait pas faire (juste sur un inset de 59, fausse
        // de ~1,5 pt sur 62).
        for inset in [CGFloat(59), 62] {
            XCTAssertEqual(
                IslandGeometry.centerY(safeAreaTop: inset), inset / 2,
                accuracy: accuracy,
                "Centre de l'îlot attendu à mi-hauteur de l'inset pour \(inset)"
            )
        }
    }

    func test_top_matchesTheKnownIslandOffset_onA59PointInset() {
        // ~11 pt : la valeur de facto de l'iPhone 14/15 Pro, que la formule
        // doit retrouver — elle généralise cette mesure, elle ne la contredit pas.
        XCTAssertEqual(IslandGeometry.top(safeAreaTop: 59), 10.835, accuracy: accuracy)
    }

    func test_topAndBottom_frameTheIslandHeight() {
        let inset: CGFloat = 59
        XCTAssertEqual(
            IslandGeometry.bottom(safeAreaTop: inset) - IslandGeometry.top(safeAreaTop: inset),
            IslandGeometry.height,
            accuracy: accuracy
        )
    }

    func test_top_neverGoesNegative_onADeviceWithoutIsland() {
        // Géométrie dégénérée (inset plus petit que l'îlot) : bornée plutôt
        // qu'absurde. `isPresent` reste le seul juge de sa pertinence.
        XCTAssertEqual(IslandGeometry.top(safeAreaTop: 20), 0, accuracy: accuracy)
    }

    // MARK: - Dégagement sous l'îlot

    func test_settledTopPadding_keepsTheElementOffTheIsland() {
        // « SANS Y ETRE COLLE » : l'air réel entre le bas de l'îlot et le haut
        // de l'élément posé ne descend jamais sous `clearanceBelow`.
        for inset in [CGFloat(59), 62] {
            let padding = IslandGeometry.settledTopPadding(safeAreaTop: inset, minimum: 8)
            let gap = inset + padding - IslandGeometry.bottom(safeAreaTop: inset)
            XCTAssertGreaterThanOrEqual(
                gap, IslandGeometry.clearanceBelow,
                "Air sous l'îlot trop court pour un inset de \(inset)"
            )
        }
    }

    func test_settledTopPadding_neverFallsBelowItsFloor() {
        XCTAssertGreaterThanOrEqual(
            IslandGeometry.settledTopPadding(safeAreaTop: 59, minimum: 8), 8
        )
    }
}

/// Invariants du morph lui-même : ce sont eux qui décident si la capsule naît
/// DANS l'îlot ou à côté.
@MainActor
final class IslandEmergenceGeometryTests: XCTestCase {

    private let accuracy: CGFloat = 0.01
    /// Taille typique d'une pastille « Aujourd'hui » posée.
    private let settledSize = CGSize(width: 103, height: 30)

    func test_birthOffset_landsTheCapsuleCenterExactlyOnTheIslandCenter() {
        let inset: CGFloat = 59
        let center = IslandEmergenceGeometry.settledCenterY(
            safeAreaTop: inset, settledHeight: settledSize.height, minimumTopPadding: 8
        )
        let offset = IslandEmergenceGeometry.birthOffset(
            safeAreaTop: inset, settledHeight: settledSize.height, minimumTopPadding: 8
        )
        XCTAssertEqual(
            center + offset, IslandGeometry.centerY(safeAreaTop: inset),
            accuracy: accuracy,
            "À la naissance, le centre de la capsule DOIT coïncider avec celui de l'îlot"
        )
    }

    func test_birthOffset_isNegative_theCapsuleRisesIntoTheIsland() {
        XCTAssertLessThan(
            IslandEmergenceGeometry.birthOffset(
                safeAreaTop: 59, settledHeight: settledSize.height, minimumTopPadding: 8
            ),
            0
        )
    }

    func test_birthScale_rendersTheCapsuleAtExactlyTheIslandSize() {
        let scale = IslandEmergenceGeometry.birthScale(settledSize: settledSize)
        XCTAssertEqual(settledSize.width * scale.width, IslandGeometry.width, accuracy: accuracy)
        XCTAssertEqual(settledSize.height * scale.height, IslandGeometry.height, accuracy: accuracy)
    }

    func test_birthScale_isAllowedToExceedOne() {
        // Régression 2026-08-13. Le correctif de la « capsule géante »
        // (2026-07-04) bornait les ratios à `min(…, 1)` — garde-fou hérité
        // d'une interpolation de FRAME. Or l'îlot est plus grand qu'une
        // pastille de jour : la borne interdisait mécaniquement à la capsule
        // de naître à la taille de l'îlot, donc de naître dedans. `scaleEffect`
        // ne participant pas au layout, il ne peut pas reproduire ce bug.
        let scale = IslandEmergenceGeometry.birthScale(settledSize: settledSize)
        XCTAssertGreaterThan(scale.width, 1)
        XCTAssertGreaterThan(scale.height, 1)
    }

    func test_birthScale_neutralizesTheMorph_onADegenerateSize() {
        let scale = IslandEmergenceGeometry.birthScale(settledSize: .zero)
        XCTAssertEqual(scale.width, 1)
        XCTAssertEqual(scale.height, 1)
    }

    func test_birthScale_shrinks_whenTheSettledCapsuleIsWiderThanTheIsland() {
        // Un libellé long (« Mercredi 12 novembre ») dépasse l'îlot : la
        // naissance doit alors RÉTRÉCIR pour y tenir — l'exactitude joue dans
        // les deux sens, elle n'est pas un simple agrandissement.
        let wide = CGSize(width: 200, height: 30)
        let scale = IslandEmergenceGeometry.birthScale(settledSize: wide)
        XCTAssertLessThan(scale.width, 1)
        XCTAssertEqual(wide.width * scale.width, IslandGeometry.width, accuracy: accuracy)
    }
}
