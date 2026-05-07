import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI

@MainActor
final class VideoClipBarSnapshotTests: XCTestCase {

    private func solidThumb(_ color: UIColor, size: CGSize = CGSize(width: 30, height: 44)) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    private func makeBar(
        title: String = "intro.mp4",
        duration: Float = 4,
        fadeIn: Float = 0,
        fadeOut: Float = 0,
        isSelected: Bool = false,
        isLocked: Bool = false,
        startTime: Float = 1,
        frames: [UIImage]? = nil
    ) -> some View {
        VideoClipBar(
            clipId: "clip-1",
            title: title,
            startTime: startTime,
            duration: duration,
            fadeIn: fadeIn,
            fadeOut: fadeOut,
            isSelected: isSelected,
            isLocked: isLocked,
            isDark: false,            // overridden by environment in helper
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 44,
            frames: frames ?? [solidThumb(.systemBlue), solidThumb(.systemTeal),
                               solidThumb(.systemIndigo), solidThumb(.systemPurple)],
            onTap: {}, onDoubleTap: {}, onLongPress: {},
            onTrimStartDelta: { _ in }, onTrimEndDelta: { _ in }, onMoveDelta: { _ in }
        )
        .frame(width: 390, height: 60, alignment: .leading)
        .padding(.vertical, 8)
    }

    // MARK: - Variant 1 : trimmed (short duration relative to slot)

    func test_snapshot_videoClip_trimmed() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(title: "trimmed.mp4", duration: 2, startTime: 1),
            named: "videoClip-trimmed"
        )
    }

    // MARK: - Variant 2 : fade in active

    func test_snapshot_videoClip_fadeIn() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(title: "fade_in.mp4", fadeIn: 0.8),
            named: "videoClip-fadeIn"
        )
    }

    // MARK: - Variant 3 : fade out active

    func test_snapshot_videoClip_fadeOut() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(title: "fade_out.mp4", fadeOut: 1.0),
            named: "videoClip-fadeOut"
        )
    }

    // MARK: - Variant 4 : selected

    func test_snapshot_videoClip_selected() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(title: "selected.mp4", isSelected: true),
            named: "videoClip-selected"
        )
    }

    // MARK: - Variant 5 : locked

    func test_snapshot_videoClip_locked() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(title: "locked.mp4", isLocked: true),
            named: "videoClip-locked"
        )
    }
}
