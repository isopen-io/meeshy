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

    func test_leCadrePrendToutLeCoteDroit_ligneEtBarreDOutils() {
        XCTAssertEqual(QuickEmojiGrid.count, 5)
        XCTAssertEqual(
            QuickEmojiGrid.frameHeight(toolbarHeight: 30),
            QuickEmojiGrid.rowHeight + QuickEmojiGrid.toolbarGap + 30,
            "le cadre monte du bas de la ligne de saisie jusqu'au haut de la barre d'outils"
        )
        XCTAssertEqual(
            QuickEmojiGrid.frameHeight(toolbarHeight: 44) - QuickEmojiGrid.frameHeight(toolbarHeight: 30), 14,
            "une barre plus haute (Dynamic Type) agrandit le cadre d'autant"
        )
    }

    func test_lesDeuxRangeesTiennentToujoursDansLeCadre() {
        for toolbar: CGFloat in [0, 20, 30, 60] {
            XCTAssertLessThanOrEqual(
                QuickEmojiGrid.contentHeight + 2 * QuickEmojiGrid.inset,
                QuickEmojiGrid.frameHeight(toolbarHeight: toolbar)
            )
        }
        XCTAssertEqual(QuickEmojiGrid.width, 3 * QuickEmojiGrid.cell + 2 * QuickEmojiGrid.spacing)
        XCTAssertEqual(QuickEmojiGrid.frameWidth, QuickEmojiGrid.width + 2 * QuickEmojiGrid.inset)
    }

    func test_lesEmojisSontAgrandis() {
        XCTAssertGreaterThan(QuickEmojiGrid.cell, 21, "le cadre agrandi porte des emojis plus grands qu'en #7931")
    }

    // MARK: - Au focus (#7966)

    func test_auFocus_troisEmojisSurUneRangee() {
        XCTAssertEqual(QuickEmojiGrid.rows(cinq, focused: true), [["😂", "❤️", "👍"]])
    }

    func test_auFocus_leCadreSAligneSurLaLigneDeSaisie() {
        XCTAssertEqual(QuickEmojiGrid.frameHeight(toolbarHeight: 30, focused: true), QuickEmojiGrid.rowHeight)
        XCTAssertLessThanOrEqual(QuickEmojiGrid.cell + 2 * QuickEmojiGrid.inset, QuickEmojiGrid.rowHeight)
    }

    func test_auFocus_laBarreDOutilsEstLiberee() {
        XCTAssertFalse(QuickEmojiGrid.coversToolbar(focused: true))
        XCTAssertTrue(QuickEmojiGrid.coversToolbar(focused: false))
    }
}
