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

    /// La marge droite des actions s'ajoute au padding de la rangée. 16 pt —
    /// la marge d'un TEXTE — ne suffisent pas : le chrome du header est fait de
    /// disques de verre de 40 pt, et un disque affleure là où une ligne de texte
    /// respire encore (retour user 2026-08-15, second signalement). La gouttière
    /// des ronds est celle du chrome flottant : 20 pt
    /// (`FreeFloatingButtonsContainer.minEdgePadding`), la seule marge de rond
    /// que l'utilisateur n'a jamais signalée.
    func test_trailingActionsInset_bringsTheRowMarginToTheRoundChromeGutter() {
        XCTAssertGreaterThan(CollapsibleHeaderMetrics.trailingActionsInset, 0)
        XCTAssertGreaterThanOrEqual(
            CollapsibleHeaderMetrics.barHorizontalPadding + CollapsibleHeaderMetrics.trailingActionsInset,
            CollapsibleHeaderMetrics.roundChromeEdgeGutter
        )
        XCTAssertEqual(CollapsibleHeaderMetrics.roundChromeEdgeGutter, 20)
    }

    /// Le défaut RÉSIDUEL du 14/08 : `layoutPriority(2)` fait servir les actions
    /// en premier, mais l'écart entre la trail et elles restait porté par un
    /// `Spacer(minLength: 8)` de priorité 0 — donc servi APRÈS la fente
    /// élastique, qui a déjà pris tout le reste. Un `Spacer` à qui l'on propose
    /// 0 rend quand même son `minLength` : la rangée dépasse de 8 pt la largeur
    /// proposée, la barre se recentre, et les actions perdent la moitié de cet
    /// excédent sur leur marge droite. L'écart doit être réservé AVEC les
    /// actions, où il ne peut rien faire déborder.
    func test_theGapToTheActions_isReservedWithThemRatherThanBySpacer() throws {
        let code = try headerSource()
        XCTAssertFalse(
            code.contains("Spacer(minLength: 8)"),
            "Un `Spacer` de priorité 0 et de longueur minimale non nulle, servi " +
            "après une fente `maxWidth: .infinity`, fait déborder la rangée de " +
            "sa largeur proposée — et pousse les actions vers le bord."
        )
        XCTAssertTrue(
            code.contains(".padding(.leading, CollapsibleHeaderMetrics.titleActionsGap)"),
            "L'écart titre ↔ actions doit être un padding des ACTIONS : réservé " +
            "avec elles au titre de la priorité 2, il ne peut pas élargir la " +
            "rangée."
        )
    }

    /// Toute la chaîne de modificateurs des actions — écart et marge de bord
    /// compris — doit rester SOUS la priorité 2, sinon la part réservée ne
    /// couvre pas les paddings et la fente élastique les reprend.
    func test_theActionsGapAndEdgeMargin_sitUnderTheirLayoutPriority() throws {
        let code = try headerSource()
        let call = try XCTUnwrap(code.range(of: "trailing()"))
        let afterCall = String(code[call.upperBound...])
        let priority = try XCTUnwrap(afterCall.range(of: "layoutPriority(2)"))
        let afterPriority = String(afterCall[priority.upperBound...])
        for padding in [
            ".padding(.leading, CollapsibleHeaderMetrics.titleActionsGap)",
            ".padding(.trailing, CollapsibleHeaderMetrics.trailingActionsInset)"
        ] {
            let range = try XCTUnwrap(afterPriority.range(of: padding), "\(padding) manquant")
            XCTAssertLessThan(
                afterPriority.distance(from: afterPriority.startIndex, to: range.lowerBound), 300,
                "\(padding) doit suivre immédiatement `layoutPriority(2)`."
            )
        }
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
