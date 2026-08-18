// apps/ios/MeeshyTests/Unit/Focal/FocalSpecCurveTests.swift

import XCTest
import UIKit
@testable import Meeshy

/// La courbe du fil, FIDÈLE à la spec « Focal Grandeur Nature » §3/§5
/// (`docs/design/2026-08-15-focal-spec-integration.html`, réancrée comme
/// contrat le 2026-08-18) : `f = min(1, d/380)`, `échelle = 1 − 0.40f`
/// (plancher 0.60), `alpha = 1 − 0.82f` (plancher 0.18), ancre de
/// transformation « bas, 16 % » — et PLUS AUCUNE loupe : l'échelle ne
/// dépasse jamais 1, l'élu est à taille pleine, sa mise en avant passe par
/// la carte et la tenue de rangée. Cette suite remplace
/// `FocalMagnificenceTests` (spec Magnificence 2026-08-17, retirée).
@MainActor
final class FocalSpecCurveTests: XCTestCase {

    private let geometry = FocalPerspectiveGeometry.standard

    private func transform(
        distance: CGFloat,
        height: CGFloat = 100,
        alphaCeiling: CGFloat = 1
    ) -> FocalCellTransform {
        geometry.transform(
            distance: distance,
            cellSize: CGSize(width: 366, height: height),
            horizontalAnchor: .leading,
            isRightToLeft: false,
            alphaCeiling: alphaCeiling
        )
    }

    // MARK: - Échelle ≤ 1 — la loupe n'existe plus

    func test_transform_atFocusLine_isExactlyFullSize() {
        let atLine = transform(distance: 0)
        XCTAssertEqual(
            atLine.scale, 1, accuracy: 0.0001,
            "spec §5 : l'élu est à l'échelle PLEINE (1.0) — la loupe 1.18 de la Magnificence est retirée, aucune rangée ne dépasse jamais sa taille de layout."
        )
        XCTAssertEqual(atLine.alpha, 1, accuracy: 0.0001)
        XCTAssertEqual(atLine.translation, .zero)
    }

    func test_transform_neverExceedsFullSize_atAnyDistance() {
        for distance in stride(from: CGFloat(-200), through: 900, by: 10) {
            XCTAssertLessThanOrEqual(
                transform(distance: distance).scale, 1.0001,
                "d=\(distance) : l'échelle ne dépasse JAMAIS 1 — c'est la définition du retrait de la loupe."
            )
        }
    }

    // MARK: - Formules exactes de la spec

    func test_transform_midRamp_matchesTheSpecFormulas() {
        // d = 190 = mi-course : f = 0.5 → échelle 0.80, alpha 0.59.
        let mid = transform(distance: 190)
        XCTAssertEqual(mid.scale, 0.80, accuracy: 0.0001, "échelle = 1 − 0.40·(190/380)")
        XCTAssertEqual(mid.alpha, 0.59, accuracy: 0.0001, "alpha = 1 − 0.82·(190/380)")
    }

    func test_transform_saturation_rendersTheSpecFloors() {
        // d ≥ 380 : f = 1 → planchers 0.60 / 0.18 de la spec.
        for distance in [CGFloat(380), 500, 900] {
            let far = transform(distance: distance)
            XCTAssertEqual(far.scale, 0.60, accuracy: 0.0001, "plancher d'échelle de la spec")
            XCTAssertEqual(far.alpha, 0.18, accuracy: 0.0001, "plancher d'opacité de la spec")
        }
    }

    func test_recette_row400AboveBand_weighsAtMost20PercentOpacity() {
        XCTAssertLessThanOrEqual(
            transform(distance: 400).alpha, 0.2,
            "recette §7 : « à 400 px au-dessus, il pèse ≤ 20 % d'opacité »"
        )
    }

    func test_transform_matchesTheFrozenSharedCurve() {
        let rendered = transform(distance: 190)
        let frozen = FocalFocusCurve.focusCurve(distance: 190, variant: .thread)
        XCTAssertEqual(rendered.scale, frozen.scale, accuracy: 0.0001,
                       "l'échelle rendue est EXACTEMENT celle de la loi partagée — jamais recalculée localement")
        XCTAssertEqual(rendered.alpha, frozen.alpha, accuracy: 0.0001,
                       "le fondu rendu est EXACTEMENT celui de la loi partagée (rétabli 2026-08-18)")
    }

    // MARK: - Plafond d'alpha : un état d'ENVOI, composé en `min`

    func test_optimisticCeiling_isAMinNeverASubstitution() {
        // Près de la bande, la courbe rend ~1 : le plafond 0.7 domine.
        XCTAssertEqual(
            transform(distance: 0, alphaCeiling: 0.7).alpha, 0.7, accuracy: 0.0001,
            "rangée optimiste dans la bande : alpha = min(0.7, ~1) = 0.7"
        )
        // Loin de la bande, la courbe rend 0.18 : la distance domine.
        XCTAssertEqual(
            transform(distance: 380, alphaCeiling: 0.7).alpha, 0.18, accuracy: 0.0001,
            "spec matrice §5 : « alpha = min(0.7, alphaPerspective) » — le plafond ne RELÈVE jamais une rangée estompée"
        )
    }

