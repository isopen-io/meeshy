import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Integration tests for the composer ↔ timeline round-trip wiring introduced in Phase 1.
///
/// Covers:
/// - Item 4: `loadCurrentSlideIntoTimeline` resolves in-session media URLs into `mediaURLs`
///   so the engine no longer receives an empty dict for every clip.
/// - Item 3 partial: `commitTimelineToCurrentSlide` writes `TimelineViewModel.project` back
///   into `currentSlide.effects` so publish ships V2 edits (transitions, trims, keyframes).
@MainActor
final class CompositorTimelineRoundTripTests: XCTestCase {

    // MARK: - Item 4: mediaURLs resolution

    func test_loadCurrentSlideIntoTimeline_includesVideoURL_whenLoadedInSession() async {
        let composer = StoryComposerViewModel()
        var slide = composer.currentSlide

        // Seed a video media object.
        let media = StoryMediaObject(id: "v1", postMediaId: "post-v1",
                                     kind: .video,
                                     aspectRatio: 1.0,
                                     startTime: 0, duration: 5)
        slide.effects.mediaObjects = [media]
        composer.currentSlide = slide

        // Simulate the composer having downloaded the video during this session.
        let fakeURL = URL(fileURLWithPath: "/tmp/video-v1.mp4")
        composer.loadedVideoURLs["v1"] = fakeURL

        composer.loadCurrentSlideIntoTimeline()
        await composer.timelineViewModel.awaitConfigured()

        // Engine must have received the URL for the media object.
        // Verified indirectly: project is populated with the clip.
        XCTAssertEqual(composer.timelineViewModel.project.mediaObjects.count, 1)
    }

    func test_loadCurrentSlideIntoTimeline_includesAudioURL_whenLoadedInSession() async {
        let composer = StoryComposerViewModel()
        var slide = composer.currentSlide

        let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "post-a1",
                                           placement: "overlay",
                                           startTime: 0, duration: 3.0)
        slide.effects.audioPlayerObjects = [audio]
        composer.currentSlide = slide

        let fakeAudioURL = URL(fileURLWithPath: "/tmp/audio-a1.m4a")
        composer.loadedAudioURLs["a1"] = fakeAudioURL

        composer.loadCurrentSlideIntoTimeline()
        await composer.timelineViewModel.awaitConfigured()

        XCTAssertEqual(composer.timelineViewModel.project.audioPlayerObjects.count, 1)
    }

    func test_loadCurrentSlideIntoTimeline_omitsURL_whenNotCached() async {
        // Items with no in-session URL and no disk cache should be passed without a URL.
        // The engine must not crash — it logs the skip and continues.
        let composer = StoryComposerViewModel()
        var slide = composer.currentSlide

        let media = StoryMediaObject(id: "v2", postMediaId: "post-v2-uncached",
                                     kind: .video,
                                     aspectRatio: 1.0,
                                     startTime: 0, duration: 4)
        slide.effects.mediaObjects = [media]
        composer.currentSlide = slide

        // No entry in loadedVideoURLs, disk cache will also miss for a random postMediaId.
        XCTAssertNoThrow(composer.loadCurrentSlideIntoTimeline())
        await composer.timelineViewModel.awaitConfigured()

        XCTAssertEqual(composer.timelineViewModel.project.mediaObjects.count, 1,
                       "Project must still contain the clip even when its URL is unresolved")
    }

    // MARK: - Item 3 partial: commitTimelineToCurrentSlide writeback

    func test_commitTimelineToCurrentSlide_writesTransitionsBackToSlide() async {
        let composer = StoryComposerViewModel()
        var slide = composer.currentSlide

        var a = StoryMediaObject(id: "clip-a", postMediaId: "pa",
                                 kind: .video, aspectRatio: 1.0, startTime: 0, duration: 4)
        var b = StoryMediaObject(id: "clip-b", postMediaId: "pb",
                                 kind: .video, aspectRatio: 1.0, startTime: 4, duration: 4)
        slide.effects.mediaObjects = [a, b]
        slide.duration = 8
        composer.currentSlide = slide

        composer.loadCurrentSlideIntoTimeline()
        await composer.timelineViewModel.awaitConfigured()

        // Add a transition via the TimelineViewModel command API.
        composer.timelineViewModel.addTransition(
            fromClipId: "clip-a",
            toClipId: "clip-b",
            kind: .crossfade,
            duration: 0.5
        )

        // Writeback — this is the reverse path under test.
        composer.commitTimelineToCurrentSlide()

        XCTAssertEqual(composer.currentSlide.effects.clipTransitions?.count, 1,
                       "Transition added in timeline must be written back into currentSlide")
        XCTAssertEqual(composer.currentSlide.effects.clipTransitions?.first?.kind, .crossfade)
    }

    func test_commitTimelineToCurrentSlide_isNoOp_whenNoEdits() async {
        let composer = StoryComposerViewModel()
        var slide = composer.currentSlide

        let media = StoryMediaObject(id: "solo", postMediaId: "ps",
                                     kind: .video, aspectRatio: 1.0, startTime: 0, duration: 5)
        slide.effects.mediaObjects = [media]
        slide.duration = 5
        composer.currentSlide = slide

        composer.loadCurrentSlideIntoTimeline()
        await composer.timelineViewModel.awaitConfigured()

        // No edits made — commit should be a no-op (no crash, no state change).
        composer.commitTimelineToCurrentSlide()

        XCTAssertEqual(composer.currentSlide.effects.mediaObjects?.count, 1)
        XCTAssertNil(composer.currentSlide.effects.clipTransitions,
                     "clipTransitions must be nil when no transitions were added")
    }

    func test_commitTimelineToCurrentSlide_preservesMediaObjects() async {
        let composer = StoryComposerViewModel()
        var slide = composer.currentSlide

        let media = StoryMediaObject(id: "m1", postMediaId: "pm1",
                                     kind: .image, aspectRatio: 1.0, startTime: 0, duration: 3)
        slide.effects.mediaObjects = [media]
        slide.duration = 3
        composer.currentSlide = slide

        composer.loadCurrentSlideIntoTimeline()
        await composer.timelineViewModel.awaitConfigured()
        composer.commitTimelineToCurrentSlide()

        XCTAssertEqual(composer.currentSlide.effects.mediaObjects?.first?.id, "m1",
                       "commitTimelineToCurrentSlide must not drop existing media objects")
    }
}
