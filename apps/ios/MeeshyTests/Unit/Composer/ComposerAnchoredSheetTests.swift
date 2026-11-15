import XCTest
@testable import Meeshy

/// **Les feuilles du compositeur sont ANCRÉES, pas présentées** (#13839, L3) :
/// posées en bas, sans voile, de hauteur bornée, une à la fois, et elles se
/// ferment d'un glissé vers le bas.
final class ComposerAnchoredSheetTests: XCTestCase {

    func test_presentation_composerSheets_areAnchoredInThePile() {
        let ancrees: [ComposerPortal] = [.sticker, .reference, .hashtag,
                                         .audience, .background, .slideDuration]
        for portail in ancrees {
            XCTAssertEqual(portail.presentation, .anchored, "\(portail) doit réduire la scène, pas la couvrir")
            XCTAssertTrue(portail.reducesScene)
            XCTAssertNil(portail.sheetDetentFraction)
        }
    }

    /// **Une vue qui monte sa propre `NavigationStack` ne s'ancre pas** (recette
    /// simulateur du 2026-10-31) : posée dans la pile, elle ne recevait AUCUN
    /// toucher — « Enregistrer », « Bibliothèque », « Fichiers », la recherche
    /// d'un lieu traversaient la feuille jusqu'à la scène, qui la refermait.
    /// Elle redevient une feuille système de hauteur fixe, et la scène se
    /// réduit toujours au-dessus d'elle.
    func test_presentation_portalsWithTheirOwnNavigation_areFixedHeightSheets_thatStillReduceTheScene() {
        for portail in [ComposerPortal.sound, .soundLibrary, .location] {
            XCTAssertEqual(portail.presentation, .sheet, "\(portail) doit rester touchable")
            XCTAssertEqual(portail.sheetDetentFraction,
                           ComposerAnchoredSheetMetrics.fraction(portail.anchoredSize),
                           "\(portail) garde la hauteur de sa feuille ancrée")
            XCTAssertTrue(portail.reducesScene, "\(portail) doit réduire la scène, pas la couvrir")
        }
    }

    func test_reducesScene_cameraAndDocumentPickers_doNotReduceTheScene() {
        for portail in [ComposerPortal.camera, .emoji, .language] {
            XCTAssertFalse(portail.reducesScene)
            XCTAssertNil(portail.sheetDetentFraction)
        }
    }

    func test_presentation_cameraStaysFullScreen_andDocumentPickersStaySheets() {
        XCTAssertEqual(ComposerPortal.camera.presentation, .fullScreen)
        XCTAssertEqual(ComposerPortal.emoji.presentation, .sheet)
        XCTAssertEqual(ComposerPortal.language.presentation, .sheet)
    }

    func test_header_sheetsWithoutTheirOwn_getTheTitledOK() {
        for portail in [ComposerPortal.sticker, .audience, .background, .slideDuration] {
            XCTAssertNotNil(portail.anchoredTitle, "\(portail) : titre et OK portés par la feuille ancrée")
        }
        for portail in [ComposerPortal.sound, .soundLibrary, .reference, .hashtag, .location] {
            XCTAssertNil(portail.anchoredTitle, "\(portail) porte déjà son en-tête : pas de doublon")
        }
    }

    func test_height_staysBelowTheAvailableSpace_soTheSceneShows() {
        for taille in ComposerAnchoredSheetMetrics.Size.allCases {
            let h = ComposerAnchoredSheetMetrics.height(taille, available: 852)
            XCTAssertGreaterThan(h, 0)
            XCTAssertLessThanOrEqual(h, 852 * ComposerAnchoredSheetMetrics.maximumFraction)
        }
    }

    func test_height_ordersCompactRegularTall() {
        let c = ComposerAnchoredSheetMetrics.height(.compact, available: 852)
        let r = ComposerAnchoredSheetMetrics.height(.regular, available: 852)
        let t = ComposerAnchoredSheetMetrics.height(.tall, available: 852)
        XCTAssertLessThan(c, r)
        XCTAssertLessThan(r, t)
    }

    func test_height_onAShortWindow_neverExceedsTheWindow() {
        XCTAssertLessThanOrEqual(ComposerAnchoredSheetMetrics.height(.compact, available: 200), 200)
    }

    func test_dismisses_aShortDrag_springsBack() {
        XCTAssertFalse(ComposerAnchoredSheetMetrics.dismisses(translation: 30, predictedEnd: 40, height: 400))
    }

    func test_dismisses_aLongDrag_closes() {
        XCTAssertTrue(ComposerAnchoredSheetMetrics.dismisses(translation: 140, predictedEnd: 150, height: 400))
    }

    func test_dismisses_aFlick_closes() {
        XCTAssertTrue(ComposerAnchoredSheetMetrics.dismisses(translation: 40, predictedEnd: 260, height: 400))
    }

    func test_dragOffset_upwardDrag_doesNotLiftTheSheet() {
        XCTAssertEqual(ComposerAnchoredSheetMetrics.dragOffset(-50), 0)
        XCTAssertEqual(ComposerAnchoredSheetMetrics.dragOffset(35), 35)
    }

    /// Le haut publié est celui de la feuille AU REPOS : la suivre pendant le
    /// glissé relancerait la réduction de la scène à chaque image.
    func test_restingTop_isTheContainerBottomMinusTheSheet() {
        XCTAssertEqual(ComposerAnchoredSheetMetrics.restingTop(containerMaxY: 852, height: 420), 432)
    }
}
