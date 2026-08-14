import XCTest
@testable import MeeshyUI

/// Retour user 2026-08-14 : « le bouton (+) de la liste de conversation et
/// (map) des feed sortent du viewport… il faut les décaler vers la gauche pour
/// être totalement visibles ».
///
/// Les DEUX écrans concernés sont exactement les deux qui posent un
/// `titleAccessory` (la trail de story compacte). Ce n'est pas une
/// coïncidence : la fente du titre réclame `maxWidth: .infinity` AVEC une
/// priorité de layout, donc elle était servie AVANT les boutons, qui
/// débordaient de la barre par la droite. Les actions sont du chrome de
/// taille fixe — c'est à elles d'être servies en premier, et à la trail,
/// élastique, de prendre ce qui reste.
final class CollapsibleHeaderTrailingActionsTests: XCTestCase {

    private func headerSource() throws -> String {
        ComposerSourceGuard.stripComments(
            try String(
                contentsOf: ComposerSourceGuard.packageRoot
                    .appendingPathComponent("Sources/MeeshyUI/Navigation/CollapsibleHeader.swift"),
                encoding: .utf8
            )
        )
    }

    /// La marge droite des actions s'ajoute au padding de la rangée : le
    /// total doit atteindre la marge standard iOS (16 pt), sans quoi un
    /// cercle de verre de 40 pt affleure le bord de l'écran.
    func test_trailingActionsInset_bringsTheRowMarginToTheStandardSixteenPoints() {
        XCTAssertGreaterThan(CollapsibleHeaderMetrics.trailingActionsInset, 0)
        XCTAssertGreaterThanOrEqual(
            CollapsibleHeaderMetrics.barHorizontalPadding + CollapsibleHeaderMetrics.trailingActionsInset,
            16
        )
    }

    func test_trailingActions_areLaidOutBeforeTheElasticTitleSlot() throws {
        let code = try headerSource()
        let call = try XCTUnwrap(code.range(of: "trailing()"))
        let afterCall = String(code[call.upperBound...])
        let priority = try XCTUnwrap(
            afterCall.range(of: "layoutPriority(2)"),
            "Les boutons d'action doivent porter une priorité de layout SUPÉRIEURE " +
            "à celle de la fente du titre (1 quand elle porte la trail) — sinon la " +
            "trail élastique est servie d'abord et les pousse hors de la barre."
        )
        XCTAssertLessThan(
            afterCall.distance(from: afterCall.startIndex, to: priority.lowerBound), 200,
            "…et elle doit être posée SUR les actions, pas ailleurs dans le fichier."
        )
    }

    func test_trailingActions_keepTheirOwnMarginFromTheScreenEdge() throws {
        let code = try headerSource()
        XCTAssertTrue(
            code.contains(".padding(.trailing, CollapsibleHeaderMetrics.trailingActionsInset)"),
            "La marge droite des actions doit venir de la constante partagée : " +
            "posée dans chaque écran, elle dérive (12 pt côté feed iPad, rien " +
            "ailleurs), et c'est cette dérive qui a laissé (+) et (map) au bord."
        )
    }
}
