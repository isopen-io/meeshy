import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class RulerViewSnapshotTests: XCTestCase {

    private func host(zoom: CGFloat, totalDuration: Float) -> some View {
        // The ruler is laid out in a horizontal scroll context in production.
        // For deterministic snapshots we measure the natural ruler width at
        // the requested zoom and clip it to the iPhone width baseline.
        let geometry = TimelineGeometry(zoomScale: zoom)
        let naturalWidth = geometry.width(for: totalDuration)
        let snapshotWidth = min(naturalWidth, 390)
        return RulerView(
            totalDuration: totalDuration,
            geometry: geometry,
            isDark: false,        // overridden by environment in helper
            height: 24,
            onTapTime: { _ in }
        )
        .frame(width: snapshotWidth, height: 36, alignment: .leading)
        .padding(.vertical, 6)
    }

    // MARK: - Variant 1 : zoom 0.3x (5s ticks, ms/s formatting on whole seconds)

    func test_snapshot_ruler_zoom_03x() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(zoom: 0.3, totalDuration: 60),
            named: "ruler-zoom-0.3x"
        )
    }

    // MARK: - Variant 2 : zoom 1x (1s ticks)

    func test_snapshot_ruler_zoom_1x() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(zoom: 1.0, totalDuration: 10),
            named: "ruler-zoom-1x"
        )
    }

    // MARK: - Variant 3 : zoom 5x (0.2s ticks, fractional seconds visible)

    func test_snapshot_ruler_zoom_5x() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(zoom: 5.0, totalDuration: 4),
            named: "ruler-zoom-5x"
        )
    }

    // MARK: - Variant 4 : zoom 15x (50ms ticks, ms formatting)

    func test_snapshot_ruler_zoom_15x() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(zoom: 15.0, totalDuration: 2),
            named: "ruler-zoom-15x"
        )
    }
}
