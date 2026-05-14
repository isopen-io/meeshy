import XCTest
import SwiftUI
@testable import MeeshyUI

// MARK: - Snapshot record workflow
//
// This file uses `swift-snapshot-testing` (v1.17.6) via `SnapshotHelpers`.
// The library's default record mode is `.missing` : the first time a test
// runs on a fresh checkout, the baseline PNG is written to `__Snapshots__/`
// and the test reports a single failure (with the message
// "Automatically recorded snapshot: …"). Re-run the test once and it now
// asserts cleanly against the freshly recorded baseline. Commit the PNGs.
//
// To force re-recording after an intentional UI change, run :
//   ./scripts/record-snapshot-baselines.sh
// (this exports `SNAPSHOT_TESTING_RECORD=all` and runs the suite).
//
// Do NOT add `XCTSkipIf(true)` back to these tests — that yields zero
// visual regression coverage and silently masks rendering bugs.

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

    func test_snapshot_audioClip_withWaveform() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(samples: Self.waveSamples),
            named: "audioClip-withWaveform"
        )
    }

    // MARK: - Variant 2 : no waveform (samples empty — common during decode)

    func test_snapshot_audioClip_noWaveform() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(samples: []),
            named: "audioClip-noWaveform"
        )
    }

    // MARK: - Variant 3 : muted

    func test_snapshot_audioClip_muted() {
        SnapshotHelpers.assertLightDarkSnapshot(
            of: makeBar(muted: true, samples: Self.waveSamples),
            named: "audioClip-muted"
        )
    }
}
