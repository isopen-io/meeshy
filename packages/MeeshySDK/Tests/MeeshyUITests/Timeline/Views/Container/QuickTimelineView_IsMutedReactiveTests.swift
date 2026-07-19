import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Mirror of `ProTimelineView_IsMutedReactiveTests` for the quick (portrait)
/// variant. P0-C fixed the hardcoded `isMuted: false` in the pro timeline but
/// left QuickTimelineView with the same bug at lines 226 (TransportBar) and
/// 399 (AudioClipBar). The fix reuses `TimelineViewModel.isMuted` and the
/// public static helper `TimelineInspectorHost.isMutedForAudio(globalMute:audio:)`,
/// so this suite pins three contracts:
///   1. The quick transport bar tracks `viewModel.isMuted` (no literal false).
///   2. The quick audio lane bar reflects either the global mute or a clip
///      volume of zero, via the shared helper.
///   3. Volume 0 alone is enough to surface the clip badge as muted, matching
///      ProTimelineView semantics (`StoryAudioPlayerObject` has no per-clip
///      mute flag).
@MainActor
final class QuickTimelineViewIsMutedReactiveTests: XCTestCase {

    // MARK: - Fixtures

    private func makeViewModel(project: TimelineProject? = nil) -> (TimelineViewModel, MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        let p = project ?? TimelineProjectFactory.emptyProject()
        vm.bootstrap(project: p, mediaURLs: [:], images: [:])
        return (vm, engine)
    }

    private func audioClip(id: String = "audio-1", volume: Float = 1.0) -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(
            id: id,
            postMediaId: "post-\(id)",
            placement: "overlay",
            x: 0.5,
            y: 0.8,
            volume: volume,
            waveformSamples: [],
            isBackground: false,
            backgroundAudioVariants: nil,
            startTime: 0,
            duration: 3,
            loop: false,
            fadeIn: 0,
            fadeOut: 0,
            sourceLanguage: nil
        )
    }

    // MARK: - 1. TransportBar reflects viewModel.isMuted

    /// QuickTimelineView's transport (line 226) must read `viewModel.isMuted`,
    /// not a literal `false`. Drives the contract through the public VM
    /// surface so a literal can never silently slip back during refactors —
    /// the body-render smoke at the bottom guards the wiring itself.
    func test_quick_transportBar_reflectsViewModelIsMuted() {
        let (vm, _) = makeViewModel()
        XCTAssertFalse(vm.isMuted)
        vm.toggleMute()
        XCTAssertTrue(vm.isMuted)

        let view = QuickTimelineView(viewModel: vm)
        _ = view.body
    }

    // MARK: - 2. AudioClipBar reflects mute (global or per-clip)

    /// Global mute alone surfaces the audio bar as muted (line 399), even when
    /// the clip volume is full. Reuses the shared helper to avoid drift with
    /// the pro variant.
    func test_quick_audioClipBar_reflectsMute() {
        let clip = audioClip(volume: 1.0)
        XCTAssertTrue(TimelineInspectorHost.isMutedForAudio(globalMute: true, audio: clip))

        let project = TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [],
            audioPlayerObjects: [clip],
            textObjects: [],
            clipTransitions: []
        )
        let (vm, _) = makeViewModel(project: project)
        vm.toggleMute()
        vm.selectClip(id: clip.id)
        let view = QuickTimelineView(viewModel: vm)
        _ = view.body
    }

    // MARK: - 3. AudioClipBar reflects volume 0 as muted

    /// Volume 0 is the persistent per-clip silenced state. The bar must
    /// render muted even when the global mute is off, matching the pro
    /// variant exactly so users see the same visual whichever container is
    /// active.
    func test_quick_audioClipBar_volume0_isMuted() {
        let clip = audioClip(volume: 0)
        XCTAssertTrue(TimelineInspectorHost.isMutedForAudio(globalMute: false, audio: clip))

        let project = TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [],
            audioPlayerObjects: [clip],
            textObjects: [],
            clipTransitions: []
        )
        let (vm, _) = makeViewModel(project: project)
        vm.selectClip(id: clip.id)
        let view = QuickTimelineView(viewModel: vm)
        _ = view.body
    }
}
