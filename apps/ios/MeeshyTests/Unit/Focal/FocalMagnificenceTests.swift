// apps/ios/MeeshyTests/Unit/Focal/FocalMagnificenceTests.swift

import XCTest
import UIKit
@testable import Meeshy

/// La Magnificence Focale (spec 2026-08-17) — la magnification est un TERME
/// DE COURBE POSITIONNEL, continu pendant le défilement, jamais un événement
/// d'élection : une loupe fixée à la ligne de lecture. Composée par-dessus
/// la courbe GELÉE dans `FocalPerspectiveGeometry` (la loi partagée TS/Swift
/// n'est pas touchée — même précédent que le retrait du fondu d'alpha).
@MainActor
final class FocalMagnificenceTests: XCTestCase {

    private let geometry = FocalPerspectiveGeometry.standard

    // MARK: - Loi de la loupe

    func test_magnification_peaksAtFocusLine() {
        XCTAssertEqual(
            geometry.magnification(signedDistance: 0, rowHeight: 100),
            FocalPassConstants.magnificationPeak,
            accuracy: 0.0001,
            "pile sur la ligne de focus, la loupe atteint son pic — c'est la magnificence de l'élu posé."
        )
    }

    func test_magnification_isSymmetricAroundTheBand() {
        XCTAssertEqual(
            geometry.magnification(signedDistance: 30, rowHeight: 100),
            geometry.magnification(signedDistance: -30, rowHeight: 100),
            accuracy: 0.0001,
            "la loupe décroît symétriquement au-dessus et en dessous de la ligne — le défilement la traverse sans discontinuité de forme."
        )
    }

    func test_magnification_vanishesExactlyAtRadius() {
        let radius = FocalFocusCurve.focusBandHalfHeight * FocalPassConstants.magnificationRadiusFactor
        XCTAssertEqual(
            geometry.magnification(signedDistance: radius, rowHeight: 100), 1, accuracy: 0.0001,
            "au rayon, la loupe retombe EXACTEMENT à 1 — au-delà, la courbe gelée règne seule, sans marche."
        )
        XCTAssertEqual(geometry.magnification(signedDistance: -radius, rowHeight: 100), 1, accuracy: 0.0001)
        XCTAssertEqual(geometry.magnification(signedDistance: radius + 200, rowHeight: 100), 1, accuracy: 0.0001)
    }

    func test_magnification_isMonotonicTowardTheLine() {
        let d1 = geometry.magnification(signedDistance: 5, rowHeight: 100)
        let d2 = geometry.magnification(signedDistance: 20, rowHeight: 100)
        let d3 = geometry.magnification(signedDistance: 40, rowHeight: 100)
        XCTAssertGreaterThan(d1, d2, "plus près de la ligne = plus magnifié — jamais d'oscillation.")
        XCTAssertGreaterThan(d2, d3)
    }

    // MARK: - Composition avec la courbe gelée

    func test_transform_atFocusLine_scalesToThePeak() {
        let transform = geometry.transform(
            signedDistance: 0,
            cellSize: CGSize(width: 366, height: 100),
            horizontalAnchor: .leading,
            isRightToLeft: false,
            alphaCeiling: 1,
            isMagnifiable: true
        )
        XCTAssertEqual(
            transform.scale, FocalPassConstants.magnificationPeak, accuracy: 0.0001,
            "à distance 0 la courbe gelée rend 1 — l'échelle rendue est le pic pur de la loupe."
        )
    }

    func test_transform_farAboveBand_matchesFrozenCurveExactly() {
        let transform = geometry.transform(
            signedDistance: 190,
            cellSize: CGSize(width: 366, height: 100),
            horizontalAnchor: .leading,
            isRightToLeft: false,
            alphaCeiling: 1,
            isMagnifiable: true
        )
        let frozen = FocalFocusCurve.focusCurve(distance: 190, variant: .thread)
        XCTAssertEqual(
            transform.scale, frozen.scale, accuracy: 0.0001,
            "au-delà du rayon de loupe, l'échelle rendue est EXACTEMENT celle de la courbe gelée — l'écart iOS n'existe que dans la bande."
        )
    }

    func test_transform_bottomEdgeStaysAnchored_whenMagnified() {
        let height: CGFloat = 100
        let transform = geometry.transform(
            signedDistance: 0,
            cellSize: CGSize(width: 366, height: height),
            horizontalAnchor: .leading,
            isRightToLeft: false,
            alphaCeiling: 1,
            isMagnifiable: true
        )
        let expectedTy = -(height / 2) * (1 - transform.scale)
        XCTAssertEqual(
            transform.translation.height, expectedTy, accuracy: 0.0001,
            "le bas visuel reste ancré : la croissance de la loupe part vers le HAUT, jamais sous le composeur — même compensation que la réduction."
        )
    }

    // MARK: - Règle STRICTE (demande user 17/08 soir)

    func test_magnification_zoneIsExactlyTheFocusBand() {
        XCTAssertEqual(
            FocalPassConstants.magnificationRadiusFactor, 1,
            "la ZONE DE MAGNIFICENCE est la bande de focus EXACTE (±demi-bande) — plus jamais le double : en dehors, échelle strictement 1, zéro résidu de loupe"
        )
        let radius = FocalFocusCurve.focusBandHalfHeight
        XCTAssertEqual(
            geometry.magnification(signedDistance: radius + 1, rowHeight: 100), 1, accuracy: 0.0001,
            "un point hors de la bande n'est JAMAIS magnifié"
        )
    }

