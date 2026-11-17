import XCTest
import SwiftUI
import PencilKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class ComposerControlsLayerTests: XCTestCase {

    // MARK: - Helpers

    private func makeVM() -> StoryComposerViewModel {
        StoryComposerViewModel()
    }

    // MARK: - bandState changes drive view tree

    func test_badges_useViewModelCounts() {
        let vm = makeVM()
        // Default empty composer
        XCTAssertEqual(vm.currentEffects.textObjects.count, 0)
        XCTAssertEqual(vm.currentEffects.mediaObjects?.count ?? 0, 0)
    }

    // MARK: - Gardes de source (D4 — masquer le chrome doit être atteignable
    // sans geste physique)

    // MARK: - Layer construction helper

}
