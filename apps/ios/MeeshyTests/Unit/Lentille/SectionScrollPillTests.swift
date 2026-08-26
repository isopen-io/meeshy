import XCTest
@testable import Meeshy

/// LWS-6 (contrat §4.3) — `SectionScrollPill`, vue d'affichage pure pilotée
/// par un état `visible`/`texte` injecté. Sa logique testable (opacité,
/// conversion de la durée de fondu) est extraite en fonctions PURES,
/// exercées directement — la loi de VISIBILITÉ (900 ms après le dernier
/// défilement) n'est PAS testée ici : elle appartient à
/// `ScrollTimePillLawTests`/`ScrollActivityVectorTests` (Focal/Core), cette
/// vue ne fait que RENDRE l'état qu'on lui donne.
final class SectionScrollPillTests: XCTestCase {

    // MARK: - Opacité

    func test_opacity_visibleTrue_isFullyOpaque() {
        XCTAssertEqual(SectionScrollPill.opacity(isVisible: true), 1)
    }

    func test_opacity_visibleFalse_isFullyTransparent() {
        XCTAssertEqual(SectionScrollPill.opacity(isVisible: false), 0)
    }

    // MARK: - Conversion fondu ms → s (§4.3 « fondu 250 ms »)

    func test_fadeDurationSeconds_matchesMetricsFadeDurationMsConvertedToSeconds() {
        let expected = LentilleMetrics.Pill.fadeDurationMs / 1_000
        XCTAssertEqual(SectionScrollPill.fadeDurationSeconds, expected)
    }

    func test_fadeDurationSeconds_isPositiveAndSubSecond() {
        // Un fondu de section doit rester bref (< 1 s) — garde de sanité,
        // pas une nouvelle loi : la valeur elle-même vient de LentilleMetrics.
        XCTAssertGreaterThan(SectionScrollPill.fadeDurationSeconds, 0)
        XCTAssertLessThan(SectionScrollPill.fadeDurationSeconds, 1)
    }

    // MARK: - Directive produit — la pilule centrale n'est plus montée

    /// **« On n'a pas besoin de sticker de section central, car les sections
    /// stick sur place quand on les dépasse. »** (porteur produit, 2026-08-23)
    ///
    /// Le défaut que cette directive solde avait été mesuré : le sticker
    /// ÉPINGLÉ affichait « MEESHY TEAM » (x=0, y=122.0, w=402, h=21.3) pendant
    /// que la pilule flottante affichait le MÊME mot (x=160.0, y=130.0,
    /// w=82.0) — deux fois le même libellé, à 8 pt d'écart, la capsule
    /// recouvrant 81 % de la bande du sticker.
    ///
    /// La pilule n'avait AUCUNE règle de coexistence : sa visibilité tient à
    /// la seule loi de défilement (visible au premier événement d'offset,
    /// invisible 900 ms après le dernier). Or « on défile » est exactement
    /// l'état où un sticker EST épinglé — le doublon était donc systématique,
    /// pas accidentel.
    ///
    /// Ce témoin garde le RETRAIT DU MONTAGE, pas la suppression des types :
    /// `SectionScrollPill` et `SectionScrollPillHost` restent dans l'arbre
    /// Xcode (les retirer touche `project.pbxproj`, geste à faire à froid).
    /// Ils sont donc du code NON MONTÉ, et ce test est ce qui empêche qu'on le
    /// remonte par inadvertance.
    func test_sectionPill_isNoLongerMounted_theStickyStickerAlreadySaysIt() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Views/ConversationListView.swift"),
            encoding: .utf8
        )
        let code = AppSourceGuard.stripComments(source)
        XCTAssertFalse(
            code.contains("SectionScrollPillHost("),
            "La pilule de section ne doit plus être montée : le sticker épinglé porte déjà "
            + "le nom de la section, et la pilule le répétait par-dessus lui (81 % de "
            + "recouvrement mesuré). Si ce test rougit, c'est qu'un lot a remonté l'hôte."
        )
    }
}
