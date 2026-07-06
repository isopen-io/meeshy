import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// WS5.2 — Timeline offline payload schema must match the single queue executor.
///
/// `StoryViewModel.executeQueuedPublish` is the ONE queue executor and it decodes
/// `[StorySlide].self`. Before this fix, `buildOfflineQueueItem` serialized a bare
/// `TimelineProject`, which is NOT a `[StorySlide]` — the decode threw, the executor
/// raised `StoryPublishUnrecoverableError`, and the composed story was permanently
/// dropped. These tests pin that the offline payload decodes as `[StorySlide]`
/// through the exact same path the executor uses, and that the slide carries the
/// timeline's mediaObjects (no content lost).
@MainActor
final class TimelineOfflinePayloadSchemaTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(project: TimelineProject) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let vm = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.06)
        )
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    /// Mirrors `executeQueuedPublish`'s decoder exactly.
    private func makeExecutorDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    // MARK: - Tests

    func test_buildOfflineQueueItem_payloadDecodesAsStorySlideArray() async throws {
        let vm = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(clipId: "clip-1"))
        await vm.awaitConfigured()

        let item = vm.buildOfflineQueueItem(visibility: .public, originalLanguage: "fr")
        let payload = try XCTUnwrap(item.slidePayloadJSON.data(using: .utf8))

        // Must decode through the SAME schema the single executor uses — no throw.
        let slides = try makeExecutorDecoder().decode([StorySlide].self, from: payload)
        XCTAssertEqual(slides.count, 1, "Timeline offline payload must be a single-element [StorySlide]")
    }

    func test_buildOfflineQueueItem_decodedSlideCarriesTimelineMediaObjects() async throws {
        let vm = makeSUT(project: TimelineProjectFactory.projectWithVideoClip(clipId: "clip-1"))
        await vm.awaitConfigured()

        let item = vm.buildOfflineQueueItem(visibility: .public, originalLanguage: "fr")
        let payload = try XCTUnwrap(item.slidePayloadJSON.data(using: .utf8))
        let slides = try makeExecutorDecoder().decode([StorySlide].self, from: payload)

        let slide = try XCTUnwrap(slides.first)
        let mediaObjects = try XCTUnwrap(slide.effects.mediaObjects)
        XCTAssertEqual(mediaObjects.map(\.id), ["clip-1"],
                       "The timeline's mediaObjects must survive into the [StorySlide] payload")
    }

    // MARK: - F5 — ALL timeline collections survive the [StorySlide] round-trip

    /// Builds a project carrying every timeline collection (media + audio + text +
    /// clipTransitions) and asserts each survives the SAME encode/decode the offline
    /// queue/executor uses. Pre-F5 only `mediaObjects` ids were pinned, so a
    /// regression dropping `clipTransitions` / `textObjects` / `audioPlayerObjects`
    /// on flush would have kept CI green. (Documents the SCOPE LIMITATION too: only
    /// the timeline-modelled fields are covered — non-timeline slide effects like
    /// `effects.background` / `filter` / `drawingStrokes` are NOT carried because the
    /// source slide is unreachable from `TimelineViewModel`; see
    /// `buildOfflineQueueItem`.)
    func test_buildOfflineQueueItem_decodedSlideCarriesAllTimelineCollections() async throws {
        var media = StoryMediaObject(id: "clip-1", postMediaId: "clip-1", kind: .video, aspectRatio: 1.0)
        media.startTime = 0
        media.duration = 4
        var mediaB = StoryMediaObject(id: "clip-2", postMediaId: "clip-2", kind: .video, aspectRatio: 1.0)
        mediaB.startTime = 4
        mediaB.duration = 4
        let audio = StoryAudioPlayerObject(id: "audio-1", postMediaId: "audio-1",
                                           startTime: 1, duration: 3)
        let text = StoryTextObject(id: "text-1", text: "Bonjour")
        let transition = StoryClipTransition(id: "tx-1", fromClipId: "clip-1",
                                             toClipId: "clip-2", kind: .crossfade,
                                             duration: 0.5)
        let project = TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [media, mediaB],
            audioPlayerObjects: [audio],
            textObjects: [text],
            clipTransitions: [transition]
        )

        let vm = makeSUT(project: project)
        await vm.awaitConfigured()

        let item = vm.buildOfflineQueueItem(visibility: .public, originalLanguage: "fr")
        let payload = try XCTUnwrap(item.slidePayloadJSON.data(using: .utf8))
        let slide = try XCTUnwrap(
            makeExecutorDecoder().decode([StorySlide].self, from: payload).first
        )

        XCTAssertEqual(try XCTUnwrap(slide.effects.mediaObjects).map(\.id),
                       ["clip-1", "clip-2"], "mediaObjects must survive the payload")
        XCTAssertEqual(try XCTUnwrap(slide.effects.audioPlayerObjects).map(\.id),
                       ["audio-1"], "audioPlayerObjects must survive the payload")
        XCTAssertEqual(slide.effects.textObjects.map(\.id),
                       ["text-1"], "textObjects must survive the payload")
        let transitions = try XCTUnwrap(slide.effects.clipTransitions)
        XCTAssertEqual(transitions.map(\.id), ["tx-1"],
                       "clipTransitions must survive the payload")
        XCTAssertEqual(transitions.first?.kind, .crossfade,
                       "clipTransition fields (kind) must survive the payload")
    }
}
