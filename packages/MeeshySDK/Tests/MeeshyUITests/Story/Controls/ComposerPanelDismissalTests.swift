import XCTest
@testable import MeeshyUI

/// T10 + T8 — la SORTIE de panneau, testée sur le signal produit et pas
/// seulement sur son enveloppe.
///
/// La chaîne réellement corrigée est : tap fond → `backgroundTapAction` →
/// `dismissing(ctx)` → contexte résultant → `fullChromeVisible == true`. Tester
/// les deux extrémités et jamais la COMPOSITION est ce qui avait laissé passer
/// le trou de l'empty-state (`feedback_verify_generated_signal_not_just_its_envelope`).
/// L'applicateur `dismissActiveBandPanel()` vit dans une extension de View non
/// montable : la décision est donc extraite en fonction PURE, et la vue n'en est
/// plus qu'un applicateur trivial (vérifié par les gardes de source en fin de
/// fichier).
final class ComposerPanelDismissalTests: XCTestCase {

    private func context(
        machineState: BandState = .hidden,
        isChromeHidden: Bool = false,
        isTextEditing: Bool = false,
        isDrawingActive: Bool = false,
        isDrawingImmersive: Bool = false,
        isViewportZoomed: Bool = false,
        isTimelineVisible: Bool = false,
        isBlankAuthoringSlide: Bool = false,
        isDraftResumePresented: Bool = false
    ) -> ComposerChromeContext {
        ComposerChromeContext(
            machineState: machineState,
            isChromeHidden: isChromeHidden,
            isTextEditing: isTextEditing,
            isDrawingActive: isDrawingActive,
            isDrawingImmersive: isDrawingImmersive,
            isViewportZoomed: isViewportZoomed,
            isTimelineVisible: isTimelineVisible,
            isBlankAuthoringSlide: isBlankAuthoringSlide,
            isDraftResumePresented: isDraftResumePresented
        )
    }

    // MARK: - La composition, de bout en bout

    func test_dismissing_fromToolPanel_yieldsFullChromeVisible() {
        let outcome = ComposerChromePolicy.dismissing(context(machineState: .toolPanel(.media)))
        XCTAssertTrue(ComposerChromePolicy.fullChromeVisible(outcome.resultingContext))
        XCTAssertFalse(outcome.clearActiveTool)
        XCTAssertFalse(outcome.clearTimeline)
        XCTAssertFalse(outcome.clearSelection)
    }

    func test_dismissing_fromTimelineOverride_yieldsFullChromeVisible() {
        let outcome = ComposerChromePolicy.dismissing(context(isTimelineVisible: true))
        XCTAssertTrue(
            outcome.clearTimeline,
            "Sans ça, `effectiveBandState` re-force aussitôt le panneau timeline et « Retour » est un no-op."
        )
        XCTAssertTrue(ComposerChromePolicy.fullChromeVisible(outcome.resultingContext))
    }

    func test_dismissing_fromDrawingList_exitsDrawingAndYieldsFullChromeVisible() {
        let outcome = ComposerChromePolicy.dismissing(context(isDrawingActive: true))
        XCTAssertTrue(outcome.clearActiveTool)
        XCTAssertTrue(ComposerChromePolicy.fullChromeVisible(outcome.resultingContext))
    }

    func test_dismissing_fromFormatPanel_clearsSelection() {
        let outcome = ComposerChromePolicy.dismissing(
            context(machineState: .formatPanel(.text, elementId: "txt-1")))
        XCTAssertTrue(outcome.clearSelection)
        XCTAssertTrue(ComposerChromePolicy.fullChromeVisible(outcome.resultingContext))
    }

    /// Verrouille le scénario de l'empty-state : le chrome avait été masqué sur
    /// un canvas vierge (état brut `.hidden`), puis la tuile Timeline a ouvert un
    /// panneau EFFECTIF sans faire transiter la machine. Sortir de ce panneau
    /// doit rendre le chrome — sinon l'écran nu se rejoue en 4 taps.
    func test_dismissing_whileChromeHidden_yieldsFullChromeVisible() {
        let outcome = ComposerChromePolicy.dismissing(
            context(isChromeHidden: true, isTimelineVisible: true))
        XCTAssertFalse(outcome.resultingContext.isChromeHidden)
        XCTAssertTrue(ComposerChromePolicy.fullChromeVisible(outcome.resultingContext))
    }

    func test_dismissing_preservesViewportZoom() {
        let outcome = ComposerChromePolicy.dismissing(
            context(machineState: .toolPanel(.media), isViewportZoomed: true))
        XCTAssertTrue(
            outcome.resultingContext.isViewportZoomed,
            "Fermer un panneau ne remet pas le viewport à l'échelle 1 — ce n'est pas son rôle."
        )
    }