    func test_magnification_growthIsCappedInAbsolutePoints() {
        let tall = geometry.transform(
            signedDistance: 0, cellSize: CGSize(width: 366, height: 400),
            horizontalAnchor: .leading, isRightToLeft: false, alphaCeiling: 1, isMagnifiable: true
        )
        let maxAllowed = 1 + FocalPassConstants.magnificationMaxGrowth / 400
        XCTAssertLessThanOrEqual(
            tall.scale, maxAllowed + 0.0001,
            "LIMITE DE TAILLE MAXIMUM : la croissance d'une rangée est plafonnée en POINTS absolus — une grande rangée ne devient jamais énorme, quel que soit le pic"
        )
        XCTAssertGreaterThan(tall.scale, 1, "dans la bande, la loupe s'applique quand même — juste bornée")
    }

    func test_transform_systemRows_areNeverMagnified() {
        let pill = geometry.transform(
            signedDistance: 0, cellSize: CGSize(width: 366, height: 32),
            horizontalAnchor: .leading, isRightToLeft: false, alphaCeiling: 1, isMagnifiable: false
        )
        XCTAssertEqual(
            pill.scale, 1, accuracy: 0.0001,
            "SEULS LES MESSAGES grossissent : pilule de jour, typing, début de conversation ne prennent JAMAIS la loupe (ils gardent la perspective de réduction) — la pilule géante de la capture user est interdite par construction"
        )
        XCTAssertEqual(pill.zPosition, 0, accuracy: 0.0001, "aucune élévation sans loupe")
    }

    // MARK: - zPosition : la rangée magnifiée recouvre ses voisines

    func test_transform_zPosition_liftsTheMagnifiedRow() {
        let atLine = geometry.transform(
            signedDistance: 0, cellSize: CGSize(width: 366, height: 100),
            horizontalAnchor: .leading, isRightToLeft: false, alphaCeiling: 1, isMagnifiable: true
        )
        let far = geometry.transform(
            signedDistance: 400, cellSize: CGSize(width: 366, height: 100),
            horizontalAnchor: .leading, isRightToLeft: false, alphaCeiling: 1, isMagnifiable: true
        )
        XCTAssertGreaterThan(
            atLine.zPosition, far.zPosition,
            "la loupe élève la rangée magnifiée au-dessus de ses voisines — sans quoi elle serait recouverte en grandissant."
        )
        XCTAssertEqual(far.zPosition, 0, accuracy: 0.0001, "hors bande, aucune élévation.")
    }

    func test_focalCellTransform_identityHasNoElevation() {
        XCTAssertEqual(FocalCellTransform.identity.zPosition, 0)
    }

    func test_perspectiveCell_writesAndResetsZPosition() {
        let cell = FocalPerspectiveCell(frame: CGRect(x: 0, y: 0, width: 366, height: 100))
        cell.writeFocalTransform(
            FocalCellTransform(scale: 1.18, alpha: 1, translation: .zero, zPosition: 120)
        )
        XCTAssertEqual(cell.layer.zPosition, 120, "la consigne du pass porte l'élévation jusqu'au layer.")

        cell.prepareForReuse()
        XCTAssertEqual(cell.layer.zPosition, 0, "une cellule recyclée ne doit jamais hériter de l'élévation de son occupant précédent.")
    }

    // MARK: - Réserve trailing : la loupe pleine ne clippe jamais

    func test_trailingReserve_fitsFullWidthMagnifiedRow() {
        let viewport: CGFloat = 390
        let leading: CGFloat = 12
        let reserve = geometry.magnifiedTrailingReserve(viewportWidth: viewport, leadingInset: leading)
        let contentWidth = viewport - leading - reserve
        let pivot = FocalFocusCurve.threadHorizontalPivot * contentWidth
        let renderedRight = leading + pivot + (contentWidth - pivot) * FocalPassConstants.magnificationPeak
        XCTAssertLessThanOrEqual(
            renderedRight, viewport + 0.5,
            "une rangée pleine largeur magnifiée au pic doit tenir dans l'écran — les timestamps du bord droit ne clippent JAMAIS."
        )
        XCTAssertLessThan(reserve, 60, "la réserve reste raisonnable — le fil ne doit pas devenir une colonne étroite.")
        XCTAssertGreaterThan(reserve, 0)
    }

    func test_pass_decorationFollowsElectionEverywhere_notOnlyFullyVisible() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Focal/Scroll/FocalScrollPass.swift")
        let stripped = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertFalse(
            stripped.contains("&& isFullyVisible"),
            "le FOND accentué suit l'élection en continu (spec Magnificence) — un fond coupé par le bord d'écran est naturel, la garde de pleine visibilité protégeait un CADRE ouvert qui n'existe plus"
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
            "en Focal, « Lire plus » n'étend JAMAIS inline (un message de 3 écrans casserait la loupe et l'atterrissage) — le tap est détourné vers la sheet scrollable"
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

    func test_sectionTrailingInset_reservesOnlyInPerspective() {
        let focal = MessageListViewController.sectionTrailingInset(usesPerspective: true, viewportWidth: 390)
        let bubbles = MessageListViewController.sectionTrailingInset(usesPerspective: false, viewportWidth: 390)
        XCTAssertEqual(bubbles, 12, "hors perspective, l'inset historique de 12 est bit-à-bit inchangé.")
        XCTAssertEqual(
            focal,
            geometry.magnifiedTrailingReserve(viewportWidth: 390, leadingInset: 12),
            accuracy: 0.5,
            "en perspective, le provider réserve la place de la loupe pleine — la formule fait foi, jamais un littéral."
        )
    }
}
