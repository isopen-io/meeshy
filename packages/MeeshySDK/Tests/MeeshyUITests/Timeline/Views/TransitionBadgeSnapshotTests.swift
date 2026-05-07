import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class TransitionBadgeSnapshotTests: XCTestCase {

    /// Centers the small 18pt diamond inside a fixed slot so the snapshot has
    /// a stable bounding box. The badge itself is positioned via `.position`
    /// in production — we replicate that anchor in the test slot.
    private func host(_ badge: TransitionBadge) -> some View {
        ZStack {
            Color.clear
            badge
        }
        .frame(width: 96, height: 60)
        .padding(.vertical, 8)
    }

    private func makeBadge(
        kind: StoryTransitionKind,
        duration: Float = 0.5,
        isSelected: Bool = false,
        anchorX: CGFloat = 48
    ) -> TransitionBadge {
        TransitionBadge(
            id: "t-\(kind)",
            kind: kind,
            duration: duration,
            isSelected: isSelected,
            isDark: false,        // overridden by environment in helper
            anchorX: anchorX,
            laneHeight: 44,
            onTap: {}, onLongPress: {}, onDurationDelta: { _ in }
        )
    }

    // MARK: - Variant 1 : crossfade idle

    func test_snapshot_transition_crossfade() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(makeBadge(kind: .crossfade)),
            named: "transition-crossfade"
        )
    }

    // MARK: - Variant 2 : dissolve idle

    func test_snapshot_transition_dissolve() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(makeBadge(kind: .dissolve)),
            named: "transition-dissolve"
        )
    }

    // MARK: - Variant 3 : hover (rendered as the selected glow ring)

    func test_snapshot_transition_hover() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        // The badge does not expose a separate "hover" state on iOS touch ;
        // hover semantics map onto the `isSelected` glow + the duration label.
        // We capture that visual state under the hover variant name so a
        // future Catalyst pointer-hover overlay can be diffed against it.
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(makeBadge(kind: .crossfade, duration: 0.75, isSelected: true)),
            named: "transition-hover"
        )
    }

    // MARK: - Variant 4 : active drag (longer duration → wider visual cue)

    func test_snapshot_transition_activeDrag() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        // Drag-in-progress is conveyed by a longer duration (1.2s) which the
        // badge represents through the duration tooltip rendered above ; we
        // pin the anchor to the right edge to mimic the user dragging right.
        SnapshotHelpers.assertLightDarkSnapshot(
            of: host(makeBadge(kind: .crossfade, duration: 1.2, isSelected: true, anchorX: 80)),
            named: "transition-activeDrag"
        )
    }
}
