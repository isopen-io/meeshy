import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class AudioClipBarSnapshotTests: XCTestCase {

    private static let waveSamples: [Float] = stride(from: 0.0, to: 1.0, by: 0.05).map {
        // Pseudo-natural envelope : low-mid-low-mid pattern around the slot.
        Float(0.25 + 0.55 * abs(sin($0 * .pi * 4)))
    }

    private func makeBar(
        title: String = "music_bg.m4a",
        volume: Float = 0.85,
        muted: Bool = false,
        samples: [Float]
    ) -> some View {
        AudioClipBar(
            clipId: "audio-1",
            title: title,
            startTime: 0,
            duration: 4,
            volume: volume,
            isMuted: muted,
            isSelected: false,
            isLocked: false,
            isDark: false,            // overridden by environment in helper
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 44,
            waveformSamples: samples,
            onTap: {}, onDoubleTap: {}, onLongPress: {},
            onMoveDelta: { _ in }
        )
        .frame(width: 390, height: 60, alignment: .leading)
        .padding(.vertical, 8)
    }

    // MARK: - Variant 1 : with waveform

    func test_snapshot_audioClip_withWaveform() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(samples: Self.waveSamples),
            named: "audioClip-withWaveform"
        )
    }

    // MARK: - Variant 2 : no waveform (samples empty — common during decode)

    func test_snapshot_audioClip_noWaveform() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(samples: []),
            named: "audioClip-noWaveform"
        )
    }

    // MARK: - Variant 3 : muted

    func test_snapshot_audioClip_muted() throws {
        try XCTSkipIf(true, "Snapshot baselines must be recorded locally — flip record: true in SnapshotHelpers + run once to generate, then commit __Snapshots__/")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(muted: true, samples: Self.waveSamples),
            named: "audioClip-muted"
        )
    }
}
