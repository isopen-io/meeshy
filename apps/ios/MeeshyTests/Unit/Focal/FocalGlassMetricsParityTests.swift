import XCTest
@testable import Meeshy

/// #8147 — « le rendu doit être identique pour iOS, web et Android » : les
/// cotes du bloc de verre Focal sont rejouées contre le miroir JSON de
/// `packages/shared/utils/focal-metrics.ts`
/// (`fixtures/long-message/focal-metrics.json`, bundle de tests).
final class FocalGlassMetricsParityTests: XCTestCase {

    private struct SharedMetrics: Decodable {
        let glassRadius: Double
        let glassHorizontalInset: Double
        let glassVerticalInset: Double
        let loupeMarginVertical: Double
        let loupeMarginHorizontal: Double
        let loupeGain: Double
        let neighborOpacity: Double
        let enterDurationMs: Double
        let flattenDurationMs: Double
        let expandDurationMs: Double
    }

    private func sharedMetrics() throws -> SharedMetrics {
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "focal-metrics", withExtension: "json", subdirectory: "fixtures/long-message"),
            "focal-metrics.json introuvable sous fixtures/long-message/ — vérifier la ressource `packages/shared/fixtures` de project.yml"
        )
        return try JSONDecoder().decode(SharedMetrics.self, from: Data(contentsOf: url))
    }

    func test_glassGeometry_matchesTheSharedTokens() throws {
        let shared = try sharedMetrics()
        XCTAssertEqual(Double(FocalScrollPerspective.focusCardCornerRadius), shared.glassRadius)
        XCTAssertEqual(Double(FocalScrollPerspective.focusCardHorizontalInset), shared.glassHorizontalInset)
        XCTAssertEqual(Double(FocalScrollPerspective.focusCardInnerMargin), shared.glassVerticalInset)
        XCTAssertEqual(Double(FocalMetrics.FocusCard.marginVertical), shared.loupeMarginVertical)
        XCTAssertEqual(Double(FocalMetrics.Row.paddingHorizontal), shared.loupeMarginHorizontal)
        XCTAssertEqual(Double(FocalMetrics.Focus.loupeGain), shared.loupeGain, accuracy: 1e-9)
    }

    func test_neighboursAndTempos_matchTheSharedTokens() throws {
        let shared = try sharedMetrics()
        XCTAssertEqual(Double(FocalScrollPerspective.alphaFloor), shared.neighborOpacity, accuracy: 1e-9)
        XCTAssertEqual(FocalMetrics.Scene.enterDuration * 1000, shared.enterDurationMs, accuracy: 1e-6)
        XCTAssertEqual(FocalMetrics.Scene.flattenDuration * 1000, shared.flattenDurationMs, accuracy: 1e-6)
        XCTAssertEqual(FocalMetrics.Focus.expandDuration * 1000, shared.expandDurationMs, accuracy: 1e-6)
    }
}
