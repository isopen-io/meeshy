import XCTest
@testable import Meeshy

/// **Cinq emojis rapides sur deux rangées** (#7931, directive porteur
/// 2026-09-25).
final class QuickEmojiGridTests: XCTestCase {

    private let cinq = ["😂", "❤️", "👍", "😮", "😢"]

    func test_cinqEmojis_seRangentEnTroisPuisDeux() {
        XCTAssertEqual(QuickEmojiGrid.rows(cinq), [["😂", "❤️", "👍"], ["😮", "😢"]])
    }

    func test_auDelaDeCinq_rienNeDeborde() {
        XCTAssertEqual(QuickEmojiGrid.rows(cinq + ["🔥", "🎉"]).flatMap { $0 }, cinq)
    }

    func test_moinsDEmojis_neLaissentPasDeRangeeVide() {
        XCTAssertEqual(QuickEmojiGrid.rows(["😂", "❤️"]), [["😂", "❤️"]])
        XCTAssertEqual(QuickEmojiGrid.rows([]), [])
    }

    func test_laGrilleTientDansLEmplacementDe44Points() {
        XCTAssertEqual(QuickEmojiGrid.count, 5)
        let hauteur = 2 * QuickEmojiGrid.cell + QuickEmojiGrid.spacing
        XCTAssertLessThanOrEqual(hauteur, 44, "deux rangées tiennent dans la hauteur fixe du slot")
        XCTAssertEqual(QuickEmojiGrid.width, 3 * QuickEmojiGrid.cell + 2 * QuickEmojiGrid.spacing)
    }
}
