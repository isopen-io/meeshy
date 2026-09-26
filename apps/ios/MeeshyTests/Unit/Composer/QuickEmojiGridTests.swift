import XCTest
@testable import Meeshy

/// **Trois emojis rapides, en permanence** (#7985, directive porteur
/// 2026-09-25 : « on doit maintenir le composant des emojis à 3 tout le
/// temps »).
final class QuickEmojiGridTests: XCTestCase {

    func test_troisEmojis_surUneRangee() {
        XCTAssertEqual(QuickEmojiGrid.row(["😂", "❤️", "👍", "😮", "😢"]), ["😂", "❤️", "👍"])
    }

    func test_moinsDeTrois_neFabriqueRien() {
        XCTAssertEqual(QuickEmojiGrid.row(["😂"]), ["😂"])
        XCTAssertEqual(QuickEmojiGrid.row([]), [])
    }

    func test_leCadreSAligneSurLaLigneDeSaisie() {
        XCTAssertEqual(QuickEmojiGrid.count, 3)
        XCTAssertLessThanOrEqual(QuickEmojiGrid.cell + 2 * QuickEmojiGrid.inset, QuickEmojiGrid.rowHeight)
        XCTAssertEqual(QuickEmojiGrid.frameWidth, 3 * QuickEmojiGrid.cell + 2 * QuickEmojiGrid.spacing + 2 * QuickEmojiGrid.inset)
    }
}