    // MARK: - `resultingContext` — ce qui SURVIT à la sortie de panneau

    /// S5 a supprimé le picker d'état vide : la barre d'outils standard est
    /// montée en permanence, donc la poignée de restauration du chrome existe
    /// toujours dans l'arbre et il n'y a plus rien à « faire réapparaître ». Ce
    /// qui doit survivre, en revanche, c'est la BLANCHEUR de la slide — c'est
    /// elle qui décide du retour des amorces après la fermeture du panneau.
    func test_dismissing_onABlankSlide_keepsTheSlideBlankInTheResultingContext() {
        let outcome = ComposerChromePolicy.dismissing(
            context(isDrawingActive: true, isBlankAuthoringSlide: true))
        XCTAssertTrue(outcome.resultingContext.isBlankAuthoringSlide)
        XCTAssertTrue(
            ComposerChromePolicy.offersContentStarters(
                outcome.resultingContext, isPartialSystemSheetPresented: false),
            """
            Sortir d'une session de dessin qui n'a RIEN produit sur une slide \
            restée vierge doit ramener les amorces — sinon la page blanche \
            perdrait définitivement son affordance de départ.
            """
        )
    }

    func test_dismissing_onASlideWithContent_offersNoStarters() {
        let outcome = ComposerChromePolicy.dismissing(
            context(isDrawingActive: true, isBlankAuthoringSlide: false))
        XCTAssertFalse(
            ComposerChromePolicy.offersContentStarters(
                outcome.resultingContext, isPartialSystemSheetPresented: false))
    }

    /// Le bandeau a été RANGÉ à l'ouverture du panneau, pas à sa fermeture :
    /// `rangeDraftResumeBannerIfNeeded()` (armé par `rangesDraftResumeBanner` dès
    /// que le chrome plein disparaît) court sur tout geste d'authoring. Recopier
    /// `ctx.isDraftResumePresented` dans le contexte résultant décrivait donc un
    /// état que la vue n'atteint jamais — un bandeau flottant au-dessus d'un
    /// panneau qui vient de se refermer.
    ///
    /// Ranger n'est toujours pas jeter : le brouillon reste en magasin
    /// (`mayOverwriteStoredDraft`) et la même offre revient à l'ouverture
    /// suivante. Seul « Recommencer » le détruit.
    func test_dismissing_reportsTheDraftResumeBannerAsRanged() {
        let outcome = ComposerChromePolicy.dismissing(
            context(machineState: .toolPanel(.media), isDraftResumePresented: true))
        XCTAssertFalse(
            outcome.resultingContext.isDraftResumePresented,
            "Le bandeau était déjà rangé quand le panneau s'est ouvert : le maintenir décrirait un état inatteignable."
        )
    }

    // MARK: - Gardes anti-régression (T8)

    func test_composerControlsLayer_routesEveryPanelExitThroughOnDismissActivePanel() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerControlsLayer.swift")
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "areFabsVisible", in: code), 0)
        for exit in ["onBackFromToolPanel: onDismissActivePanel",
                     "onCloseFormatPanel: onDismissActivePanel",
                     "onResizeDismiss: onDismissActivePanel"] {
            XCTAssertTrue(code.contains(exit), "Chemin de sortie non unifié : \(exit)")
        }
    }

    func test_canvasBackgroundTap_routesThroughChromePolicy() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Canvas.swift")
        XCTAssertTrue(code.contains("onBackgroundTapped: { handleCanvasBackgroundTap() }"))
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "areFabsVisible", in: code), 0)
    }

    /// L'unique vérité de visibilité du chrome vit dans la machine : plus aucun
    /// `@State` parallèle nulle part dans le composer.
    func test_chromeVisibility_hasNoSecondSourceOfTruth() throws {
        let offenders = try ComposerSourceGuard.allStorySources()
            .filter { $0.code.contains("areFabsVisible") }
        XCTAssertTrue(offenders.isEmpty, "Seconde vérité du chrome ressuscitée dans : \(offenders.map(\.path))")
    }

    func test_dismissActivePanel_appliesTheOutcome() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Chrome.swift")
        XCTAssertTrue(code.contains("ComposerChromePolicy.dismissing(chromeContext)"))
        XCTAssertTrue(code.contains("outcome.clearActiveTool"))
        XCTAssertTrue(code.contains("outcome.clearTimeline"))
        XCTAssertTrue(code.contains("outcome.clearSelection"))
        XCTAssertTrue(code.contains("bandStateMachine.showChrome()"))
    }
}
