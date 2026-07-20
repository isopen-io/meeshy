import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Bande d'opérations de la timeline (retour user 2026-07-20) : snap, annuler,
/// rétablir et enregistrer déménagent du transport vers une bande dédiée sous
/// la bande des outils, qui porte aussi le bouton « +10 s » de prolongation.
@MainActor
final class TimelineOperationsBarTests: XCTestCase {

    func test_extendStep_isTenSeconds() {
        XCTAssertEqual(TimelineOperationsBar.extendStepSeconds, 10, accuracy: 0.001)
    }

    func test_init_doesNotCrash() {
        let bar = TimelineOperationsBar(
            canUndo: true, canRedo: false, isSnapEnabled: true,
            onUndo: {}, onRedo: {}, onSnapToggle: {},
            onExtendDuration: {}, onSave: {}
        )
        _ = bar.body
    }

    func test_init_withoutSave_doesNotCrash() {
        let bar = TimelineOperationsBar(
            canUndo: false, canRedo: false, isSnapEnabled: false,
            onUndo: {}, onRedo: {}, onSnapToggle: {},
            onExtendDuration: {}, onSave: nil
        )
        _ = bar.body
    }

    // MARK: - Prolongation de la durée (VM)

    private func makeVM(slideDuration: Float) -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.06))
        vm.bootstrap(project: TimelineProjectFactory.emptyProject(duration: slideDuration),
                     mediaURLs: [:], images: [:])
        return vm
    }

    func test_extendSlideDuration_addsTenSeconds() {
        let vm = makeVM(slideDuration: 12)
        vm.extendSlideDuration()
        XCTAssertEqual(vm.project.slideDuration, 22, accuracy: 0.001)
    }

    func test_extendSlideDuration_clampsAtMaxDuration() {
        let vm = makeVM(slideDuration: 595)
        vm.extendSlideDuration()
        XCTAssertEqual(vm.project.slideDuration, 600, accuracy: 0.001,
                       "setSlideDuration plafonne à 600 s — la prolongation respecte le même clamp")
    }
}
