import XCTest
import Combine
@testable import MeeshyUI
@testable import MeeshySDK

/// #9874 - un tick de tete de lecture ne reevalue plus que les feuilles qui
/// lisent la tete : il ne publie QUE sur `PlayheadClock`, jamais sur le view
/// model que six vues observent.
@MainActor
final class TimelineViewModelPlayheadIsolationTests: XCTestCase {

    private func makeSUT() -> (sut: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        sut.bootstrap(project: TimelineProjectFactory.projectWithVideoClip(), mediaURLs: [:], images: [:])
        return (sut, engine)
    }

    func test_engineTick_publishesOnPlayheadOnly_neverOnViewModel() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()
        var viewModelChanges = 0
        var playheadChanges = 0
        let bag = [
            sut.objectWillChange.sink { viewModelChanges += 1 },
            sut.playhead.objectWillChange.sink { playheadChanges += 1 },
        ]

        engine.onTimeUpdate?(1.25)
        engine.onTimeUpdate?(1.30)

        XCTAssertEqual(viewModelChanges, 0, "un tick ne doit pas reevaluer les vues qui observent le view model")
        XCTAssertEqual(playheadChanges, 2)
        XCTAssertEqual(sut.currentTime, 1.30, accuracy: 0.0001)
        XCTAssertEqual(sut.playhead.time, 1.30, accuracy: 0.0001)
        bag.forEach { $0.cancel() }
    }

    func test_scrub_publishesOnPlayheadOnly() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()
        var viewModelChanges = 0
        let bag = sut.objectWillChange.sink { viewModelChanges += 1 }

        sut.scrub(to: 0.5)

        XCTAssertEqual(viewModelChanges, 0)
        XCTAssertEqual(sut.playhead.time, 0.5, accuracy: 0.0001)
        bag.cancel()
    }

    func test_samePlayheadValue_doesNotRepublish() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()
        engine.onTimeUpdate?(2)
        var playheadChanges = 0
        let bag = sut.playhead.objectWillChange.sink { playheadChanges += 1 }

        engine.onTimeUpdate?(2)

        XCTAssertEqual(playheadChanges, 0)
        bag.cancel()
    }

    func test_onPlayheadChanged_stillFiresOnEveryMove() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()
        var seen: [Float] = []
        sut.onPlayheadChanged = { seen.append($0) }

        engine.onTimeUpdate?(1)
        engine.onTimeUpdate?(1)
        sut.scrub(to: 0.25)

        XCTAssertEqual(seen, [1, 1, 0.25], "le pont du canvas recoit chaque deplacement, publie ou non")
    }

    func test_projectEdit_stillPublishesOnViewModel() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()
        var viewModelChanges = 0
        let bag = sut.objectWillChange.sink { viewModelChanges += 1 }

        sut.selectClip(id: "clip-1")

        XCTAssertGreaterThan(viewModelChanges, 0, "l'isolation ne doit pas faire taire les vraies editions")
        bag.cancel()
    }

    func test_projectRevision_advancesOnProjectChange() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()
        let before = sut.projectRevision

        sut.bootstrap(project: TimelineProjectFactory.emptyProject(), mediaURLs: [:], images: [:])

        XCTAssertGreaterThan(sut.projectRevision, before)
    }

    func test_projectRevision_neverCollidesAcrossViewModels() {
        let (first, _) = makeSUT()
        let (second, _) = makeSUT()

        XCTAssertNotEqual(first.projectRevision, second.projectRevision,
                          "une vue qui change de view model ne doit jamais retrouver la cle de l'ancien projet")

        first.bootstrap(project: TimelineProjectFactory.emptyProject(), mediaURLs: [:], images: [:])
        second.bootstrap(project: TimelineProjectFactory.emptyProject(), mediaURLs: [:], images: [:])

        XCTAssertNotEqual(first.projectRevision, second.projectRevision)
    }
}
