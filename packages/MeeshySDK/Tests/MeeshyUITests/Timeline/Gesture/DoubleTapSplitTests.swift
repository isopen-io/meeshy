import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// La découpe au playhead : elle vit dans la fiche d'édition, qui agit sur
/// le clip qu'elle inspecte (directive user 2026-07-27). Les barres de piste
/// dont les gestes étaient gardés ici ont quitté MeeshyUI (#18899).
@MainActor
final class DoubleTapSplitTests: XCTestCase {

    // MARK: - La découpe elle-même (view model, inchangé)

    func test_splitAtPlayhead_producesTwoClips() async {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(engine: engine,
                                    commandStack: CommandStack(),
                                    snapEngine: SnapEngine(toleranceSeconds: 0.1))
        sut.bootstrap(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 6),
                      mediaURLs: [:], images: [:])
        await sut.awaitConfigured()

        sut.selectClip(id: "clip-1")
        sut.scrub(to: 2.0)
        sut.splitSelectedAtPlayhead()

        XCTAssertEqual(sut.project.mediaObjects.count, 2, "La découpe produit deux clips")
        let durations = sut.project.mediaObjects.compactMap { $0.duration }.sorted()
        XCTAssertEqual(durations[0], 2.0, accuracy: 0.01, "Moitié gauche = 2 s")
        XCTAssertEqual(durations[1], 4.0, accuracy: 0.01, "Moitié droite = 4 s")
    }

    /// La fiche ouverte par un double tap porte sur le clip surligné : c'est ce
    /// qui rend `splitSelectedAtPlayhead()` correct sans être paramétré.
    func test_inspectingAClip_alsoSelectsIt_soSplitTargetsIt() async {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(engine: engine,
                                    commandStack: CommandStack(),
                                    snapEngine: SnapEngine(toleranceSeconds: 0.1))
        sut.bootstrap(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 6),
                      mediaURLs: [:], images: [:])
        await sut.awaitConfigured()

        sut.inspectClip(id: "clip-1")
        sut.scrub(to: 2.0)
        sut.splitSelectedAtPlayhead()

        XCTAssertEqual(sut.project.mediaObjects.count, 2,
                       "Le bouton Diviser de la fiche agit sur le clip qu'elle inspecte.")
    }
}