    // MARK: - Ancre de transformation : bas, 16 %

    func test_transform_bottomEdgeStaysAnchored() {
        let height: CGFloat = 100
        let far = transform(distance: 380, height: height)
        let expectedTy = -(height / 2) * (1 - far.scale)
        XCTAssertEqual(
            far.translation.height, expectedTy, accuracy: 0.0001,
            "le bas visuel reste ancré (« Ancre de transformation : bas ») — compensation ty = −(h/2)(1−s), jamais un anchorPoint écrit."
        )
    }

    func test_transform_horizontalPivot_isTheSpecSixteenPercent() {
        XCTAssertEqual(
            FocalFocusCurve.threadHorizontalPivot, 0.16, accuracy: 0.0001,
            "spec §5 : anchorPoint (0.16, 1.0) — le x du pivot est 16 %, plus jamais le 18 % de la maquette vol. 3."
        )
        let far = transform(distance: 380)
        let expectedTx = -(366 * (0.5 - 0.16)) * (1 - far.scale)
        XCTAssertEqual(
            far.translation.width, expectedTx, accuracy: 0.0001,
            "la compensation horizontale dérive du pivot 16 % : tx = ±w·(0.5 − 0.16)·(1 − s)."
        )
    }

    // MARK: - zPosition : l'élévation appartenait à la loupe — plus d'écrivain

    func test_perspectiveCell_neverCarriesElevation() {
        let cell = FocalPerspectiveCell(frame: CGRect(x: 0, y: 0, width: 366, height: 100))
        cell.layer.zPosition = 120
        cell.writeFocalTransform(FocalCellTransform(scale: 0.8, alpha: 0.5, translation: .zero))
        XCTAssertEqual(
            cell.layer.zPosition, 0,
            "toute écriture du pass remet zPosition à 0 — une cellule recyclée depuis l'ère de la loupe n'hérite d'aucune élévation."
        )
    }

    // MARK: - La décoration suit l'élection partout (spec Magnificence, conservé)

    func test_pass_decorationFollowsElectionEverywhere_notOnlyFullyVisible() throws {
        let stripped = try focalSource("Meeshy/Features/Main/Focal/Scroll/FocalScrollPass.swift")
        XCTAssertFalse(
            stripped.contains("&& isFullyVisible"),
            "le FOND accentué suit l'élection en continu — un fond coupé par le bord d'écran est naturel, la garde de pleine visibilité protégeait un CADRE ouvert qui n'existe plus"
        )
    }

    // MARK: - « Lire plus » (spec §3) — sheet scrollable, jamais un dépli inline

    func test_readMorePayload_isIdentifiedByItsMessage() {
        let payload = FocalReadMorePayload(
            messageId: "m1", senderName: "Ali", timeString: "10:41",
            text: "Un très long message…", accentHex: "#31B6BA", isDark: true
        )
        XCTAssertEqual(
            payload.id, "m1",
            "la sheet est présentée par .sheet(item:) — l'identité du payload EST le message"
        )
    }

    private func focalSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_focalRow_routesExpansionToTheReadMoreSheet() throws {
        let stripped = try focalSource("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        guard let callStart = stripped.range(of: "BubbleExpandableText(") else {
            return XCTFail("FocalRow doit toujours rendre son texte via BubbleExpandableText")
        }
        let window = String(stripped[callStart.lowerBound...].prefix(1400))
        XCTAssertTrue(
            window.contains("onExpandOverride"),
            "en Focal, « Lire plus » n'étend JAMAIS inline (un message de 3 écrans casserait l'atterrissage) — le tap est détourné vers la sheet scrollable"
        )
        XCTAssertTrue(
            window.contains("onReadMore"),
            "le détournement doit router vers FocalRowActions.onReadMore — c'est lui qui remonte jusqu'à la sheet de ConversationView"
        )
    }

    func test_conversationView_presentsTheReadMoreSheet() throws {
        let files = try FileManager.default.contentsOfDirectory(
            atPath: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Views").path
        ).filter { $0.hasPrefix("ConversationView") && $0.hasSuffix(".swift") }
        let combined = try files
            .map { try focalSource("Meeshy/Features/Main/Views/\($0)") }
            .joined()
        XCTAssertTrue(
            combined.contains("FocalReadMoreSheet("),
            "ConversationView doit présenter FocalReadMoreSheet — sans ce montage, « Lire plus » route dans le vide"
        )
    }

    // MARK: - La réserve trailing de loupe n'existe plus

    func test_host_hasNoMagnifiedTrailingReserve() throws {
        let stripped = try focalSource("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertFalse(
            stripped.contains("magnifiedTrailingReserve"),
            "sans loupe, aucune réserve trailing : le fil garde ses 12 pt des deux côtés et la date de l'élu sa pleine largeur."
        )
    }
}
