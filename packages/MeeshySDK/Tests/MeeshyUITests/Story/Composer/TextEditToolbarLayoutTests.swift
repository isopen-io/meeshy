import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// La barre d'outils du texte s'est un jour retrouvée à demander 432 pt sur un
/// écran qui en offre 361 : la première bulle et le bouton de sortie sortaient
/// de l'écran, sans scroll ni indice — le seul chemin de sortie explicite était
/// coupé en deux.
///
/// Ces tests tiennent le budget de largeur et la répartition des outils entre
/// les deux rangées, pour que la régression ne puisse pas revenir en silence.
final class TextEditToolbarLayoutTests: XCTestCase {

    // MARK: - Répartition des outils

    /// Un outil oublié dans la répartition disparaît de l'interface sans que
    /// rien ne le signale : ni erreur de compilation, ni test rouge ailleurs.
    func test_theTwoRowsCoverEveryToolExactlyOnce() {
        let all = Set(TextEditTool.allCases)
        let top = Set(TextEditTool.topTools)
        let bottom = Set(TextEditTool.bottomTools)

        XCTAssertEqual(top.union(bottom), all, "aucun outil ne doit disparaître de l'interface")
        XCTAssertTrue(top.isDisjoint(with: bottom), "un outil ne doit pas figurer sur les deux rangées")
        XCTAssertEqual(TextEditTool.topTools.count + TextEditTool.bottomTools.count,
                       TextEditTool.allCases.count, "aucun doublon dans une rangée")
    }

    /// La rangée haute ne porte que des attributs à valeurs discrètes : eux
    /// seuls se prêtent à la rotation au tap. Une palette de 14 couleurs ou un
    /// curseur de taille n'y ont pas leur place.
    func test_everyToolOnTheTopRowCanBeCycled() {
        for tool in TextEditTool.topTools {
            XCTAssertTrue(tool.isCyclable, "\(tool) est sur la rangée haute mais ne sait pas tourner")
        }
    }

    // MARK: - Budget de largeur

    func test_theBottomRowFitsOnTheNarrowestSupportedScreen() {
        XCTAssertTrue(
            TextEditToolbarMetrics.fits(
                bubbleCount: TextEditTool.bottomTools.count,
                in: TextEditToolbarMetrics.narrowestUsableWidth),
            "la rangée basse doit tenir sur un iPhone SE")
    }

    func test_theTopRowFitsOnTheNarrowestSupportedScreen_finishButtonIncluded() {
        XCTAssertTrue(
            TextEditToolbarMetrics.fits(
                bubbleCount: TextEditTool.topTools.count,
                trailing: TextEditToolbarMetrics.finishControlWidth,
                in: TextEditToolbarMetrics.narrowestUsableWidth),
            "la rangée haute doit tenir sur un iPhone SE, bouton Terminé compris")
    }

    /// La composition d'origine — les neuf outils plus le bouton de sortie sur
    /// une seule rangée — ne tenait sur AUCUN iPhone. Ce test échoue si
    /// quelqu'un la reconstitue.
    func test_theOriginalSingleRowLayoutDoesNotFitAnywhere() {
        let everythingOnOneRow = TextEditTool.allCases.count + 1
        XCTAssertFalse(
            TextEditToolbarMetrics.fits(bubbleCount: everythingOnOneRow,
                                        in: TextEditToolbarMetrics.narrowestUsableWidth))
        XCTAssertFalse(
            TextEditToolbarMetrics.fits(bubbleCount: everythingOnOneRow, in: 393 - 32),
            "c'est exactement le débordement observé sur iPhone 16 Pro")
    }

    func test_requiredWidth_countsBubblesAndTheGapsBetweenThem() {
        let bubble = TextEditToolbarMetrics.bubbleSize
        let gap = TextEditToolbarMetrics.spacing
        let fiveBubbles: CGFloat = 5 * bubble + 4 * gap

        XCTAssertEqual(TextEditToolbarMetrics.requiredWidth(bubbleCount: 1), bubble)
        XCTAssertEqual(TextEditToolbarMetrics.requiredWidth(bubbleCount: 5), fiveBubbles)
        XCTAssertEqual(TextEditToolbarMetrics.requiredWidth(bubbleCount: 0), 0,
                       "une rangée vide n'occupe rien")
    }

    func test_requiredWidth_reservesTheGapBeforeATrailingControl() {
        let bubble = TextEditToolbarMetrics.bubbleSize
        let gap = TextEditToolbarMetrics.spacing
        let trailing: CGFloat = 100
        let expected: CGFloat = 4 * bubble + 3 * gap + gap + trailing

        XCTAssertEqual(
            TextEditToolbarMetrics.requiredWidth(bubbleCount: 4, trailing: trailing),
            expected)
    }
}
