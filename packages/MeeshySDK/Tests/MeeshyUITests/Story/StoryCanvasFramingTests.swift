import XCTest
import CoreGraphics
@testable import MeeshyUI

final class StoryCanvasFramingTests: XCTestCase {

    private func viewport() -> CGSize { CGSize(width: 402, height: 874) }

    private func makeInput(
        viewport: CGSize? = nil,
        headerInset: CGFloat = 100,
        bottomInset: CGFloat = 320,
        state: StoryCanvasFraming.Presentation = .carded,
        cornerRadius: CGFloat = 22
    ) -> StoryCanvasFraming.Input {
        StoryCanvasFraming.Input(
            viewport: viewport ?? self.viewport(),
            headerInset: headerInset,
            bottomInset: bottomInset,
            state: state,
            cardedCornerRadius: cornerRadius
        )
    }

    func test_resolve_free_isIdentityNoCorners() {
        let r = StoryCanvasFraming.resolve(makeInput(state: .free))
        XCTAssertEqual(r.scale, 1, accuracy: 0.0001)
        XCTAssertEqual(r.offset, .zero)
        XCTAssertEqual(r.cornerRadius, 0, accuracy: 0.0001)
    }

    func test_resolve_immersive_isIdentityNoCorners() {
        let r = StoryCanvasFraming.resolve(makeInput(state: .immersive))
        XCTAssertEqual(r.scale, 1, accuracy: 0.0001)
        XCTAssertEqual(r.offset, .zero)
        XCTAssertEqual(r.cornerRadius, 0, accuracy: 0.0001)
    }

    func test_resolve_carded_shrinksAndRoundsCorners() {
        let r = StoryCanvasFraming.resolve(makeInput(state: .carded))
        XCTAssertLessThan(r.scale, 1)
        XCTAssertGreaterThan(r.scale, 0)
        XCTAssertEqual(r.cornerRadius, 22, accuracy: 0.0001)
    }

    func test_resolve_carded_symmetricInsets_sameCardSizeOwnVsOthers() {
        let own = StoryCanvasFraming.resolve(makeInput(headerInset: 100, bottomInset: 130))
        let others = StoryCanvasFraming.resolve(makeInput(headerInset: 100, bottomInset: 130))
        XCTAssertEqual(own.scale, others.scale, accuracy: 0.0001)
        XCTAssertEqual(own.offset.height, others.offset.height, accuracy: 0.0001)
        XCTAssertEqual(own.cornerRadius, others.cornerRadius, accuracy: 0.0001)
    }

    func test_resolve_carded_scaleMonotonicallyDecreasesWithBottomInset() {
        let small = StoryCanvasFraming.resolve(makeInput(bottomInset: 200)).scale
        let mid = StoryCanvasFraming.resolve(makeInput(bottomInset: 360)).scale
        let large = StoryCanvasFraming.resolve(makeInput(bottomInset: 520)).scale
        XCTAssertGreaterThan(small, mid)
        XCTAssertGreaterThan(mid, large)
    }

    func test_resolve_carded_collapsedSheet_scaleApproachesFull() {
        let r = StoryCanvasFraming.resolve(makeInput(headerInset: 0, bottomInset: 0))
        XCTAssertEqual(r.scale, 1, accuracy: 0.001)
    }

    func test_resolve_carded_canvasBottomNeverBelowSheetTop() {
        let vp = viewport()
        let headerInset: CGFloat = 100
        let bottomInset: CGFloat = 360
        let r = StoryCanvasFraming.resolve(makeInput(headerInset: headerInset, bottomInset: bottomInset))
        let intrinsic = CanvasGeometry.aspectFitSize(in: vp)
        let presentedHeight = intrinsic.height * r.scale
        let centerY = vp.height / 2 + r.offset.height
        let canvasBottom = centerY + presentedHeight / 2
        let sheetTop = vp.height - bottomInset
        XCTAssertLessThanOrEqual(canvasBottom, sheetTop + 0.5)
    }

    func test_resolve_carded_canvasTopNeverAboveHeaderBottom() {
        let vp = viewport()
        let headerInset: CGFloat = 120
        let r = StoryCanvasFraming.resolve(makeInput(headerInset: headerInset, bottomInset: 360))
        let intrinsic = CanvasGeometry.aspectFitSize(in: vp)
        let presentedHeight = intrinsic.height * r.scale
        let centerY = vp.height / 2 + r.offset.height
        let canvasTop = centerY - presentedHeight / 2
        XCTAssertGreaterThanOrEqual(canvasTop, headerInset - 0.5)
    }

    func test_resolve_zeroViewport_returnsSafeIdentity() {
        let r = StoryCanvasFraming.resolve(makeInput(viewport: .zero, state: .carded))
        XCTAssertEqual(r.scale, 1, accuracy: 0.0001)
        XCTAssertEqual(r.offset, .zero)
        XCTAssertEqual(r.cornerRadius, 0, accuracy: 0.0001)
    }

    func test_isCarded_truthTable() {
        XCTAssertFalse(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: false, textActive: false))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: true, drawingActive: false, textActive: false))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: true, textActive: false))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: false, textActive: true))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: true, drawingActive: true, textActive: true))
    }
}
