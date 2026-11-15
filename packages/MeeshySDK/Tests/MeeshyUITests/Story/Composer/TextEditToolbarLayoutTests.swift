import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// La barre d'outils du texte s'est un jour retrouvée à demander 432 pt sur un
/// écran qui en offre 361 : la première bulle et le bouton de sortie sortaient
/// de l'écran, sans scroll ni indice — le seul chemin de sortie explicite était
/// coupé en deux. La réponse d'alors fut de séparer en deux rangées ; celle
/// d'aujourd'hui est de retirer deux outils devenus des curseurs.
///
/// Ces tests tiennent le budget de largeur, pour que la troncature silencieuse
/// ne puisse pas revenir.
final class TextEditToolbarLayoutTests: XCTestCase {

    // MARK: - Composition

    func test_theRowCoversEveryToolExactlyOnce() {
        XCTAssertEqual(Set(TextEditTool.all), Set(TextEditTool.allCases))
        XCTAssertEqual(TextEditTool.all.count, TextEditTool.allCases.count,
                       "aucun doublon dans la rangée")
    }

    /// Huit depuis #4870 : l'EFFET — lueur, ombre, relief — a sa bulle, à
    /// côté de la police dont il est l'axe orthogonal.
    func test_theRowCarriesEightTools() {
        XCTAssertEqual(TextEditTool.all.count, 8)
    }

    /// L'EFFET vient JUSTE APRÈS la police : c'est la question que l'auteur se
    /// posait devant la grille des dix-huit avant que POLICE ne soit nommée
    /// pour ce qu'elle est (#4850), et elle se pose dans cet ordre.
    func test_effectSitsRightAfterStyle() {
        XCTAssertEqual(Array(TextEditTool.all.prefix(2)), [.style, .effect])
    }

    /// Taille et graisse sont des valeurs continues : elles vivent en curseurs
    /// dans le panneau Police, pas derrière une bulle. Ce test échoue si
    /// quelqu'un les réintroduit comme outils.
    func test_sizeAndWeightAreNotToolsAnyMore() {
        let names = TextEditTool.allCases.map(\.rawValue)
        XCTAssertFalse(names.contains("size"))
        XCTAssertFalse(names.contains("weight"))
    }

    // MARK: - Budget de largeur

    func test_theRowFitsOnTheNarrowestSupportedScreen() {
        XCTAssertTrue(
            TextEditToolbarMetrics.fits(
                bubbleCount: TextEditTool.all.count,
                in: TextEditToolbarMetrics.narrowestUsableWidth),
            "les huit bulles doivent tenir sur un iPhone SE")
    }

    /// La rangée haute ne porte plus que « Terminé » : elle tient par
    /// construction, mais la garde reste utile si quelqu'un y remet des outils.
    func test_theTopRowCarriesOnlyTheFinishButton() {
        XCTAssertTrue(
            TextEditToolbarMetrics.fits(
                bubbleCount: 0,
                trailing: TextEditToolbarMetrics.finishControlWidth,
                in: TextEditToolbarMetrics.narrowestUsableWidth))
    }

    /// La garde qui compte : une bulle de plus et la rangée déborde sur le
    /// plus étroit des écrans supportés. Le `ScrollView` la rend visible au
    /// lieu de la couper, mais ce test rappelle que le budget est atteint.
    func test_oneMoreBubbleWouldOverflowTheNarrowestScreen() {
        XCTAssertFalse(
            TextEditToolbarMetrics.fits(
                bubbleCount: TextEditTool.all.count + 1,
                in: TextEditToolbarMetrics.narrowestUsableWidth),
            "neuf bulles ne tiennent plus sur un iPhone SE")
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
