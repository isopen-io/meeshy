import XCTest
import SwiftUI
@testable import Meeshy

/// #5718 — **une rangée ÉLUE sans ligne basse ne réserve plus aucune hauteur
/// sous son texte**, et `focusStrip`/`focusStampChip` (la bande superposée en
/// bas de la carte de focus) débordent alors dessus.
///
/// Miroir iOS du défaut 1 déjà fermé côté web par #5648
/// (`apps/web-v3/src/components/focal-row.tsx:528-558`, `data-focus-reserve`) :
/// même géométrie (`overlay(alignment: .bottom)` + `offset(y: overhang)`),
/// même défaut (rien n'absorbe le débord quand `flagAndReactionsRow` ne se
/// monte pas), même correction (réserver, sur la rangée élue SEULEMENT, la
/// hauteur qu'une ligne basse réelle aurait autrement absorbée).
///
/// R15 (contrat Focal §7) : aucun snapshot, aucun test de rendu — la règle se
/// prouve par la FORMULE qui la produit, extraite en fonction pure, jamais
/// par un `if` inline qu'aucune assertion ne peut atteindre.
@MainActor
final class FocalRowFocusReserveTests: XCTestCase {

    // MARK: - La formule

    /// Sur les cotes ACTUELLES (`chipHeight: 24`, `overhang: 15`), le débord
    /// mesuré côté web était de 9 px sur la même géométrie — la formule doit
    /// rendre exactement ce nombre, pas une valeur voisine.
    func test_surLesCotesActuelles_reserveExactementLeDebordMesureCoteWeb() {
        XCTAssertEqual(
            FocalRow.focusOverlayReserveHeight(
                chipHeight: FocalMetrics.FocusStrip.chipHeight,
                overhang: FocalMetrics.FocusStrip.overhang
            ),
            9
        )
    }

    /// La formule annule le débord au point près, quelles que soient les
    /// deux cotes : `overhang` en moins que `chipHeight` doit rendre
    /// exactement leur différence.
    func test_laFormule_estLaDifferenceEntreChipHeightEtOverhang() {
        XCTAssertEqual(FocalRow.focusOverlayReserveHeight(chipHeight: 30, overhang: 10), 20)
        XCTAssertEqual(FocalRow.focusOverlayReserveHeight(chipHeight: 24, overhang: 24), 0)
    }

    /// Un `overhang` supérieur ou égal à `chipHeight` ne débande jamais sur
    /// le texte (la bande est alors entière sous le bord bas de la rangée) —
    /// la réserve ne doit jamais devenir négative, ce qui rétrécirait la
    /// rangée au lieu de la faire grandir.
    func test_quandLOverhangDepasseLaHauteurDeLaPuce_laReserveResteNulle_jamaisNegative() {
        XCTAssertEqual(FocalRow.focusOverlayReserveHeight(chipHeight: 24, overhang: 40), 0)
    }

    /// Couverture paramétrée sur plusieurs échelles de cotes — la formule ne
    /// dépend QUE de la différence, jamais d'une des deux valeurs isolément.
    func test_laFormule_neDependQueDeLaDifference_surPlusieursEchelles() {
        let cas: [(chipHeight: CGFloat, overhang: CGFloat, attendu: CGFloat)] = [
            (16, 10, 6),
            (40, 5, 35),
            (24, 15, 9),   // les cotes actuelles de FocalMetrics.FocusStrip
            (12, 12, 0),
        ]
        for c in cas {
            XCTAssertEqual(
                FocalRow.focusOverlayReserveHeight(chipHeight: c.chipHeight, overhang: c.overhang),
                c.attendu
            )
        }
    }

    // MARK: - Garde source : la réserve n'est posée QUE sur la rangée élue sans ligne basse

    private func rowSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// La branche de réserve existe, se pose en `else` de `mountsBottomLine`
    /// (jamais en plus d'une ligne basse réelle, qui absorbe déjà son propre
    /// débord) et ne se monte que pour la rangée ÉLUE.
    func test_focalRow_reserveUnPlaceholder_seulementSiElueEtSansLigneBasse() throws {
        let stripped = AppSourceGuard.stripComments(try rowSource())
        XCTAssertTrue(
            stripped.contains("} else if input.isFocused {"),
            "la réserve doit être l'alternative de `if mountsBottomLine`, jamais une condition à part qui pourrait se monter en même temps que la ligne basse"
        )
        XCTAssertTrue(
            stripped.contains("Self.focusOverlayReserveHeight("),
            "la hauteur réservée doit venir de la fonction pure extraite, jamais d'un calcul recopié inline"
        )
        XCTAssertTrue(
            stripped.contains(".accessibilityHidden(true)"),
            "le placeholder ne porte ni texte ni contrôle : VoiceOver ne doit rien en dire"
        )
    }

    /// Garde source (R15) : la formule ne doit jamais réapparaître en
    /// littéral autonome dans `FocalRow.swift` — elle passe TOUJOURS par
    /// `FocalMetrics.FocusStrip.chipHeight`/`.overhang`, jamais par une
    /// copie à la main qui pourrait diverger des cotes réelles.
    func test_laReserve_neReecritJamaisLesCotesEnDur() throws {
        let stripped = AppSourceGuard.stripComments(try rowSource())
        guard let range = stripped.range(of: "static func focusOverlayReserveHeight") else {
            return XCTFail("focusOverlayReserveHeight introuvable dans FocalRow.swift")
        }
        let callSite = stripped[stripped.startIndex..<range.lowerBound]
        XCTAssertTrue(
            callSite.contains("FocalMetrics.FocusStrip.chipHeight") && callSite.contains("FocalMetrics.FocusStrip.overhang"),
            "l'appel doit passer les cotes nommées, pas des littéraux recopiés à la main"
        )
    }
}
