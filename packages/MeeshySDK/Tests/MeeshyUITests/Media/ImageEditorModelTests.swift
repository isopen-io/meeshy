import XCTest
import CoreGraphics
@testable import MeeshyUI

/// Unit tests for the pure model layer of the image editor: `ImageEditState`,
/// `ImageAdjustments`, `AdjustmentKind` and `ImageEditorMode`.
final class ImageEditorModelTests: XCTestCase {

    // MARK: - ImageEditState

    func test_identity_hasNoEdits() {
        XCTAssertFalse(ImageEditState.identity.hasEdits)
        XCTAssertFalse(ImageEditState.identity.hasGeometryEdits)
    }

    func test_settingFilter_marksColourEditButNotGeometry() {
        var state = ImageEditState.identity
        state.filter = .vivid
        XCTAssertTrue(state.hasEdits)
        XCTAssertFalse(state.hasGeometryEdits)
    }

    func test_orientationTurns_areNormalizedIntoZeroToThree() {
        XCTAssertEqual(ImageEditState(orientationTurns: 5).orientationTurns, 1)
        XCTAssertEqual(ImageEditState(orientationTurns: -1).orientationTurns, 3)
        XCTAssertEqual(ImageEditState(orientationTurns: 4).orientationTurns, 0)
    }

    func test_rotateClockwise_fourTimes_returnsToOrigin() {
        var state = ImageEditState.identity
        for _ in 0..<4 { state.rotateClockwise() }
        XCTAssertEqual(state.orientationTurns, 0)
    }

    func test_rotateClockwise_marksGeometryEdit() {
        var state = ImageEditState.identity
        state.rotateClockwise()
        XCTAssertTrue(state.hasGeometryEdits)
        XCTAssertEqual(state.orientationTurns, 1)
    }

    func test_rotateRectCW_movesLeftStripToTopStrip() {
        let leftStrip = CGRect(x: 0, y: 0, width: 0.5, height: 1)
        XCTAssertEqual(ImageEditState.rotateRectCW(leftStrip),
                       CGRect(x: 0, y: 0, width: 1, height: 0.5))
    }

    func test_rotateRectCW_fourTimes_isIdentity() {
        let rect = CGRect(x: 0.1, y: 0.2, width: 0.3, height: 0.4)
        var rotated = rect
        for _ in 0..<4 { rotated = ImageEditState.rotateRectCW(rotated) }
        assertRectEqual(rotated, rect)
    }

    func test_flipRectHorizontal_mirrorsAcrossX() {
        let rect = CGRect(x: 0.1, y: 0.2, width: 0.3, height: 0.4)
        XCTAssertEqual(ImageEditState.flipRectHorizontal(rect),
                       CGRect(x: 0.6, y: 0.2, width: 0.3, height: 0.4))
    }

    func test_flipRectVertical_mirrorsAcrossY() {
        let rect = CGRect(x: 0.1, y: 0.2, width: 0.3, height: 0.4)
        XCTAssertEqual(ImageEditState.flipRectVertical(rect),
                       CGRect(x: 0.1, y: 0.4, width: 0.3, height: 0.4))
    }

    func test_rotateClockwise_carriesExistingCropIntoNewFrame() {
        var state = ImageEditState.identity
        state.cropNormalized = CGRect(x: 0, y: 0, width: 0.5, height: 1)
        state.rotateClockwise()
        XCTAssertEqual(state.cropNormalized, CGRect(x: 0, y: 0, width: 1, height: 0.5))
    }

    func test_codableRoundTrip_preservesEveryField() throws {
        var state = ImageEditState.identity
        state.filter = .dramatic
        state.effect = .grain
        state.orientationTurns = 2
        state.flipHorizontal = true
        state.cropNormalized = CGRect(x: 0.1, y: 0.1, width: 0.8, height: 0.8)
        state.adjustments.contrast = 1.3
        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(ImageEditState.self, from: data)
        XCTAssertEqual(decoded, state)
    }

    // MARK: - ImageAdjustments

    func test_neutralAdjustments_areNeutral() {
        XCTAssertTrue(ImageAdjustments.neutral.isNeutral)
        XCTAssertEqual(ImageAdjustments.neutral.activeCount, 0)
    }

    func test_subscript_clampsValuesToKindRange() {
        var adjustments = ImageAdjustments.neutral
        adjustments[.contrast] = 99
        XCTAssertEqual(adjustments.contrast, AdjustmentKind.contrast.range.upperBound)
        adjustments[.exposure] = -99
        XCTAssertEqual(adjustments.exposure, AdjustmentKind.exposure.range.lowerBound)
    }

    func test_activeCount_countsAdjustmentsAwayFromNeutral() {
        var adjustments = ImageAdjustments.neutral
        adjustments[.brightness] = 0.2
        adjustments[.saturation] = 1.4
        XCTAssertEqual(adjustments.activeCount, 2)
    }

    func test_everyAdjustmentKind_hasNeutralValueInsideItsRange() {
        for kind in AdjustmentKind.allCases {
            XCTAssertTrue(kind.range.contains(kind.neutralValue),
                          "\(kind) neutral value outside range")
        }
    }

    func test_essentialAdjustments_areBrightnessContrastSaturation() {
        let essential = Set(AdjustmentKind.allCases.filter(\.isEssential))
        XCTAssertEqual(essential, [.brightness, .contrast, .saturation])
    }

    // MARK: - ImageEditorMode

    func test_imageEditorMode_togglesBetweenSimpleAndPro() {
        XCTAssertEqual(ImageEditorMode.simple.toggled, .pro)
        XCTAssertEqual(ImageEditorMode.pro.toggled, .simple)
        XCTAssertTrue(ImageEditorMode.pro.isPro)
        XCTAssertFalse(ImageEditorMode.simple.isPro)
    }

    // MARK: - Helpers

    private func assertRectEqual(_ a: CGRect, _ b: CGRect,
                                 accuracy: CGFloat = 0.0001,
                                 file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(a.minX, b.minX, accuracy: accuracy, file: file, line: line)
        XCTAssertEqual(a.minY, b.minY, accuracy: accuracy, file: file, line: line)
        XCTAssertEqual(a.width, b.width, accuracy: accuracy, file: file, line: line)
        XCTAssertEqual(a.height, b.height, accuracy: accuracy, file: file, line: line)
    }
}
