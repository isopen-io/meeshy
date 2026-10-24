import XCTest
@testable import MeeshyUI

/// #9874 - les resolveurs de la timeline se calculent une fois par version du
/// projet, pas une fois par body.
@MainActor
final class KeyedMemoTests: XCTestCase {

    func test_sameKey_computesOnce() {
        let memo = KeyedMemo<Int, String>()
        var computations = 0

        let first = memo.value(for: 1) { computations += 1; return "a" }
        let second = memo.value(for: 1) { computations += 1; return "b" }

        XCTAssertEqual(first, "a")
        XCTAssertEqual(second, "a")
        XCTAssertEqual(computations, 1)
    }

    func test_changedKey_recomputes() {
        let memo = KeyedMemo<Int, String>()
        _ = memo.value(for: 1) { "a" }

        let next = memo.value(for: 2) { "b" }

        XCTAssertEqual(next, "b")
    }

    func test_returningToPreviousKey_recomputesBecauseOnlyTheLastIsKept() {
        let memo = KeyedMemo<Int, Int>()
        var computations = 0
        _ = memo.value(for: 1) { computations += 1; return 1 }
        _ = memo.value(for: 2) { computations += 1; return 2 }

        _ = memo.value(for: 1) { computations += 1; return 1 }

        XCTAssertEqual(computations, 3, "une seule entree : la memoire reste bornee")
    }
}
