import Testing
import CoreGraphics
@testable import MeeshyUI

@Suite("FullscreenChromeMetrics — un gabarit, dérivé des jetons")
struct FullscreenChromeMetricsTests {

    @Test("Le disque et sa cible viennent de MeeshyControlSize ; la cible déborde le disque")
    func test_disc_andTarget_derivedFromControlSizes() {
        #expect(FullscreenChromeMetrics.discDiameter == MeeshyControlSize.regular)
        #expect(FullscreenChromeMetrics.tapTarget == MeeshyControlSize.tapTarget)
        #expect(FullscreenChromeMetrics.tapTarget >= 44)
        #expect(FullscreenChromeMetrics.tapTarget > FullscreenChromeMetrics.discDiameter)
    }

    @Test("Les glyphes viennent de MeeshyIconSize")
    func test_glyphs_derivedFromIconSizes() {
        #expect(FullscreenChromeMetrics.discGlyphSize == MeeshyIconSize.lg)
        #expect(FullscreenChromeMetrics.floatingGlyphSize == MeeshyIconSize.xxl)
    }

    @Test("Une cellule flottante tient une cible tactile de large")
    func test_floatingCell_holdsATapTarget() {
        #expect(FullscreenChromeMetrics.floatingCellWidth >= FullscreenChromeMetrics.tapTarget)
        #expect(FullscreenChromeMetrics.reactionStripLeadingOffset == -FullscreenChromeMetrics.floatingCellWidth)
    }

    @Test("Le disque visible tombe sur la gouttière du chrome")
    func test_topBar_placesTheDiscOnTheGutter() {
        let overflow = (FullscreenChromeMetrics.tapTarget - FullscreenChromeMetrics.discDiameter) / 2
        #expect(FullscreenTopBarLayout.horizontalPadding + overflow == FullscreenChromeMetrics.edgeInset)
        #expect(FullscreenChromeMetrics.edgeInset == MeeshySpacing.lg)
    }

    @Test("Les gestes et l'effacement gardent les valeurs de la galerie et du lecteur vidéo")
    func test_gestureAndAutoHide_values() {
        #expect(FullscreenChromeMetrics.dismissDragThreshold == 150)
        #expect(FullscreenChromeMetrics.autoHideDelay == 3)
    }

    @Test("Un verbe, un glyphe")
    func test_symbols_pinned() {
        #expect(FullscreenChromeSymbol.close == "xmark")
        #expect(FullscreenChromeSymbol.more == "ellipsis")
        #expect(FullscreenChromeSymbol.react == "face.smiling")
        #expect(FullscreenChromeSymbol.reactBadge == "plus")
        #expect(FullscreenChromeSymbol.reply == "arrowshape.turn.up.left.fill")
        #expect(FullscreenChromeSymbol.comments == "bubble.right.fill")
    }

    @Test("Le voile garde les valeurs du lecteur de story (#6701)")
    func test_scrims_keepStoryValues() {
        #expect(FullscreenScrimMetrics.topExtent == 110)
        #expect(FullscreenScrimMetrics.bottomHeight == 240)
        #expect(FullscreenScrimMetrics.topStops == [
            FullscreenScrimStop(opacity: 0.7, location: 0),
            FullscreenScrimStop(opacity: 0.4, location: 0.5),
            FullscreenScrimStop(opacity: 0, location: 1)
        ])
        #expect(FullscreenScrimMetrics.bottomStops == [
            FullscreenScrimStop(opacity: 0, location: 0),
            FullscreenScrimStop(opacity: 0.55, location: 0.45),
            FullscreenScrimStop(opacity: 0.92, location: 1)
        ])
    }

    @Test("Le voile suit le chrome : plein avec lui, nul sans lui")
    func test_scrimOpacity_followsChrome() {
        #expect(FullscreenScrims.opacity(chromeVisible: true) == 1)
        #expect(FullscreenScrims.opacity(chromeVisible: false) == 0)
    }

    @Test("Seule une action flottante écrit sa légende, et jamais une légende vide")
    func test_actionStyle_caption() {
        #expect(FullscreenActionStyle.floating.showsCaption("Répondre"))
        #expect(!FullscreenActionStyle.floating.showsCaption(nil))
        #expect(!FullscreenActionStyle.floating.showsCaption(""))
        #expect(!FullscreenActionStyle.disc(.onMedia).showsCaption("Répondre"))
        #expect(!FullscreenActionStyle.disc(.adaptive).showsCaption("12"))
    }
}
