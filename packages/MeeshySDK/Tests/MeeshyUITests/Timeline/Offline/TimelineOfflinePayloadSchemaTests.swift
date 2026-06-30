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
}
