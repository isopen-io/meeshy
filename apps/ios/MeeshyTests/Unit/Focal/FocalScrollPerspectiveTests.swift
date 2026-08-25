import XCTest
import QuartzCore
@testable import Meeshy

/// Focal minimal (2026-08-21) : la pose d'une cellule ne dépend que de sa
/// distance à la ligne de focus, par la loi PARTAGÉE du fil — jamais d'une
/// hauteur, d'une élection ou d'un atterrissage.
final class FocalScrollPerspectiveTests: XCTestCase {

    func test_pose_onTheFocusLine_isIdentity_andSymmetricOnBothSides() {
        XCTAssertEqual(FocalScrollPerspective.pose(distance: 0, reduceMotion: false), .identity)
        // Compaction SYMÉTRIQUE (2026-08-21) : une rangée sous la ligne se pose
        // comme sa jumelle au-dessus — la ligne est au centre de l'écran.
        XCTAssertEqual(
            FocalScrollPerspective.pose(distance: -120, reduceMotion: false),
            FocalScrollPerspective.pose(distance: 120, reduceMotion: false)
        )
    }

    func test_pose_aboveTheFocusLine_followsTheSharedThreadCurve() {
        // 100 pt : la loi donne une opacité au-dessus du plancher iOS (0.62),
        // donc c'est bien la loi qu'on lit ici — le plancher a son témoin.
        let pose = FocalScrollPerspective.pose(distance: 100, reduceMotion: false)
        let law = FocalFocusCurve.focusCurve(distance: 100, variant: .thread)
        XCTAssertEqual(pose.scale, law.scale, accuracy: 0.0001)
        XCTAssertEqual(pose.alpha, law.alpha, accuracy: 0.0001)
        XCTAssertLessThan(pose.scale, 1)
        XCTAssertLessThan(pose.alpha, 1)
    }

    func test_pose_farFromTheFocusLine_isClampedAtTheLawScaleFloor_andTheAlphaFloor() {
        let pose = FocalScrollPerspective.pose(distance: 5_000, reduceMotion: false)
        XCTAssertEqual(pose.scale, 1 - FocalFocusCurve.threadScaleDecay, accuracy: 0.0001)
        // Plancher d'opacité iOS (règle de consommation, loi intacte) : une
        // rangée lointaine reste LISIBLE — plus d'arrivée/sortie par fondu.
        XCTAssertEqual(pose.alpha, FocalScrollPerspective.alphaFloor, accuracy: 0.0001)
        XCTAssertGreaterThan(FocalScrollPerspective.alphaFloor, 1 - FocalFocusCurve.threadAlphaDecay)
        XCTAssertGreaterThanOrEqual(FocalScrollPerspective.alphaFloor, 0.6)
    }

    func test_pose_nearTheFocusLine_isNotTouchedByTheAlphaFloor() {
        let pose = FocalScrollPerspective.pose(distance: 60, reduceMotion: false)
        let law = FocalFocusCurve.focusCurve(distance: 60, variant: .thread)
        XCTAssertEqual(pose.alpha, law.alpha, accuracy: 0.0001)
    }

    func test_pose_underReduceMotion_isIdentity_whateverTheDistance() {
        XCTAssertEqual(FocalScrollPerspective.pose(distance: 400, reduceMotion: true), .identity)
    }

    /// Ligne de focus au CENTRE de la région visible (directive user
    /// 2026-08-21 : « presque au centre de l'écran »)…
    func test_focusY_isTheCenterOfTheVisibleRegion_onceScrolledHalfAScreen() {
        XCTAssertEqual(FocalScrollPerspective.focusY(visibleTop: 100, visibleBottom: 700, offsetFromBottom: 300), 400)
        XCTAssertEqual(FocalScrollPerspective.focusY(visibleTop: 100, visibleBottom: 700, offsetFromBottom: 5_000), 400)
    }

    /// …qui descend au bord bas au repos sur le dernier message (sinon le
    /// message le plus récent ne pourrait JAMAIS être en focus), et remonte
    /// linéairement sur la première demi-hauteur de défilement.
    func test_focusY_sitsAtTheBottomEdge_whenRestingOnTheNewestMessage_andRisesLinearly() {
        XCTAssertEqual(FocalScrollPerspective.focusY(visibleTop: 100, visibleBottom: 700, offsetFromBottom: 0), 700)
        XCTAssertEqual(FocalScrollPerspective.focusY(visibleTop: 100, visibleBottom: 700, offsetFromBottom: 150), 550)
        XCTAssertEqual(FocalScrollPerspective.focusY(visibleTop: 100, visibleBottom: 700, offsetFromBottom: -40), 700, "rebond élastique sous le bas : la ligne ne sort pas de l'écran")
    }

