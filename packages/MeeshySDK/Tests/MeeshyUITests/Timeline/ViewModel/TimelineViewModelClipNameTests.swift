import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TimelineViewModelClipNameTests: XCTestCase {

    private func makeSUT(media: [StoryMediaObject]) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 10,
                                              mediaObjects: media, audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    func test_setClipName_persistsOnModel() async {
        let m = StoryMediaObject(id: "m1", postMediaId: "p", kind: .image, aspectRatio: 1)
        let sut = await makeSUT(media: [m])
        sut.setClipName(id: "m1", name: "Intro")
        XCTAssertEqual(sut.project.mediaObjects.first(where: { $0.id == "m1" })?.name, "Intro")
    }

    func test_setClipName_isUndoable() async {
        let m = StoryMediaObject(id: "m1", postMediaId: "p", kind: .image, aspectRatio: 1)
        let sut = await makeSUT(media: [m])
        sut.setClipName(id: "m1", name: "Intro")
        sut.undo()
        XCTAssertNil(sut.project.mediaObjects.first(where: { $0.id == "m1" })?.name)
    }
}
