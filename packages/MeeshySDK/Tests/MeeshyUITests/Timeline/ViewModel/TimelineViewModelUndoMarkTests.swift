import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **« Quitter » la frise plein écran défait ce qu'elle a réglé, et rien
/// d'autre** (#17110, planche S9) ; « Valider » garde tout.
@MainActor
final class TimelineViewModelUndoMarkTests: XCTestCase {

    private func makeSUT(stack: CommandStack = CommandStack()) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: stack,
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

    /// Une pile PLEINE garde son curseur pendant que chaque réglage évince la
    /// plus vieille entrée : un repère compté n'y défaisait plus rien.
    func test_rewind_surUnePilePleine_defaitQuandMemeLaSession() async {
        let sut = await makeSUT(stack: CommandStack(maxSize: 2))
        sut.setClipStart(id: "m1", to: 3)
        let repere = TimelineUndoMark.taken(on: sut)
        sut.setClipEnd(id: "m1", to: 9)
        sut.setClipStart(id: "m1", to: 1)
        sut.setClipEnd(id: "m1", to: 8)
        repere.rewind(sut)
        XCTAssertEqual(start(sut), 3, accuracy: 0.001, "les réglages encore dans la pile sont défaits")
        XCTAssertFalse(sut.commandStack.canUndo, "rien d'antérieur à la session n'a été défait de trop")
    }

    func test_rewind_apresAvoirDejaAnnuleAvantLeRepere_neDefaitRienDePlus() async {
        let sut = await makeSUT()
        sut.setClipStart(id: "m1", to: 3)
        let repere = TimelineUndoMark.taken(on: sut)
        sut.undo()
        repere.rewind(sut)
        XCTAssertEqual(start(sut), 2, accuracy: 0.001)
        XCTAssertTrue(sut.commandStack.canRedo, "le réglage d'avant reste rejouable")
    }
}