    /// La carte encadre le message avec les MÊMES marges en haut et en bas
    /// (directive user 2026-08-21) : elle mange le rembourrage vertical de la
    /// rangée et, en tête de groupe, le rembourrage de groupe.
    func test_focusCardInsets_leaveTheSameVisibleMargin_topAndBottom() {
        let head = FocalScrollPerspective.focusCardInsets(isFirstInGroup: true)
        let follow = FocalScrollPerspective.focusCardInsets(isFirstInGroup: false)
        let margin = FocalScrollPerspective.focusCardInnerMargin
        XCTAssertEqual(head.top, FocalMetrics.Row.paddingVertical + FocalMetrics.Row.groupTopPadding - margin)
        XCTAssertEqual(head.bottom, FocalMetrics.Row.paddingVertical - margin)
        XCTAssertEqual(follow.top, FocalMetrics.Row.paddingVertical - margin)
        XCTAssertEqual(follow.bottom, follow.top, "en continuation, haut et bas sont symétriques")
        XCTAssertEqual(head.left, FocalScrollPerspective.focusCardHorizontalInset)
        XCTAssertGreaterThanOrEqual(follow.top, 0)
    }

    func test_transform_atScaleOne_isIdentity() {
        XCTAssertTrue(CATransform3DIsIdentity(FocalScrollPerspective.transform(scale: 1, size: CGSize(width: 300, height: 100))))
    }

    /// Le pivot de la spec — (16 %, bas visuel) = (0.16·w, 0) dans le repère
    /// renversé — reste FIXE sous la mise à l'échelle.
    func test_transform_keepsTheSpecPivotFixed() {
        let size = CGSize(width: 300, height: 100)
        let t = FocalScrollPerspective.transform(scale: 0.6, size: size)
        let affine = CATransform3DGetAffineTransform(t)
        // Point du layer exprimé par rapport à son centre (anchorPoint 0.5, 0.5).
        let pivot = CGPoint(x: 0.16 * size.width - size.width / 2, y: 0 - size.height / 2)
        let moved = pivot.applying(affine)
        XCTAssertEqual(moved.x, pivot.x, accuracy: 0.001)
        XCTAssertEqual(moved.y, pivot.y, accuracy: 0.001)
        // …et un point opposé se rapproche du pivot.
        let far = CGPoint(x: size.width / 2, y: size.height / 2)
        let farMoved = far.applying(affine)
        XCTAssertLessThan(abs(farMoved.x - pivot.x), abs(far.x - pivot.x))
        XCTAssertLessThan(abs(farMoved.y - pivot.y), abs(far.y - pivot.y))
    }

