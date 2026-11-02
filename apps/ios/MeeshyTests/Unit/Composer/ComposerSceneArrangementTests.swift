import XCTest
import SwiftUI
@testable import Meeshy

/// **Grand écran : la place libre décide, jamais le modèle d'appareil** (#13839, L6, spec iOS § 2.5, spec partagée § 4.5).
///
/// En rails, la scène est le plus grand 9:16 qui tient en HAUTEUR une fois Publier posé sous elle et les marges
/// déduits ; s'il reste à côté d'elle la place de deux rails libellés de 112 pt et de leurs marges, on les pose.
/// Les tailles sont celles du conteneur racine, zone sûre déduite (points).
final class ComposerSceneArrangementTests: XCTestCase {

    private func resolve(_ width: CGFloat, _ height: CGFloat,
                         previous: ComposerSceneArrangement? = nil) -> ComposerSceneArrangement {
        ComposerSceneArrangement.resolve(width: width, height: height, previous: previous)
    }

    // MARK: - Valeurs de référence

    func test_resolve_iPhoneHeldUpright_keepsEverythingOnTheScene() {
        XCTAssertEqual(resolve(402, 814), .overlay)
        XCTAssertEqual(resolve(375, 647), .overlay, "le plus petit iPhone servi")
    }

    func test_resolve_iPhoneTurnedSideways_laysTheTwoRails() {
        XCTAssertEqual(resolve(734, 372), .rails)
    }

    func test_resolve_iPad11Upright_isLimitedByItsWidthAndKeepsTheOverlays() {
        XCTAssertEqual(resolve(820, 1136), .overlay)
    }

    func test_resolve_iPad11Sideways_laysTheRails() {
        XCTAssertEqual(resolve(1180, 776), .rails)
    }

    func test_resolve_iPad13Upright_hasRoomForTheRails() {
        XCTAssertEqual(resolve(1032, 1322), .rails, "la place libre décide, pas l'orientation")
    }

    func test_resolve_splitViewThirdAndHalf_keepTheOverlays() {
        XCTAssertEqual(resolve(375, 776), .overlay, "Split View 1/3")
        XCTAssertEqual(resolve(586, 776), .overlay, "Split View 1/2")
    }

    func test_resolve_splitViewTwoThirds_laysTheRails() {
        XCTAssertEqual(resolve(796, 776), .rails)
    }

    func test_resolve_stageManagerWindows_followTheirOwnSize() {
        XCTAssertEqual(resolve(700, 560), .rails, "fenêtre large et basse")
        XCTAssertEqual(resolve(500, 700), .overlay, "fenêtre étroite")
    }

    // MARK: - La loi

    func test_threshold_isTwoLabelledRailsAndTheirMargins() {
        XCTAssertEqual(ComposerSceneArrangement.railWidth, 112)
        XCTAssertEqual(ComposerSceneArrangement.threshold, 2 * 112 + 2 * 16)
    }

    func test_railsSceneHeight_deductsPublishAndTheMargins() {
        let height: CGFloat = 776
        let scene = ComposerSceneArrangement.railsSceneHeight(height: height)
        XCTAssertEqual(scene, height - ComposerSceneArrangement.publishReserve - 2 * ComposerSceneArrangement.margin)
        XCTAssertEqual(ComposerSceneArrangement.freeWidth(width: 1180, height: height), 1180 - scene * 9 / 16,
                       accuracy: 0.001)
    }

    func test_resolve_justUnderTheThreshold_staysOnTheOverlays_justOverIt_laysTheRails() {
        let height: CGFloat = 700
        let edge = ComposerSceneArrangement.railsSceneHeight(height: height) * 9 / 16 + ComposerSceneArrangement.threshold
        XCTAssertEqual(resolve(edge - 1, height), .overlay)
        XCTAssertEqual(resolve(edge, height), .rails)
    }

    func test_resolve_onTheRails_aShrinkUnderTheHysteresis_keepsThem_soSplitViewDoesNotFlicker() {
        let height: CGFloat = 700
        let edge = ComposerSceneArrangement.railsSceneHeight(height: height) * 9 / 16 + ComposerSceneArrangement.threshold
        XCTAssertEqual(resolve(edge - 10, height, previous: .rails), .rails)
        XCTAssertEqual(resolve(edge - ComposerSceneArrangement.hysteresis - 1, height, previous: .rails), .overlay)
        XCTAssertEqual(resolve(edge - 10, height, previous: .overlay), .overlay)
    }

    func test_resolve_emptyOrUnmeasuredContainer_neverLaysTheRails() {
        XCTAssertEqual(resolve(0, 0), .overlay)
        XCTAssertEqual(resolve(100, 20), .overlay)
        XCTAssertEqual(resolve(.infinity, 800), .overlay)
        XCTAssertEqual(resolve(.nan, 800), .overlay)
    }

