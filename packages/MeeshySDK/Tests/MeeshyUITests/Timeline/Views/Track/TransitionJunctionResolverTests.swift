import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Lot D — les transitions doivent être CRÉABLES et VISIBLES : le résolveur
/// de jonctions désigne chaque couture entre deux clips média consécutifs,
/// porte l'éventuelle transition existante, et exclut fond + clips
/// synthétiques (jamais transitionnés par le compositor).
@MainActor
final class TransitionJunctionResolverTests: XCTestCase {

    private func media(_ id: String, start: Double, duration: Double?,
                       isBackground: Bool = false) -> StoryMediaObject {
        var m = StoryMediaObject(id: id, postMediaId: id, kind: .video, aspectRatio: 1.0)
        m.startTime = start
        m.duration = duration
        m.isBackground = isBackground
        return m
    }

    private func project(media: [StoryMediaObject],
                         transitions: [StoryClipTransition] = []) -> TimelineProject {
        TimelineProject(slideId: "s", slideDuration: 10,
                        mediaObjects: media, audioPlayerObjects: [],
                        textObjects: [], clipTransitions: transitions)
    }

    func test_resolve_twoConsecutiveClips_yieldsOneJunctionAtSeamMidpoint() {
        let p = project(media: [media("a", start: 0, duration: 3),
                                media("b", start: 3, duration: 4)])

        let junctions = TransitionJunctionResolver.resolve(project: p, slideDuration: 10)

        XCTAssertEqual(junctions.count, 1)
        XCTAssertEqual(junctions[0].fromClipId, "a")
        XCTAssertEqual(junctions[0].toClipId, "b")
        XCTAssertEqual(junctions[0].anchorTime, 3.0, accuracy: 0.001)
        XCTAssertNil(junctions[0].existingTransitionId)
    }

    func test_resolve_existingTransition_carriesIdKindDuration() {
        let t = StoryClipTransition(fromClipId: "a", toClipId: "b",
                                    kind: .crossfade, duration: 0.5, easing: .linear)
        let p = project(media: [media("a", start: 0, duration: 3),
                                media("b", start: 3, duration: 4)],
                        transitions: [t])

        let junctions = TransitionJunctionResolver.resolve(project: p, slideDuration: 10)

        XCTAssertEqual(junctions[0].existingTransitionId, t.id)
        XCTAssertEqual(junctions[0].existingKind, .crossfade)
        XCTAssertEqual(junctions[0].existingDuration, 0.5)
    }

    func test_resolve_backgroundAndSyntheticClips_areExcluded() {
        let synthetic = media("\(StoryComposerViewModel.syntheticTimelineClipIdPrefix)s",
                              start: 0, duration: 10)
        let p = project(media: [media("bg", start: 0, duration: 10, isBackground: true),
                                synthetic,
                                media("a", start: 0, duration: 3)])

        XCTAssertTrue(TransitionJunctionResolver.resolve(project: p, slideDuration: 10).isEmpty,
                      "Un seul clip foreground réel → aucune couture candidate")
    }

    func test_resolve_permanentDurationClip_usesEffectiveWindowForSeam() {
        let p = project(media: [media("a", start: 0, duration: nil),
                                media("b", start: 6, duration: 4)])

        let junctions = TransitionJunctionResolver.resolve(project: p, slideDuration: 10)

        XCTAssertEqual(junctions[0].anchorTime, 8.0, accuracy: 0.001,
                       "Clip permanent : fin effective = slideDuration (10) ; couture = (10+6)/2")
    }

    func test_junctionsForLane_filtersByFromClip() {
        let p = project(media: [media("a", start: 0, duration: 3),
                                media("b", start: 3, duration: 3),
                                media("c", start: 6, duration: 3)])
        let all = TransitionJunctionResolver.resolve(project: p, slideDuration: 10)

        let laneB = TransitionJunctionResolver.junctions(for: ["b"], in: all)

        XCTAssertEqual(laneB.map(\.fromClipId), ["b"],
                       "La lane de b n'héberge que la couture b→c")
    }
}

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
