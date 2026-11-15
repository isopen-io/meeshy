import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Balayage des index — le composer de story désigne une slide par son ID, pas
/// par sa position du moment.
@MainActor
final class StoryComposerSlideIdentityTests: XCTestCase {

    /// Le sélecteur de photos a épinglé la slide A ; l'auteur la supprime
    /// pendant le chargement. L'image atterrissait sur la slide visible.
    func test_insertForegroundImage_intoADeletedSlide_landsNowhere() {
        let vm = StoryComposerViewModel()
        vm.addSlide()
        let pinned = vm.slides[0].id
        vm.removeSlide(at: 0)

        XCTAssertNil(vm.insertForegroundImage(UIImage(), fileURL: nil, intoSlideId: pinned, objectId: "x"))
        XCTAssertTrue(vm.slides.allSatisfy { ($0.effects.mediaObjects ?? []).isEmpty })
    }

    /// [A, B, C] sur C ; supprimer A garde C ; annuler rendait la position 1,
    /// donc B. L'éditeur doit rester sur C.
    func test_undoGlobal_afterDeletingAnEarlierSlide_staysOnTheEditedSlide() {
        let vm = StoryComposerViewModel()
        vm.addSlide()
        vm.addSlide()
        XCTAssertEqual(vm.currentSlideIndex, 2)
        let edited = vm.slides[2].id
        vm.seedHistory()
        vm.removeSlide(at: 0)
        vm.pushHistorySnapshot()
        XCTAssertEqual(vm.slides[vm.currentSlideIndex].id, edited)

        XCTAssertTrue(vm.undoGlobal())

        XCTAssertEqual(vm.slides.count, 3)
        XCTAssertEqual(vm.slides[vm.currentSlideIndex].id, edited)
    }
}
