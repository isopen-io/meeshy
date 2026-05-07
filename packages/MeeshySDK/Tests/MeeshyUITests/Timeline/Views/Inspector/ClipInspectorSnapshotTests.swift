import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class ClipInspectorSnapshotTests: XCTestCase {

    private func snapshot(_ clip: ClipInspector.ClipSnapshot,
                          presentation: InspectorPresentation = .sheet) -> some View {
        // The inspector renders inside a 360pt-wide column on iPhone (Quick
        // sheet) and a 320pt popover on iPad (Pro). We pin the wider value
        // for the snapshot so both presentations share the same baseline width.
        ClipInspector(
            presentation: presentation,
            clip: clip,
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        .frame(width: 360, alignment: .top)
        .padding(.vertical, 12)
    }

    // MARK: - Variant 1 : video clip selected

    func test_snapshot_inspector_videoSelected() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        let video = ClipInspector.ClipSnapshot(
            id: "v1", displayName: "intro.mp4", kind: .video,
            startTime: 0.5, duration: 5, volume: 0.85,
            fadeInDuration: 0.4, fadeOutDuration: 0.6,
            isLooping: false, isBackground: true
        )
        SnapshotHelpers.assertLightDarkSnapshot(
            of: snapshot(video),
            named: "inspector-videoSelected"
        )
    }

    // MARK: - Variant 2 : audio clip selected

    func test_snapshot_inspector_audioSelected() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        let audio = ClipInspector.ClipSnapshot(
            id: "a1", displayName: "music_bg.m4a", kind: .audio,
            startTime: 0, duration: 8, volume: 0.6,
            fadeInDuration: 0, fadeOutDuration: 0,
            isLooping: true, isBackground: false
        )
        SnapshotHelpers.assertLightDarkSnapshot(
            of: snapshot(audio),
            named: "inspector-audioSelected"
        )
    }

    // MARK: - Variant 3 : text clip selected

    func test_snapshot_inspector_textSelected() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        let text = ClipInspector.ClipSnapshot(
            id: "t1", displayName: "Bienvenue", kind: .text,
            startTime: 1, duration: 3, volume: 1.0,
            fadeInDuration: 0, fadeOutDuration: 0,
            isLooping: false, isBackground: false
        )
        SnapshotHelpers.assertLightDarkSnapshot(
            of: snapshot(text),
            named: "inspector-textSelected"
        )
    }

    // MARK: - Variant 4 : no selection (popover empty state)

    func test_snapshot_inspector_noSelection() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        // The "no selection" state is modeled as a placeholder snapshot with
        // zeroed values + an empty displayName. Production renders a hint
        // ("Sélectionnez un clip pour l'éditer") which the snapshot locks in.
        let empty = ClipInspector.ClipSnapshot(
            id: "", displayName: "", kind: .video,
            startTime: 0, duration: 0, volume: 0,
            fadeInDuration: 0, fadeOutDuration: 0,
            isLooping: false, isBackground: false
        )
        SnapshotHelpers.assertLightDarkSnapshot(
            of: snapshot(empty, presentation: .popover),
            named: "inspector-noSelection"
        )
    }
}
