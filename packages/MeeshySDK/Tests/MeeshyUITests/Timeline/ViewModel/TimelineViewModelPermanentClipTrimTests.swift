import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Trim universel — un élément « permanent » (duration nil : tout texte
/// fraîchement posé) doit être trimable au doigt comme une vidéo : le trim
/// MATÉRIALISE sa fenêtre (base = startTime → slideDuration) puis l'ajuste.
/// Avant : `clipDuration(id:)` retournait nil → guard → poignées inertes.
@MainActor
final class TimelineViewModelPermanentClipTrimTests: XCTestCase {

    private func makeSUT() async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        var text = StoryTextObject(id: "t1", text: "Salut")
        text.startTime = 2
        text.duration = nil
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 10,
                                              mediaObjects: [], audioPlayerObjects: [],
                                              textObjects: [text], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    func test_trimClipEnd_permanentText_materializesEffectiveWindowThenAdjusts() async {
        let vm = await makeSUT()

        vm.trimClipEnd(id: "t1", deltaTimeSeconds: -3)

        let text = vm.project.textObjects[0]
        XCTAssertEqual(Float(text.duration ?? -1), 5, accuracy: 0.001,
                       "Base permanente = 10−2 = 8s ; −3s de trim ⇒ durée matérialisée 5s")
        XCTAssertTrue(vm.canUndo, "Le trim doit passer par TrimClipCommand (undo-able)")
    }

    func test_trimClipStart_permanentText_shiftsStartAndMaterializesDuration() async {
        let vm = await makeSUT()

        vm.trimClipStart(id: "t1", deltaTimeSeconds: 1)

        let text = vm.project.textObjects[0]
        XCTAssertEqual(Float(text.startTime ?? -1), 3, accuracy: 0.001)
        XCTAssertEqual(Float(text.duration ?? -1), 7, accuracy: 0.001,
                       "Base 8s − 1s rogné à gauche = 7s")
    }
}
