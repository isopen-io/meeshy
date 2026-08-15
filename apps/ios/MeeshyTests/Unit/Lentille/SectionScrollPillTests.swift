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
}
