import XCTest
@testable import MeeshyUI

/// Régression du bug §0 (rapport terrain 2026-07-30 « des contrôleurs hors
/// du viewport ») : `canvasIsCarded`/`presentedSheetHeight` lisaient l'état
/// BRUT `bandStateMachine.state` au lieu de l'état RÉSOLU
/// (`ComposerChromeContext.effectiveBandState`/`isBandHidden`, posé par S1).
/// Sur les 6 chemins d'ouverture Timeline (cf. `BandStateMachineTests.
/// openTimeline*`), `isTimelineVisible` bascule à `true` SANS que la machine
/// transite (`effectiveBandState` la force via son override, la machine reste
/// `.hidden`). `canvasIsCarded` restait vrai par un terme redondant
/// (`timelineActive:` passé séparément à `StoryCanvasFraming.isCarded`), mais
/// `presentedSheetHeight` n'avait AUCUN filet : son bloc de réserve mesurée
/// restait derrière `bandStateMachine.state != .hidden` (faux sur ces 6
/// chemins) et retournait `0` au lieu des ~392-406pt réellement occupés par le
/// panneau Timeline (`ComposerToolPanelHost.defaultPanelHeight(for: .timeline)`
/// = 392 + `canvasSheetGap` 14) — le canvas cardait à une taille trop grande,
/// ses contrôles bas passant SOUS le panneau réellement rendu.
///
/// Les deux fonctions sont des propriétés `StoryComposerView` lisant
/// `@ObservedObject`/`@Binding`/`@State` privés que XCTest ne peut pas monter
/// directement — même pattern que
/// `StoryComposerView_ShouldShowEmptyStateLargePickerTests` : la logique pure
/// est extraite en `static func`, exercée ici sans monter la View.
final class StoryComposerView_TimelineSpaceReservationTests: XCTestCase {

    // MARK: - resolveCanvasIsCarded

    /// **RETOURNÉ au #4124** (directive porteur 2026-08-28 : « mettre la scène
    /// 9:16 au centre avec coin arrondi et un peu d'espace à gauche, haut, bas
    /// et droite »). Le repos CARDE désormais — il ne reste plein écran que là
    /// où l'immersion est le sujet, et ces deux cas ont leurs témoins juste en
    /// dessous.
    ///
    /// Ce que le nom de ce test disait — « band cachée, aucun override ⇒ pas
    /// cardé » — était vrai d'une règle qui posait le plein écran par défaut.
    /// La règle dit maintenant l'inverse, donc le témoin change de verdict et de
    /// nom : le garder à `false` aurait figé une directive révoquée.
    func test_resolveCanvasIsCarded_auRepos_carde() {
        let result = StoryComposerView.resolveCanvasIsCarded(
            isTextEditing: false,
            effectiveBandIsHidden: true,
            drawingActive: false,
            presentedSystemSheetFraction: nil
        )
        XCTAssertTrue(result, "Au repos, la scène est une carte centrée et marginée.")
    }

    /// Les deux immersions que #4124 ne révoque PAS, et qui tiennent le plein
    /// écran contre le nouveau défaut.
    func test_resolveCanvasIsCarded_lesDeuxImmersions_restentPleinEcran() {
        XCTAssertFalse(StoryComposerView.resolveCanvasIsCarded(
            isTextEditing: false, effectiveBandIsHidden: true,
            drawingActive: true, presentedSystemSheetFraction: nil),
            "Le dessin reste immersif — dessinable jusqu'aux angles (2026-07-11).")
        XCTAssertFalse(StoryComposerView.resolveCanvasIsCarded(
            isTextEditing: true, effectiveBandIsHidden: false,
            drawingActive: false, presentedSystemSheetFraction: 0.5),
            "L'édition texte reste immersive et l'emporte sur tout (2026-07-28).")
    }

    /// Régression centrale : reproduit exactement ce qui se passe sur les 6
    /// chemins d'ouverture Timeline — la machine BRUTE peut rester `.hidden`
    /// tant que l'override `isTimelineVisible` fait le travail dans
    /// `effectiveBandState`. Passer l'état RÉSOLU (`effectiveBandIsHidden:
    /// false`) doit carder le canvas, indépendamment de l'état brut.
    func test_resolveCanvasIsCarded_effectiveBandIsHiddenFalse_isCarded() {
        let result = StoryComposerView.resolveCanvasIsCarded(
            isTextEditing: false,
            effectiveBandIsHidden: false,
            drawingActive: false,
            presentedSystemSheetFraction: nil
        )
        XCTAssertTrue(
            result,
            "Le panneau Timeline occupe réellement l'écran (état effectif résolu) : le canvas doit carder même si l'état BRUT de la machine reste .hidden."
        )
    }

