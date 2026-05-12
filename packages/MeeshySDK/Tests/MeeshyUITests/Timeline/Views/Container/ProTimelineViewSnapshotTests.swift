import XCTest
import SwiftUI
import MeeshySDK
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

// MARK: - Known production bug surfaced by this suite
//
// `AudioClipBar.waveform` (Sources/MeeshyUI/Story/Timeline/Views/Track/
// AudioClipBar.swift, line ~105) computes `count = max(samples.count, 1)`
// to "always show at least one bar", then iterates `ForEach(0..<count)`
// and indexes `samples[i]`. When `samples` is empty, `count` becomes 1
// but `samples[0]` is out-of-range → `Swift/ContiguousArrayBuffer.swift:675:
// Fatal error: Index out of range`.
//
// The same bug breaks `QuickTimelineViewSnapshotTests.test_snapshot_quick_deployed`
// and `AudioClipBarSnapshotTests.test_snapshot_audioClip_noWaveform`
// (their baselines are missing from `__Snapshots__/` for the same reason).
//
// Workaround applied here: every `StoryAudioPlayerObject` fixture below
// carries a non-empty `waveformSamples` array, which is what a real
// audio clip in the editor always has (samples are extracted at
// composition time — see `packages/MeeshySDK/CLAUDE.md` Audio Pipeline).
// The empty-array edge case is a production bug tracked separately.

@MainActor
final class ProTimelineViewSnapshotTests: XCTestCase {

    /// Stable, deterministic waveform shape used by the audio fixture below.
    /// Mirrors the `AudioClipBarSnapshotTests.waveSamples` pattern so the
    /// rendered bars match the look of an actual decoded audio clip.
    /// Working around the empty-array crash in `AudioClipBar.waveform` —
    /// see file-level note above.
    private static let waveformFixture: [Float] = [
        0.10, 0.20, 0.35, 0.50, 0.65, 0.80, 0.70, 0.55,
        0.45, 0.30, 0.40, 0.55, 0.70, 0.85, 0.90, 0.75,
        0.60, 0.50, 0.40, 0.30, 0.20, 0.30, 0.45, 0.60,
        0.70, 0.55, 0.40, 0.30, 0.25, 0.20, 0.15, 0.10
    ]

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        vm.setMode(.pro)
        return vm
    }

    private func projectWithEditorialContent() -> TimelineProject {
        var video1 = StoryMediaObject(id: "v1", postMediaId: "v1", kind: .video, aspectRatio: 1.0)
        video1.startTime = 0; video1.duration = 4
        var video2 = StoryMediaObject(id: "v2", postMediaId: "v2", kind: .video, aspectRatio: 1.0)
        video2.startTime = 4; video2.duration = 4
        // waveformSamples MUST be non-empty — see file-level "Known production bug" note.
        var audio = StoryAudioPlayerObject(
            id: "a1",
            postMediaId: "a1",
            waveformSamples: Self.waveformFixture
        )
        audio.startTime = 0; audio.duration = 8; audio.volume = 0.7
        var text = StoryTextObject(id: "t1", text: "Story")
        text.startTime = 1; text.duration = 3
        let crossfade = StoryClipTransition(
            fromClipId: "v1", toClipId: "v2", kind: .crossfade,
            duration: 0.5, easing: .linear
        )
        return TimelineProject(
            slideId: "slide-pro",
            slideDuration: 10,
            mediaObjects: [video1, video2],
            audioPlayerObjects: [audio],
            textObjects: [text],
            clipTransitions: [crossfade]
        )
    }

    // MARK: - Variant 1 : iPad landscape, inspector closed

    func test_snapshot_pro_iPadLandscape_inspectorClosed() {
        let vm = makeViewModel(project: projectWithEditorialContent())
        SnapshotHelpers.assertLightDarkSnapshot(
            of: ProTimelineView(viewModel: vm),
            device: .iPadPro11Landscape,
            named: "pro-iPadLandscape-inspectorClosed"
        )
    }

    // MARK: - Variant 2 : iPad landscape, inspector open (selected clip)

    func test_snapshot_pro_iPadLandscape_inspectorOpen() {
        let vm = makeViewModel(project: projectWithEditorialContent())
        vm.selectClip(id: "v1")
        SnapshotHelpers.assertLightDarkSnapshot(
            of: ProTimelineView(viewModel: vm),
            device: .iPadPro11Landscape,
            named: "pro-iPadLandscape-inspectorOpen"
        )
    }

    // MARK: - Variant 3 : Portrait fallback on iPhone

    func test_snapshot_pro_portraitFallback_iPhone() {
        let vm = makeViewModel(project: projectWithEditorialContent())
        // ProTimelineView in portrait must degrade gracefully — Task 34
        // documents the explicit fallback as a vertical stack with reduced
        // inspector. The snapshot locks that layout.
        SnapshotHelpers.assertLightDarkSnapshot(
            of: ProTimelineView(viewModel: vm),
            device: .iPhone16Pro,
            named: "pro-portraitFallback-iPhone"
        )
    }

    // MARK: - Variant 4 : iPad landscape with two clips, transition between them

    func test_snapshot_pro_iPadLandscape_withTransition() {
        let vm = makeViewModel(project: projectWithEditorialContent())
        SnapshotHelpers.assertLightDarkSnapshot(
            of: ProTimelineView(viewModel: vm),
            device: .iPadPro11Landscape,
            named: "pro-iPadLandscape-withTransition"
        )
    }
}
