import XCTest
import UIKit
@testable import MeeshyUI

/// Behaviour tests for `ImageEditorViewModel` — editing, undo/redo, history
/// navigation, mode switching and export.
@MainActor
final class ImageEditorViewModelTests: XCTestCase {

    private func makeImage() -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 240, height: 180), format: format)
        return renderer.image { ctx in
            UIColor.systemIndigo.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 240, height: 180))
        }
    }

    private func makeSUT() -> ImageEditorViewModel {
        ImageEditorViewModel(image: makeImage(), context: .post)
    }

    func test_initialState_isIdentity_withNoEditsOrHistory() {
        let sut = makeSUT()
        XCTAssertEqual(sut.state, .identity)
        XCTAssertFalse(sut.hasEdits)
        XCTAssertFalse(sut.canUndo)
        XCTAssertFalse(sut.canRedo)
        XCTAssertEqual(sut.historySteps.count, 1)
    }

    func test_perform_appliesMutation_andRecordsHistory() {
        let sut = makeSUT()
        sut.perform("Vivid") { $0.filter = .vivid }
        XCTAssertEqual(sut.state.filter, .vivid)
        XCTAssertTrue(sut.hasEdits)
        XCTAssertTrue(sut.canUndo)
        XCTAssertEqual(sut.historySteps.count, 2)
    }

    func test_undo_revertsToPreviousState() {
        let sut = makeSUT()
        sut.perform("Vivid") { $0.filter = .vivid }
        sut.undo()
        XCTAssertEqual(sut.state, .identity)
        XCTAssertFalse(sut.canUndo)
        XCTAssertTrue(sut.canRedo)
    }

    func test_redo_reappliesUndoneState() {
        let sut = makeSUT()
        sut.perform("Vivid") { $0.filter = .vivid }
        sut.undo()
        sut.redo()
        XCTAssertEqual(sut.state.filter, .vivid)
        XCTAssertFalse(sut.canRedo)
    }

    func test_reset_revertsToIdentity() {
        let sut = makeSUT()
        sut.perform("Noir") { $0.filter = .noir }
        sut.perform("Contrast") { $0.adjustments.contrast = 1.4 }
        sut.reset()
        XCTAssertEqual(sut.state, .identity)
        XCTAssertFalse(sut.hasEdits)
    }

    func test_jump_toFirstStep_revertsToIdentity() {
        let sut = makeSUT()
        sut.perform("A") { $0.filter = .vivid }
        sut.perform("B") { $0.effect = .grain }
        sut.jump(to: sut.historySteps[0].id)
        XCTAssertEqual(sut.state, .identity)
        XCTAssertTrue(sut.canRedo)
    }

    func test_continuousUpdateWithoutCommit_doesNotGrowHistory() {
        let sut = makeSUT()
        sut.update { $0.adjustments.brightness = 0.1 }
        sut.update { $0.adjustments.brightness = 0.2 }
        sut.update { $0.adjustments.brightness = 0.3 }
        XCTAssertEqual(sut.historySteps.count, 1)
        sut.commit("Luminosité")
        XCTAssertEqual(sut.historySteps.count, 2)
        XCTAssertEqual(sut.state.adjustments.brightness, 0.3, accuracy: 0.0001)
    }

    func test_toggleMode_switchesBetweenSimpleAndPro() {
        let sut = makeSUT()
        let initial = sut.mode
        sut.toggleMode()
        XCTAssertEqual(sut.mode, initial.toggled)
        sut.toggleMode()
        XCTAssertEqual(sut.mode, initial)
    }

    func test_export_rendersANonEmptyImage() {
        let sut = makeSUT()
        sut.perform("Vivid") { $0.filter = .vivid }
        let exported = sut.export()
        XCTAssertGreaterThan(exported.size.width, 0)
        XCTAssertGreaterThan(exported.size.height, 0)
        XCTAssertNotNil(exported.cgImage)
    }

    func test_cropBackdrop_andComparisonImage_areRenderable() {
        let sut = makeSUT()
        sut.perform("Crop") { $0.cropNormalized = CGRect(x: 0, y: 0, width: 0.5, height: 0.5) }
        XCTAssertNotNil(sut.cropBackdrop().cgImage)
        XCTAssertNotNil(sut.comparisonImage().cgImage)
    }
}
