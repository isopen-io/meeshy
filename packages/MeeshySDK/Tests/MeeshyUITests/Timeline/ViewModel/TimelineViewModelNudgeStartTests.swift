import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Les steppers « Début » ±0,1 s de l'inspecteur passaient par `dragClip`,
/// c'est-à-dire par le chemin du GESTE — lequel applique l'aimantation
/// magnétique. Sa tolérance vaut `8 pt / (50 × zoom)`, soit **0,16 s** au zoom
/// par défaut : PLUS que le pas de 0,1 s.
///
/// Conséquence : un clip posé à 0 (`slideStart` est un candidat d'aimant), ou
/// collé au bord d'un voisin, revenait systématiquement à sa place. Le contrôle
/// de précision était avalé par un aimant taillé pour un doigt.
@MainActor
final class TimelineViewModelNudgeStartTests: XCTestCase {

    private func makeSUT(mediaObjects: [StoryMediaObject], slideDuration: Float = 20) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: slideDuration,
                                              mediaObjects: mediaObjects, audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    private func media(_ id: String, start: Double, duration: Double) -> StoryMediaObject {
        var m = StoryMediaObject(id: id, postMediaId: id, kind: .video, aspectRatio: 1.0)
        m.startTime = start
        m.duration = duration
        return m
    }

    private func start(of id: String, in vm: TimelineViewModel) -> Float? {
        vm.project.mediaObjects.first(where: { $0.id == id })?.startTime.map { Float($0) }
    }

    // MARK: - Le défaut

    /// Le cas le plus banal : un clip au tout début de la slide. `slideStart`
    /// est un candidat d'aimant à t=0, et 0,1 < 0,16 — le nudge était annulé
    /// avant même d'être visible.
    func test_nudgeFromSlideStart_actuallyMovesTheClip() async {
        let sut = await makeSUT(mediaObjects: [media("m1", start: 0, duration: 5)])

        sut.nudgeClipStart(id: "m1", by: 0.1)

        XCTAssertEqual(start(of: "m1", in: sut) ?? -1, 0.1, accuracy: 0.0001,
                       "Le stepper doit déplacer d'exactement un pas, sans se faire ravaler par l'aimant.")
    }

    /// Contraste explicite : le chemin du GESTE, lui, DOIT continuer d'aimanter
    /// — c'est ce qui rend un drag au doigt utilisable. Les deux chemins ont
    /// des exigences opposées, d'où deux méthodes distinctes.
    func test_theGesturePath_stillSnaps_soTheTwoPathsRemainDistinct() async {
        let sut = await makeSUT(mediaObjects: [media("m1", start: 0, duration: 5)])

        sut.dragClip(id: "m1", deltaTimeSeconds: 0.1, isCommitted: true)

        XCTAssertEqual(start(of: "m1", in: sut) ?? -1, 0, accuracy: 0.0001,
                       "Un déplacement au doigt sous la tolérance reste aimanté — comportement voulu.")
    }

    /// Deuxième cas courant : deux clips bout à bout. Le bord du voisin est un
    /// candidat d'aimant ; nudger de 0,1 s à côté de lui était sans effet.
    func test_nudgeNextToANeighbourEdge_actuallyMovesTheClip() async {
        let sut = await makeSUT(mediaObjects: [media("m1", start: 5, duration: 5),
                                               media("m2", start: 10, duration: 5)])

        sut.nudgeClipStart(id: "m2", by: -0.1)

        XCTAssertEqual(start(of: "m2", in: sut) ?? -1, 9.9, accuracy: 0.0001)
    }

    // MARK: - Bornes et no-op

    func test_nudgeBelowZero_clampsToTheSlideStart() async {
        let sut = await makeSUT(mediaObjects: [media("m1", start: 0.05, duration: 5)])
        sut.nudgeClipStart(id: "m1", by: -0.1)
        XCTAssertEqual(start(of: "m1", in: sut) ?? -1, 0, accuracy: 0.0001,
                       "Un clip ne commence jamais avant le début de la slide.")
    }

    func test_nudgeAlreadyAtZero_towardsTheLeft_pushesNoCommand() async {
        let sut = await makeSUT(mediaObjects: [media("m1", start: 0, duration: 5)])
        sut.nudgeClipStart(id: "m1", by: -0.1)
        XCTAssertFalse(sut.canUndo, "Un no-op ne doit pas polluer la pile d'annulation.")
    }

    func test_nudgeWithANonFiniteDelta_isIgnored() async {
        let sut = await makeSUT(mediaObjects: [media("m1", start: 2, duration: 5)])
        sut.nudgeClipStart(id: "m1", by: .nan)
        XCTAssertEqual(start(of: "m1", in: sut) ?? -1, 2, accuracy: 0.0001)
        XCTAssertFalse(sut.canUndo)
    }

    func test_nudgeOnAnUnknownClip_isIgnored() async {
        let sut = await makeSUT(mediaObjects: [media("m1", start: 2, duration: 5)])
        sut.nudgeClipStart(id: "ghost", by: 0.1)
        XCTAssertEqual(start(of: "m1", in: sut) ?? -1, 2, accuracy: 0.0001)
        XCTAssertFalse(sut.canUndo)
    }

    // MARK: - Historique

    func test_nudgeIsUndoable_andRedoable() async {
        let sut = await makeSUT(mediaObjects: [media("m1", start: 3, duration: 5)])

        sut.nudgeClipStart(id: "m1", by: 0.1)
        XCTAssertEqual(start(of: "m1", in: sut) ?? -1, 3.1, accuracy: 0.0001)

        sut.undo()
        XCTAssertEqual(start(of: "m1", in: sut) ?? -1, 3, accuracy: 0.0001)

        sut.redo()
        XCTAssertEqual(start(of: "m1", in: sut) ?? -1, 3.1, accuracy: 0.0001)
    }

    /// Déplacer un clip change la fenêtre de contenu : la durée de slide doit
    /// se recaler, comme sur tous les autres chemins d'édition.
    func test_nudgeRecomputesTheSlideDuration() async {
        let sut = await makeSUT(mediaObjects: [media("m1", start: 0, duration: 20)], slideDuration: 20)

        sut.nudgeClipStart(id: "m1", by: 0.1)

        XCTAssertEqual(sut.project.slideDuration, 20.1, accuracy: 0.01,
                       "La fenêtre du contenu s'étend de 0,1 s — la slide suit.")
    }

    /// Dix pas de 0,1 s doivent faire exactement 1 s : aucune dérive cumulée.
    func test_tenSuccessiveNudges_landExactlyOneSecondLater() async {
        let sut = await makeSUT(mediaObjects: [media("m1", start: 2, duration: 5)])
        for _ in 0..<10 { sut.nudgeClipStart(id: "m1", by: 0.1) }
        XCTAssertEqual(start(of: "m1", in: sut) ?? -1, 3.0, accuracy: 0.001)
    }
}
