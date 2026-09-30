import Testing
@testable import MeeshyUI

@Suite("FullscreenChromeState — ce que le plein écran peint")
struct FullscreenChromeStateTests {

    @Test("À l'ouverture, le chrome et son voile sont à l'écran")
    func test_initial_showsChromeAndScrims() {
        let state = FullscreenChromeState.initial
        #expect(state.showsChrome)
        #expect(state.showsScrims)
        #expect(state.overlay == nil)
        #expect(!state.isImmersive)
    }

    @Test("Un tap sur le média bascule l'immersion, aller et retour")
    func test_tappingMedia_withNothingOpen_togglesImmersion() {
        let immersive = FullscreenChromeState.initial.tappingMedia()
        #expect(immersive.isImmersive)
        #expect(!immersive.showsChrome)
        #expect(!immersive.showsScrims)
        #expect(immersive.tappingMedia() == .initial)
    }

    @Test("Un tap sur le média referme d'abord ce qui est ouvert, sans passer en immersion")
    func test_tappingMedia_withOverlayOpen_closesOverlayOnly() {
        let open = FullscreenChromeState.initial.opening(.reactions)
        let next = open.tappingMedia()
        #expect(next.overlay == nil)
        #expect(!next.isImmersive)
        #expect(next.showsChrome)
    }

    @Test("Une ouverture voile le reste du chrome et son voile")
    func test_opening_veilsChrome() {
        let state = FullscreenChromeState.initial.opening(.reply)
        #expect(state.isOpen(.reply))
        #expect(!state.showsChrome)
        #expect(!state.showsScrims)
    }

    @Test("Ouvrir une surface congédie l'autre")
    func test_opening_replacesTheOtherOverlay() {
        let state = FullscreenChromeState.initial.opening(.reactions).opening(.reply)
        #expect(state.isOpen(.reply))
        #expect(!state.isOpen(.reactions))
    }

    @Test("Le même bouton ouvre et referme sa surface")
    func test_toggling_opensThenCloses() {
        let open = FullscreenChromeState.initial.toggling(.reactions)
        #expect(open.isOpen(.reactions))
        #expect(open.toggling(.reactions) == .initial)
    }

    @Test("Basculer une AUTRE surface la remplace au lieu de tout fermer")
    func test_toggling_otherOverlay_replaces() {
        let state = FullscreenChromeState.initial.toggling(.reactions).toggling(.panel("comments"))
        #expect(state.isOpen(.panel("comments")))
    }

    @Test("Une ouverture n'existe jamais en immersion")
    func test_init_overlayForcesChromeOut() {
        let state = FullscreenChromeState(isImmersive: true, overlay: .reactions)
        #expect(!state.isImmersive)
        #expect(FullscreenChromeState.initial.tappingMedia().opening(.reply).isImmersive == false)
    }

    @Test("Changer de page retire l'ouverture et garde l'immersion")
    func test_turningPage_closesOverlayKeepsImmersion() {
        #expect(FullscreenChromeState.initial.opening(.reactions).turningPage() == .initial)
        let immersive = FullscreenChromeState(isImmersive: true)
        #expect(immersive.turningPage().isImmersive)
    }

    @Test("Ramener le chrome ne ferme rien")
    func test_revealing_keepsOverlay() {
        #expect(FullscreenChromeState(isImmersive: true).revealing() == .initial)
        #expect(FullscreenChromeState.initial.opening(.reply).revealing().isOpen(.reply))
    }

    @Test("Seule une lecture en cours, chrome visible et rien d'ouvert, s'efface d'elle-même")
    func test_autoHideDelay_onlyWhilePlayingWithChromeShown() {
        #expect(FullscreenChromeState.initial.autoHideDelay(isPlaying: true) == FullscreenChromeMetrics.autoHideDelay)
        #expect(FullscreenChromeState.initial.autoHideDelay(isPlaying: false) == nil)
        #expect(FullscreenChromeState.initial.opening(.reply).autoHideDelay(isPlaying: true) == nil)
        #expect(FullscreenChromeState(isImmersive: true).autoHideDelay(isPlaying: true) == nil)
    }

    @Test("Au terme du délai, le chrome s'efface — sauf si une ouverture est survenue")
    func test_autoHiding_respectsOverlay() {
        #expect(FullscreenChromeState.initial.autoHiding().isImmersive)
        let open = FullscreenChromeState.initial.opening(.reactions)
        #expect(open.autoHiding() == open)
    }
}
