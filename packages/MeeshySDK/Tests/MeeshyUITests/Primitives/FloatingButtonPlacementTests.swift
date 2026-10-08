import XCTest
import SwiftUI
@testable import MeeshyUI

/// Les deux boutons flottants se posent à n'importe quelle hauteur, contre le
/// bord gauche ou droit (#9679).
///
/// Avant : 246 pt réservés en dur en haut (la zone sûre lue étant NULLE), 110 pt
/// en bas, une hauteur normalisée sur une plage qui changeait avec la barre de
/// recherche — le bouton ne montait jamais au-dessus de ~272 pt et bougeait
/// tout seul —, et rien n'empêchait les deux disques de se recouvrir.
@MainActor
final class FloatingButtonPlacementTests: XCTestCase {

    private let pro = FloatingButtonGeometry(
        screenSize: CGSize(width: 402, height: 874),
        safeArea: EdgeInsets(top: 62, leading: 0, bottom: 34, trailing: 0)
    )
    private let se = FloatingButtonGeometry(
        screenSize: CGSize(width: 375, height: 667),
        safeArea: EdgeInsets(top: 20, leading: 0, bottom: 0, trailing: 0)
    )
    private let landscape = FloatingButtonGeometry(
        screenSize: CGSize(width: 874, height: 402),
        safeArea: EdgeInsets(top: 0, leading: 62, bottom: 21, trailing: 62)
    )
    private var half: CGFloat { FloatingButtonGeometry.buttonSize / 2 }

    // MARK: - La plage verticale

    func test_range_reachesJustUnderTheIslandAndJustAboveTheHomeIndicator() {
        let top = pro.center(for: FloatingButtonPlacement(side: .leading, screenFraction: 0))
        let bottom = pro.center(for: FloatingButtonPlacement(side: .trailing, screenFraction: 1))

        XCTAssertGreaterThanOrEqual(top.y - half, pro.safeArea.top, "le disque mord l'îlot")
        XCTAssertLessThan(top.y, 120, "le haut de l'écran reste inaccessible (avant : 272)")
        XCTAssertLessThanOrEqual(bottom.y + half, pro.screenSize.height - pro.safeArea.bottom, "le disque mord l'indicateur d'accueil")
        XCTAssertGreaterThan(bottom.y, 874 - 110 - half, "le bas de l'écran reste inaccessible (avant : 738)")
    }

    func test_bothSidesAreReachable_atEveryHeight() {
        for height in stride(from: CGFloat(0), through: 1, by: 0.25) {
            let left = pro.center(for: FloatingButtonPlacement(side: .leading, screenFraction: height))
            let right = pro.center(for: FloatingButtonPlacement(side: .trailing, screenFraction: height))
            XCTAssertEqual(left.y, right.y, accuracy: 0.001)
            XCTAssertEqual(left.x, FloatingButtonGeometry.edgePadding + half, accuracy: 0.001)
            XCTAssertEqual(right.x, 402 - FloatingButtonGeometry.edgePadding - half, accuracy: 0.001)
        }
    }

    func test_placementAt_snapsToTheNearestEdge_andClampsTheHeight() {
        XCTAssertEqual(pro.placement(at: CGPoint(x: 150, y: 400)).side, .leading)
        XCTAssertEqual(pro.placement(at: CGPoint(x: 260, y: 400)).side, .trailing)
        XCTAssertEqual(pro.center(for: pro.placement(at: CGPoint(x: 10, y: -500))).y, pro.minY, accuracy: 0.001)
        XCTAssertEqual(pro.center(for: pro.placement(at: CGPoint(x: 10, y: 5000))).y, pro.maxY, accuracy: 0.001)
    }

