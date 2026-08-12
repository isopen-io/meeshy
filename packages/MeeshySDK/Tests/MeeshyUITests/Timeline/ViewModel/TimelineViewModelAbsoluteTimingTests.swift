import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Réglages ABSOLUS du timing d'un clip — ce que les champs saisissables de la
/// fiche appellent. Jusqu'ici seuls des deltas existaient : poser un début à
/// 3,5 s demandait 35 pressions sur ±0,1 s.
@MainActor
final class TimelineViewModelAbsoluteTimingTests: XCTestCase {

    private func makeSUT(start: Float = 2, duration: Float = 4) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78,
                                     startTime: Double(start), duration: Double(duration))
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 10,
                                              mediaObjects: [media], audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    private func window(_ vm: TimelineViewModel) -> (start: Float, duration: Float) {
        let m = vm.project.mediaObjects.first { $0.id == "m1" }
        return (Float(m?.startTime ?? -1), Float(m?.duration ?? -1))
    }

    func test_setClipStart_movesTheClip_keepingDuration() async {
        let sut = await makeSUT(start: 2, duration: 4)
        sut.setClipStart(id: "m1", to: 3.5)
        let w = window(sut)
        XCTAssertEqual(w.start, 3.5, accuracy: 0.001)
        XCTAssertEqual(w.duration, 4, accuracy: 0.001, "Régler le début déplace, il ne trimme pas.")
    }

    func test_setClipEnd_keepsStart_recomputesDuration() async {
        let sut = await makeSUT(start: 2, duration: 4)
        sut.setClipEnd(id: "m1", to: 9)
        let w = window(sut)
        XCTAssertEqual(w.start, 2, accuracy: 0.001)
        XCTAssertEqual(w.duration, 7, accuracy: 0.001)
    }

    func test_setClipDuration_keepsStart_movesEnd() async {
        let sut = await makeSUT(start: 2, duration: 4)
        sut.setClipDuration(id: "m1", to: 1.5)
        let w = window(sut)
        XCTAssertEqual(w.start, 2, accuracy: 0.001)
        XCTAssertEqual(w.duration, 1.5, accuracy: 0.001)
    }

    /// Une entrée d'undo par réglage — pas zéro (le réglage serait irrattrapable),
    /// pas deux (l'utilisateur devrait annuler deux fois un seul geste).
    func test_eachAbsoluteEdit_pushesExactlyOneUndoEntry() async {
        let sut = await makeSUT(start: 2, duration: 4)
        let before = sut.commandHistoryDepth
        sut.setClipEnd(id: "m1", to: 9)
        XCTAssertEqual(sut.commandHistoryDepth, before + 1)
        sut.undo()
        XCTAssertEqual(window(sut).duration, 4, accuracy: 0.001)
    }

    func test_noOpEdit_pushesNothing() async {
        let sut = await makeSUT(start: 2, duration: 4)
        let before = sut.commandHistoryDepth
        sut.setClipStart(id: "m1", to: 2)
        XCTAssertEqual(sut.commandHistoryDepth, before,
                       "Régler une valeur à ce qu'elle vaut déjà ne doit rien empiler.")
    }

    func test_unknownClipId_isIgnored() async {
        let sut = await makeSUT()
        let before = sut.commandHistoryDepth
        sut.setClipEnd(id: "nope", to: 9)
        XCTAssertEqual(sut.commandHistoryDepth, before)
    }

    /// Le clip est autoritaire, la slide suit : allonger un clip au-delà de la
    /// fin de slide DOIT allonger la slide, puisque plus aucune affordance ne
    /// la règle à la main.
    func test_extendingBeyondSlideEnd_growsTheSlide() async {
        let sut = await makeSUT(start: 0, duration: 6)
        sut.setClipEnd(id: "m1", to: 25)
        XCTAssertEqual(window(sut).duration, 25, accuracy: 0.001)
        XCTAssertEqual(sut.project.slideDuration, 25, accuracy: 0.05,
                       "La durée de slide dérive du contenu : elle suit le clip le plus long.")
    }

    func test_absoluteEdits_respectTheCeiling() async {
        let sut = await makeSUT(start: 0, duration: 6)
        sut.setClipEnd(id: "m1", to: 9999)
        XCTAssertEqual(window(sut).duration, ClipWindowResolver.maximumEnd, accuracy: 0.001)
    }
}
