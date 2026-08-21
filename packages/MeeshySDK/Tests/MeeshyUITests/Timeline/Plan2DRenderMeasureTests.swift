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
/// RÉGRESSION PROVISOIRE ET NON-SPEC (revue Fable n°11 : aucun chiffre p50
/// n'existe dans la spec) — il attrape une régression flagrante sur
/// simulateur, rien de plus. LA MESURE QUI COMPTE est la mesure DEVICE
/// (Step 2 de D4, chronométrée hors XCTest, chiffres consignés au commit) :
/// c'est elle, et elle seule, qui recale ce seuil ou déclenche le STOP de
/// lot documenté en Step 3 si le budget d'usage casse au scrub.
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
            onMoveEnded: { _ in }
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

    // MARK: - Garde-fou de régression PROVISOIRE (recalé sur la mesure device, Step 2)

    /// 50 ms — large à dessein (mesure simulateur observée : ~1 à 1,5 ms sur
    /// iPhone 16 Pro/iOS 18.2 pour les 30 pistes, aux deux zooms — marge
    /// ×30-50). Ce nombre n'a AUCUNE valeur de spec, il n'existe que pour
    /// attraper une régression flagrante avant que la mesure device
    /// (Step 2) ne fasse foi. Ne JAMAIS le lire comme un budget produit.
    private static let provisionalRegressionBudgetSeconds: Double = 0.05

    func test_render_thirtyTracks_bothZooms_staysUnderProvisionalBudget() {
        for zoom in Plan2DZoom.allCases {
            let start = CFAbsoluteTimeGetCurrent()
            _ = render(zoom: zoom)
            let elapsed = CFAbsoluteTimeGetCurrent() - start
            XCTAssertLessThan(
                elapsed, Self.provisionalRegressionBudgetSeconds,
                "Rendu \(zoom) à \(elapsed)s — au-delà du garde-fou provisoire de "
                    + "\(Self.provisionalRegressionBudgetSeconds)s (non-spec, RECALÉ par la mesure "
                    + "device, Step 2 de D4)"
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
