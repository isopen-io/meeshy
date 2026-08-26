import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **B1 (#3924) — changer de mode ne jette jamais le contenu.**
/// Le composer garde UN seul contenu ; la scène qui naît le reçoit sur sa
/// slide courante via le point d'entrée public `applyContentText`, d'où il
/// partira à la publication (et où B2 le rendra dans une section repliable).
@MainActor
final class StoryComposerContentPreservationTests: XCTestCase {

    func test_applyContentText_semeLeContenuSurLaSlideCourante() {
        let vm = StoryComposerViewModel()
        vm.applyContentText("Bonjour le monde")
        XCTAssertEqual(vm.currentSlide.content, "Bonjour le monde",
                       "Le contenu écrit au composer SUIT sur la slide de la scène.")
    }

    func test_applyContentText_videMetNil_pasDeContenuFantome() {
        let vm = StoryComposerViewModel()
        vm.applyContentText("x")
        vm.applyContentText("")
        XCTAssertNil(vm.currentSlide.content,
                     "Un contenu vidé devient nil — jamais une chaîne vide fantôme.")
    }
}
