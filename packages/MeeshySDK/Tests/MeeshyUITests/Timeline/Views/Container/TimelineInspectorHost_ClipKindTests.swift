import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Guards the bug where the Pro timeline mapped every selected media clip to
/// `ClipSnapshot.Kind.video`, surfacing the volume slider and the loop toggle
/// on still images that have no audio track and no playback to wrap around.
///
/// Tests target the pure mapping (`TimelineInspectorHost.resolveClipSnapshot`) and
/// the kind→affordance gates on `ClipInspector` so we don't need to drive a
/// real SwiftUI render tree to assert which controls light up.
@MainActor
final class TimelineInspectorHostClipKindTests: XCTestCase {

    // MARK: - Fixtures

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    private func mediaProject(clipId: String, kind: StoryMediaKind) -> TimelineProject {
        var media = StoryMediaObject(id: clipId, postMediaId: "post-\(clipId)",
                                     kind: kind, aspectRatio: 1.0)
        media.startTime = 0
        media.duration = 4
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [media],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }

    private func audioProject(clipId: String) -> TimelineProject {
        let audio = StoryAudioPlayerObject(
            id: clipId,
            postMediaId: "post-\(clipId)",
            placement: "overlay",
            x: 0.5,
            y: 0.8,
            volume: 0.75,
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
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [],
            audioPlayerObjects: [audio],
            textObjects: [],
            clipTransitions: []
        )
    }

    // MARK: - resolveClipSnapshot

    func test_resolveClipSnapshot_noSelection_returnsNil() {
        let vm = makeViewModel(project: mediaProject(clipId: "c", kind: .image))
        XCTAssertNil(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm))
    }

    func test_resolveClipSnapshot_imageMedia_returnsImageKind() {
        let vm = makeViewModel(project: mediaProject(clipId: "img-1", kind: .image))
        vm.selectClip(id: "img-1")
        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)
        XCTAssertNotNil(snapshot)
        XCTAssertEqual(snapshot?.kind, .image)
        XCTAssertEqual(snapshot?.id, "img-1")
    }

    func test_resolveClipSnapshot_videoMedia_returnsVideoKind() {
        let vm = makeViewModel(project: mediaProject(clipId: "vid-1", kind: .video))
        vm.selectClip(id: "vid-1")
        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)
        XCTAssertEqual(snapshot?.kind, .video)
        XCTAssertEqual(snapshot?.id, "vid-1")
    }

    func test_resolveClipSnapshot_audioPlayerObject_returnsAudioKind() {
        let vm = makeViewModel(project: audioProject(clipId: "aud-1"))
        vm.selectClip(id: "aud-1")
        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)
        XCTAssertEqual(snapshot?.kind, .audio)
        XCTAssertEqual(snapshot?.id, "aud-1")
    }

    func test_resolveClipSnapshot_unknownClipId_returnsNil() {
        let vm = makeViewModel(project: mediaProject(clipId: "img-1", kind: .image))
        vm.selectClip(id: "does-not-exist")
        XCTAssertNil(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm))
    }

    // MARK: - Inspector kind gating

    func test_inspector_imageKind_hidesVolumeControl() {
        XCTAssertFalse(ClipInspector.hasAudioAffordances(kind: .image))
    }

    func test_inspector_imageKind_hidesLoopToggle() {
        XCTAssertFalse(ClipInspector.supportsLoop(kind: .image, isBackground: true))
    }

    func test_inspector_videoKind_loopOnlyWhenBackground() {
        XCTAssertTrue(ClipInspector.hasAudioAffordances(kind: .video))
        XCTAssertTrue(ClipInspector.supportsLoop(kind: .video, isBackground: true))
        XCTAssertFalse(ClipInspector.supportsLoop(kind: .video, isBackground: false),
                       "Règle produit : la boucle est réservée au FOND — un clip foreground a une fenêtre, il ne boucle pas")
    }

    func test_inspector_audioKind_loopOnlyWhenBackground() {
        XCTAssertTrue(ClipInspector.hasAudioAffordances(kind: .audio))
        XCTAssertTrue(ClipInspector.supportsLoop(kind: .audio, isBackground: true))
        XCTAssertFalse(ClipInspector.supportsLoop(kind: .audio, isBackground: false))
    }

    func test_inspector_textKind_hidesVolumeAndLoop() {
        XCTAssertFalse(ClipInspector.hasAudioAffordances(kind: .text))
        XCTAssertFalse(ClipInspector.supportsLoop(kind: .text, isBackground: true))
    }

    // MARK: - End-to-end body rendering

    /// Builds the inspector body for an image-kind snapshot to guard against
    /// crashes in the kind-gated view branches (volume slider + loop toggle
    /// suppressed). Mirrors the existing `_ = view.body` smoke pattern in
    /// `ClipInspectorTests`.
    func test_inspector_imageSnapshot_bodyDoesNotCrash() {
        let snapshot = ClipInspector.ClipSnapshot(
            id: "img-1",
            displayName: "photo.png",
            kind: .image,
            startTime: 0,
            duration: 3,
            volume: 1.0,
            fadeInDuration: 0.2,
            fadeOutDuration: 0.3,
            isLooping: false,
            isBackground: false
        )
        let view = ClipInspector(
            presentation: .popover,
            clip: snapshot,
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        _ = view.body
    }
}