    func test_served_accessibilityTextSize_fallsBackOnTheOverlays() {
        XCTAssertEqual(ComposerSceneArrangement.served(width: 1180, height: 776, previous: nil,
                                                       accessibilityText: true), .overlay,
                       "un libellé de grande taille ne tient pas dans 112 pt : repli en surimpression")
        XCTAssertEqual(ComposerSceneArrangement.served(width: 1180, height: 776, previous: nil,
                                                       accessibilityText: false), .rails)
    }

    // MARK: - Publier sous la scène

    func test_publishWidth_isTheSceneWidth_orAtLeast300() {
        let large = ComposerSceneArrangement.publishWidth(width: 1180, height: 776)
        XCTAssertEqual(large, ComposerSceneArrangement.railsSceneHeight(height: 776) * 9 / 16, accuracy: 0.001)
        XCTAssertEqual(ComposerSceneArrangement.publishWidth(width: 734, height: 372), 300,
                       "une scène étroite ne rétrécit pas Publier sous 300 pt")
    }

    func test_publishWidth_neverReachesIntoTheRails() {
        let colonne: CGFloat = 500 - 2 * (ComposerSceneArrangement.railWidth + ComposerSceneArrangement.margin)
        XCTAssertEqual(ComposerSceneArrangement.publishWidth(width: 500, height: 360), colonne)
    }

    // MARK: - La scène rend leur couloir aux rails

    func test_insets_overlay_giveTheSceneTheWholeContainer() {
        XCTAssertEqual(ComposerSceneRailsInsets.insets(arrangement: .overlay, showsSlideRow: true), EdgeInsets())
    }

    func test_insets_rails_reserveBothLanes_andTheSlideRowAboveTheScene() {
        let sans = ComposerSceneRailsInsets.insets(arrangement: .rails, showsSlideRow: false)
        let avec = ComposerSceneRailsInsets.insets(arrangement: .rails, showsSlideRow: true)
        XCTAssertEqual(sans.leading, ComposerSceneArrangement.railWidth + 2 * ComposerSceneArrangement.margin)
        XCTAssertEqual(sans.trailing, sans.leading)
        XCTAssertEqual(avec.top - sans.top, ComposerSceneArrangement.slideRowReserve,
                       "la rangée des diapos se pose au-dessus de la scène, jamais dessus")
    }

    // MARK: - Les panneaux du bas restent dans la colonne de la scène

    func test_lowerFloorsInsets_overlay_spanTheWholeWidth() {
        XCTAssertEqual(ComposerSceneRailsInsets.lowerFloors(arrangement: .overlay), EdgeInsets())
    }

    func test_lowerFloorsInsets_rails_keepBandsToolOptionsAndTheDrawingBarOffTheRails() {
        let bas = ComposerSceneRailsInsets.lowerFloors(arrangement: .rails)
        let scene = ComposerSceneRailsInsets.insets(arrangement: .rails, showsSlideRow: false)
        XCTAssertEqual(bas.leading, scene.leading, "une bande sous le rail gauche y serait couverte et intouchable")
        XCTAssertEqual(bas.trailing, scene.trailing)
        XCTAssertEqual(bas.top, 0)
        XCTAssertEqual(bas.bottom, 0)
    }

    func test_sceneSurface_constrainsItsLowerFloorsToTheSceneColumn() throws {
        let surface = try Self.source("ComposerSceneSurface.swift")
        XCTAssertTrue(surface.contains(".padding(ComposerSceneRailsInsets.lowerFloors(arrangement: arrangement))"),
                      "frise, bandes, réglages d'outil et barre de dessin ne passent jamais sous les rails")
        XCTAssertTrue(surface.contains("leadingInset: sceneCardLeading - railLaneLeading"),
                      "le pied des références, dans la colonne, s'aligne sur la carte sans compter le couloir deux fois")
    }

    // MARK: - Le meuble lit la loi, pas la classe de taille

    func test_sceneSurface_readsTheArrangement_neverTheSizeClass() throws {
        let surface = try Self.source("ComposerSceneSurface.swift")
        XCTAssertFalse(surface.contains("horizontalSizeClass"),
                       "la bascule ne dépend jamais de la classe de taille seule")
        XCTAssertTrue(surface.contains("arrangement == .rails"))
    }

    func test_host_feedsTheArrangementFromTheContainer_keyboardIgnored() throws {
        let host = try Self.source("ComposerSceneArrangementRelay.swift")
        XCTAssertTrue(host.contains("ComposerSceneArrangement.served("))
        XCTAssertTrue(host.contains("previous: host.sceneLayout.arrangement"), "l'hystérésis lit la disposition en place")
        XCTAssertTrue(host.contains(".ignoresSafeArea(.keyboard)"), "le clavier ne fait pas basculer la disposition")
    }

    static func source(_ fichier: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/\(fichier)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }
}
