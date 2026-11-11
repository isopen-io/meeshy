import XCTest
@testable import MeeshyUI

/// Témoins de comportement de K07 (`MeeshyColorDots`), recette en valeurs.
/// Vecteurs de la planche : A3 (358 pt, s32, 14 teintes), S1 (342 pt, s28, 17
/// teintes), A13 (338 pt, row, 9 teintes).
final class MeeshyColorDotsTests: XCTestCase {

    func test_resolve_wrapSmallWidth_packsEightPlusSixForA3() {
        let recipe = MeeshyColorDotsRecipe.resolve(count: 14, available: 358, size: .s32, layout: .wrap)
        XCTAssertEqual(recipe.rows, [8, 6])
        XCTAssertFalse(recipe.scrolls)
    }

    func test_resolve_wrapSeventeen_packsEightEightOneForS1() {
        let recipe = MeeshyColorDotsRecipe.resolve(count: 17, available: 342, size: .s28, layout: .wrap)
        XCTAssertEqual(recipe.rows, [8, 8, 1])
        XCTAssertFalse(recipe.scrolls)
    }

    func test_resolve_rowOverflow_scrollsOnOneLineForA13() {
        let recipe = MeeshyColorDotsRecipe.resolve(count: 9, available: 338, size: .s28, layout: .row)
        XCTAssertEqual(recipe.rows, [9])
        XCTAssertTrue(recipe.scrolls)
    }

    func test_resolve_emptyList_rendersNoRow() {
        let recipe = MeeshyColorDotsRecipe.resolve(count: 0, available: 342, size: .s28, layout: .wrap)
        XCTAssertEqual(recipe.rows, [])
        XCTAssertFalse(recipe.scrolls)
    }

    func test_resolve_narrowWidth_keepsAtLeastOneColumn() {
        let recipe = MeeshyColorDotsRecipe.resolve(count: 3, available: 10, size: .s28, layout: .wrap)
        XCTAssertEqual(recipe.rows, [1, 1, 1])
    }

    func test_cellSide_isTapTargetForBothSizes() {
        XCTAssertEqual(MeeshyColorDotSize.s28.cell, 44)
        XCTAssertEqual(MeeshyColorDotSize.s32.cell, 44)
    }
}
