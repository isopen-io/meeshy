import XCTest
@testable import MeeshyUI

/// Balayage des index : deux entrées qu'un tiers contrôle faisaient planter ou
/// figer l'affichage.
@MainActor
final class IndexBoundsHardeningTests: XCTestCase {

    /// `$` ouvrait un mot sans être consommé : la boucle ne progressait plus,
    /// et un fichier shell ou PHP partagé figeait la conversation.
    func test_tokenize_dollarIdentifier_terminatesAndKeepsTheText() {
        // Sur l'ancien code, cet appel ne rendait jamais la main.
        let lines = SyntaxHighlighter.tokenize("echo $HOME $(ls) $", language: .shell)
        XCTAssertEqual(lines.first?.map { $0.text }.joined(), "echo $HOME $(ls) $")
    }

    /// Un Lottie de pack avec `fr: 0` donne une durée infinie ou NaN, une durée
    /// démesurée un tableau d'images sans fin.
    func test_frameCount_nonFiniteOrHugeDuration_staysBounded() {
        XCTAssertEqual(LottieFilm.frameCount(duration: .infinity, framesPerSecond: 15), 1)
        XCTAssertEqual(LottieFilm.frameCount(duration: .nan, framesPerSecond: 15), 1)
        XCTAssertEqual(LottieFilm.frameCount(duration: -3, framesPerSecond: 15), 1)
        XCTAssertEqual(LottieFilm.frameCount(duration: 1_000_000, framesPerSecond: 15), LottieFilm.maxFrames)
        XCTAssertEqual(LottieFilm.frameCount(duration: 2, framesPerSecond: 15), 30)
    }
}