    func test_aDroppedButton_staysExactlyWhereTheFingerLeftIt() {
        let dropped = CGPoint(x: 30, y: 431)
        let placement = pro.placement(at: dropped)
        let stored = placement.storageValue
        let center = pro.center(forStorage: stored, default: FloatingButtonGeometry.defaultFeedStorage)
        XCTAssertEqual(center.y, 431, accuracy: 0.5)
        XCTAssertEqual(center.x, FloatingButtonGeometry.edgePadding + half, accuracy: 0.001)
    }

    // MARK: - La forme persistée

    /// Recette 2026-10-08 : le Flux posé à 450 pt revenait à 482 pt après une
    /// relance. La fraction était écrite sur la plage d'une zone sûre et relue
    /// sur celle d'une autre (mesure transitoire). Écrite sur l'ÉCRAN, elle
    /// revient au point près, quelle que soit la zone sûre de l'un ou l'autre
    /// passage.
    func test_relaunch_bringsTheButtonBackToTheSamePoint_whateverTheSafeAreaMeasured() {
        let transient = FloatingButtonGeometry(screenSize: pro.screenSize, safeArea: EdgeInsets())
        let partial = FloatingButtonGeometry(
            screenSize: pro.screenSize,
            safeArea: EdgeInsets(top: 126, leading: 0, bottom: 34, trailing: 0)
        )
        for writer in [pro, transient, partial] {
            let stored = writer.placement(at: CGPoint(x: 30, y: 450)).storageValue
            for reader in [pro, transient, partial, pro] {
                let center = reader.center(forStorage: stored, default: FloatingButtonGeometry.defaultFeedStorage)
                XCTAssertEqual(center.y, 450, accuracy: 0.01, "écrit sous \(writer.safeArea.top), relu sous \(reader.safeArea.top)")
            }
        }
    }

    // MARK: - La bannière du joueur pousse le conteneur (recette 2026-10-08)

    /// Bannière REPLIÉE : le conteneur touche le haut de l'écran.
    private let collapsed = FloatingButtonGeometry.measured(
        container: CGRect(x: 0, y: 0, width: 402, height: 874),
        safeRegion: CGRect(x: 0, y: 62, width: 402, height: 778),
        reported: EdgeInsets()
    )
    /// Bannière DÉPLIÉE : elle pousse le conteneur de 80 pt vers le bas.
    private let expanded = FloatingButtonGeometry.measured(
        container: CGRect(x: 0, y: 80, width: 402, height: 794),
        safeRegion: CGRect(x: 0, y: 80, width: 402, height: 760),
        reported: EdgeInsets(top: 0, leading: 0, bottom: 34, trailing: 0)
    )

    func test_theBanner_neverChangesTheScreenGeometry() {
        XCTAssertEqual(collapsed.screenSize, expanded.screenSize)
        XCTAssertEqual(collapsed.minY, expanded.minY, accuracy: 0.001)
        XCTAssertEqual(collapsed.maxY, expanded.maxY, accuracy: 0.001)
    }

    /// Le doigt lâche le bouton à 400 pt de l'ÉCRAN : le conteneur le reçoit
    /// dans SON repère, la géométrie le remet en global.
    private func drop(atScreenY y: CGFloat, in geometry: FloatingButtonGeometry) -> String {
        let local = geometry.local(CGPoint(x: 30, y: y))
        return geometry.placement(at: geometry.global(local)).storageValue
    }

    private func screenY(of stored: String, in geometry: FloatingButtonGeometry) -> CGFloat {
        let local = geometry.local(geometry.center(forStorage: stored, default: FloatingButtonGeometry.defaultFeedStorage))
        return local.y + geometry.origin.y
    }

    func test_writtenWithTheBannerCollapsed_readWithItExpanded_staysAt400() {
        let stored = drop(atScreenY: 400, in: collapsed)
        XCTAssertEqual(screenY(of: stored, in: expanded), 400, accuracy: 0.01)
        XCTAssertEqual(expanded.local(expanded.center(forStorage: stored, default: "")).y, 320, accuracy: 0.01)
    }

