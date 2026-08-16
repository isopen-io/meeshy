import XCTest
@testable import Meeshy

/// LWS-6 (contrat §4.3) — `StoriesVivantsRail`, vue pure. Logique testable
/// extraite dans `LentilleRailPolicy` (troncature `≤ 6`, masquage si vide),
/// exercée directement sans framework de rendu SwiftUI — même patron que
/// `LentilleStickerTests`/`SectionScrollPillTests`.
final class StoriesVivantsRailTests: XCTestCase {

    private func makeEntries(_ count: Int) -> [LentilleRailEntry] {
        (1...count).map { LentilleRailEntry(id: "entry-\($0)", displayName: "Entry \($0)") }
    }

    // MARK: - Masqué si vide

    func test_shouldRender_emptyEntries_isFalse() {
        XCTAssertFalse(LentilleRailPolicy.shouldRender([]))
    }

    func test_shouldRender_nonEmptyEntries_isTrue() {
        XCTAssertTrue(LentilleRailPolicy.shouldRender(makeEntries(1)))
    }

    func test_visibleEntries_emptyInput_isEmpty() {
        XCTAssertTrue(LentilleRailPolicy.visibleEntries([]).isEmpty)
    }

    // MARK: - `≤ 6` entrées (LentilleMetrics.Rail.maxEntries, §4.3)

    func test_visibleEntries_fewerThanMax_returnsAllUnchanged() {
        let entries = makeEntries(3)
        XCTAssertEqual(LentilleRailPolicy.visibleEntries(entries), entries)
    }

    func test_visibleEntries_exactlyMax_returnsAllUnchanged() {
        let entries = makeEntries(LentilleMetrics.Rail.maxEntries)
        XCTAssertEqual(LentilleRailPolicy.visibleEntries(entries), entries)
    }

    func test_visibleEntries_moreThanMax_truncatesToMaxEntries() {
        let entries = makeEntries(10)
        let visible = LentilleRailPolicy.visibleEntries(entries)
        XCTAssertEqual(visible.count, LentilleMetrics.Rail.maxEntries)
    }

    func test_visibleEntries_moreThanMax_keepsTheFirstEntriesInOrder() {
        let entries = makeEntries(10)
        let visible = LentilleRailPolicy.visibleEntries(entries)
        XCTAssertEqual(visible, Array(entries.prefix(LentilleMetrics.Rail.maxEntries)))
        XCTAssertEqual(visible.first?.id, "entry-1")
    }

    func test_shouldRender_moreThanMaxEntries_isTrue() {
        XCTAssertTrue(LentilleRailPolicy.shouldRender(makeEntries(10)))
    }
}
