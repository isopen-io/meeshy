import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// addTransition doit retourner l'id créé pour router la sélection vers le
/// TransitionInspector immédiatement après création (tap sur le badge « + »).
@MainActor
final class TimelineViewModelAddTransitionReturnTests: XCTestCase {

    func test_addTransition_valid_returnsCreatedTransitionId() async {
        let engine = MockStoryTimelineEngine()
        let vm = TimelineViewModel(engine: engine, commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        var a = StoryMediaObject(id: "a", postMediaId: "a", kind: .video, aspectRatio: 1)
        a.startTime = 0; a.duration = 3
        var b = StoryMediaObject(id: "b", postMediaId: "b", kind: .video, aspectRatio: 1)
        b.startTime = 3; b.duration = 3
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 10,
                                              mediaObjects: [a, b], audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()

        let id = vm.addTransition(fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 0.5)

        XCTAssertNotNil(id)
        XCTAssertEqual(vm.project.clipTransitions.first?.id, id,
                       "L'id retourné doit être celui de la transition réellement insérée")
    }

    func test_addTransition_unknownClip_returnsNil() async {
        let engine = MockStoryTimelineEngine()
        let vm = TimelineViewModel(engine: engine, commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 10,
                                              mediaObjects: [], audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()

        XCTAssertNil(vm.addTransition(fromClipId: "x", toClipId: "y", kind: .crossfade, duration: 0.5))
    }
}