    func test_writtenWithTheBannerExpanded_readWithItCollapsed_staysAt400() {
        let stored = drop(atScreenY: 400, in: expanded)
        XCTAssertEqual(screenY(of: stored, in: collapsed), 400, accuracy: 0.01)
    }

    func test_aDropUnderTheSameSafeArea_roundTripsExactly() {
        for y in stride(from: pro.minY, through: pro.maxY, by: 37) {
            let stored = pro.placement(at: CGPoint(x: 380, y: y)).storageValue
            XCTAssertEqual(pro.center(forStorage: stored, default: FloatingButtonGeometry.defaultMenuStorage).y, y, accuracy: 0.01)
        }
    }

    func test_nothingIsPlaced_beforeTheScreenIsMeasured() {
        XCTAssertFalse(FloatingButtonGeometry(screenSize: .zero, safeArea: EdgeInsets()).isMeasured)
        XCTAssertTrue(pro.isMeasured)
    }

    func test_storageOfTheFirstBuilds_isStillReadOnTheRange() {
        XCTAssertEqual(pro.center(forStorage: "v2,L,0.0000", default: FloatingButtonGeometry.defaultFeedStorage).y, pro.minY, accuracy: 0.001)
        XCTAssertEqual(pro.center(forStorage: "v2,R,1.0000", default: FloatingButtonGeometry.defaultMenuStorage).y, pro.maxY, accuracy: 0.001)
    }

    func test_storage_roundTrips() {
        let placement = FloatingButtonPlacement(side: .trailing, screenFraction: 0.4231)
        XCTAssertEqual(FloatingButtonStoredPosition.parse(placement.storageValue), .placement(placement))
    }

    func test_storage_isUnreadableAsTheOldPair_soAnOlderAppFallsBackToItsDefault() {
        let raw = FloatingButtonPlacement(side: .leading, screenFraction: 0.5).storageValue
        XCTAssertNotEqual(raw.split(separator: ",").count, 2)
    }

    func test_malformedStorage_fallsBackToTheDefault() {
        let fallback = pro.center(forStorage: FloatingButtonGeometry.defaultMenuStorage, default: FloatingButtonGeometry.defaultMenuStorage)
        for raw in ["", "garbage", "v3,X,0.5", "v9,L,0.5", "v3,L,nan", "1.0"] {
            XCTAssertEqual(pro.center(forStorage: raw, default: FloatingButtonGeometry.defaultMenuStorage), fallback, raw)
        }
    }

    // MARK: - Migration des valeurs d'avant #9679

    func test_defaultPositions_stayWhereTheyWere() {
        let feed = pro.center(forStorage: FloatingButtonGeometry.defaultFeedStorage, default: FloatingButtonGeometry.defaultFeedStorage)
        let menu = pro.center(forStorage: FloatingButtonGeometry.defaultMenuStorage, default: FloatingButtonGeometry.defaultMenuStorage)
        XCTAssertEqual(feed, CGPoint(x: 46, y: 272))
        XCTAssertEqual(menu, CGPoint(x: 356, y: 272))
    }

    func test_legacyValue_isReadWithItsOwnGeometry() {
        let bottomRight = pro.center(forStorage: "1.0,1.0", default: FloatingButtonGeometry.defaultMenuStorage)
        XCTAssertEqual(bottomRight.x, 356, accuracy: 0.001)
        XCTAssertEqual(bottomRight.y, 874 - 110 - 26, accuracy: 0.001)
    }

    func test_legacyValue_neverLandsOffScreen() {
        for geometry in [pro, se, landscape] {
            for raw in ["0.0,0.0", "1.0,1.0", "0.0,0.5", "5,-3", "-1,9"] {
                let center = geometry.center(forStorage: raw, default: FloatingButtonGeometry.defaultFeedStorage)
                XCTAssertGreaterThanOrEqual(center.y - half, geometry.safeArea.top, "\(raw) \(geometry.screenSize)")
                XCTAssertLessThanOrEqual(center.y + half, geometry.screenSize.height - geometry.safeArea.bottom, "\(raw) \(geometry.screenSize)")
                XCTAssertGreaterThanOrEqual(center.x - half, geometry.safeArea.leading)
                XCTAssertLessThanOrEqual(center.x + half, geometry.screenSize.width - geometry.safeArea.trailing)
            }
        }
    }

