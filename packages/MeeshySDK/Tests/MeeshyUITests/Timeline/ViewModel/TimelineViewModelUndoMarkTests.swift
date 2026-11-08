import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **« Quitter » la frise plein écran défait ce qu'elle a réglé, et rien
/// d'autre** (#17110, planche S9) ; « Valider » garde tout.
@MainActor
final class TimelineViewModelUndoMarkTests: XCTestCase {

    private func makeSUT() async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78, startTime: 2, duration: 4)
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 10,
                                              mediaObjects: [media], audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    private func start(_ vm: TimelineViewModel) -> Double {
        vm.project.mediaObjects.first { $0.id == "m1" }?.startTime ?? -1
    }

    func test_rewind_defaitCeQuiSuitLeRepere_etGardeCeQuiPrecede() async {
        let sut = await makeSUT()
        sut.setClipStart(id: "m1", to: 3)
        let repere = TimelineUndoMark.taken(on: sut)
        sut.setClipEnd(id: "m1", to: 9)
        sut.setClipStart(id: "m1", to: 1)
        repere.rewind(sut)
        XCTAssertEqual(TimelineUndoMark.taken(on: sut), repere)
        XCTAssertEqual(start(sut), 3, accuracy: 0.001, "le réglage d'avant l'ouverture reste")
    }

    func test_rewind_sansRienRegle_neDefaitRien() async {
        let sut = await makeSUT()
        sut.setClipStart(id: "m1", to: 3)
        TimelineUndoMark.taken(on: sut).rewind(sut)
        XCTAssertEqual(start(sut), 3, accuracy: 0.001)
    }
}
