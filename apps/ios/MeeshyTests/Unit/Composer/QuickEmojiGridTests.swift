import XCTest
@testable import Meeshy

/// **La rangée rapide sert les 20 derniers émojis utilisés et en montre trois
/// et demi** (#10842, retour porteur 2026-10-16 : « mettre plutôt les 20
/// derniers emojis utilisés que ce soit lors de la composition de message ou
/// par sélection dans la feuille d'émojis ou de stickers, on affiche toujours
/// trois et demi à la fois »). Elle servait les 3 plus FRÉQUENTS (#7985).
final class QuickEmojiGridTests: XCTestCase {

    // MARK: - L'historique : les plus récents d'abord, sans doublon, borné à 20

    func test_history_putsTheMostRecentFirst() {
        let history = RecentEmojiHistory.recording(["🔥"], into: ["😂", "❤️"])
        XCTAssertEqual(history, ["🔥", "😂", "❤️"])
    }

    /// Un émoji réemployé remonte en tête : il n'apparaît qu'une fois.
    func test_history_movesAReusedEmojiToTheFront_withoutDuplicate() {
        let history = RecentEmojiHistory.recording(["❤️"], into: ["😂", "❤️", "👍"])
        XCTAssertEqual(history, ["❤️", "😂", "👍"])
    }

    /// Plusieurs émojis d'un même message : le DERNIER écrit est le plus récent.
    func test_history_ofAComposedMessage_takesTheLastWrittenAsTheMostRecent() {
        let history = RecentEmojiHistory.recording(["😂", "🔥", "😂"], into: ["👍"])
        XCTAssertEqual(history, ["😂", "🔥", "👍"])
    }

    func test_history_keepsTheTwentyMostRecent() {
        let old = (0..<20).map { String(UnicodeScalar(0x1F600 + $0)!) }
        let history = RecentEmojiHistory.recording(["🔥"], into: old)
        XCTAssertEqual(history.count, RecentEmojiHistory.capacity)
        XCTAssertEqual(RecentEmojiHistory.capacity, 20)
        XCTAssertEqual(history.first, "🔥")
        XCTAssertFalse(history.contains(old.last!), "le plus ancien sort")
    }

    // MARK: - Les sources : la rangée, la feuille, un message composé

    /// Un message composé contribue TOUS ses émojis, dans l'ordre d'écriture —
    /// séquences composées (drapeaux, familles, tons de peau) comprises.
    func test_emojisInText_extractsEveryEmojiInWritingOrder() {
        XCTAssertEqual(RecentEmojiHistory.emojis(in: "Salut 😂 on se voit 👍🏽 à 🇫🇷 !"), ["😂", "👍🏽", "🇫🇷"])
        XCTAssertEqual(RecentEmojiHistory.emojis(in: "Rien que du texte, 123 #"), [])
    }

    // MARK: - Ce que la rangée montre

    /// Sans historique : les défauts actuels ; avec un historique court, il passe
    /// devant les défauts, qui complètent sans doublon.
    func test_row_withoutHistory_servesTheDefaults_andAShortHistoryLeadsThem() {
        let defaults = ["😂", "❤️", "👍", "😮"]
        XCTAssertEqual(RecentEmojiHistory.row(history: [], defaults: defaults), defaults)
        XCTAssertEqual(RecentEmojiHistory.row(history: ["🔥", "❤️"], defaults: defaults), ["🔥", "❤️", "😂", "👍", "😮"])
    }

    func test_row_neverServesMoreThanTheCapacity() {
        let history = (0..<20).map { String(UnicodeScalar(0x1F600 + $0)!) }
        XCTAssertEqual(QuickEmojiGrid.row(history + ["😂", "❤️"]).count, 20)
    }

    // MARK: - La géométrie : trois et demi dans la même largeur

    /// La rangée garde la largeur qu'elle avait (3 cellules de 32 pt) ; trois
    /// cellules et demie y tiennent, la quatrième coupée en deux.
    func test_geometry_showsThreeAndAHalfEmojisInTheSameWidth() {
        XCTAssertEqual(QuickEmojiGrid.width, 3 * 32 + 2 * 3)
        XCTAssertEqual(QuickEmojiGrid.visibleCount, 3.5)
        XCTAssertEqual(3.5 * QuickEmojiGrid.cell + 3 * QuickEmojiGrid.spacing, QuickEmojiGrid.width, accuracy: 0.01)
        XCTAssertEqual(QuickEmojiGrid.frameWidth, QuickEmojiGrid.width + 2 * QuickEmojiGrid.inset)
    }

    func test_geometry_emojiShrinksWithItsCell_andTheRowStillAlignsOnTheInputLine() {
        XCTAssertLessThan(QuickEmojiGrid.emojiSize, 24, "l'émoji rapetisse pour laisser voir le quatrième")
        XCTAssertLessThan(QuickEmojiGrid.emojiSize, QuickEmojiGrid.cell)
        XCTAssertLessThanOrEqual(QuickEmojiGrid.cell + 2 * QuickEmojiGrid.inset, QuickEmojiGrid.rowHeight)
    }

    /// La rangée défile entre son premier et son dernier émoji, jamais au-delà ;
    /// une rangée qui tient dans le cadre ne défile pas.
    func test_scroll_isBoundedByTheFirstAndTheLastEmoji() {
        let travel = QuickEmojiGrid.contentWidth(itemCount: 20) - QuickEmojiGrid.frameWidth
        XCTAssertEqual(QuickEmojiGrid.clampedScroll(40, itemCount: 20), 0)
        XCTAssertEqual(QuickEmojiGrid.clampedScroll(-10_000, itemCount: 20), -travel)
        XCTAssertEqual(QuickEmojiGrid.clampedScroll(-50, itemCount: 20), -50)
        XCTAssertEqual(QuickEmojiGrid.clampedScroll(-50, itemCount: 3), 0)
    }
}
