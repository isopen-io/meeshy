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
        XCTAssertFalse(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: false, textActive: false, timelineActive: false))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: true, drawingActive: false, textActive: false, timelineActive: false))
        // Mode dessin IMMERSIF (user 2026-07-11) : le dessin seul ne carde
        // PLUS — canvas plein écran, dessinable jusqu'aux angles, bulles
        // flottantes sans sheet. (Remplace la spec 2026-06-02 « identique
        // pour tous les outils, dessin inclus ».)
        XCTAssertFalse(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: true, textActive: false, timelineActive: false))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: false, textActive: true, timelineActive: false))
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: true, drawingActive: true, textActive: true, timelineActive: false))
        // Timeline (2026-07-14) : la timeline force le cadrage exactement
        // comme l'édition de texte — le panneau timeline est présenté via
        // l'override de ComposerControlsLayer pendant que
        // `bandStateMachine.state` reste `.hidden`, donc `bandPresent` seul
        // ne peut pas le voir.
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: false, textActive: false, timelineActive: true))
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

    // MARK: - Alignement vertical (directive user 2026-07-04 : carte flush sous le header)

    func test_resolve_topAlignment_cardStartsAtRegionTop() {
        // sideInset large → contrainte LARGEUR active → mou vertical présent :
        // c'est le cas discriminant entre .center (mou réparti) et .top (flush).
        let viewport = CGSize(width: 402, height: 874)
        func cardTop(_ alignment: StoryCanvasFraming.VerticalAlignment) -> CGFloat {
            let input = StoryCanvasFraming.Input(
                viewport: viewport, headerInset: 131, bottomInset: 64,
                sideInset: 60, state: .carded, cardedCornerRadius: 22,
                verticalAlignment: alignment)
            let r = StoryCanvasFraming.resolve(input)
            let scaledH = CanvasGeometry.aspectFitSize(in: viewport).height * r.scale
            return viewport.height / 2 + r.offset.height - scaledH / 2
        }
        XCTAssertEqual(cardTop(.top), 131, accuracy: 0.5,
                       "flush sous le header — plus de vide au-dessus de la carte")
        XCTAssertGreaterThan(cardTop(.center), 131 + 20,
                             "le mode historique répartissait le mou en haut ET en bas")
    }

    func test_resolve_defaultAlignment_staysCenter() {
        let input = StoryCanvasFraming.Input(
            viewport: CGSize(width: 402, height: 874), headerInset: 131,
            bottomInset: 64, sideInset: 60, state: .carded, cardedCornerRadius: 22)
        XCTAssertEqual(input.verticalAlignment, .center,
                       "compat : les call sites existants (composer) gardent le centrage")
    }

    func test_resolve_landscapeTopAlignment_flushesUnderHeader() {
        // A landscape 16:9 canvas is width-constrained → short, leaving vertical
        // slack in the reduced region (sheet/keyboard up). `.top` must flush it
        // under the header (« canvas horizontal bouge entièrement vers le haut »),
        // not centre it with a gap above.
        let viewport = CGSize(width: 402, height: 874)
        let headerInset: CGFloat = 100
        func cardTop(_ alignment: StoryCanvasFraming.VerticalAlignment) -> CGFloat {
            let input = StoryCanvasFraming.Input(
                viewport: viewport, headerInset: headerInset, bottomInset: 300,
                state: .carded, cardedCornerRadius: 22,
                verticalAlignment: alignment,
                canvasRatio: CanvasGeometry.landscapeRatio)
            let r = StoryCanvasFraming.resolve(input)
            let scaledH = CanvasGeometry.aspectFitSize(in: viewport, ratio: CanvasGeometry.landscapeRatio).height * r.scale
            return viewport.height / 2 + r.offset.height - scaledH / 2
        }
        XCTAssertEqual(cardTop(.top), headerInset, accuracy: 0.5,
                       "landscape card must flush under the header with .top")
        XCTAssertGreaterThan(cardTop(.center), headerInset + 10,
                             "sanity: .center leaves a gap above the short landscape card")
    }

    // MARK: - Canvas paysage (fond 16:9 impose la forme horizontale)

    func test_resolve_landscapeRatio_cardIsSixteenNine() {
        let vp = viewport()
        let r = StoryCanvasFraming.resolve(StoryCanvasFraming.Input(
            viewport: vp, headerInset: 100, bottomInset: 320,
            state: .carded, cardedCornerRadius: 22,
            canvasRatio: CanvasGeometry.landscapeRatio))
        let intrinsic = CanvasGeometry.aspectFitSize(in: vp, ratio: CanvasGeometry.landscapeRatio)
        // La carte est le canvas 16:9 intrinsèque réduit par framing.scale : son
        // ratio présenté reste 16:9, et elle tient dans la région libre.
        XCTAssertEqual(intrinsic.width / intrinsic.height, 16.0 / 9.0, accuracy: 0.0001)
        XCTAssertGreaterThan(r.scale, 0)
        XCTAssertLessThanOrEqual(r.scale, 1)
    }

    func test_resolve_defaultRatio_isPortrait() {
        // Un `Input` sans `canvasRatio` explicite reste 9:16 — le comportement
        // par défaut « vertical » attendu pour toutes les stories existantes.
        let input = StoryCanvasFraming.Input(
            viewport: viewport(), headerInset: 100, bottomInset: 320,
            state: .carded, cardedCornerRadius: 22)
        XCTAssertEqual(input.canvasRatio, CanvasGeometry.portraitRatio, accuracy: 0.0001)
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

    // MARK: - Alignement .bottom (carte paysage collée au sheet, user 2026-07-20)

    private func landscapeInput(_ align: StoryCanvasFraming.VerticalAlignment,
                                bottomInset: CGFloat = 320) -> StoryCanvasFraming.Input {
        StoryCanvasFraming.Input(
            viewport: CGSize(width: 402, height: 874),
            headerInset: 74, bottomInset: bottomInset, sideInset: 14,
            state: .carded, cardedCornerRadius: 22,
            verticalAlignment: align, canvasRatio: 16.0 / 9.0)
    }

    func test_resolve_bottomAlignment_landscape_cardBottomSitsAtRegionBottom() {
        // Une carte PAYSAGE `.bottom` colle son bord BAS à `regionBottom`
        // (= viewport.height − bottomInset), juste au-dessus du sheet.
        let bottomInset: CGFloat = 320
        let r = StoryCanvasFraming.resolve(landscapeInput(.bottom, bottomInset: bottomInset))
        let intrinsicH = 402.0 / (16.0 / 9.0)          // fit-par-largeur (16:9)
        let scaledH = intrinsicH * r.scale
        let cardBottom = 874.0 / 2 + r.offset.height + scaledH / 2
        XCTAssertEqual(cardBottom, 874.0 - bottomInset, accuracy: 0.5,
            "Carte paysage .bottom : bord bas au ras du sheet (regionBottom).")
    }

    func test_resolve_bottomVsCenter_landscape_bottomIsLower() {
        // `.bottom` place la carte PLUS BAS (offset y plus grand) que `.center`.
        let bottom = StoryCanvasFraming.resolve(landscapeInput(.bottom)).offset.height
        let center = StoryCanvasFraming.resolve(landscapeInput(.center)).offset.height
        XCTAssertGreaterThan(bottom, center,
            ".bottom colle la carte au sheet ; .center la remonte au milieu de la région.")
    }
}
