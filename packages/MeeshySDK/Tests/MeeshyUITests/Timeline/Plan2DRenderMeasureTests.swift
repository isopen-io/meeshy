import XCTest
import SwiftUI
@testable import MeeshySDK
@testable import MeeshyUI

/// Banc de coût du plan 2D (D4) — mesure le rendu HORS ÉCRAN
/// (`ImageRenderer`) d'un plan représentatif du pire cas plausible : 30
/// pistes (borne du schéma v3, ≤ 60 objets/scène — P15) dont 10 timées
/// portant chacune 6 keyframes, aux deux zooms.
///
/// Le seuil `provisionalRegressionBudgetSeconds` est un GARDE-FOU DE
/// RÉGRESSION, NON-SPEC (revue Fable n°11 : aucun chiffre p50 n'existe dans
/// la spec) — il attrape une régression flagrante sur simulateur, rien de
/// plus, et ne prétend JAMAIS être le budget d'usage produit. Recalé
/// (revue DoD, 2026-08-21) sur le coût mesuré (~1-2,5 ms simulateur et
/// device confondus) avec une marge ×4-6, contre ×30-50 avant. LA MESURE
/// D'USAGE reste la mesure DEVICE (Step 2 de D4) : celle obtenue à ce jour
/// (iPhone 16 Pro Max, A18 Pro) est un appareil PLAFOND, pas le plancher A11
/// exigé par la spec — le budget d'usage plancher n'est donc PAS validé ;
/// voir la ligne P0 D4 (`2026-08-19-meeshy-composer-views.html`) pour
/// l'extrapolation plancher et le verdict STOP (Step 2) qui en découle.
@MainActor
final class Plan2DRenderMeasureTests: XCTestCase {

    // MARK: - Fixture : pire cas plausible (P15 — plafond 60 objets/scène)

    private static func timedTrack(index: Int) -> Plan2DTrack {
        Plan2DTrack(
            id: "timed-\(index)",
            label: "Aa piste \(index)",
            plane: .fg,
            z: 100 - index,
            bar: .timed(start: Double(index), end: Double(index) + 6),
            keyframes: (0..<6).map { k in
                Plan2DKeyframe(id: "timed-\(index)-kf-\(k)", time: Double(index) + Double(k))
            }
        )
    }

    private static func ghostTrack(index: Int, plane: TrackPlane) -> Plan2DTrack {
        Plan2DTrack(id: "ghost-\(plane)-\(index)", label: "\u{263A}", plane: plane,
                    z: 100 - index, bar: .ghost)
    }

    /// 30 pistes : 10 timées à 6 losanges (fg), 10 fantômes content, 10
    /// fantômes bg — les trois plans et les deux natures de barre (`.timed`/
    /// `.ghost`) rendues dans le MÊME passe Canvas, comme un plan chargé réel.
    private static func makeTracks() -> [Plan2DTrack] {
        (0..<10).map(timedTrack(index:))
            + (0..<10).map { ghostTrack(index: $0, plane: .content) }
            + (0..<10).map { ghostTrack(index: $0, plane: .bg) }
    }

    // MARK: - Rendu hors écran

    private func render(zoom: Plan2DZoom) -> UIImage? {
        let view = Plan2DView(
            tracks: Self.makeTracks(),
            zoom: zoom,
            laneWidth: 350,
            slideDuration: 30,
            isDark: false,
            onSelectTrack: { _ in },
            onSelectKeyframe: { _ in },
            onReorder: { _, _ in },
            onTrimStart: { _, _ in },
            onTrimEnd: { _, _ in },
            onMove: { _, _ in },
            onMoveEnded: { _ in },
            onScrollLockChanged: { _ in }
        )
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        return renderer.uiImage
    }

    // MARK: - Le rendu hors écran produit bien une image, aux deux zooms

    func test_render_bothZooms_producesANonEmptyImage() {
        for zoom in Plan2DZoom.allCases {
            let image = render(zoom: zoom)
            XCTAssertNotNil(image, "Le rendu hors écran de 30 pistes doit produire une image (\(zoom))")
            XCTAssertGreaterThan(image?.size.width ?? 0, 0, "Largeur non nulle attendue (\(zoom))")
            XCTAssertGreaterThan(image?.size.height ?? 0, 0, "Hauteur non nulle attendue (\(zoom))")
        }
    }

    // MARK: - Garde-fou de régression (recalé sur simulateur+device, revue DoD 2026-08-21)

    /// 10 ms — recalé (revue DoD, 2026-08-21) sur le coût mesuré : ~1 à 2,5 ms
    /// sur simulateur (RSD jusqu'à ~17 %) et 1,62-2,53 ms sur device (iPhone
    /// 16 Pro Max, A18 Pro — un appareil PLAFOND). Marge ×4-6 sur le pic
    /// observé, assez pour attraper une régression flagrante sans flakiness
    /// de bruit machine. Ce nombre n'a TOUJOURS AUCUNE valeur de budget
    /// produit — c'est une garde de RÉGRESSION, pas un budget d'usage : le
    /// budget d'usage au plancher A11 reste NON validé (voir la ligne P0 D4).
    private static let provisionalRegressionBudgetSeconds: Double = 0.01

    func test_render_thirtyTracks_bothZooms_staysUnderProvisionalBudget() {
        for zoom in Plan2DZoom.allCases {
            let start = CFAbsoluteTimeGetCurrent()
            _ = render(zoom: zoom)
            let elapsed = CFAbsoluteTimeGetCurrent() - start
            XCTAssertLessThan(
                elapsed, Self.provisionalRegressionBudgetSeconds,
                "Rendu \(zoom) à \(elapsed)s — au-delà du garde-fou de régression de "
                    + "\(Self.provisionalRegressionBudgetSeconds)s (non-spec ; le budget d'usage "
                    + "plancher A11 reste distinct, voir la ligne P0 D4)"
            )
        }
    }

    // MARK: - Métrique XCTest (baseline Xcode, en complément du seuil ci-dessus)

    func test_render_thirtyTracks_measuresRenderCost() {
        measure(metrics: [XCTClockMetric()]) {
            for zoom in Plan2DZoom.allCases {
                _ = render(zoom: zoom)
            }
        }
    }
}
