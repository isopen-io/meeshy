import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **La frise de SCÈNE lit le projet que la frise de l'atelier édite** (#8370,
/// lot 6 — maquette « chaque objet a sa piste », « Entre ici », « Sort ici »).
@MainActor
final class SceneFriseTrackTests: XCTestCase {

    private func makeSUT() async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        let fond = StoryMediaObject(id: "fond", kind: .image, aspectRatio: 0.56,
                                    isBackground: true, startTime: 0, duration: 6)
        let video = StoryMediaObject(id: "v1", kind: .video, aspectRatio: 1.78,
                                     startTime: 1, duration: 3)
        var texte = StoryTextObject(id: "t1", text: "Bonjour")
        texte.startTime = 0.5
        texte.duration = 2
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 6,
                                              mediaObjects: [fond, video], audioPlayerObjects: [],
                                              textObjects: [texte], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    func test_chaqueObjetASaPiste_saufLeFond() async {
        let sut = await makeSUT()
        XCTAssertEqual(sut.sceneFriseTracks.map(\.id), ["v1", "t1"],
                       "Le fond EST la scène : il ne se règle pas dans le temps.")
    }

    func test_laPisteNommeLeTexteEtPorteSaFenetre() async {
        let sut = await makeSUT()
        let piste = sut.sceneFriseTracks.first { $0.id == "t1" }
        XCTAssertEqual(piste?.label, "Bonjour")
        XCTAssertEqual(piste?.kind, .text)
        XCTAssertEqual(piste?.start ?? -1, 0.5, accuracy: 0.001)
        XCTAssertEqual(piste?.end ?? -1, 2.5, accuracy: 0.001)
    }

    func test_entreIci_avanceLEntree_sansBougerLaSortie() async {
        let sut = await makeSUT()
        sut.setClipEntry(id: "v1", to: 2)
        let piste = sut.sceneFriseTracks.first { $0.id == "v1" }
        XCTAssertEqual(piste?.start ?? -1, 2, accuracy: 0.001)
        XCTAssertEqual(piste?.end ?? -1, 4, accuracy: 0.001)
    }

    func test_sortIci_avanceLaSortie_sansBougerLEntree() async {
        let sut = await makeSUT()
        sut.setClipExit(id: "v1", to: 2.5)
        let piste = sut.sceneFriseTracks.first { $0.id == "v1" }
        XCTAssertEqual(piste?.start ?? -1, 1, accuracy: 0.001)
        XCTAssertEqual(piste?.end ?? -1, 2.5, accuracy: 0.001)
    }

    /// La maquette : une entrée posée APRÈS la sortie ne retourne pas la
    /// piste — elle s'arrête juste avant (`t0 = min(ph, t1 − 0,05)`).
    func test_entreeApresLaSortie_resteAvantElle() async {
        let sut = await makeSUT()
        sut.setClipEntry(id: "v1", to: 5)
        let piste = sut.sceneFriseTracks.first { $0.id == "v1" }
        XCTAssertLessThan(piste?.start ?? 99, piste?.end ?? 0)
        XCTAssertEqual(piste?.end ?? -1, 4, accuracy: 0.001)
    }
}