    // MARK: - Les deux boutons ne se recouvrent pas

    func test_layout_menuOnTopOfFeed_isShiftedJustBelow() {
        let stored = FloatingButtonPlacement(side: .leading, screenFraction: 0.5).storageValue
        let layout = pro.layout(feedStorage: stored, menuStorage: stored)
        XCTAssertEqual(layout.menu.x, layout.feed.x, accuracy: 0.001)
        XCTAssertEqual(layout.menu.y - layout.feed.y, FloatingButtonGeometry.minimumSeparation, accuracy: 0.5)
    }

    func test_layout_atTheBottom_theMenuGoesAboveInstead() {
        let stored = FloatingButtonPlacement(side: .trailing, screenFraction: 1).storageValue
        let layout = pro.layout(feedStorage: stored, menuStorage: stored)
        XCTAssertEqual(layout.feed.y - layout.menu.y, FloatingButtonGeometry.minimumSeparation, accuracy: 0.5)
    }

    func test_layout_oppositeSides_neverMove() {
        let feed = FloatingButtonPlacement(side: .leading, screenFraction: 0.3).storageValue
        let menu = FloatingButtonPlacement(side: .trailing, screenFraction: 0.3).storageValue
        let layout = pro.layout(feedStorage: feed, menuStorage: menu)
        XCTAssertEqual(layout.menu, pro.center(for: FloatingButtonPlacement(side: .trailing, screenFraction: 0.3)))
    }

    func test_drop_slightlyAboveTheOther_landsJustAboveIt() {
        let other = pro.center(for: FloatingButtonPlacement(side: .leading, screenFraction: 0.5))
        let placement = pro.placement(droppedAt: CGPoint(x: 40, y: other.y - 10), avoiding: other)
        let center = pro.center(for: placement)
        XCTAssertEqual(placement.side, .leading)
        XCTAssertEqual(other.y - center.y, FloatingButtonGeometry.minimumSeparation, accuracy: 0.5)
    }

    func test_drop_farFromTheOther_isUntouched() {
        let other = pro.center(for: FloatingButtonPlacement(side: .leading, screenFraction: 0.9))
        let placement = pro.placement(droppedAt: CGPoint(x: 40, y: 200), avoiding: other)
        XCTAssertEqual(pro.center(for: placement).y, 200, accuracy: 0.5)
    }

    // MARK: - Le sens d'ouverture du menu

    private let ladder: CGFloat = 6 * (46 + 12)

    func test_menu_opensDownward_fromTheTop() {
        let top = pro.center(for: FloatingButtonPlacement(side: .trailing, screenFraction: 0))
        XCTAssertTrue(pro.menuOpensDownward(from: top, ladderExtent: ladder))
    }

    func test_menu_opensUpward_fromTheBottom() {
        let bottom = pro.center(for: FloatingButtonPlacement(side: .trailing, screenFraction: 1))
        XCTAssertFalse(pro.menuOpensDownward(from: bottom, ladderExtent: ladder))
    }

    func test_menu_whenItFitsNeitherWay_opensTowardTheLargerSide() {
        let nearBottom = se.center(for: FloatingButtonPlacement(side: .trailing, screenFraction: 0.6))
        let nearTop = se.center(for: FloatingButtonPlacement(side: .trailing, screenFraction: 0.4))
        let huge: CGFloat = 1000
        XCTAssertFalse(se.menuOpensDownward(from: nearBottom, ladderExtent: huge))
        XCTAssertTrue(se.menuOpensDownward(from: nearTop, ladderExtent: huge))
    }
}
