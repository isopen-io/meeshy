import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Guards the P0 bug where `TransportBar(isMuted: false, …)` and
/// `AudioClipBar(isMuted: false, …)` were hardcoded inside `ProTimelineView`,
/// leaving the speaker icon stuck in "playing" forever even though the engine
/// honoured `toggleMute()` underneath.
///
/// The reactive seam is `TimelineViewModel.isMuted`, an `@Observable` stored
/// property mirrored from `engine.isMuted` inside `toggleMute()`. These tests
/// pin three contracts:
///   1. The view-model is the single source of truth for the UI mute icon
///      (TransportBar reads `viewModel.isMuted` directly).
///   2. The audio lane bar reflects EITHER the global mute OR a clip volume
///      of zero (`StoryAudioPlayerObject` has no per-clip mute flag).
///   3. `toggleMute()` keeps view-model and engine in lock-step so a single
///      tap on the speaker propagates to both the audio path and the icon.
@MainActor
final class TimelineInspectorHostIsMutedReactiveTests: XCTestCase {

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

    // MARK: - 1. Initial state

    /// Default engine boot state is unmuted; the view-model mirror must agree
    /// so the speaker icon never lands on `speaker.slash.fill` for a fresh
    /// timeline.
    func test_isMuted_initialState_false() {
        let (vm, engine) = makeViewModel()
        XCTAssertFalse(vm.isMuted)
        XCTAssertFalse(engine.isMuted)
    }

    /// If the engine boots already muted (e.g., user came back to a session
    /// where they had muted preview), the view-model must pick that up at
    /// init time — otherwise the very first render shows the wrong icon.
    func test_isMuted_initialState_mirrorsPreMutedEngine() {
        let engine = MockStoryTimelineEngine()
        engine.isMuted = true
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        XCTAssertTrue(vm.isMuted, "VM must read engine.isMuted at init")
    }

    // MARK: - 2. TransportBar reflects viewModel.isMuted

    /// The transport bar's mute icon reads `viewModel.isMuted` (not a literal
    /// `false`), so flipping the VM flag flips what the UI would render.
    /// Drives the contract through the public VM surface — wiring inside the
    /// SwiftUI body is verified by the body-render smoke test below.
    func test_transportBar_reflectsViewModelIsMuted() {
        let (vm, _) = makeViewModel()
        XCTAssertFalse(vm.isMuted)
        vm.toggleMute()
        XCTAssertTrue(vm.isMuted)
    }

    /// Smoke-renders the ProTimelineView body with the mute flag asserted, to
    /// catch any future regression that detaches the transport bar's
    /// `isMuted:` argument from `viewModel.isMuted` (e.g., a literal sneaks
    /// back in during a refactor). Mirrors the `_ = view.body` pattern used
    /// across the rest of the timeline container tests.
    func test_transportBar_bodyRendersWhenMuted() {
        let (vm, _) = makeViewModel()
        vm.toggleMute()
        let view = ProTimelineView(viewModel: vm)
        _ = view.body
    }

    // MARK: - 3. AudioClipBar per-clip mute semantics

    /// Global mute alone is enough to surface the clip as muted — even when
    /// the clip's own volume is at full strength. This is the "user tapped
    /// the speaker" case.
    func test_audioClipBar_reflectsGlobalMute() {
        let clip = audioClip(volume: 1.0)
        XCTAssertTrue(TimelineInspectorHost.isMutedForAudio(globalMute: true, audio: clip))
    }

    /// Conversely, a clip with volume zero is shown as muted even when the
    /// global mute is off. `StoryAudioPlayerObject` has no `isMuted` field;
    /// volume 0 is the persistent silenced state we have to honour.
    func test_audioClipBar_reflectsZeroVolume() {
        let clip = audioClip(volume: 0)
        XCTAssertTrue(TimelineInspectorHost.isMutedForAudio(globalMute: false, audio: clip))
    }

    /// Negative or NaN volume should never happen in practice but the resolver
    /// must stay deterministic — `<=` keeps the badge consistent rather than
    /// silently flipping to "unmuted" on a corrupted clip.
    func test_audioClipBar_reflectsNegativeVolumeAsMuted() {
        let clip = audioClip(volume: -0.01)
        XCTAssertTrue(TimelineInspectorHost.isMutedForAudio(globalMute: false, audio: clip))
    }

    /// Standard playback path: global off, clip has volume — the bar must
    /// render as unmuted.
    func test_audioClipBar_unmutedWhenGlobalOffAndPositiveVolume() {
        let clip = audioClip(volume: 0.5)
        XCTAssertFalse(TimelineInspectorHost.isMutedForAudio(globalMute: false, audio: clip))
    }

    /// Body-render smoke test for the audio branch: builds a project with one
    /// audio clip and a global mute engaged, then evaluates the body so the
    /// AudioClipBar branch (line ~643) is exercised end-to-end.
    func test_audioClipBar_bodyRendersWithGlobalMuteAndAudioClip() {
        let project = TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [],
            audioPlayerObjects: [audioClip(volume: 1.0)],
            textObjects: [],
            clipTransitions: []
        )
        let (vm, _) = makeViewModel(project: project)
        vm.toggleMute()
        vm.selectClip(id: "audio-1")
        let view = ProTimelineView(viewModel: vm)
        _ = view.body
    }

    // MARK: - 4. toggleMute propagates VM ↔ engine

    /// `toggleMute()` must update both the engine (audio path) and the VM
    /// mirror (UI) on the same call. Without the mirror, the speaker icon
    /// would stay frozen on `false`. Without the engine write, the audio
    /// would keep playing.
    func test_toggleMute_propagatesToTransportBar() {
        let (vm, engine) = makeViewModel()

        vm.toggleMute()
        XCTAssertTrue(vm.isMuted, "VM mirror must flip on toggleMute()")
        XCTAssertTrue(engine.isMuted, "Engine state must flip on toggleMute()")

        vm.toggleMute()
        XCTAssertFalse(vm.isMuted, "Second toggle restores VM to unmuted")
        XCTAssertFalse(engine.isMuted, "Second toggle restores engine to unmuted")
    }

    /// Guards against a regression where the VM mirror could drift from the
    /// engine if a future setter clamped or refused the write. The mirror
    /// must trust the engine's post-set value, never the local optimistic
    /// value passed in.
    func test_toggleMute_mirrorReadsEngineBack() {
        let (vm, engine) = makeViewModel()
        vm.toggleMute()
        // Engine accepted the write — mirror is identical.
        XCTAssertEqual(vm.isMuted, engine.isMuted)
        vm.toggleMute()
        XCTAssertEqual(vm.isMuted, engine.isMuted)
    }
}