    func test_resolveCanvasIsCarded_textEditing_shortCircuitsToFalse() {
        let result = StoryComposerView.resolveCanvasIsCarded(
            isTextEditing: true,
            effectiveBandIsHidden: false,
            drawingActive: false,
            presentedSystemSheetFraction: nil
        )
        XCTAssertFalse(result, "L'édition texte garde le canvas plein écran, quel que soit l'état du band.")
    }

    func test_resolveCanvasIsCarded_systemSheetPresented_cardsEvenWithBandHidden() {
        let result = StoryComposerView.resolveCanvasIsCarded(
            isTextEditing: false,
            effectiveBandIsHidden: true,
            drawingActive: false,
            presentedSystemSheetFraction: 0.5
        )
        XCTAssertTrue(result)
    }

    func test_resolveCanvasIsCarded_drawingActiveAlone_doesNotCard() {
        let result = StoryComposerView.resolveCanvasIsCarded(
            isTextEditing: false,
            effectiveBandIsHidden: true,
            drawingActive: true,
            presentedSystemSheetFraction: nil
        )
        XCTAssertFalse(
            result,
            "Parité avec le contrat de StoryCanvasFraming.isCarded : drawingActive seul (mode immersif, band déjà .hidden) ne carde plus depuis 2026-07-11."
        )
    }

    // MARK: - resolvePresentedSheetHeight

    func test_resolvePresentedSheetHeight_canvasNotCarded_returnsZero() {
        let height = StoryComposerView.resolvePresentedSheetHeight(
            canvasIsCarded: false,
            effectiveBandIsHidden: false,
            measuredBandTopY: 100,
            measuredBottomBandHeight: 392,
            composerBandHeight: 392,
            presentedSystemSheetFraction: nil,
            composerScreenHeight: 844
        )
        XCTAssertEqual(height, 0)
    }

    /// Régression centrale reproduisant EXACTEMENT le bug §0 : un des 6
    /// chemins d'ouverture Timeline a basculé `isTimelineVisible`, la machine
    /// BRUTE est restée `.hidden`, mais l'état RÉSOLU
    /// (`effectiveBandIsHidden: false`) et la mesure réelle du haut de bande
    /// (`measuredBandTopY`) placent le panneau à ~392pt du bas de l'écran.
    /// Avant le fix, ce cas retournait `0` (garde sur l'état brut).
    func test_resolvePresentedSheetHeight_effectiveBandIsHiddenFalseWithRealBandTop_reservesTimelineHeight() {
        let screenHeight: CGFloat = 844
        let bandTopY: CGFloat = screenHeight - 392
        let height = StoryComposerView.resolvePresentedSheetHeight(
            canvasIsCarded: true,
            effectiveBandIsHidden: false,
            measuredBandTopY: bandTopY,
            measuredBottomBandHeight: 0,
            composerBandHeight: 280,
            presentedSystemSheetFraction: nil,
            composerScreenHeight: screenHeight
        )
        XCTAssertEqual(
            height, 392, accuracy: 0.5,
            "Le panneau Timeline occupe réellement ~392pt en bas : la réserve ne doit JAMAIS retomber à 0 pendant que canvasIsCarded == true."
        )
    }

    func test_resolvePresentedSheetHeight_bandTopNotYetMeasured_fallsBackToComposerBandHeight() {
        let height = StoryComposerView.resolvePresentedSheetHeight(
            canvasIsCarded: true,
            effectiveBandIsHidden: false,
            measuredBandTopY: .greatestFiniteMagnitude,
            measuredBottomBandHeight: 0,
            composerBandHeight: 392,
            presentedSystemSheetFraction: nil,
            composerScreenHeight: 844
        )
        XCTAssertEqual(height, 392, "`.greatestFiniteMagnitude` (sentinelle « pas encore mesuré ») retombe sur composerBandHeight, jamais 0.")
    }

    func test_resolvePresentedSheetHeight_systemSheetOnly_usesScreenFraction() {
        let height = StoryComposerView.resolvePresentedSheetHeight(
            canvasIsCarded: true,
            effectiveBandIsHidden: true,
            measuredBandTopY: .greatestFiniteMagnitude,
            measuredBottomBandHeight: 0,
            composerBandHeight: 280,
            presentedSystemSheetFraction: 0.5,
            composerScreenHeight: 844
        )
        XCTAssertEqual(height, 422)
    }

    func test_resolvePresentedSheetHeight_isCappedAt85PercentOfScreenHeight() {
        let screenHeight: CGFloat = 844
        let height = StoryComposerView.resolvePresentedSheetHeight(
            canvasIsCarded: true,
            effectiveBandIsHidden: false,
            measuredBandTopY: 0,   // valeur aberrante/transitoire (montage) : réserve = tout l'écran
            measuredBottomBandHeight: 0,
            composerBandHeight: 0,
            presentedSystemSheetFraction: nil,
            composerScreenHeight: screenHeight
        )
        XCTAssertEqual(height, screenHeight * 0.85, accuracy: 0.5)
    }
}
