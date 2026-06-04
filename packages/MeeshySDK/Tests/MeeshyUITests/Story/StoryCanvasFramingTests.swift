import XCTest
import CoreGraphics
@testable import MeeshyUI

final class StoryCanvasFramingTests: XCTestCase {

    private func viewport() -> CGSize { CGSize(width: 402, height: 874) }

    private func makeInput(
        viewport: CGSize? = nil,
        headerInset: CGFloat = 100,
        bottomInset: CGFloat = 320,
        sideInset: CGFloat = 0,
        state: StoryCanvasFraming.Presentation = .carded,
        cornerRadius: CGFloat = 22
    ) -> StoryCanvasFraming.Input {
        StoryCanvasFraming.Input(
            viewport: viewport ?? self.viewport(),
            headerInset: headerInset,
            bottomInset: bottomInset,
            sideInset: sideInset,
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

    func test_resolve_carded_sideInset_keepsHorizontalMargins() {
        // With a side inset the canvas card never spans the full viewport width — even with
        // a tiny bottom inset (drawer collapsed) — so it stays distinguished from the
        // viewport edges, and remains rounded (user spec 2026-06-02).
        let vp = viewport()
        let sideInset: CGFloat = 16
        let r = StoryCanvasFraming.resolve(
            makeInput(headerInset: 80, bottomInset: 40, sideInset: sideInset))
        let intrinsic = CanvasGeometry.aspectFitSize(in: vp)
        let cardWidth = intrinsic.width * r.scale
        XCTAssertLessThanOrEqual(cardWidth, vp.width - 2 * sideInset + 0.5,
                                 "card must keep horizontal margins (not full-bleed)")
        XCTAssertGreaterThan(r.cornerRadius, 0)
        XCTAssertLessThan(r.scale, 1)
    }

    func test_resolve_carded_fullSize_keepsRoundedCorners() {
        // "Rounded card, always" (user 2026-06-02): a carded canvas (any tool active) keeps
        // its rounded corners even when it fills the viewport — e.g. drawer collapsed to a
        // handle → scale≈1. Pre-fix the corner dropped to 0 once scale hit 1 → square
        // full-bleed canvas, which the user flagged ("ni les bordures arrondies").
        let r = StoryCanvasFraming.resolve(makeInput(headerInset: 0, bottomInset: 0))
        XCTAssertEqual(r.scale, 1, accuracy: 0.001)
        XCTAssertEqual(r.cornerRadius, 22, accuracy: 0.0001,
                       "a carded canvas stays rounded even at full size")
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

    // MARK: - readerPresentation (reader expand-on-hide truth-table)

    func test_readerPresentation_normalMode_chromeVisible_isCarded() {
        // Au repos en mode normal (chrome visible) → carte arrondie marginée.
        XCTAssertEqual(
            StoryCanvasFraming.readerPresentation(isFullscreenSession: false, chromeVisible: true),
            .carded)
    }

    func test_readerPresentation_normalMode_chromeHidden_isFree() {
        // Long-press masque le chrome → le canvas épouse le viewport (plein bord 9:16).
        XCTAssertEqual(
            StoryCanvasFraming.readerPresentation(isFullscreenSession: false, chromeVisible: false),
            .free)
    }

    func test_readerPresentation_fullscreenSession_alwaysFree() {
        // En session plein écran, le canvas reste plein bord même quand le chrome
        // ré-apparaît temporairement (touch-and-hold peek) — pas de re-cardage.
        XCTAssertEqual(
            StoryCanvasFraming.readerPresentation(isFullscreenSession: true, chromeVisible: true),
            .free)
        XCTAssertEqual(
            StoryCanvasFraming.readerPresentation(isFullscreenSession: true, chromeVisible: false),
            .free)
    }
}
