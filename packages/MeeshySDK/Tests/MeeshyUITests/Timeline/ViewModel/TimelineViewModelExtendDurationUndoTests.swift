import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// « +10 s » allonge la timeline — et doit s'annuler comme tout le reste.
///
/// Le bouton écrivait `project.slideDuration` et `authoredSlideDuration` sans
/// passer par la pile de commandes : après un appui, « Annuler » restait grisé
/// et rien ne ramenait la timeline à sa longueur d'avant. Toutes les autres
/// opérations de la barre (déplacement, trim, fondu, volume, nom…) sont
/// annulables ; celle-ci faisait exception sans le dire.
@MainActor
final class TimelineViewModelExtendDurationUndoTests: XCTestCase {

    private func makeViewModel(slideDuration: Float) -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.06))
        var media = StoryMediaObject(id: "m1", postMediaId: "post-m1",
                                     kind: .video, aspectRatio: 1.0)
        media.startTime = 0
        media.duration = Double(slideDuration)
        vm.bootstrap(project: TimelineProject(slideId: "slide-1",
                                              slideDuration: slideDuration,
                                              mediaObjects: [media],
                                              audioPlayerObjects: [],
                                              textObjects: [],
                                              clipTransitions: []),
                     mediaURLs: [:], images: [:])
        return vm
    }

    func test_extendSlideDuration_enablesUndo() {
        let vm = makeViewModel(slideDuration: 6)
        XCTAssertFalse(vm.canUndo)

        vm.extendSlideDuration()

        XCTAssertTrue(vm.canUndo)
    }

    func test_undo_restoresPreviousDuration() {
        let vm = makeViewModel(slideDuration: 6)
        vm.extendSlideDuration()
        XCTAssertEqual(vm.project.slideDuration, 16)

        vm.undo()

        XCTAssertEqual(vm.project.slideDuration, 6)
    }

    /// La durée d'AUTEUR est le champ qui empêche le recalcul depuis le contenu
    /// d'effacer la demande. Annuler doit la reprendre aussi, sinon le prochain
    /// recalcul restaurerait les 16 s que l'auteur vient d'annuler.
    func test_undo_alsoRestoresAuthoredDuration() {
        let vm = makeViewModel(slideDuration: 6)
        vm.extendSlideDuration()
        XCTAssertEqual(vm.authoredSlideDuration, 16)

        vm.undo()

        XCTAssertNil(vm.authoredSlideDuration)
    }

    func test_redo_reappliesTheExtension() {
        let vm = makeViewModel(slideDuration: 6)
        vm.extendSlideDuration()
        vm.undo()

        vm.redo()

        XCTAssertEqual(vm.project.slideDuration, 16)
        XCTAssertEqual(vm.authoredSlideDuration, 16)
    }

    /// Deux prolongations = deux entrées d'historique distinctes : l'auteur qui
    /// dépasse d'un appui doit pouvoir en retirer un seul.
    func test_twoExtensions_undoOneAtATime() {
        let vm = makeViewModel(slideDuration: 6)
        vm.extendSlideDuration()
        vm.extendSlideDuration()
        XCTAssertEqual(vm.project.slideDuration, 26)

        vm.undo()

        XCTAssertEqual(vm.project.slideDuration, 16)
    }
}
