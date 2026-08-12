import XCTest
@testable import MeeshyUI

/// S5 — la page blanche d'auteur est un ÉTAT DU CANVAS, plus un menu.
///
/// L'ancien état vide substituait à la barre d'outils une grille opaque de six
/// tuiles prenant 47 % de la hauteur : un choix bloquant avant le canvas. Il
/// disparaît au profit de trois amorces posées DANS le canvas + du canvas
/// lui-même comme bouton « écrire ».
///
/// Deux règles pures portent tout : `isBlankAuthoringSlide` (le prédicat est
/// SLIDE-scoped — une 2ᵉ slide vierge derrière une 1ʳᵉ remplie est une page
/// blanche, sinon le même geste au même pixel changerait de sens sans signal)
/// et `offersContentStarters` (les amorces ne flottent jamais au-dessus d'une
/// sheet partielle ni d'un chrome masqué).
final class ComposerBlankCanvasPolicyTests: XCTestCase {

    private func context(
        machineState: BandState = .hidden,
        isChromeHidden: Bool = false,
        isTextEditing: Bool = false,
        isDrawingActive: Bool = false,
        isDrawingImmersive: Bool = false,
        isViewportZoomed: Bool = false,
        isTimelineVisible: Bool = false,
        isBlankAuthoringSlide: Bool = true,
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

    // MARK: - isBlankAuthoringSlide

    func test_isBlankAuthoringSlide_emptySlideInCreationMode_returnsTrue() {
        XCTAssertTrue(
            ComposerChromePolicy.isBlankAuthoringSlide(
                currentSlideIsEmpty: true,
                isEditingExistingStory: false,
                isDraftResumePresented: false
            )
        )
    }

    func test_isBlankAuthoringSlide_whileEditingExistingStory_returnsFalse() {
        XCTAssertFalse(
            ComposerChromePolicy.isBlankAuthoringSlide(
                currentSlideIsEmpty: true,
                isEditingExistingStory: true,
                isDraftResumePresented: false
            ),
            """
            L'hydratation d'une story publiée passe par une fenêtre où la slide \
            est réellement vide : y proposer des amorces de création serait un \
            faux état vide.
            """
        )
    }

    func test_isBlankAuthoringSlide_whileDraftResumeIsPresented_returnsFalse() {
        XCTAssertFalse(
            ComposerChromePolicy.isBlankAuthoringSlide(
                currentSlideIsEmpty: true,
                isEditingExistingStory: false,
                isDraftResumePresented: true
            ),
            "Le bandeau de reprise décide d'abord ; les amorces ne concurrencent pas ce choix."
        )
    }

    func test_isBlankAuthoringSlide_slideCarriesContent_returnsFalse() {
        XCTAssertFalse(
            ComposerChromePolicy.isBlankAuthoringSlide(
                currentSlideIsEmpty: false,
                isEditingExistingStory: false,
                isDraftResumePresented: false
            )
        )
    }

    // MARK: - offersContentStarters

    func test_offersContentStarters_blankSlideAndFullChrome_returnsTrue() {
        XCTAssertTrue(
            ComposerChromePolicy.offersContentStarters(
                context(), isPartialSystemSheetPresented: false)
        )
    }

    func test_offersContentStarters_partialSystemSheetPresented_returnsFalse() {
        XCTAssertFalse(
            ComposerChromePolicy.offersContentStarters(
                context(), isPartialSystemSheetPresented: true),
            """
            La sheet « Transitions » s'ouvre depuis l'overflow SANS ouvrir le band : \
            le chrome plein reste vrai. Sans cette garde, les amorces dépasseraient \
            au-dessus du bord de la sheet (le « fantôme » de l'ancien picker).
            """
        )
    }

    func test_offersContentStarters_chromeHidden_returnsFalse() {
        XCTAssertFalse(
            ComposerChromePolicy.offersContentStarters(
                context(isChromeHidden: true), isPartialSystemSheetPresented: false),
            "Chrome masqué volontairement = surface nue voulue ; aucune amorce ne revient."
        )
    }

    func test_offersContentStarters_toolPanelOpen_returnsFalse() {
        XCTAssertFalse(
            ComposerChromePolicy.offersContentStarters(
                context(machineState: .toolPanel(.media)), isPartialSystemSheetPresented: false)
        )
    }

    func test_offersContentStarters_slideHasContent_returnsFalse() {
        XCTAssertFalse(
            ComposerChromePolicy.offersContentStarters(
                context(isBlankAuthoringSlide: false), isPartialSystemSheetPresented: false)
        )
    }

    func test_offersContentStarters_timelineVisible_returnsFalse() {
        XCTAssertFalse(
            ComposerChromePolicy.offersContentStarters(
                context(isTimelineVisible: true), isPartialSystemSheetPresented: false),
            "La timeline est forcée ouverte alors que la machine reste `.hidden` — état effectif obligatoire."
        )
    }

    // MARK: - backgroundTapAction, cas S5

    func test_backgroundTapAction_blankSlideWithChromeVisible_startsTextComposition() {
        XCTAssertEqual(
            ComposerChromePolicy.backgroundTapAction(context()), .startTextComposition,
            "Toute la surface du canvas est le bouton « écrire » sur une page blanche."
        )
    }

    func test_backgroundTapAction_blankSlideOnSecondSlide_startsTextComposition() {
        // Le prédicat est SLIDE-scoped : une 2ᵉ slide vierge ajoutée derrière une
        // 1ʳᵉ remplie a exactement la même apparence que l'écran d'ouverture, donc
        // exactement le même geste.
        XCTAssertEqual(
            ComposerChromePolicy.backgroundTapAction(context(isBlankAuthoringSlide: true)),
            .startTextComposition
        )
    }

    func test_backgroundTapAction_blankSlideButChromeHidden_togglesChrome() {
        XCTAssertEqual(
            ComposerChromePolicy.backgroundTapAction(
                context(isChromeHidden: true)), .toggleChrome,
            """
            Chrome masqué (swipe-down) : le tap le RESTAURE d'abord — jamais de \
            cul-de-sac (D4). Écrire reste à un tap de plus.
            """
        )
    }

    func test_backgroundTapAction_slideWithContent_togglesChrome() {
        XCTAssertEqual(
            ComposerChromePolicy.backgroundTapAction(
                context(isBlankAuthoringSlide: false)), .toggleChrome,
            "Une slide qui porte du contenu garde l'immersion au tap."
        )
    }

    func test_backgroundTapAction_draftResumePresented_dismissesTheBanner() {
        XCTAssertEqual(
            ComposerChromePolicy.backgroundTapAction(
                context(isDraftResumePresented: true)), .dismissDraftResume,
            """
            Le bandeau de reprise n'est plus modal : interagir avec le canvas le \
            RANGE sans jeter le brouillon (« Recommencer » reste le seul discard \
            explicite).
            """
        )
    }

    func test_backgroundTapAction_draftResumePresentedWhileTimelineOpen_isIgnored() {
        XCTAssertEqual(
            ComposerChromePolicy.backgroundTapAction(
                context(isTimelineVisible: true, isDraftResumePresented: true)), .ignore,
            "Les éditeurs qui possèdent le canvas gardent la priorité absolue."
        )
    }

    func test_backgroundTapAction_blankSlideWithToolPanelOpen_dismissesPanel() {
        XCTAssertEqual(
            ComposerChromePolicy.backgroundTapAction(
                context(machineState: .toolPanel(.media))), .dismissPanel,
            "Un panneau ouvert se ferme AVANT toute création — jamais un texte par-dessus."
        )
    }

    // MARK: - Le bandeau ne flotte au-dessus de RIEN

    /// Le tap sur le canvas n'était pas le seul geste d'authoring : taper un FAB,
    /// ouvrir le panneau Média, insérer une photo ou entrer en édition texte
    /// laissaient le bandeau posé en `.overlay(alignment: .bottom)`, donc
    /// AU-DESSUS du panneau qui venait de s'ouvrir (band déployée ≈ 300 pt). La
    /// règle est la même que pour les amorces : le bandeau n'appartient qu'au
    /// canvas AU REPOS.
    func test_rangesDraftResumeBanner_whenAToolPanelOpens_returnsTrue() {
        XCTAssertTrue(
            ComposerChromePolicy.rangesDraftResumeBanner(
                context(machineState: .toolPanel(.media), isDraftResumePresented: true))
        )
    }

    func test_rangesDraftResumeBanner_whenTheTextEditorOpens_returnsTrue() {
        XCTAssertTrue(
            ComposerChromePolicy.rangesDraftResumeBanner(
                context(isTextEditing: true, isDraftResumePresented: true))
        )
    }

    func test_rangesDraftResumeBanner_onTheCanvasAtRest_returnsFalse() {
        XCTAssertFalse(
            ComposerChromePolicy.rangesDraftResumeBanner(
                context(isDraftResumePresented: true)),
            "Au repos, l'offre reste lisible — c'est tout son intérêt."
        )
    }

    func test_rangesDraftResumeBanner_withoutAnyBanner_returnsFalse() {
        XCTAssertFalse(
            ComposerChromePolicy.rangesDraftResumeBanner(
                context(machineState: .toolPanel(.media))),
            "Aucune offre posée : rien à ranger, et surtout aucune mutation à déclencher."
        )
    }
}