    /// Le câblage hôte : la passe tourne au tick de défilement, à l'affichage
    /// d'une cellule et après chaque apply — et chaque configuration REMET le
    /// layer à plat (cellule recyclée d'un mode à l'autre).
    func test_host_appliesThePassOnScrollDisplayAndApply_andResetsOnConfigure() throws {
        // Unit/Focal → Unit → MeeshyTests → apps/ios : QUATRE remontées.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/MessageListViewController.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertGreaterThanOrEqual(code.components(separatedBy: "applyFocalPerspectiveToVisibleCells()").count - 1, 3,
            "scrollViewDidScroll + fin d'apply + changement de mode, au minimum")
        XCTAssertTrue(code.contains("FocalScrollPerspective.reset(cell.contentView.layer)"))
        XCTAssertTrue(code.contains("applyFocalPerspective(to: cell)"))
    }

    // MARK: - Compaction + focus (retours user 2026-08-21)

    private func cell(_ id: String, midY: CGFloat, height: CGFloat = 100, isMessage: Bool = true) -> FocalScrollPerspective.CellGeometry {
        FocalScrollPerspective.CellGeometry(id: id, visualMidY: midY, height: height, isMessage: isMessage)
    }

    /// Les rangées sous la ligne de focus ne bougent pas ; au-dessus, chaque
    /// rangée est tirée vers le bas de la hauteur PERDUE par celles qui la
    /// séparent de la ligne — les interstices ne grandissent plus.
    func test_poses_pullEachUpperRowByTheHeightLostBelowIt() {
        let focusY: CGFloat = 700
        // Distances 150/250/350 : toutes DANS la portée de la loi (maxDistance
        // 380) — au-delà, l'échelle touche son plancher et deux rangées
        // lointaines ont la même échelle (ce que ce témoin ne teste pas).
        let cells = [cell("below", midY: 760), cell("a", midY: 550), cell("b", midY: 450), cell("c", midY: 350)]
        let poses = FocalScrollPerspective.poses(cells: cells, focusY: focusY, reduceMotion: false)
        let byId = Dictionary(uniqueKeysWithValues: poses.map { ($0.id, $0) })
        // « below » est à 60 pt SOUS la ligne : il rétrécit à peine, vers son
        // haut, sans rien au-dessus de lui à tirer.
        XCTAssertEqual(byId["below"]?.pull, 0)
        XCTAssertEqual(byId["below"]?.anchorY, 1)
        XCTAssertEqual(byId["a"]?.pull, 0)
        XCTAssertEqual(byId["a"]?.anchorY, 0)
        let lostA = (1 - byId["a"]!.scale) * 100
        XCTAssertEqual(byId["b"]!.pull, lostA, accuracy: 0.0001)
        let lostB = (1 - byId["b"]!.scale) * 100
        XCTAssertEqual(byId["c"]!.pull, lostA + lostB, accuracy: 0.0001)
        XCTAssertLessThan(byId["c"]!.scale, byId["b"]!.scale)
        XCTAssertLessThan(byId["b"]!.scale, byId["a"]!.scale)
    }

    /// Sous la ligne, même loi, autre sens : chaque rangée est tirée vers le
    /// HAUT (pull négatif) de la hauteur perdue par celles qui la séparent de
    /// la ligne, et rétrécit vers son haut (anchorY 1) — zéro interstice des
    /// deux côtés.
    func test_poses_pullEachLowerRowUpByTheHeightLostAboveIt() {
        let focusY: CGFloat = 300
        let cells = [cell("above", midY: 240), cell("a", midY: 450), cell("b", midY: 550), cell("c", midY: 650)]
        let poses = FocalScrollPerspective.poses(cells: cells, focusY: focusY, reduceMotion: false)
        let byId = Dictionary(uniqueKeysWithValues: poses.map { ($0.id, $0) })
        XCTAssertEqual(byId["a"]?.pull, 0)
        XCTAssertEqual(byId["a"]?.anchorY, 1)
        let lostA = (1 - byId["a"]!.scale) * 100
        XCTAssertEqual(byId["b"]!.pull, -lostA, accuracy: 0.0001)
        let lostB = (1 - byId["b"]!.scale) * 100
        XCTAssertEqual(byId["c"]!.pull, -(lostA + lostB), accuracy: 0.0001)
        XCTAssertLessThan(byId["c"]!.scale, byId["b"]!.scale)
        XCTAssertEqual(byId["above"]?.anchorY, 0)
    }

    func test_transform_withAnchorAtTheVisualTop_keepsTheTopFixed_inTheFlippedSpace() {
        let size = CGSize(width: 300, height: 100)
        let t = FocalScrollPerspective.transform(scale: 0.6, anchorY: 1, size: size)
        let affine = CATransform3DGetAffineTransform(t)
        // Haut VISUEL = y = h dans le repère renversé, soit +h/2 par rapport au centre.
        let pivot = CGPoint(x: 0.16 * size.width - size.width / 2, y: size.height / 2)
        let moved = pivot.applying(affine)
        XCTAssertEqual(moved.x, pivot.x, accuracy: 0.001)
        XCTAssertEqual(moved.y, pivot.y, accuracy: 0.001)
    }

    func test_poses_nonMessageCells_fadeButKeepTheirScale_andLoseNoHeight() {
        let poses = FocalScrollPerspective.poses(
            cells: [cell("pill", midY: 300, height: 40, isMessage: false), cell("m", midY: 100)],
            focusY: 700, reduceMotion: false
        )
        let byId = Dictionary(uniqueKeysWithValues: poses.map { ($0.id, $0) })
        XCTAssertEqual(byId["pill"]?.scale, 1)
        XCTAssertLessThan(byId["pill"]!.alpha, 1)
        XCTAssertEqual(byId["m"]?.pull, 0, "une pilule ne rétrécit pas : elle ne libère aucune hauteur")
    }

    func test_poses_underReduceMotion_areAllIdentity() {
        let poses = FocalScrollPerspective.poses(cells: [cell("a", midY: 100), cell("b", midY: 500)], focusY: 700, reduceMotion: true)
        XCTAssertTrue(poses.allSatisfy { $0.scale == 1 && $0.alpha == 1 && $0.pull == 0 })
    }

    /// Câblage de la SCÈNE (directive user 2026-08-21) : la perspective ne
    /// s'active que sur un geste utilisateur, s'aplatit après `restDelay`,
    /// et le changement de mode remet tout à plat sans animation.
    func test_host_activatesTheSceneOnUserGestureOnly_andFlattensAtRest() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/MessageListViewController.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
        XCTAssertTrue(code.contains("guard readingMode == .focal, scrollView.isDragging || scrollView.isDecelerating else { return }"),
                      "La scène ne s'active que sur un geste UTILISATEUR — jamais sur un défilement programmé.")
        XCTAssertTrue(code.contains("DispatchQueue.main.asyncAfter(deadline: .now() + FocalMetrics.Scene.restDelay, execute: work)"),
                      "L'aplatissement attend `restDelay` après la pose, depuis le token — pas un nombre recopié.")
        XCTAssertTrue(code.contains("func resetFocalPerspectiveOnVisibleCells() { flattenFocalScene(animated: false) }"),
                      "Changer de mode aplatit SEC : pas d'animation de sortie entre deux rendus.")
        XCTAssertTrue(code.contains("guard readingMode == .focal, isViewLoaded, focalSceneActive else { return }"),
                      "Scène inactive ⇒ la passe est un no-op : les cellules arrivent à plat, comme en Script.")
    }

    /// **La sur-réserve appartient à la COMPACTION** (audit 2026-08-25).
    ///
    /// `focalOverscan` pré-réalisait 0,3 hauteur d'écran de cellules parce que
    /// la compaction « tire les rangées vers la ligne de focus d'autant que
    /// les rangées rétrécies ont perdu » : des cellules encore hors écran pour
    /// UIKit devaient déjà exister pour occuper la place libérée. Or `poses`
    /// n'est plus APPLIQUÉE — la loi reste écrite et testée, la planche est
    /// fixe. Tant qu'il en est ainsi, Focal payait ces cellules par frame pour
    /// rien. Cette garde LIE les deux : si la compaction revient, la
    /// sur-réserve doit revenir avec elle.
    func test_focalOverscan_isZero_whileTheCompactionIsNotApplied() throws {
        let host = try normalizedSource("Meeshy/Features/Main/Views/MessageListViewController.swift")
        if host.contains("FocalScrollPerspective.poses(") {
            XCTAssertTrue(
                host.contains("layout.focalOverscan = readingMode == .focal"),
                "la compaction est de retour : la sur-réserve doit être rebranchée sur le mode"
            )
        } else {
            XCTAssertTrue(host.contains("layout.focalOverscan = 0"), "aucune compaction appliquée ⇒ aucune sur-réserve")
            XCTAssertFalse(
                host.contains("layout.focalOverscan = readingMode == .focal"),
                "sur-réserve conditionnée au mode alors que rien ne la consomme"
            )
        }
        // La machinerie RESTE en place : c'est le point de rebranchement.
        let perspective = try normalizedSource("Meeshy/Features/Main/Focal/Core/FocalScrollPerspective.swift")
        XCTAssertTrue(perspective.contains("static let overscanFraction"), "la fraction reste nommée")
        let layout = try normalizedSource("Meeshy/Features/Main/Views/MessageListLayout.swift")
        XCTAssertTrue(layout.contains("let extended = rect.insetBy(dx: 0, dy: -focalOverscan)"), "le layout garde son extension de rect")
    }

    private func normalizedSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }

    func test_focusedId_isTheNearestMessage_withHysteresis() {
        let cells = [cell("near", midY: 690), cell("far", midY: 400), cell("pill", midY: 705, isMessage: false)]
        XCTAssertEqual(FocalScrollPerspective.focusedId(cells: cells, focusY: 700, currentId: nil), "near")
        // L'élu tient tant qu'il reste dans l'hystérésis du fil…
        let drifted = [cell("near", midY: 700 - FocalFocusCurve.threadFocusBandHysteresis + 1), cell("other", midY: 702)]
        XCTAssertEqual(FocalScrollPerspective.focusedId(cells: drifted, focusY: 700, currentId: "near"), "near")
        // …et cède au-delà.
        let gone = [cell("near", midY: 700 - FocalFocusCurve.threadFocusBandHysteresis - 1), cell("other", midY: 702)]
        XCTAssertEqual(FocalScrollPerspective.focusedId(cells: gone, focusY: 700, currentId: "near"), "other")
    }

    func test_transform_withPull_movesTheLayerTowardsTheFocusLine_inTheFlippedSpace() {
        let size = CGSize(width: 300, height: 100)
        let t = FocalScrollPerspective.transform(scale: 1, pull: 40, size: size)
        let affine = CATransform3DGetAffineTransform(t)
        let p = CGPoint(x: 0, y: 0).applying(affine)
        XCTAssertEqual(p.y, -40, accuracy: 0.001, "vers le bas visuel = −y dans le repère renversé")
        XCTAssertEqual(p.x, 0, accuracy: 0.001)
    }
}
